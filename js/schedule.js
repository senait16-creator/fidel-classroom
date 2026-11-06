// =============================================================================
// SCHEDULE.JS
// The Schedule tab: upcoming lesson, booking a lesson (with Stripe Checkout
// for payment), and lesson history. Also powers Home's upcoming-lesson card.
//
// Live lesson model: each Fidel level has one live lesson. Lesson N's
// first portion is the mastery check for Level N-1 (except Lesson 1,
// which has none) -- there is no separate "live test" appointment. This
// file never gates practice; it only informs ("Book Level X Lesson") and
// handles the booking/payment mechanics.
//
// Payment: a booking starts as 'pending_payment' (inserted directly by
// this file, respecting RLS -- a student can only ever insert a row for
// themselves). This file then calls the create-checkout-session Edge
// Function and redirects to Stripe. Only the stripe-webhook Edge Function
// (service-role key) is ever allowed to flip a booking to 'confirmed' --
// see schedule_migration.sql. This file never marks a booking paid itself.
//
// Loads after app.js (_supabase, currentUser, currentProfile,
// showNotificationToast, showGobezToast, icon, blockIfPreviewing) and
// after challenge.js (getMyCurrentLevel).
// =============================================================================

// Whether this student has already had Level `levelNumber`'s live lesson
// -- the real booking history is the primary signal; the teacher's
// manual "Mark Lesson Delivered" team-wide override (lesson_level_delivered)
// still works as a fallback for anyone who didn't book through the app.
async function hasHadLessonForLevel(levelNumber, team) {
    if ((team?.lesson_level_delivered || 0) >= levelNumber) return true;
    if (!currentUser?.id) return false;

    const nowIso = new Date().toISOString();
    const { data } = await _supabase
        .from('lesson_bookings')
        .select('level_number, status, starts_at')
        .eq('student_id', currentUser.id)
        .eq('level_number', levelNumber)
        .eq('status', 'confirmed');

    return (data || []).some(b => b.starts_at && b.starts_at <= nowIso);
}
window.hasHadLessonForLevel = hasHadLessonForLevel;

function formatLessonDateTime(iso) {
    const d = new Date(iso);
    const datePart = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `${datePart} · ${timePart}`;
}

async function fetchLessonPriceCents() {
    const { data } = await _supabase.from('app_settings').select('lesson_price_cents').eq('singleton', true).maybeSingle();
    return data?.lesson_price_cents || 300;
}

// The soonest not-yet-happened booking that's either paid for or mid-checkout.
// Filtered/sorted client-side since supabase-js can't filter on an embedded
// join's column directly in a simple query.
async function fetchMyUpcomingBooking() {
    if (!currentUser?.id) return null;
    const nowIso = new Date().toISOString();
    const { data } = await _supabase
        .from('lesson_bookings')
        .select('id, level_number, status, price_cents, starts_at, calendly_event_uri, calendly_confirmed_at, calendly_self_reported')
        .eq('student_id', currentUser.id)
        .in('status', ['pending_payment', 'confirmed']);

    const upcoming = (data || [])
        .filter(b => b.starts_at && b.starts_at > nowIso)
        .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    return upcoming[0] || null;
}
window.fetchMyUpcomingBooking = fetchMyUpcomingBooking;

// Every paid booking whose lesson time has already passed -- our stand-in
// for "completed" (no separate status needed; a confirmed booking in the
// past is definitionally a completed lesson).
async function fetchLessonHistory() {
    if (!currentUser?.id) return [];
    const nowIso = new Date().toISOString();
    const { data } = await _supabase
        .from('lesson_bookings')
        .select('id, level_number, status, starts_at')
        .eq('student_id', currentUser.id)
        .eq('status', 'confirmed');

    return (data || [])
        .filter(b => b.starts_at && b.starts_at <= nowIso)
        .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
}

// ---------------------------------------------------------------------------
// Upcoming lesson -- shared rendering used by both the Schedule tab's own
// card and Home's compact upcoming-lesson card, so the two can never
// disagree about what "your next lesson" looks like.
// ---------------------------------------------------------------------------

async function fetchCalendlySchedulingUrl() {
    const { data } = await _supabase.from('app_settings').select('calendly_scheduling_url').eq('singleton', true).maybeSingle();
    return data?.calendly_scheduling_url || null;
}

function buildCalendlyPrefillUrl(schedulingUrl) {
    const params = new URLSearchParams();
    if (currentProfile?.nickname) params.set('name', currentProfile.nickname);
    if (currentProfile?.email) params.set('email', currentProfile.email);
    const query = params.toString();
    return query ? `${schedulingUrl}?${query}` : schedulingUrl;
}

function renderUpcomingLessonHtml(booking, { compact = false } = {}) {
    const dt = formatLessonDateTime(booking.starts_at);
    const priorLevel = booking.level_number - 1;
    const masteryNote = priorLevel >= 1
        ? `<p class="schedule-mastery-note">Includes Level ${priorLevel} mastery check</p>`
        : '';

    if (compact) {
        const calendlyNote = booking.status === 'confirmed' && !booking.calendly_confirmed_at && !booking.calendly_self_reported
            ? `<div class="home-lesson-mastery" style="color:#b45309;">⚠ Finish booking this on Calendly</div>`
            : '';
        return `
            <div class="home-lesson-level">Level ${booking.level_number} Fidel</div>
            <div class="home-lesson-time">${dt}</div>
            ${priorLevel >= 1 ? `<div class="home-lesson-mastery">Includes Level ${priorLevel} mastery check</div>` : ''}
            ${calendlyNote}
            <div class="home-lesson-link">View lesson →</div>
        `;
    }

    // Still mid-checkout -- nothing to confirm on Calendly yet, payment
    // hasn't gone through (or failed) so there's no point sending them
    // there until it has.
    if (booking.status !== 'confirmed') {
        return `
            <div class="schedule-upcoming-level">Level ${booking.level_number} Fidel Lesson</div>
            <div class="schedule-upcoming-time">${dt}</div>
            <div class="schedule-mastery-note">Finishing payment...</div>
        `;
    }

    let calendlyStateHtml;
    if (booking.calendly_confirmed_at) {
        calendlyStateHtml = `<div class="schedule-upcoming-paid schedule-upcoming-calendly-confirmed">${icon('check-circle')} Confirmed on calendar</div>`;
    } else if (booking.calendly_self_reported) {
        calendlyStateHtml = `<div class="schedule-calendly-note">You said you've confirmed this on Calendly — thanks! We'll double-check it lands.</div>`;
    } else {
        calendlyStateHtml = `
            <div class="schedule-calendly-pending">
                <p class="schedule-calendly-pending-text">One more step: confirm ${dt} on your teacher's calendar.</p>
                <button type="button" class="btn-primary" style="margin-bottom:8px;" onclick="openCalendlyToFinish('${dt.replace(/'/g, "\\'")}')">Open Calendly →</button>
                <button type="button" class="schedule-self-report-link" onclick="selfReportCalendlyConfirmed('${booking.id}')">I've confirmed this on Calendly</button>
            </div>`;
    }

    return `
        <div class="schedule-upcoming-level">Level ${booking.level_number} Fidel Lesson</div>
        <div class="schedule-upcoming-time">${dt}</div>
        <div class="schedule-upcoming-paid">${icon('check-circle')} Payment confirmed</div>
        ${masteryNote}
        ${calendlyStateHtml}
        <div class="schedule-upcoming-actions">
            <button type="button" class="btn-secondary" onclick="cancelLessonBooking('${booking.id}')">Cancel / Reschedule</button>
        </div>
    `;
}

async function openCalendlyToFinish(dtLabel) {
    const schedulingUrl = await fetchCalendlySchedulingUrl();
    if (!schedulingUrl) {
        return showNotificationToast("Calendly isn't connected yet -- ask your teacher.");
    }
    showNotificationToast(`On Calendly, pick ${dtLabel} to match what you paid for.`);
    window.open(buildCalendlyPrefillUrl(schedulingUrl), '_blank', 'noopener');
}
window.openCalendlyToFinish = openCalendlyToFinish;

// Courtesy signal only -- never treated as proof anywhere in the app. The
// trustworthy signal (calendly_confirmed_at) is set only by the
// calendly-webhook Edge Function, independently, when Calendly itself
// reports the booking.
async function selfReportCalendlyConfirmed(bookingId) {
    showNotificationToast('Got it, noting that...');
    const { error } = await _supabase.from('lesson_bookings').update({ calendly_self_reported: true }).eq('id', bookingId);
    if (error) return showNotificationToast("Couldn't save: " + error.message);
    showGobezToast(`Thanks! ${icon('check-circle')}`);
    if (typeof renderScheduleTab === 'function') await renderScheduleTab();
    if (typeof renderHomeUpcomingLessonCard === 'function') await renderHomeUpcomingLessonCard();
}
window.selfReportCalendlyConfirmed = selfReportCalendlyConfirmed;

// Home's compact version of the same card -- booked state reuses
// renderUpcomingLessonHtml's compact mode so the two can't disagree;
// unbooked state shows the recommended level + price + "Book lesson" CTA.
async function renderHomeUpcomingLessonCard() {
    const card = document.getElementById('homeLessonCard');
    const eyebrow = document.getElementById('homeLessonEyebrow');
    const mount = document.getElementById('homeLessonMount');
    if (!card || !mount) return;

    card.style.display = 'block';

    const booking = await fetchMyUpcomingBooking();
    if (booking) {
        card.classList.remove('home-lesson-unbooked');
        if (eyebrow) eyebrow.innerText = 'Next Lesson';
        mount.innerHTML = renderUpcomingLessonHtml(booking, { compact: true });
        return;
    }

    card.classList.add('home-lesson-unbooked');
    const myLevel = typeof getMyCurrentLevel === 'function' ? await getMyCurrentLevel() : 1;
    const priceCents = await fetchLessonPriceCents();
    const priceLabel = `$${(priceCents / 100).toFixed(2)}`;
    if (eyebrow) eyebrow.innerText = 'Ready for your next lesson?';
    mount.innerHTML = `
        <div class="home-lesson-level">Level ${myLevel} · ${priceLabel}</div>
        <div class="home-lesson-link">Book lesson →</div>
    `;
}
window.renderHomeUpcomingLessonCard = renderHomeUpcomingLessonCard;

async function renderUpcomingLessonCard(booking) {
    const mount = document.getElementById('scheduleUpcomingMount');
    if (!mount) return;
    if (!booking) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No lesson booked yet — see below to book your next one.</p>`;
        return;
    }
    mount.innerHTML = renderUpcomingLessonHtml(booking);
}

// ---------------------------------------------------------------------------
// Book next lesson
// ---------------------------------------------------------------------------

// Cache for the currently-displayed Calendly availability, keyed by local
// date string -- lets the date pills and time buttons re-render from the
// same fetch without hitting the Edge Function again on every tap.
let _calendlyTimesCache = null;
let _calendlySelectedDateKey = null;

// supabase-js puts a non-2xx Edge Function response's JSON body behind
// error.context (a Response), not in `data` -- without this, callers only
// ever see a generic "non-2xx status code" message instead of the real
// reason the function sent back.
async function readEdgeFunctionErrorMessage(error) {
    try {
        const body = await error?.context?.json?.();
        return body?.error || null;
    } catch {
        return null;
    }
}

async function renderBookNextLessonCard(recommendedLevel) {
    const card = document.getElementById('scheduleBookCard');
    const mount = document.getElementById('scheduleBookMount');
    const titleEl = document.getElementById('scheduleBookTitle');
    if (!card || !mount) return;

    if (titleEl) titleEl.innerText = 'Book Next Lesson';
    card.style.display = 'block';
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading available times...</p>`;

    const priceCents = await fetchLessonPriceCents();

    const { data, error } = await _supabase.functions.invoke('calendly-available-times', { body: { days: 14 } });
    if (error || data?.error) {
        const msg = (data && data.error) || await readEdgeFunctionErrorMessage(error) || "Couldn't load available times right now — try again shortly.";
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">${msg}</p>`;
        return;
    }

    const times = data?.times || [];
    if (times.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No open times in the next two weeks — check back soon.</p>`;
        return;
    }

    const byDate = {};
    const dateOrder = [];
    times.forEach(t => {
        const dateKey = new Date(t.start_time).toDateString();
        if (!byDate[dateKey]) { byDate[dateKey] = []; dateOrder.push(dateKey); }
        byDate[dateKey].push(t.start_time);
    });

    _calendlyTimesCache = { byDate, dateOrder, levelNumber: recommendedLevel, priceCents };
    _calendlySelectedDateKey = dateOrder[0];

    const priceLabel = `$${(priceCents / 100).toFixed(2)}`;
    const priorLevel = recommendedLevel - 1;
    const masteryNote = priorLevel >= 1
        ? `<p class="schedule-lesson-summary-sub">Includes Level ${priorLevel} mastery check</p>`
        : '';

    mount.innerHTML = `
        <div class="schedule-lesson-summary">
            <div class="schedule-lesson-summary-title">Level ${recommendedLevel} Fidel Lesson</div>
            ${masteryNote}
            <div class="schedule-lesson-summary-price">${priceLabel}</div>
        </div>
        <div class="schedule-date-row" id="scheduleDateRow"></div>
        <div class="schedule-time-row" id="scheduleTimeRow"></div>
    `;

    renderCalendlyDateRow();
    renderCalendlyTimeRow();
}

// Preply-style horizontal date selector -- one pill per date that has at
// least one open time, weekday + day number, selected one highlighted.
function renderCalendlyDateRow() {
    const row = document.getElementById('scheduleDateRow');
    if (!row || !_calendlyTimesCache) return;
    row.innerHTML = _calendlyTimesCache.dateOrder.map(dateKey => {
        const d = new Date(dateKey);
        const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
        const day = d.toLocaleDateString(undefined, { day: 'numeric' });
        const isSelected = dateKey === _calendlySelectedDateKey;
        return `
            <button type="button" class="schedule-date-pill${isSelected ? ' active' : ''}" onclick='selectCalendlyDate(${JSON.stringify(dateKey)})'>
                <span class="schedule-date-pill-weekday">${weekday}</span>
                <span class="schedule-date-pill-day">${day}</span>
            </button>`;
    }).join('');
}

function selectCalendlyDate(dateKey) {
    _calendlySelectedDateKey = dateKey;
    renderCalendlyDateRow();
    renderCalendlyTimeRow();
}
window.selectCalendlyDate = selectCalendlyDate;

function renderCalendlyTimeRow() {
    const row = document.getElementById('scheduleTimeRow');
    if (!row || !_calendlyTimesCache) return;
    const times = _calendlyTimesCache.byDate[_calendlySelectedDateKey] || [];
    row.innerHTML = times.map(iso => {
        const label = new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        return `<button type="button" class="schedule-time-btn" onclick='bookCalendlyTime(${JSON.stringify(iso)})'>${label}</button>`;
    }).join('');
}

async function bookCalendlyTime(startTimeIso) {
    if (typeof blockIfPreviewing === 'function' && blockIfPreviewing()) return;
    if (!_calendlyTimesCache) return;
    const { levelNumber, priceCents } = _calendlyTimesCache;

    showNotificationToast('Reserving your spot...');

    const { data: booking, error } = await _supabase
        .from('lesson_bookings')
        .insert({ starts_at: startTimeIso, student_id: currentUser.id, level_number: levelNumber, price_cents: priceCents })
        .select('id')
        .single();

    if (error) {
        console.error('Failed to create booking:', error);
        return showNotificationToast("Couldn't reserve that time: " + error.message);
    }

    showNotificationToast('Redirecting to payment...');

    const basePath = window.location.origin + window.location.pathname;
    const successUrl = `${basePath}?booking_id=${booking.id}&checkout=success`;
    const cancelUrl = `${basePath}?booking_id=${booking.id}&checkout=canceled`;

    try {
        const { data: sessionData, error: fnError } = await _supabase.functions.invoke('create-checkout-session', {
            body: { bookingId: booking.id, successUrl, cancelUrl }
        });
        if (fnError || !sessionData?.url) throw fnError || new Error('No checkout URL returned');
        window.location.href = sessionData.url;
    } catch (err) {
        console.error('Failed to start checkout:', err);
        showNotificationToast("Couldn't start payment. Please try again.");
        // Don't hold the slot hostage for a checkout that never started.
        await _supabase.from('lesson_bookings').delete().eq('id', booking.id);
    }
}
window.bookCalendlyTime = bookCalendlyTime;

async function cancelLessonBooking(bookingId) {
    if (!confirm('Cancel this lesson booking?')) return;
    showNotificationToast('Canceling...');

    // If this booking was already confirmed on Calendly, cancel the real
    // event there too -- not a hard dependency, the app-side cancel below
    // still proceeds even if this fails (e.g. it was never confirmed on
    // Calendly in the first place, which comes back as a clean no-op).
    let calendlyResult = null;
    try {
        const { data } = await _supabase.functions.invoke('calendly-cancel-event', { body: { bookingId } });
        calendlyResult = data;
    } catch (err) {
        console.error('calendly-cancel-event call failed:', err);
    }

    const { error } = await _supabase.from('lesson_bookings').update({ status: 'canceled' }).eq('id', bookingId);
    if (error) return showNotificationToast("Couldn't cancel: " + error.message);

    if (calendlyResult?.error) {
        showNotificationToast("Canceled in Fidel, but couldn't remove it from Calendly automatically — let your teacher know.");
    } else {
        showNotificationToast('Booking canceled.');
    }
    if (typeof renderScheduleTab === 'function') await renderScheduleTab();
    if (typeof renderHomeUpcomingLessonCard === 'function') await renderHomeUpcomingLessonCard();
}
window.cancelLessonBooking = cancelLessonBooking;

// ---------------------------------------------------------------------------
// Lesson history
// ---------------------------------------------------------------------------

async function renderLessonHistoryCard() {
    const mount = document.getElementById('scheduleHistoryMount');
    if (!mount) return;

    const history = await fetchLessonHistory();
    if (history.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No completed lessons yet.</p>`;
        return;
    }

    const priorLevels = [...new Set(history.map(b => b.level_number - 1).filter(l => l >= 1))];
    const { data: completions } = priorLevels.length > 0
        ? await _supabase.from('level_completion_requests').select('level_number, status').eq('student_id', currentUser.id).in('level_number', priorLevels)
        : { data: [] };
    const statusByLevel = {};
    (completions || []).forEach(c => { statusByLevel[c.level_number] = c.status; });

    mount.innerHTML = history.map(b => {
        const dt = new Date(b.starts_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const priorLevel = b.level_number - 1;
        let masteryLine = '';
        if (priorLevel >= 1) {
            const st = statusByLevel[priorLevel];
            const label = st === 'approved' ? 'Passed' : st ? 'Pending' : '—';
            masteryLine = `<div class="schedule-history-mastery">Level ${priorLevel} mastery: ${label}</div>`;
        }
        return `
            <div class="schedule-history-row">
                <div class="schedule-history-top">
                    <strong>${dt} — Level ${b.level_number} Lesson</strong>
                    <span class="schedule-history-status">Completed</span>
                </div>
                ${masteryLine}
            </div>`;
    }).join('');
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

async function renderScheduleTab() {
    const [booking, myLevel] = await Promise.all([
        fetchMyUpcomingBooking(),
        typeof getMyCurrentLevel === 'function' ? getMyCurrentLevel() : Promise.resolve(1)
    ]);

    await renderUpcomingLessonCard(booking);

    const bookCard = document.getElementById('scheduleBookCard');
    if (booking) {
        if (bookCard) bookCard.style.display = 'none';
    } else {
        await renderBookNextLessonCard(myLevel);
    }

    await renderLessonHistoryCard();
}
window.renderScheduleTab = renderScheduleTab;

// Called once on login/app load. Detects a return from Stripe Checkout
// (success or cancel), confirms it, and cleans the URL so refreshing
// doesn't re-trigger the same handling.
async function handleScheduleReturnIfNeeded() {
    const params = new URLSearchParams(window.location.search);
    const bookingId = params.get('booking_id');
    const checkoutResult = params.get('checkout');
    if (!bookingId) return;

    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, '', cleanUrl);

    if (typeof switchStudentShellTab === 'function') switchStudentShellTab('schedule');

    if (checkoutResult === 'canceled') {
        showNotificationToast('Checkout canceled — your spot was not reserved.');
        await _supabase.from('lesson_bookings').delete().eq('id', bookingId).eq('status', 'pending_payment');
        if (typeof renderScheduleTab === 'function') await renderScheduleTab();
        return;
    }

    showNotificationToast('Confirming your payment...');
    // Stripe's webhook usually lands within a second or two, but it isn't
    // synchronous with this redirect -- poll briefly instead of assuming
    // it already landed.
    for (let i = 0; i < 8; i++) {
        const { data } = await _supabase.from('lesson_bookings').select('status').eq('id', bookingId).maybeSingle();
        if (data?.status === 'confirmed') {
            showGobezToast(`Lesson booked! ${icon('confetti')}`);
            if (typeof renderScheduleTab === 'function') await renderScheduleTab();
            if (typeof renderHomeUpcomingLessonCard === 'function') await renderHomeUpcomingLessonCard();
            return;
        }
        await new Promise(r => setTimeout(r, 1500));
    }
    showNotificationToast('Payment is still processing — check back in a moment.');
    if (typeof renderScheduleTab === 'function') await renderScheduleTab();
}
window.handleScheduleReturnIfNeeded = handleScheduleReturnIfNeeded;

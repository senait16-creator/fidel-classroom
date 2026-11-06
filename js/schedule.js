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
        .select('level_number, status, lesson_slots(starts_at)')
        .eq('student_id', currentUser.id)
        .eq('level_number', levelNumber)
        .eq('status', 'confirmed');

    return (data || []).some(b => b.lesson_slots?.starts_at && b.lesson_slots.starts_at <= nowIso);
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
        .select('id, level_number, status, price_cents, slot_id, lesson_slots(starts_at)')
        .eq('student_id', currentUser.id)
        .in('status', ['pending_payment', 'confirmed']);

    const upcoming = (data || [])
        .filter(b => b.lesson_slots?.starts_at && b.lesson_slots.starts_at > nowIso)
        .sort((a, b) => new Date(a.lesson_slots.starts_at) - new Date(b.lesson_slots.starts_at));
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
        .select('id, level_number, status, lesson_slots(starts_at)')
        .eq('student_id', currentUser.id)
        .eq('status', 'confirmed');

    return (data || [])
        .filter(b => b.lesson_slots?.starts_at && b.lesson_slots.starts_at <= nowIso)
        .sort((a, b) => new Date(b.lesson_slots.starts_at) - new Date(a.lesson_slots.starts_at));
}

// ---------------------------------------------------------------------------
// Upcoming lesson -- shared rendering used by both the Schedule tab's own
// card and Home's compact upcoming-lesson card, so the two can never
// disagree about what "your next lesson" looks like.
// ---------------------------------------------------------------------------

function renderUpcomingLessonHtml(booking, { compact = false } = {}) {
    const dt = formatLessonDateTime(booking.lesson_slots.starts_at);
    const priorLevel = booking.level_number - 1;
    const masteryNote = priorLevel >= 1
        ? `<p class="schedule-mastery-note">Includes Level ${priorLevel} mastery check</p>`
        : '';

    if (compact) {
        return `
            <div class="home-lesson-level">Level ${booking.level_number} Fidel</div>
            <div class="home-lesson-time">${dt}</div>
            ${priorLevel >= 1 ? `<div class="home-lesson-mastery">Includes Level ${priorLevel} mastery check</div>` : ''}
            <div class="home-lesson-link">View lesson →</div>
        `;
    }

    return `
        <div class="schedule-upcoming-level">Level ${booking.level_number} Fidel Lesson</div>
        <div class="schedule-upcoming-time">${dt}</div>
        <div class="schedule-upcoming-paid">${icon('check-circle')} Payment confirmed</div>
        ${masteryNote}
        <div class="schedule-upcoming-actions">
            <button type="button" class="btn-secondary" onclick="cancelLessonBooking('${booking.id}')">Cancel / Reschedule</button>
        </div>
    `;
}

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

async function renderBookNextLessonCard(recommendedLevel) {
    const card = document.getElementById('scheduleBookCard');
    const mount = document.getElementById('scheduleBookMount');
    const titleEl = document.getElementById('scheduleBookTitle');
    if (!card || !mount) return;

    const priceCents = await fetchLessonPriceCents();
    const priceLabel = `$${(priceCents / 100).toFixed(2)}`;
    if (titleEl) titleEl.innerText = `Book Level ${recommendedLevel} Lesson · ${priceLabel}`;

    const nowIso = new Date().toISOString();
    const { data: slots } = await _supabase
        .from('lesson_slots')
        .select('id, starts_at, capacity')
        .eq('target_level', recommendedLevel)
        .eq('is_canceled', false)
        .gte('starts_at', nowIso)
        .order('starts_at', { ascending: true });

    card.style.display = 'block';

    if (!slots || slots.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No times posted yet for Level ${recommendedLevel} — check back soon or ask your teacher.</p>`;
        return;
    }

    const slotIds = slots.map(s => s.id);
    const { data: bookedRows } = await _supabase
        .from('lesson_bookings')
        .select('slot_id')
        .in('slot_id', slotIds)
        .in('status', ['pending_payment', 'confirmed']);

    const bookedCountBySlot = {};
    (bookedRows || []).forEach(b => { bookedCountBySlot[b.slot_id] = (bookedCountBySlot[b.slot_id] || 0) + 1; });

    const openSlots = slots.filter(s => (bookedCountBySlot[s.id] || 0) < s.capacity);

    if (openSlots.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">All posted Level ${recommendedLevel} times are full — check back soon.</p>`;
        return;
    }

    mount.innerHTML = openSlots.map(s => `
        <button type="button" class="schedule-slot-btn" onclick="bookLessonSlot('${s.id}', ${recommendedLevel}, ${priceCents})">
            ${formatLessonDateTime(s.starts_at)}
        </button>
    `).join('');
}

async function bookLessonSlot(slotId, levelNumber, priceCents) {
    if (typeof blockIfPreviewing === 'function' && blockIfPreviewing()) return;
    showNotificationToast('Reserving your spot...');

    const { data: booking, error } = await _supabase
        .from('lesson_bookings')
        .insert({ slot_id: slotId, student_id: currentUser.id, level_number: levelNumber, price_cents: priceCents })
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
window.bookLessonSlot = bookLessonSlot;

async function cancelLessonBooking(bookingId) {
    if (!confirm('Cancel this lesson booking?')) return;
    showNotificationToast('Canceling...');
    const { error } = await _supabase.from('lesson_bookings').update({ status: 'canceled' }).eq('id', bookingId);
    if (error) return showNotificationToast("Couldn't cancel: " + error.message);
    showNotificationToast('Booking canceled.');
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
        const dt = new Date(b.lesson_slots.starts_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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

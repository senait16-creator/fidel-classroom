// =============================================================================
// CALENDAR.JS
// Generic month-grid calendar + event system — not hardcoded to Fidel
// Competition. Everything above the "Competition Calendar" section works
// off a plain CalendarEvent shape:
//   { id, type, date ('YYYY-MM-DD'), title, shortLabel, teamName, teamId,
//     studentName, levelNumber, notes }
// and has no idea where that data came from. fetchCompetitionCalendarEvents()
// is the one Competition-specific adapter that builds that shape from
// writing_submissions / calendar_events. A future calendar elsewhere in the
// app should add its own fetchXEvents() adapter and reuse the renderer/
// day-detail/event-detail functions as-is, instead of building a new
// calendar from scratch.
//
// Loads AFTER app.js (alphabetData) and challenge.js (getTeamHex,
// fetchChallengeLevels, challengeLevelsCache).
// =============================================================================

// `groupable: true` types get collapsed into a count header ("5 writing
// approvals") in day detail, since a wall of near-identical rows doesn't
// read as a story. `emphasize: true` types are milestones — they never
// group, and get their own gold/banner treatment instead so they dominate
// the day rather than getting buried in a list.
const CALENDAR_EVENT_TYPES = {
    writing_submitted: { icon: '✍️', color: '#2563eb', label: 'Writing submitted', groupNoun: 'writing submission', groupable: true },
    writing_approved:  { icon: '✅', color: '#166534', label: 'Writing approved', groupNoun: 'writing approval', groupable: true },
    team_level_up:     { icon: '🏆', color: '#ca8a04', label: 'Team leveled up', emphasize: true },
    // Dormant until a captain-change write path is wired up (see the
    // schema notes) — included now so the type exists end-to-end and
    // proves out the "add a type without redesigning the calendar" promise.
    captain_change:    { icon: '👑', color: '#7e22ce', label: 'New team captain', emphasize: true },
    announcement:      { icon: '📢', color: '#dc2626', label: 'Announcement', groupNoun: 'announcement', groupable: true }
};

// Filter bar only covers the three things most people actually want to
// narrow down to — captain changes/announcements still show under "All".
const CALENDAR_FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'writing_submitted', label: 'Submissions' },
    { key: 'writing_approved', label: 'Approvals' },
    { key: 'team_level_up', label: 'Level Ups' }
];

const CALENDAR_WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CALENDAR_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// -----------------------------------------------------------------------------
// Generic month-grid renderer
// -----------------------------------------------------------------------------

function formatCalendarDateKey(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function groupCalendarEventsByDate(events) {
    const map = {};
    events.forEach(ev => {
        if (!map[ev.date]) map[ev.date] = [];
        map[ev.date].push(ev);
    });
    return map;
}

// mountEl: the grid container. events: CalendarEvent[] for the visible month
// (already filtered, if a filter is active). onDayClick(dateKey, eventsForThatDay)
// fires when a day cell is tapped. Cells show at most one dot per event TYPE
// present (not one per event) so they stay tiny regardless of volume, and a
// level-up day gets a trophy badge + gold background instead of just another dot.
function renderCalendarMonthGrid(mountEl, year, month, events, onDayClick) {
    if (!mountEl) return;

    const eventsByDate = groupCalendarEventsByDate(events);
    const firstOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leadingBlanks = (firstOfMonth.getDay() + 6) % 7; // Monday-first
    const now = new Date();
    const todayKey = formatCalendarDateKey(now.getFullYear(), now.getMonth(), now.getDate());

    let html = `<div class="calendar-weekday-row">${CALENDAR_WEEKDAY_LABELS.map(d => `<div class="calendar-weekday">${d}</div>`).join('')}</div>`;
    html += `<div class="calendar-grid">`;

    for (let i = 0; i < leadingBlanks; i++) {
        html += `<div class="calendar-day-cell empty"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = formatCalendarDateKey(year, month, day);
        const dayEvents = eventsByDate[dateKey] || [];
        const hasMilestone = dayEvents.some(ev => CALENDAR_EVENT_TYPES[ev.type]?.emphasize);
        const isToday = dateKey === todayKey;

        const typesPresent = [...new Set(
            dayEvents.filter(ev => !CALENDAR_EVENT_TYPES[ev.type]?.emphasize).map(ev => ev.type)
        )];
        const dots = typesPresent.map(type => {
            const meta = CALENDAR_EVENT_TYPES[type] || {};
            return `<span class="calendar-day-dot" style="background:${meta.color || '#94a3b8'};" title="${meta.label || type}"></span>`;
        }).join('');
        const badge = hasMilestone ? `<span class="calendar-day-trophy">🏆</span>` : '';

        html += `
            <div class="calendar-day-cell ${dayEvents.length ? 'has-events' : ''} ${hasMilestone ? 'has-levelup' : ''} ${isToday ? 'is-today' : ''}" data-date="${dateKey}">
                ${badge}
                <div class="calendar-day-number">${day}</div>
                <div class="calendar-day-dots">${dots}</div>
            </div>
        `;
    }

    html += `</div>`;
    mountEl.innerHTML = html;

    mountEl.querySelectorAll('.calendar-day-cell[data-date]').forEach(cell => {
        cell.onclick = () => {
            const dateKey = cell.getAttribute('data-date');
            onDayClick(dateKey, eventsByDate[dateKey] || []);
        };
    });
}
window.renderCalendarMonthGrid = renderCalendarMonthGrid;
window.groupCalendarEventsByDate = groupCalendarEventsByDate;

function filterCalendarEvents(events, filterKey) {
    if (!filterKey || filterKey === 'all') return events;
    return events.filter(ev => ev.type === filterKey);
}
window.filterCalendarEvents = filterCalendarEvents;

// -----------------------------------------------------------------------------
// Competition Calendar — the current consumer of the generic renderer above.
// A future calendar elsewhere in the app adds its own adapter function and
// calls renderCalendarMonthGrid()/the detail overlays the same way, without
// touching anything above this line.
// -----------------------------------------------------------------------------

let calendarViewYear = null;
let calendarViewMonth = null; // 0-indexed
let calendarActiveFilter = 'all';
let calendarMonthEventsCache = [];
let calendarBaseLetterLevelMap = null;

async function getCalendarBaseLetterLevelMap() {
    if (calendarBaseLetterLevelMap) return calendarBaseLetterLevelMap;
    const levels = typeof fetchChallengeLevels === 'function' ? await fetchChallengeLevels() : [];
    const map = {};
    levels.forEach(level => {
        (level.letter_families || []).forEach(letter => { map[letter] = level.level_number; });
    });
    calendarBaseLetterLevelMap = map;
    return map;
}

async function fetchCompetitionCalendarEvents(year, month) {
    const monthEnd = new Date(year, month + 1, 0);
    const startIso = new Date(year, month, 1).toISOString();
    const endIso = new Date(year, month + 1, 1).toISOString(); // exclusive upper bound
    const startKey = formatCalendarDateKey(year, month, 1);
    const endKey = formatCalendarDateKey(year, month, monthEnd.getDate());

    const [profilesRes, teamsRes, submittedRes, approvedRes, loggedRes, levelMap] = await Promise.all([
        _supabase.from('profiles').select('id, nickname, team_id'),
        // is_test = false excludes practice teams (e.g. Purple Team) the
        // same way the rest of the app already does — see app.js/
        // songweek.js/team/map.js for the other places filtering on this
        // same column.
        _supabase.from('teams').select('id, name').eq('is_test', false),
        _supabase.from('writing_submissions').select('id, student_id, base_letter, submitted_at')
            .gte('submitted_at', startIso).lt('submitted_at', endIso),
        _supabase.from('writing_submissions').select('id, student_id, base_letter, reviewed_at, reviewer_note')
            .eq('status', 'approved').gte('reviewed_at', startIso).lt('reviewed_at', endIso),
        _supabase.from('calendar_events').select('id, event_type, event_date, team_id, student_id, level_number, title, description')
            .gte('event_date', startKey).lte('event_date', endKey),
        getCalendarBaseLetterLevelMap()
    ]);

    const profilesById = {};
    (profilesRes.data || []).forEach(p => { profilesById[p.id] = p; });
    // Test teams are already excluded from teamsRes, so a student whose
    // team_id isn't in here belongs to a test team (or has no team).
    const teamsById = {};
    (teamsRes.data || []).forEach(t => { teamsById[t.id] = t; });
    const isExcludedStudent = (studentId) => {
        const student = profilesById[studentId];
        return !!student?.team_id && !teamsById[student.team_id];
    };

    const events = [];

    (submittedRes.data || []).forEach(row => {
        if (isExcludedStudent(row.student_id)) return;
        const student = profilesById[row.student_id];
        const team = student ? teamsById[student.team_id] : null;
        const name = student?.nickname || 'A student';
        events.push({
            id: 'sub-' + row.id,
            type: 'writing_submitted',
            date: row.submitted_at.slice(0, 10),
            title: `${name} submitted ${row.base_letter}`,
            shortLabel: `${name} — ${row.base_letter}`,
            teamName: team?.name || null,
            teamId: team?.id || null,
            studentName: student?.nickname || null,
            levelNumber: levelMap[row.base_letter] || null,
            notes: null
        });
    });

    (approvedRes.data || []).forEach(row => {
        if (isExcludedStudent(row.student_id)) return;
        const student = profilesById[row.student_id];
        const team = student ? teamsById[student.team_id] : null;
        const name = student?.nickname || 'A student';
        events.push({
            id: 'appr-' + row.id,
            type: 'writing_approved',
            date: row.reviewed_at.slice(0, 10),
            title: `${name} passed ${row.base_letter}`,
            shortLabel: `${name} — ${row.base_letter}`,
            teamName: team?.name || null,
            teamId: team?.id || null,
            studentName: student?.nickname || null,
            levelNumber: levelMap[row.base_letter] || null,
            notes: row.reviewer_note || null
        });
    });

    // team_level_up / captain_change / announcement have no other natural
    // source — read straight from calendar_events. Empty until either an
    // optional DB trigger is enabled (level-ups, captain changes) or a
    // teacher authors one (announcements).
    (loggedRes.data || []).forEach(row => {
        if (row.team_id && !teamsById[row.team_id]) return;
        if (row.student_id && isExcludedStudent(row.student_id)) return;
        const team = teamsById[row.team_id];
        const student = row.student_id ? profilesById[row.student_id] : null;
        events.push({
            id: 'log-' + row.id,
            type: row.event_type,
            date: row.event_date,
            title: row.title,
            shortLabel: row.title,
            teamName: team?.name || null,
            teamId: row.team_id || null,
            studentName: student?.nickname || null,
            levelNumber: row.level_number || null,
            notes: row.description || null
        });
    });

    return events;
}

async function openCompetitionCalendar() {
    const now = new Date();
    calendarViewYear = now.getFullYear();
    calendarViewMonth = now.getMonth();
    calendarActiveFilter = 'all';
    const overlay = document.getElementById('competitionCalendarOverlay');
    if (overlay) overlay.style.display = 'flex';
    renderCalendarFilterBar();
    await renderCompetitionCalendarMonth();
}
window.openCompetitionCalendar = openCompetitionCalendar;

function closeCompetitionCalendar() {
    const overlay = document.getElementById('competitionCalendarOverlay');
    if (overlay) overlay.style.display = 'none';
}
window.closeCompetitionCalendar = closeCompetitionCalendar;

async function navigateCalendarMonth(delta) {
    calendarViewMonth += delta;
    if (calendarViewMonth < 0) { calendarViewMonth = 11; calendarViewYear -= 1; }
    if (calendarViewMonth > 11) { calendarViewMonth = 0; calendarViewYear += 1; }
    await renderCompetitionCalendarMonth();
}
window.navigateCalendarMonth = navigateCalendarMonth;

function renderCalendarFilterBar() {
    const mount = document.getElementById('calendarFilterBar');
    if (!mount) return;
    mount.innerHTML = CALENDAR_FILTERS.map(f => `
        <button type="button" class="calendar-filter-pill ${f.key === calendarActiveFilter ? 'active' : ''}" data-filter="${f.key}">${f.label}</button>
    `).join('');
    mount.querySelectorAll('.calendar-filter-pill').forEach(btn => {
        btn.onclick = () => {
            calendarActiveFilter = btn.getAttribute('data-filter');
            renderCalendarFilterBar();
            renderCalendarFromCache();
        };
    });
}

function renderCalendarMonthSummary(events) {
    const mount = document.getElementById('calendarSummaryBar');
    if (!mount) return;
    const submitted = events.filter(ev => ev.type === 'writing_submitted').length;
    const approved = events.filter(ev => ev.type === 'writing_approved').length;
    const levelUps = events.filter(ev => ev.type === 'team_level_up').length;

    mount.innerHTML = `
        <span><strong>${submitted}</strong> submission${submitted === 1 ? '' : 's'}</span>
        <span><strong>${approved}</strong> approval${approved === 1 ? '' : 's'}</span>
        <span><strong>${levelUps}</strong> level up${levelUps === 1 ? '' : 's'}</span>
    `;
}

// Re-renders the grid + summary from the already-fetched month cache —
// used when switching filters so that doesn't need a network round trip.
function renderCalendarFromCache() {
    const mount = document.getElementById('calendarGridMount');
    renderCalendarMonthSummary(calendarMonthEventsCache);
    const visible = filterCalendarEvents(calendarMonthEventsCache, calendarActiveFilter);
    renderCalendarMonthGrid(mount, calendarViewYear, calendarViewMonth, visible, openCalendarDay);
}

async function renderCompetitionCalendarMonth() {
    const mount = document.getElementById('calendarGridMount');
    const label = document.getElementById('calendarMonthLabel');
    if (label) label.innerText = `${CALENDAR_MONTH_NAMES[calendarViewMonth]} ${calendarViewYear}`;
    if (mount) mount.innerHTML = `<p style="color:#94a3b8; font-size:13px; text-align:center; padding:24px 0;">Loading...</p>`;

    calendarMonthEventsCache = await fetchCompetitionCalendarEvents(calendarViewYear, calendarViewMonth);
    renderCalendarFromCache();
}

// -----------------------------------------------------------------------------
// Day detail — groups same-type events into an expandable count header
// ("5 writing approvals") instead of a wall of near-identical rows.
// Milestone events (team_level_up, captain_change) never group — they get
// their own gold banner at the top of the day so they dominate.
// -----------------------------------------------------------------------------

function openCalendarDay(dateKey, dayEvents) {
    const overlay = document.getElementById('calendarDayDetailOverlay');
    const title = document.getElementById('calendarDayDetailTitle');
    const list = document.getElementById('calendarDayDetailList');
    if (!overlay || !title || !list) return;

    const d = new Date(dateKey + 'T00:00:00');
    title.innerText = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    if (dayEvents.length === 0) {
        list.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Nothing happened this day.</p>`;
        overlay.style.display = 'flex';
        return;
    }

    const eventsById = {};
    dayEvents.forEach(ev => { eventsById[ev.id] = ev; });

    const milestones = dayEvents.filter(ev => CALENDAR_EVENT_TYPES[ev.type]?.emphasize);
    const groupable = dayEvents.filter(ev => !CALENDAR_EVENT_TYPES[ev.type]?.emphasize);

    let html = milestones.map(ev => {
        const meta = CALENDAR_EVENT_TYPES[ev.type] || {};
        return `
            <button type="button" class="calendar-banner-card" data-event-id="${ev.id}">
                <span class="calendar-banner-icon">${meta.icon || '🏆'}</span>
                <span class="calendar-banner-text">${ev.title}</span>
            </button>
        `;
    }).join('');

    const byType = {};
    groupable.forEach(ev => {
        if (!byType[ev.type]) byType[ev.type] = [];
        byType[ev.type].push(ev);
    });

    html += Object.entries(byType).map(([type, group]) => {
        const meta = CALENDAR_EVENT_TYPES[type] || {};
        const noun = meta.groupNoun || type;
        const groupId = `cal-group-${type}-${Math.random().toString(36).slice(2, 8)}`;
        return `
            <div class="calendar-group">
                <button type="button" class="calendar-group-header" data-target="${groupId}">
                    <span class="calendar-group-icon" style="background:${meta.color || '#94a3b8'};">${meta.icon || '•'}</span>
                    <span class="calendar-group-label">${group.length} ${noun}${group.length === 1 ? '' : 's'}</span>
                    <span class="calendar-group-arrow">▾</span>
                </button>
                <div class="calendar-group-body" id="${groupId}" style="display:none;">
                    ${group.map(ev => `<button type="button" class="calendar-group-item" data-event-id="${ev.id}">${ev.shortLabel || ev.title}</button>`).join('')}
                </div>
            </div>
        `;
    }).join('');

    list.innerHTML = html;

    list.querySelectorAll('.calendar-group-header').forEach(header => {
        header.onclick = () => {
            const body = document.getElementById(header.getAttribute('data-target'));
            if (!body) return;
            const isOpen = body.style.display === 'block';
            body.style.display = isOpen ? 'none' : 'block';
            header.classList.toggle('open', !isOpen);
        };
    });

    list.querySelectorAll('[data-event-id]').forEach(el => {
        el.onclick = (e) => {
            e.stopPropagation();
            const ev = eventsById[el.getAttribute('data-event-id')];
            if (ev) openCalendarEventDetail(ev);
        };
    });

    overlay.style.display = 'flex';
}
window.openCalendarDay = openCalendarDay;

function closeCalendarDayDetail() {
    const overlay = document.getElementById('calendarDayDetailOverlay');
    if (overlay) overlay.style.display = 'none';
}
window.closeCalendarDayDetail = closeCalendarDayDetail;

function openCalendarEventDetail(event) {
    const overlay = document.getElementById('calendarEventDetailOverlay');
    const body = document.getElementById('calendarEventDetailBody');
    if (!overlay || !body) return;

    const meta = CALENDAR_EVENT_TYPES[event.type] || {};
    const rows = [];
    if (event.studentName) rows.push(['Student', event.studentName]);
    if (event.teamName) rows.push(['Team', event.teamName]);
    if (event.levelNumber) rows.push(['Level', event.levelNumber]);
    if (event.notes) rows.push(['Notes', event.notes]);

    body.innerHTML = `
        <div class="calendar-event-detail-icon" style="background:${meta.color || '#94a3b8'};">${meta.icon || '•'}</div>
        <div class="calendar-event-detail-title">${event.title}</div>
        <div class="calendar-event-detail-type">${meta.label || event.type}</div>
        ${rows.length ? `<div class="calendar-event-detail-rows">${rows.map(([k, v]) => `
            <div class="calendar-event-detail-row"><span>${k}</span><strong>${v}</strong></div>
        `).join('')}</div>` : ''}
    `;

    overlay.style.display = 'flex';
}
window.openCalendarEventDetail = openCalendarEventDetail;

function closeCalendarEventDetail() {
    const overlay = document.getElementById('calendarEventDetailOverlay');
    if (overlay) overlay.style.display = 'none';
}
window.closeCalendarEventDetail = closeCalendarEventDetail;

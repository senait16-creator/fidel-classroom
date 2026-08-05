// =============================================================================
// CALENDAR.JS
// Generic month-grid calendar + event system — not hardcoded to Fidel
// Competition. Everything below works off a plain CalendarEvent shape:
//   { id, type, date ('YYYY-MM-DD'), title, shortLabel, teamName, teamId,
//     studentName, levelNumber, notes }
// and has no idea where that data came from. fetchCompetitionCalendarEvents()
// is the one Competition-specific adapter, and it's now a thin read of a
// single table (calendar_events) — every event type, individual or team,
// is logged there by a DB trigger with its narrative title already
// composed, so this file never re-derives English sentences from raw
// progress data. A future calendar elsewhere in the app should add its own
// fetchXEvents() adapter and reuse the renderer/day-detail/event-detail/
// highlights functions as-is, instead of building a new calendar from
// scratch.
// =============================================================================

// `category` drives the All/Individual/Team filter. `groupable: true` types
// collapse into a count header ("3 students began Level 2") in day detail
// when more than one happens the same day — a single occurrence renders as
// a plain row instead. `emphasize: true` types are milestones — they never
// group, get their own gold banner in day detail, a trophy badge on the
// month grid, and are the only things that show up in Monthly Highlights.
const CALENDAR_EVENT_TYPES = {
    level_started: {
        icon: '✍️', color: '#2563eb', label: 'Started a level', category: 'individual', groupable: true,
        groupLabel: (n, lvl) => `${n} ${n === 1 ? 'student' : 'students'} began Level ${lvl}`
    },
    level_ready: {
        icon: '🎯', color: '#7c3aed', label: 'Ready for writing test', category: 'individual', groupable: true,
        groupLabel: (n, lvl) => `${n} ${n === 1 ? 'student is' : 'students are'} ready for the Level ${lvl} writing test`
    },
    level_passed: {
        icon: '✅', color: '#166534', label: 'Passed writing test', category: 'individual', groupable: true,
        groupLabel: (n, lvl) => `${n} ${n === 1 ? 'student' : 'students'} passed the Level ${lvl} writing test`
    },
    team_level_up:             { icon: '🏆', color: '#ca8a04', label: 'Team leveled up', category: 'team', emphasize: true },
    first_to_level:            { icon: '🥇', color: '#b45309', label: 'First to reach a level', category: 'team', emphasize: true },
    all_teams_completed_level: { icon: '🎉', color: '#be185d', label: 'Every team caught up', category: 'team', emphasize: true },
    // Dormant — no write path wired up yet, included so the types exist
    // end-to-end and prove out "add a type without redesigning the
    // calendar." See the SQL notes for how to wire either one up.
    captain_change:         { icon: '👑', color: '#7e22ce', label: 'New team captain', category: 'team', emphasize: true },
    competition_milestone:  { icon: '🎯', color: '#0891b2', label: 'Competition milestone', category: 'team', emphasize: true }
};

const CALENDAR_FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'individual', label: 'Individual' },
    { key: 'team', label: 'Team' }
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
// milestone day gets a trophy badge + gold background instead of just
// another dot.
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
    return events.filter(ev => (CALENDAR_EVENT_TYPES[ev.type]?.category) === filterKey);
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

async function fetchCompetitionCalendarEvents(year, month) {
    const monthEnd = new Date(year, month + 1, 0);
    const startKey = formatCalendarDateKey(year, month, 1);
    const endKey = formatCalendarDateKey(year, month, monthEnd.getDate());

    const [profilesRes, teamsRes, loggedRes] = await Promise.all([
        _supabase.from('profiles').select('id, nickname, team_id'),
        // is_test = false excludes practice teams (e.g. Purple Team) the
        // same way the rest of the app already does — see app.js/
        // songweek.js/team/map.js for the other places filtering on this
        // same column.
        _supabase.from('teams').select('id, name').eq('is_test', false),
        _supabase.from('calendar_events').select('id, event_type, event_date, team_id, student_id, level_number, title, description')
            .gte('event_date', startKey).lte('event_date', endKey)
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
            shortLabel: student?.nickname || row.title,
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

// Summary + Highlights always reflect the full month regardless of the
// active filter — the filter narrows what the day grid shows, not the
// month's headline numbers or story.
function renderCalendarMonthSummary(events) {
    const mount = document.getElementById('calendarSummaryBar');
    if (!mount) return;
    const started = events.filter(ev => ev.type === 'level_started').length;
    const passed = events.filter(ev => ev.type === 'level_passed').length;
    const levelUps = events.filter(ev => ev.type === 'team_level_up').length;

    mount.innerHTML = `
        <span><strong>${started}</strong> level${started === 1 ? '' : 's'} started</span>
        <span><strong>${passed}</strong> writing test${passed === 1 ? '' : 's'} passed</span>
        <span><strong>${levelUps}</strong> team level-up${levelUps === 1 ? '' : 's'}</span>
    `;
}

function renderCalendarHighlights(events) {
    const mount = document.getElementById('calendarHighlightsMount');
    if (!mount) return;

    const highlights = events
        .filter(ev => CALENDAR_EVENT_TYPES[ev.type]?.emphasize)
        .sort((a, b) => a.date.localeCompare(b.date));

    if (highlights.length === 0) {
        mount.innerHTML = `<p class="calendar-highlights-empty">No major milestones yet this month.</p>`;
        return;
    }

    const eventsById = {};
    highlights.forEach(ev => { eventsById[ev.id] = ev; });

    mount.innerHTML = highlights.map(ev => {
        const meta = CALENDAR_EVENT_TYPES[ev.type] || {};
        const d = new Date(ev.date + 'T00:00:00');
        const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `
            <button type="button" class="calendar-highlight-item" data-event-id="${ev.id}">
                <span class="calendar-highlight-date">${dateLabel}</span>
                <span class="calendar-highlight-icon">${meta.icon || '🏆'}</span>
                <span class="calendar-highlight-text">${ev.title}</span>
            </button>
        `;
    }).join('');

    mount.querySelectorAll('.calendar-highlight-item').forEach(item => {
        item.onclick = () => openCalendarEventDetail(eventsById[item.getAttribute('data-event-id')]);
    });
}

// Re-renders the grid from the already-fetched month cache — used when
// switching filters so that doesn't need a network round trip. Summary and
// Highlights always use the unfiltered cache (see note above).
function renderCalendarFromCache() {
    const mount = document.getElementById('calendarGridMount');
    renderCalendarMonthSummary(calendarMonthEventsCache);
    renderCalendarHighlights(calendarMonthEventsCache);
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
// Day detail — groups same-type-and-level events into an expandable count
// header ("3 students began Level 2") instead of a wall of near-identical
// rows; a single occurrence renders as a plain row instead. Milestone
// events (team_level_up, first_to_level, ...) never group — they get their
// own gold banner at the top of the day so they dominate.
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

    // Group by (type, level) so "3 students began Level 2" doesn't get
    // conflated with a student beginning a different level the same day.
    const byGroup = {};
    groupable.forEach(ev => {
        const key = `${ev.type}::${ev.levelNumber || 'na'}`;
        if (!byGroup[key]) byGroup[key] = { type: ev.type, levelNumber: ev.levelNumber, items: [] };
        byGroup[key].items.push(ev);
    });

    html += Object.values(byGroup).map(({ type, levelNumber, items }) => {
        const meta = CALENDAR_EVENT_TYPES[type] || {};

        if (items.length === 1) {
            const ev = items[0];
            return `
                <button type="button" class="calendar-group-header" data-event-id="${ev.id}">
                    <span class="calendar-group-icon" style="background:${meta.color || '#94a3b8'};">${meta.icon || '•'}</span>
                    <span class="calendar-group-label">${ev.title}</span>
                </button>
            `;
        }

        const label = meta.groupLabel ? meta.groupLabel(items.length, levelNumber) : `${items.length} ${meta.label || type}`;
        const groupId = `cal-group-${type}-${levelNumber}-${Math.random().toString(36).slice(2, 8)}`;
        return `
            <div class="calendar-group">
                <button type="button" class="calendar-group-header" data-target="${groupId}">
                    <span class="calendar-group-icon" style="background:${meta.color || '#94a3b8'};">${meta.icon || '•'}</span>
                    <span class="calendar-group-label">${label}</span>
                    <span class="calendar-group-arrow">▾</span>
                </button>
                <div class="calendar-group-body" id="${groupId}" style="display:none;">
                    ${items.map(ev => `<button type="button" class="calendar-group-item" data-event-id="${ev.id}">${ev.shortLabel || ev.title}</button>`).join('')}
                </div>
            </div>
        `;
    }).join('');

    list.innerHTML = html;

    list.querySelectorAll('.calendar-group-header[data-target]').forEach(header => {
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
    if (!overlay || !body || !event) return;

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

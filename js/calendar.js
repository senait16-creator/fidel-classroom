// =============================================================================
// CALENDAR.JS
// Competition Timeline — a season history of the competition, not a
// scheduling tool. Built on a generic month-grid + event system that isn't
// hardcoded to Fidel Competition: everything below works off a plain
// CalendarEvent shape:
//   { id, type, date ('YYYY-MM-DD'), title, shortLabel, teamName, teamId,
//     studentName, levelNumber, notes }
// and has no idea where that data came from. fetchCompetitionCalendarEvents()
// is the one Competition-specific adapter, and it's a thin read of a single
// table (calendar_events) — every event's narrative title is composed once,
// at the source, by a DB trigger, so this file never re-derives English
// sentences from raw progress data. A future timeline elsewhere in the app
// should add its own fetchXEvents() adapter and reuse the renderer/
// day-detail/event-detail/grouped-timeline functions as-is, instead of
// building a new one from scratch.
// =============================================================================

// `category` drives the All/Individual/Team filter. `groupable: true` types
// collapse into a count header ("3 students began Level 2") in day detail
// when more than one happens the same day — a single occurrence renders as
// a plain row instead. `emphasize: true` types are milestones — they never
// group, and get their own gold banner wherever they appear (day detail,
// the main timeline) plus a trophy badge on the month grid. `highlight:
// true` is a separate, lighter flag: it marks a type as worth surfacing
// even though it's common enough to stay dot-only on the grid — level_passed
// uses this, since a student finishing a level is still worth telling.
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
        icon: '✅', color: '#166534', label: 'Passed writing test', category: 'individual', groupable: true, highlight: true,
        groupLabel: (n, lvl) => `${n} ${n === 1 ? 'student' : 'students'} passed the Level ${lvl} writing test`
    },
    team_level_up:             { icon: '🏆', color: '#ca8a04', label: 'Team leveled up', category: 'team', emphasize: true },
    first_to_level:            { icon: '🥇', color: '#b45309', label: 'First to reach a level', category: 'team', emphasize: true },
    all_teams_completed_level: { icon: '🎉', color: '#be185d', label: 'Every team caught up', category: 'team', emphasize: true },
    // Dormant — no write path wired up yet, included so the types exist
    // end-to-end and prove out "add a type without redesigning the
    // timeline." See the SQL notes for how to wire either one up.
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
const CALENDAR_GENERAL_GROUP_COLOR = '#475569';

// -----------------------------------------------------------------------------
// Generic month-grid renderer — dots represent TEAMS with activity that
// day (one dot per team, not one per event), so the grid answers "which
// teams were active" at a glance. A milestone day additionally gets a
// trophy badge + gold background regardless of which team it belongs to.
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

function calendarTeamColor(teamName) {
    return typeof getTeamHex === 'function' ? getTeamHex(teamName) : CALENDAR_GENERAL_GROUP_COLOR;
}

// mountEl: the grid container. events: CalendarEvent[] for the visible month
// (already filtered, if a filter is active). onDayClick(dateKey, eventsForThatDay)
// fires when a day cell is tapped.
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

        const teamsPresent = [...new Set(dayEvents.filter(ev => ev.teamName).map(ev => ev.teamName))];
        const hasGeneral = dayEvents.some(ev => !ev.teamName);
        const dots = teamsPresent.map(teamName =>
            `<span class="calendar-day-dot" style="background:${calendarTeamColor(teamName)};" title="${teamName}"></span>`
        ).join('') + (hasGeneral ? `<span class="calendar-day-dot" style="background:${CALENDAR_GENERAL_GROUP_COLOR};" title="Competition-wide"></span>` : '');
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
// Shared "grouped by team" renderer — used by both the day-detail popup and
// the main monthly Timeline, so a date's story and the month's story read
// the same way. Team-less events (e.g. "Every team caught up") get their
// own Competition-wide section, shown first.
// -----------------------------------------------------------------------------

function renderTimelineEventRow(ev) {
    const meta = CALENDAR_EVENT_TYPES[ev.type] || {};
    if (meta.emphasize) {
        return `
            <button type="button" class="calendar-banner-card" data-event-id="${ev.id}">
                <span class="calendar-banner-icon">${meta.icon || '🏆'}</span>
                <span class="calendar-banner-text">${ev.title}</span>
            </button>
        `;
    }
    return `
        <button type="button" class="timeline-event-row" data-event-id="${ev.id}">
            <span class="timeline-event-icon">${meta.icon || '•'}</span>
            <span class="timeline-event-text">${ev.title}</span>
        </button>
    `;
}

function renderEventsGroupedByTeam(events) {
    const general = events.filter(ev => !ev.teamName);
    const byTeam = {};
    events.filter(ev => ev.teamName).forEach(ev => {
        if (!byTeam[ev.teamName]) byTeam[ev.teamName] = [];
        byTeam[ev.teamName].push(ev);
    });

    // Most recently active team first — reads like "what's happening now,"
    // ties broken alphabetically for a stable order.
    const teamNames = Object.keys(byTeam).sort((a, b) => {
        const latest = (name) => byTeam[name].reduce((max, ev) => (ev.date > max ? ev.date : max), '');
        const cmp = latest(b).localeCompare(latest(a));
        return cmp !== 0 ? cmp : a.localeCompare(b);
    });

    const eventsById = {};
    events.forEach(ev => { eventsById[ev.id] = ev; });

    let html = '';

    if (general.length > 0) {
        const sortedGeneral = [...general].sort((a, b) => a.date.localeCompare(b.date));
        html += `
            <div class="timeline-team-group">
                <div class="timeline-team-header"><span class="timeline-team-dot" style="background:${CALENDAR_GENERAL_GROUP_COLOR};"></span> Competition-wide</div>
                <div class="timeline-team-items">${sortedGeneral.map(renderTimelineEventRow).join('')}</div>
            </div>
        `;
    }

    teamNames.forEach(teamName => {
        const teamEvents = [...byTeam[teamName]].sort((a, b) => a.date.localeCompare(b.date));
        html += `
            <div class="timeline-team-group">
                <div class="timeline-team-header"><span class="timeline-team-dot" style="background:${calendarTeamColor(teamName)};"></span> ${teamName}</div>
                <div class="timeline-team-items">${teamEvents.map(renderTimelineEventRow).join('')}</div>
            </div>
        `;
    });

    return { html, eventsById };
}

function wireTimelineEventClicks(mount, eventsById) {
    mount.querySelectorAll('[data-event-id]').forEach(el => {
        el.onclick = (e) => {
            e.stopPropagation();
            const ev = eventsById[el.getAttribute('data-event-id')];
            if (ev) openCalendarEventDetail(ev);
        };
    });
}

// -----------------------------------------------------------------------------
// Competition Timeline — the current consumer of the generic renderer above.
// A future timeline elsewhere in the app adds its own adapter function and
// calls these same pieces, without touching anything above this line.
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

// A one-line headline instead of raw stats: leads with "Team X took the
// lead" when a first_to_level milestone happened this month (the most
// recent one, if more than one), otherwise falls back to a simple count of
// the month's two most common individual milestones. Always reflects the
// full month regardless of the active filter — the filter narrows what the
// day grid/timeline show, not the month's headline.
function renderCalendarNarrativeSummary(events) {
    const mount = document.getElementById('calendarNarrativeSummary');
    if (!mount) return;

    const firstToLevel = events
        .filter(ev => ev.type === 'first_to_level')
        .sort((a, b) => b.date.localeCompare(a.date))[0];

    if (firstToLevel) {
        mount.innerText = `${firstToLevel.teamName} took the lead.`;
        return;
    }

    const started = events.filter(ev => ev.type === 'level_started').length;
    const passed = events.filter(ev => ev.type === 'level_passed').length;

    if (started === 0 && passed === 0) {
        mount.innerText = 'Nothing to show yet this month.';
        return;
    }

    mount.innerText = `${started} student${started === 1 ? '' : 's'} started new level${started === 1 ? '' : 's'} • ${passed} writing test${passed === 1 ? '' : 's'} passed`;
}

// Dynamic legend — only lists teams that actually had activity this month
// (plus a generic milestone key), since dots are team-colored rather than
// a fixed palette.
function renderCalendarLegend(events) {
    const mount = document.getElementById('calendarLegendMount');
    if (!mount) return;

    const teamNames = [...new Set(events.filter(ev => ev.teamName).map(ev => ev.teamName))].sort();
    const hasGeneral = events.some(ev => !ev.teamName);

    mount.innerHTML = teamNames.map(name => `
        <span><span class="calendar-legend-dot" style="background:${calendarTeamColor(name)};"></span>${name}</span>
    `).join('') + (hasGeneral ? `<span><span class="calendar-legend-dot" style="background:${CALENDAR_GENERAL_GROUP_COLOR};"></span>Competition-wide</span>` : '')
      + `<span>🏆 Milestone</span>`;
}

function renderCompetitionTimeline(events) {
    const mount = document.getElementById('calendarHighlightsMount');
    if (!mount) return;

    if (events.length === 0) {
        mount.innerHTML = `<p class="calendar-highlights-empty">Nothing to show yet this month.</p>`;
        return;
    }

    const { html, eventsById } = renderEventsGroupedByTeam(events);
    mount.innerHTML = html;
    wireTimelineEventClicks(mount, eventsById);
}

// Re-renders the grid + timeline from the already-fetched month cache —
// used when switching filters so that doesn't need a network round trip.
// The narrative summary and legend always use the unfiltered cache (see
// note above renderCalendarNarrativeSummary).
function renderCalendarFromCache() {
    const mount = document.getElementById('calendarGridMount');
    renderCalendarNarrativeSummary(calendarMonthEventsCache);
    renderCalendarLegend(calendarMonthEventsCache);
    const visible = filterCalendarEvents(calendarMonthEventsCache, calendarActiveFilter);
    renderCalendarMonthGrid(mount, calendarViewYear, calendarViewMonth, visible, openCalendarDay);
    renderCompetitionTimeline(visible);
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
// Dashboard preview — a compact teaser on the Competition Dashboard itself,
// since a feature hidden behind an icon goes undiscovered. Reuses the same
// month-grid renderer (shrunk via CSS) and shows the 5 most recent events
// as a flat list, since a "preview" doesn't need the full team-grouped story.
// -----------------------------------------------------------------------------

async function renderTimelinePreview() {
    const miniMount = document.getElementById('timelinePreviewMiniCalendar');
    const highlightsMount = document.getElementById('timelinePreviewHighlights');
    if (!miniMount && !highlightsMount) return;

    const now = new Date();
    const events = await fetchCompetitionCalendarEvents(now.getFullYear(), now.getMonth());

    if (miniMount) {
        renderCalendarMonthGrid(miniMount, now.getFullYear(), now.getMonth(), events, () => openCompetitionCalendar());
    }

    if (highlightsMount) {
        const recent = [...events].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
        if (recent.length === 0) {
            highlightsMount.innerHTML = `<p class="timeline-preview-empty">No activity yet this month.</p>`;
        } else {
            const eventsById = {};
            recent.forEach(ev => { eventsById[ev.id] = ev; });
            highlightsMount.innerHTML = recent.map(ev => {
                const meta = CALENDAR_EVENT_TYPES[ev.type] || {};
                return `<button type="button" class="timeline-preview-item" data-event-id="${ev.id}"><span>${meta.icon || '•'}</span> ${ev.title}</button>`;
            }).join('');
            wireTimelineEventClicks(highlightsMount, eventsById);
        }
    }
}
window.renderTimelinePreview = renderTimelinePreview;

// -----------------------------------------------------------------------------
// Day detail + event detail — day detail reuses the same grouped-by-team
// renderer as the main timeline, so a single date's story reads the same
// way as the month's.
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

    const { html, eventsById } = renderEventsGroupedByTeam(dayEvents);
    list.innerHTML = html;
    wireTimelineEventClicks(list, eventsById);

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

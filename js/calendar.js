// =============================================================================
// CALENDAR.JS
// Generic month-grid calendar + event system — not hardcoded to Fidel
// Competition. Everything above the "Competition Calendar" section works
// off a plain CalendarEvent shape:
//   { id, type, date ('YYYY-MM-DD'), title, teamName, teamId, studentName,
//     levelNumber, notes, recurring }
// and has no idea where that data came from. fetchCompetitionCalendarEvents()
// is the one Competition-specific adapter that builds that shape from
// writing_submissions / team_meetings / calendar_events. A future calendar
// elsewhere in the app should add its own fetchXEvents() adapter and reuse
// the renderer/day-detail/event-detail functions as-is, instead of building
// a new calendar from scratch.
//
// Loads AFTER app.js (alphabetData) and challenge.js (getTeamHex,
// fetchChallengeLevels, challengeLevelsCache).
// =============================================================================

const CALENDAR_EVENT_TYPES = {
    writing_submitted: { icon: '📝', color: '#2563eb', label: 'Writing submitted' },
    writing_approved:  { icon: '✅', color: '#166534', label: 'Writing approved' },
    team_level_up:     { icon: '🏆', color: '#ca8a04', label: 'Team leveled up', emphasize: true },
    team_meeting:      { icon: '👥', color: '#7e22ce', label: 'Team meeting' },
    announcement:      { icon: '📢', color: '#dc2626', label: 'Announcement' }
};

const CALENDAR_WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CALENDAR_WEEKDAY_LABELS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
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

// mountEl: the grid container. events: CalendarEvent[] for the visible month.
// onDayClick(dateKey, eventsForThatDay) fires when a day cell is tapped.
function renderCalendarMonthGrid(mountEl, year, month, events, onDayClick) {
    if (!mountEl) return;

    const eventsByDate = groupCalendarEventsByDate(events);
    const firstOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leadingBlanks = (firstOfMonth.getDay() + 6) % 7; // Monday-first, matches day_of_week strings used elsewhere
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
        const hasLevelUp = dayEvents.some(ev => CALENDAR_EVENT_TYPES[ev.type]?.emphasize);
        const isToday = dateKey === todayKey;

        const dots = dayEvents.slice(0, 3).map(ev => {
            const meta = CALENDAR_EVENT_TYPES[ev.type] || {};
            return `<span class="calendar-day-dot" style="background:${meta.color || '#94a3b8'};" title="${meta.label || ev.type}">${meta.icon || '•'}</span>`;
        }).join('');
        const overflow = dayEvents.length > 3 ? `<span class="calendar-day-more">+${dayEvents.length - 3}</span>` : '';

        html += `
            <div class="calendar-day-cell ${dayEvents.length ? 'has-events' : ''} ${hasLevelUp ? 'has-levelup' : ''} ${isToday ? 'is-today' : ''}" data-date="${dateKey}">
                <div class="calendar-day-number">${day}</div>
                <div class="calendar-day-dots">${dots}${overflow}</div>
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

// -----------------------------------------------------------------------------
// Competition Calendar — the current consumer of the generic renderer above.
// A future calendar elsewhere in the app adds its own adapter function and
// calls renderCalendarMonthGrid()/the detail overlays the same way, without
// touching anything above this line.
// -----------------------------------------------------------------------------

let calendarViewYear = null;
let calendarViewMonth = null; // 0-indexed
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

    const [profilesRes, teamsRes, submittedRes, approvedRes, meetingsRes, loggedRes, levelMap] = await Promise.all([
        _supabase.from('profiles').select('id, nickname, team_id'),
        _supabase.from('teams').select('id, name'),
        _supabase.from('writing_submissions').select('id, student_id, base_letter, submitted_at')
            .gte('submitted_at', startIso).lt('submitted_at', endIso),
        _supabase.from('writing_submissions').select('id, student_id, base_letter, reviewed_at, reviewer_note')
            .eq('status', 'approved').gte('reviewed_at', startIso).lt('reviewed_at', endIso),
        _supabase.from('team_meetings').select('team_id, day_of_week, meeting_time'),
        _supabase.from('calendar_events').select('id, event_type, event_date, team_id, student_id, level_number, title, description')
            .gte('event_date', startKey).lte('event_date', endKey),
        getCalendarBaseLetterLevelMap()
    ]);

    const profilesById = {};
    (profilesRes.data || []).forEach(p => { profilesById[p.id] = p; });
    const teamsById = {};
    (teamsRes.data || []).forEach(t => { teamsById[t.id] = t; });

    const events = [];

    (submittedRes.data || []).forEach(row => {
        const student = profilesById[row.student_id];
        const team = student ? teamsById[student.team_id] : null;
        events.push({
            id: 'sub-' + row.id,
            type: 'writing_submitted',
            date: row.submitted_at.slice(0, 10),
            title: `${student?.nickname || 'A student'} wrote ${row.base_letter}`,
            teamName: team?.name || null,
            teamId: team?.id || null,
            studentName: student?.nickname || null,
            levelNumber: levelMap[row.base_letter] || null,
            notes: null,
            recurring: false
        });
    });

    (approvedRes.data || []).forEach(row => {
        const student = profilesById[row.student_id];
        const team = student ? teamsById[student.team_id] : null;
        events.push({
            id: 'appr-' + row.id,
            type: 'writing_approved',
            date: row.reviewed_at.slice(0, 10),
            title: `${student?.nickname || 'A student'}'s ${row.base_letter} was approved`,
            teamName: team?.name || null,
            teamId: team?.id || null,
            studentName: student?.nickname || null,
            levelNumber: levelMap[row.base_letter] || null,
            notes: row.reviewer_note || null,
            recurring: false
        });
    });

    // Team meetings are stored as one recurring weekly slot per team, not
    // dated rows — synthesize each occurrence that falls in the visible
    // month instead of needing a stored row per instance.
    (meetingsRes.data || []).forEach(row => {
        if (!row.day_of_week) return;
        const team = teamsById[row.team_id];
        const targetWeekday = CALENDAR_WEEKDAY_LABELS_FULL.indexOf(row.day_of_week);
        if (targetWeekday === -1) return;
        for (let day = 1; day <= monthEnd.getDate(); day++) {
            const jsWeekday = (new Date(year, month, day).getDay() + 6) % 7; // Monday-first
            if (jsWeekday === targetWeekday) {
                events.push({
                    id: `meet-${row.team_id}-${year}-${month}-${day}`,
                    type: 'team_meeting',
                    date: formatCalendarDateKey(year, month, day),
                    title: `${team?.name || 'Team'} meeting`,
                    teamName: team?.name || null,
                    teamId: row.team_id,
                    studentName: null,
                    levelNumber: null,
                    notes: row.meeting_time || null,
                    recurring: true
                });
            }
        }
    });

    // team_level_up / announcement have no other natural source — read
    // straight from calendar_events. Empty until either the optional DB
    // trigger is enabled (level-ups) or a teacher authors one (announcements).
    (loggedRes.data || []).forEach(row => {
        const team = teamsById[row.team_id];
        const student = row.student_id ? profilesById[row.student_id] : null;
        events.push({
            id: 'log-' + row.id,
            type: row.event_type,
            date: row.event_date,
            title: row.title,
            teamName: team?.name || null,
            teamId: row.team_id || null,
            studentName: student?.nickname || null,
            levelNumber: row.level_number || null,
            notes: row.description || null,
            recurring: false
        });
    });

    return events;
}

async function openCompetitionCalendar() {
    const now = new Date();
    calendarViewYear = now.getFullYear();
    calendarViewMonth = now.getMonth();
    const overlay = document.getElementById('competitionCalendarOverlay');
    if (overlay) overlay.style.display = 'flex';
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

async function renderCompetitionCalendarMonth() {
    const mount = document.getElementById('calendarGridMount');
    const label = document.getElementById('calendarMonthLabel');
    if (label) label.innerText = `${CALENDAR_MONTH_NAMES[calendarViewMonth]} ${calendarViewYear}`;
    if (mount) mount.innerHTML = `<p style="color:#94a3b8; font-size:13px; text-align:center; padding:24px 0;">Loading...</p>`;

    const events = await fetchCompetitionCalendarEvents(calendarViewYear, calendarViewMonth);
    renderCalendarMonthGrid(mount, calendarViewYear, calendarViewMonth, events, openCalendarDay);
}

// -----------------------------------------------------------------------------
// Day detail + event detail — generic, driven entirely by the CalendarEvent
// shape passed in.
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
    } else {
        list.innerHTML = dayEvents.map((ev, idx) => {
            const meta = CALENDAR_EVENT_TYPES[ev.type] || {};
            return `
                <button type="button" class="calendar-day-event-row" data-idx="${idx}">
                    <span class="calendar-day-event-icon" style="background:${meta.color || '#94a3b8'};">${meta.icon || '•'}</span>
                    <span class="calendar-day-event-text">
                        <span class="calendar-day-event-title">${ev.title}</span>
                        ${ev.teamName ? `<span class="calendar-day-event-sub">${ev.teamName}</span>` : ''}
                    </span>
                </button>
            `;
        }).join('');

        list.querySelectorAll('.calendar-day-event-row').forEach(row => {
            row.onclick = () => openCalendarEventDetail(dayEvents[Number(row.getAttribute('data-idx'))]);
        });
    }

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

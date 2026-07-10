// =============================================================================
// JS/TEAM/PROGRESS.JS
// Team race visualization, level completion requests, and help flags.
//
// Loads after app.js. Relies on globals:
//   _supabase, currentUser, currentProfile, STREAK_THRESHOLD,
//   showNotificationToast, showGobezToast, executeVictoryConfettiCelebration,
//   getTeamHex, checkAndUpdateTeamLevelCompletion
// =============================================================================

// ---------------------------------------------------------------------------
// Team race view — all teams on a visual progress track, sorted by level
// ---------------------------------------------------------------------------

// Per-student, per-family status — the single source of truth both the
// team-row summary counts and the student detail view are built from, so
// the two views can never disagree about where someone actually stands.
//   not_started -> practicing -> needs_writing -> pending -> approved
// "help" is an overlay (a student mid-practice can still have flagged for
// help), not a separate point tier, so it doesn't affect the progress math.
const RACE_STATUS_POINTS = { not_started: 0, practicing: 1, needs_writing: 2, pending: 3, approved: 4 };

function computeRaceFamilyStatus(row, hasPendingSubmission, hasHelpFlag) {
    let key;
    if (row?.streak_passed && row?.writing_passed) key = 'approved';
    else if (hasPendingSubmission) key = 'pending';
    else if (row?.streak_passed) key = 'needs_writing';
    else if ((row?.best_streak || 0) > 0) key = 'practicing';
    else key = 'not_started';

    return { key, points: RACE_STATUS_POINTS[key], needsHelp: !!hasHelpFlag, streak: row?.best_streak || 0 };
}

const RACE_STATUS_LABEL = {
    approved: 'approved',
    pending: 'pending writing',
    needs_writing: 'needs writing',
    practicing: 'practicing',
    not_started: 'not started'
};

const RACE_TEAM_COLOR_MAP = {
    'Red':    '#ef4444',
    'Blue':   '#1d4ed8',
    'Green':  '#166534',
    'Yellow': '#a16207',
    'Purple': '#7c3aed',
};

function getRaceTeamColor(name) {
    for (const [key, hex] of Object.entries(RACE_TEAM_COLOR_MAP)) {
        if (name && name.includes(key)) return hex;
    }
    return '#64748b';
}

function getRaceTeamInitial(name) {
    if (!name) return '?';
    for (const key of Object.keys(RACE_TEAM_COLOR_MAP)) {
        if (name.includes(key)) return key[0];
    }
    return name[0];
}

// Shared standings computation — both the detailed Challenge-dashboard race
// and the lighter Community leaderboard are built from this same array, so
// the two views can never disagree about a team's rank or percentage.
//
// Reads ONLY the aggregate public_team_race_summary view (team/family
// counts, no student identities) — safe for any student to read for every
// team. Individual student-by-student detail (Layer 3) is fetched
// separately and lazily, see fetchTeamStudentDetail below, and only for
// teams the viewer is allowed to drill into.
async function computeTeamRaceStandings() {
    const { data: rows } = await _supabase
        .from('public_team_race_summary')
        .select('team_id, team_name, current_level, last_advanced_at, base_letter, member_count, approved_count, practicing_count, needs_writing_count, pending_count, help_count, team_percent')
        .order('team_name');

    if (!rows || rows.length === 0) return [];

    const teamIds = [...new Set(rows.map(r => r.team_id))];
    const { data: statusRows } = await _supabase
        .from('team_level_status')
        .select('team_id, level_number, all_members_cleared, live_quiz_passed')
        .in('team_id', teamIds);

    const byTeam = {};
    rows.forEach(r => {
        if (!byTeam[r.team_id]) {
            byTeam[r.team_id] = {
                id: r.team_id,
                name: r.team_name,
                level: r.current_level,
                last_advanced_at: r.last_advanced_at,
                memberCount: r.member_count,
                overallPct: Math.round(r.team_percent || 0),
                families: [],
                familySummaries: [],
                readyForQuiz: (statusRows || []).some(s =>
                    s.team_id === r.team_id && s.level_number === r.current_level &&
                    s.all_members_cleared && !s.live_quiz_passed
                )
            };
        }
        byTeam[r.team_id].families.push(r.base_letter);
        byTeam[r.team_id].familySummaries.push({
            family: r.base_letter,
            approved: r.approved_count,
            pending: r.pending_count,
            practicing: r.practicing_count + r.needs_writing_count,
            notStarted: r.member_count - r.approved_count - r.pending_count - r.practicing_count - r.needs_writing_count,
            memberCount: r.member_count,
            helpCount: r.help_count
        });
    });

    const standings = Object.values(byTeam);
    standings.sort((a, b) => b.overallPct - a.overallPct);
    return standings;
}

// A student can only drill into their OWN team's student-by-student
// detail; teachers/admins can drill into any team. Other teams stay at
// the aggregate level computed above — individual names, who asked for
// help, and who's stuck are not exposed cross-team.
function canExpandRaceTeam(teamId) {
    return !!currentProfile?.is_admin || teamId === currentProfile?.team_id;
}

// Persists streak progress for one family, defending against out-of-order
// concurrent writes to the same row: the periodic in-game autosave and
// the "streak passed" save are two independent async calls with no
// ordering guarantee, so if the autosave's write lands second, it can
// silently downgrade an already-passed streak back to not-passed even
// though best_streak stayed at/above the threshold. Reading the existing
// row first and taking the max/OR of old vs new makes every write
// monotonic — streak_passed can only ever go false -> true, and
// best_streak can only ever go up, regardless of arrival order. Shared by
// both the Fidel Challenge and embedded practice-sheet streak games so
// they can't drift apart.
async function saveStreakProgress(baseLetter, levelNumber, bestStreak, passed) {
    const { data: existing } = await _supabase
        .from('student_family_progress')
        .select('best_streak, streak_passed')
        .eq('student_id', currentUser.id)
        .eq('base_letter', baseLetter)
        .maybeSingle();

    const finalBestStreak = Math.max(bestStreak, existing?.best_streak || 0);
    const finalPassed = !!passed || !!existing?.streak_passed || finalBestStreak >= STREAK_THRESHOLD;

    const { error } = await _supabase.from('student_family_progress').upsert({
        student_id: currentUser.id, base_letter: baseLetter,
        level_number: levelNumber, best_streak: finalBestStreak, streak_passed: finalPassed
    }, { onConflict: 'student_id,base_letter' });
    if (error) console.error("Failed to save streak progress:", error);
}

// Credits an approved writing submission onto student_family_progress —
// shared by the teacher's and captain's approve-submission flows so they
// can't drift apart. Upserts rather than updates: the free-form "pick any
// letter" submit path in the Team Hub (openTeamHubFinalSubmit) has no
// gate requiring the streak game be played first, unlike the Practice
// Sheet flow, so a matching row may not exist yet. A plain UPDATE would
// then silently match zero rows and the approval would never register
// anywhere else in the app (roster, Team Race, the student's own view).
async function creditApprovedWritingToProgress(studentId, baseLetter) {
    const { data: progressRow } = await _supabase
        .from('student_family_progress')
        .select('streak_passed')
        .eq('student_id', studentId)
        .eq('base_letter', baseLetter)
        .maybeSingle();

    const payload = {
        student_id: studentId,
        base_letter: baseLetter,
        writing_passed: true
    };
    if (progressRow?.streak_passed) payload.completed_at = new Date().toISOString();

    if (!progressRow) {
        // Brand new row — resolve which level this letter belongs to so
        // level-scoped queries (roster, Team Race) can still find it.
        const { data: levelRow } = await _supabase
            .from('challenge_levels')
            .select('level_number')
            .contains('letter_families', [baseLetter])
            .maybeSingle();
        if (levelRow?.level_number) payload.level_number = levelRow.level_number;
    }

    const { error } = await _supabase
        .from('student_family_progress')
        .upsert(payload, { onConflict: 'student_id,base_letter' });

    if (error) console.error("Failed to credit approved writing to progress:", error);
}

// Lazy, per-team fetch of the protected, student-identifying tables —
// only ever called for a team the viewer is allowed to see (see
// canExpandRaceTeam), and only once per team per page load (cached by
// toggleRaceTeamDetail).
//
// Captains are excluded entirely — they don't grind the matching/writing
// game themselves (they review teammates' work instead), so they're not
// part of the race and shouldn't appear in the per-student breakdown.
async function fetchTeamStudentDetail(teamId, level, families) {
    const { data: members } = await _supabase
        .from('profiles')
        .select('id, nickname, avatar')
        .eq('team_id', teamId)
        .eq('is_captain', false);

    const memberIds = (members || []).map(m => m.id);
    if (memberIds.length === 0) return [];

    const [{ data: prog }, { data: subs }, { data: flags }] = await Promise.all([
        _supabase.from('student_family_progress')
            .select('student_id, base_letter, streak_passed, writing_passed, best_streak')
            .eq('level_number', level).in('student_id', memberIds),
        // No level_number filter here — writing_submissions doesn't have
        // that column, and base_letter alone is enough since each letter
        // belongs to exactly one challenge level.
        _supabase.from('writing_submissions')
            .select('student_id, base_letter').eq('status', 'pending').in('student_id', memberIds),
        _supabase.from('help_flags')
            .select('student_id, base_letter').eq('is_resolved', false).in('student_id', memberIds)
    ]);

    return (members || []).map(m => {
        const statuses = families.map(fam => {
            const row = (prog || []).find(p => p.student_id === m.id && p.base_letter === fam);
            const hasPending = (subs || []).some(s => s.student_id === m.id && s.base_letter === fam);
            const hasHelp = (flags || []).some(f => f.student_id === m.id && f.base_letter === fam);
            return { family: fam, status: computeRaceFamilyStatus(row, hasPending, hasHelp) };
        });
        return { ...m, statuses };
    });
}

// Single entry point for both places Team Race is shown. `options.mode`
// picks the depth of detail:
//   'challenge' (default) — full family breakdown + tap-to-expand
//     student detail, for the Fidel Challenge dashboard / team hub.
//   'compact' — rank/name/level/% + a couple of recent wins, for the
//     Community page so it doesn't overwhelm a celebration feed.
// Both modes are built from the same computeTeamRaceStandings() call, so
// they can never disagree about a team's rank or percentage.
async function renderTeamRaceView(mountId, options = {}) {
    const mode = options.mode === 'compact' ? 'compact' : 'challenge';
    const mount = document.getElementById(mountId);
    if (!mount) return;
    mount.innerHTML = `<p style="color:#94a3b8;font-size:13px;padding:8px 0;">Loading...</p>`;

    try {
        const standings = await computeTeamRaceStandings();

        if (standings.length === 0) {
            mount.innerHTML = `<p style="color:#94a3b8;font-size:13px;">No teams yet.</p>`;
            return;
        }

        _raceStandingsCache[mountId] = standings;

        if (mode === 'compact') {
            renderCompactRaceStandings(mount, standings);
        } else {
            renderDetailedRaceStandings(mount, mountId, standings);
        }
    } catch (e) {
        console.error('Race render error:', e);
        mount.innerHTML = `<p style="color:#94a3b8;font-size:13px;">Couldn't load team standings.</p>`;
    }
}

function renderDetailedRaceStandings(mount, mountId, standings) {
    const getTeamColor = getRaceTeamColor;
    const getTeamInitial = getRaceTeamInitial;
    const medals = ['🥇', '🥈', '🥉'];

    mount.innerHTML = '';
    const standings_div = document.createElement('div');
    standings_div.className = 'race-standings';

    standings.forEach((team, idx) => {
        const isYou = team.id === currentProfile?.team_id;
        const color = getTeamColor(team.name);
        const rowId = `raceRow-${mountId}-${team.id}`;

        const row = document.createElement('div');
        row.className = `race-row${isYou ? ' race-you' : ''}`;

        const medalHtml = idx < 3
            ? `<div class="race-medal">${medals[idx]}</div>`
            : `<div class="race-medal race-num">${idx + 1}</div>`;

        const familyLinesHtml = team.familySummaries.map(fs => {
            const parts = [`${fs.approved}/${fs.memberCount} approved`];
            if (fs.pending > 0) parts.push(`${fs.pending} pending`);
            if (fs.practicing > 0) parts.push(`${fs.practicing} practicing`);
            const fullyDone = fs.approved === fs.memberCount;
            return `
                <div class="race-family-line ${fullyDone ? 'race-family-line-done' : ''}">
                    <span class="race-family-letter">${fs.family}</span>
                    <span class="race-family-detail">${parts.join(' · ')}</span>
                </div>`;
        }).join('');

        // Only your own team (or a teacher/admin) can drill into
        // individual students — everyone else stops at the aggregate
        // family lines above. See canExpandRaceTeam.
        const expandable = canExpandRaceTeam(team.id);
        const headerAttrs = expandable
            ? `class="race-row-header race-row-expandable" onclick="toggleRaceTeamDetail('${mountId}', '${team.id}', '${rowId}')"`
            : `class="race-row-header"`;

        row.innerHTML = `
            <div ${headerAttrs}>
                ${medalHtml}
                <div class="race-team-dot" style="background:${color};">
                    ${getTeamInitial(team.name)}
                </div>
                <div class="race-team-info">
                    <div class="race-team-name-row">
                        <div class="race-team-name-text">
                            ${team.name}
                            ${isYou ? '<span class="race-you-tag">You</span>' : ''}
                        </div>
                        <div class="race-team-count">${team.overallPct}%</div>
                    </div>
                    <div class="race-bar-track">
                        <div class="race-bar-fill" style="width:${team.overallPct}%;background:${color};"></div>
                    </div>
                    <div class="race-team-sub">Level ${team.level} · ${team.memberCount} active student${team.memberCount === 1 ? '' : 's'}${team.readyForQuiz ? ' · 🎤 ready for live quiz' : ''}</div>
                </div>
                ${expandable ? '<div class="race-expand-arrow">▾</div>' : ''}
            </div>
            <div class="race-family-lines">${familyLinesHtml}</div>
            ${expandable ? `<div class="race-team-detail" id="${rowId}" style="display:none;"></div>` : ''}
        `;

        standings_div.appendChild(row);
    });

    mount.appendChild(standings_div);
}

// ---------------------------------------------------------------------------
// Community's lighter version — same standings data, but Community is a
// celebration feed, not a work dashboard, so this deliberately drops the
// per-family breakdown and tap-to-expand student detail (that stays on the
// Challenge dashboard / team hub, via mode:'challenge'). Just rank, level,
// a simple bar, and a couple of recent team-level-up "wins" for buzz.
// ---------------------------------------------------------------------------

function renderCompactRaceStandings(mount, standings) {
    const medals = ['🥇', '🥈', '🥉'];

    const rowsHtml = standings.map((team, idx) => {
        const isYou = team.id === currentProfile?.team_id;
        const color = getRaceTeamColor(team.name);
        const rankHtml = idx < 3
            ? `<div class="community-race-medal">${medals[idx]}</div>`
            : `<div class="community-race-medal community-race-num">${idx + 1}</div>`;

        return `
            <div class="community-race-row${isYou ? ' community-race-you' : ''}">
                ${rankHtml}
                <div class="community-race-dot" style="background:${color};">${getRaceTeamInitial(team.name)}</div>
                <div class="community-race-info">
                    <div class="community-race-name-row">
                        <span class="community-race-name">${team.name}${isYou ? ' <span class="race-you-tag">You</span>' : ''}</span>
                        <span class="community-race-pct">${team.overallPct}%</span>
                    </div>
                    <div class="race-bar-track"><div class="race-bar-fill" style="width:${team.overallPct}%;background:${color};"></div></div>
                    <div class="community-race-sub">Level ${team.level}${team.readyForQuiz ? ' <span class="community-race-ready-tag">🎤 ready for quiz</span>' : ''}</div>
                </div>
            </div>`;
    }).join('');

    // Recent wins — last few teams to advance a level, most recent first.
    const recentWins = standings
        .filter(t => t.last_advanced_at)
        .sort((a, b) => new Date(b.last_advanced_at) - new Date(a.last_advanced_at))
        .slice(0, 3);

    const winsHtml = recentWins.length > 0
        ? `<div class="community-race-wins">${recentWins.map(t => `
            <div class="community-race-win-row">
                🎉 <strong>${t.name}</strong> advanced to Level ${t.level}
                <span class="community-race-win-time">${typeof formatTimeAgo === 'function' ? formatTimeAgo(t.last_advanced_at) : ''}</span>
            </div>`).join('')}</div>`
        : '';

    mount.innerHTML = `<div class="community-race-standings">${rowsHtml}</div>${winsHtml}`;
}

// Cache keyed by mountId so a tap-to-expand on one instance (e.g. the
// Community page) can find its own render's data without re-fetching.
const _raceStandingsCache = {};

async function toggleRaceTeamDetail(mountId, teamId, rowId) {
    const el = document.getElementById(rowId);
    if (!el) return;

    if (el.style.display !== 'none') {
        el.style.display = 'none';
        return;
    }

    if (!canExpandRaceTeam(teamId)) {
        el.innerHTML = `<p style="color:#94a3b8; font-size:12px; padding:6px 0;">Student detail is only visible for your own team.</p>`;
        el.style.display = 'block';
        return;
    }

    const standings = _raceStandingsCache[mountId] || [];
    const team = standings.find(t => t.id === teamId);
    if (!team) return;

    // Cache per team so re-toggling the same row doesn't re-fetch.
    if (!_raceDetailCache[teamId]) {
        el.innerHTML = `<p style="color:#94a3b8; font-size:12px; padding:6px 0;">Loading...</p>`;
        el.style.display = 'block';
        _raceDetailCache[teamId] = await fetchTeamStudentDetail(teamId, team.level, team.families);
    }
    const members = _raceDetailCache[teamId];

    if (!members || members.length === 0) {
        el.innerHTML = `<p style="color:#94a3b8; font-size:12px; padding:6px 0;">No student detail available.</p>`;
        el.style.display = 'block';
        return;
    }

    el.innerHTML = members.map(m => {
        const line = m.statuses.map(s => {
            const label = RACE_STATUS_LABEL[s.status.key];
            const streakSuffix = s.status.key === 'practicing' && s.status.streak > 0 ? ` ${s.status.streak}/${STREAK_THRESHOLD}` : '';
            const helpPrefix = s.status.needsHelp ? '🆘 ' : '';
            return `<span class="race-student-family race-student-${s.status.needsHelp ? 'help' : s.status.key}">${s.family} ${helpPrefix}${label}${streakSuffix}</span>`;
        }).join(' ');

        return `
            <div class="race-student-row">
                <span class="race-student-avatar">${m.avatar || '🦁'}</span>
                <span class="race-student-name">${m.nickname}</span>
                <span class="race-student-line">${line}</span>
            </div>`;
    }).join('');

    el.style.display = 'block';
}

// Keyed by team_id — cleared each page load (module-level), so a stale
// approval/help-flag from a previous visit never lingers into a new one.
const _raceDetailCache = {};

// ---------------------------------------------------------------------------
// Level completion banner + submission
// Shows when a student has cleared all 3 families in the current level.
// ---------------------------------------------------------------------------

// Live-test scheduling — one shared Calendly event, prefilled with the
// student's name/email so they don't have to retype it.
const LIVE_TEST_SCHEDULING_URL = 'https://calendly.com/senaitrichmond16/fidel-test';

function buildLiveTestSchedulingLink() {
    const params = new URLSearchParams();
    if (currentProfile?.nickname) params.set('name', currentProfile.nickname);
    if (currentProfile?.email) params.set('email', currentProfile.email);
    const query = params.toString();
    return query ? `${LIVE_TEST_SCHEDULING_URL}?${query}` : LIVE_TEST_SCHEDULING_URL;
}

async function checkLevelCompletionStatus() {
    if (!currentProfile?.team_id || currentProfile?.is_captain) return null;

    const { data: team } = await _supabase
        .from('teams')
        .select('current_level')
        .eq('id', currentProfile.team_id)
        .maybeSingle();

    if (!team) return null;

    const { data: level } = await _supabase
        .from('challenge_levels')
        .select('letter_families')
        .eq('level_number', team.current_level)
        .maybeSingle();

    if (!level?.letter_families?.length) return null;

    const { data: progressRows } = await _supabase
        .from('student_family_progress')
        .select('base_letter, streak_passed, writing_passed')
        .eq('student_id', currentUser.id)
        .eq('level_number', team.current_level);

    const allCleared = level.letter_families.every(letter => {
        const row = (progressRows || []).find(r => r.base_letter === letter);
        return row?.streak_passed && row?.writing_passed;
    });

    if (!allCleared) return { allCleared: false, level: team.current_level };

    // Check for existing completion request
    const { data: existing } = await _supabase
        .from('level_completion_requests')
        .select('status, submitted_at')
        .eq('student_id', currentUser.id)
        .eq('level_number', team.current_level)
        .maybeSingle();

    return {
        allCleared: true,
        level: team.current_level,
        existingRequest: existing || null
    };
}

async function renderLevelCompletionBanner(mountId) {
    const mount = document.getElementById(mountId);
    if (!mount) return;

    const status = await checkLevelCompletionStatus();

    if (!status || !status.allCleared) {
        mount.innerHTML = "";
        mount.style.display = "none";
        return;
    }

    mount.style.display = "block";

    if (status.existingRequest?.status === 'approved') {
        // Approval doesn't mean the whole team has advanced yet — point the
        // student at encouraging teammates instead of implying they're done.
        mount.innerHTML = `
            <div style="background:#f0fdf4; border:2px solid #166534; border-radius:16px;
                        padding:20px; text-align:center; margin-bottom:16px;">
                <div style="font-size:36px; margin-bottom:8px;">🎉</div>
                <p style="font-size:16px; font-weight:800; color:#166534; margin-bottom:4px;">
                    Your teacher approved your level!
                </p>
                <p style="font-size:13px; color:#15803d; margin-bottom:16px;">
                    Encourage your teammates so your team can begin Level ${status.level + 1} together.
                </p>
                <button id="levelApprovalEncourageBtn" class="btn-primary"
                        style="max-width:280px; margin:0 auto; display:block;">
                    📣 Encourage Your Team
                </button>
            </div>`;

        const encourageBtn = document.getElementById('levelApprovalEncourageBtn');
        if (encourageBtn) {
            encourageBtn.onclick = () => {
                if (typeof shareTeamChallenge === 'function') {
                    shareTeamChallenge(`🎉 I just got Level ${status.level} approved! Let's finish up so our team can move to Level ${status.level + 1} together 💪`);
                }
            };
        }
    } else if (status.existingRequest?.status === 'pending') {
        mount.innerHTML = `
            <div style="background:#fffbeb; border:2px solid #ca8a04; border-radius:16px;
                        padding:20px; text-align:center; margin-bottom:16px;">
                <div style="font-size:36px; margin-bottom:8px;">⏳</div>
                <p style="font-size:15px; font-weight:700; color:#92400e; margin-bottom:4px;">
                    Your Teacher Has Been Notified
                </p>
                <p style="font-size:13px; color:#b45309; margin-bottom:16px;">
                    You've cleared all 3 families in Level ${status.level}! Book your live
                    test now — read a letter aloud, then write a few from memory.
                </p>
                <a href="${buildLiveTestSchedulingLink()}" target="_blank" rel="noopener"
                   class="btn-primary"
                   style="max-width:280px; margin:0 auto; display:block; text-decoration:none;">
                    📅 Schedule Your Live Test
                </a>
                <p style="font-size:12px; color:#92400e; margin-top:12px;">
                    While you wait for your teammates, keep practicing —
                    check the Community page for the class streak board!
                </p>
            </div>`;
    } else {
        // All cleared, no request yet — show submit button
        mount.innerHTML = `
            <div style="background:linear-gradient(135deg, #f0fdf4, #fffbeb); border:2px solid #166534;
                        border-radius:16px; padding:20px; text-align:center; margin-bottom:16px;">
                <div style="font-size:36px; margin-bottom:8px;">⭐</div>
                <p style="font-size:16px; font-weight:800; color:#166534; margin-bottom:6px;">
                    You cleared all 3 families!
                </p>
                <p style="font-size:13px; color:#475569; margin-bottom:16px;">
                    Submit for teacher approval to advance your team to
                    Level ${status.level + 1}.
                </p>
                <button onclick="submitLevelCompletion(${status.level})"
                        class="btn-primary"
                        style="max-width:280px; margin:0 auto; display:block;">
                    Submit for Level Approval ➜
                </button>
            </div>`;
    }
}

async function submitLevelCompletion(levelNumber) {
    showNotificationToast("Submitting for teacher approval...");

    const { error } = await _supabase
        .from('level_completion_requests')
        .upsert({
            student_id: currentUser.id,
            team_id: currentProfile.team_id,
            level_number: levelNumber,
            status: 'pending',
            submitted_at: new Date().toISOString()
        }, { onConflict: 'student_id,level_number' });

    if (error) {
        console.error("Failed to submit level completion:", error);
        return showNotificationToast("Couldn't submit: " + error.message);
    }

    showGobezToast("Submitted! Your teacher will review your Level completion. 🌟");
    await renderLevelCompletionBanner('levelCompletionMount');
}

// ---------------------------------------------------------------------------
// Help flags — student signals they need help with a specific letter
// ---------------------------------------------------------------------------

async function flagNeedHelp(baseLetter, levelNumber) {
    if (!currentProfile?.team_id) {
        return showNotificationToast("You need to be on a team to send a help flag.");
    }

    const { error } = await _supabase
        .from('help_flags')
        .insert({
            student_id: currentUser.id,
            team_id: currentProfile.team_id,
            base_letter: baseLetter,
            level_number: levelNumber
        });

    if (error) {
        // Duplicate insert (already flagged) — just confirm
        if (error.code === '23505') {
            return showNotificationToast("Help request already sent for this letter.");
        }
        console.error("Failed to flag help:", error);
        return showNotificationToast("Couldn't send flag: " + error.message);
    }

    showNotificationToast(`Help request sent to your captain for "${baseLetter}" 🙋`);
}

async function loadHelpFlags(mountId) {
    const mount = document.getElementById(mountId);
    if (!mount) return;

    if (!currentProfile?.is_captain || !currentProfile?.team_id) {
        mount.innerHTML = "";
        return;
    }

    const { data: members } = await _supabase
        .from('profiles')
        .select('id, nickname, avatar')
        .eq('team_id', currentProfile.team_id);

    const memberIds = (members || []).map(m => m.id);
    if (memberIds.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No teammates yet.</p>`;
        return;
    }

    const { data: flags } = await _supabase
        .from('help_flags')
        .select('id, base_letter, level_number, created_at, student_id')
        .in('student_id', memberIds)
        .eq('is_resolved', false)
        .order('created_at', { ascending: true });

    if (!flags || flags.length === 0) {
        mount.innerHTML = `
            <div style="text-align:center; padding:16px 4px; color:#94a3b8;">
                <div style="font-size:24px; margin-bottom:6px;">🙌</div>
                <p style="font-size:13px; margin:0;">No help requests right now.</p>
            </div>`;
        return;
    }

    mount.innerHTML = "";

    flags.forEach(flag => {
        const member = (members || []).find(m => m.id === flag.student_id);
        const card = document.createElement('div');
        card.style.cssText = `
            display:flex; justify-content:space-between; align-items:center;
            padding:10px 12px; background:#fffbeb; border:1px solid #fde68a;
            border-radius:10px; margin-bottom:8px; font-size:13px;
        `;
        card.innerHTML = `
            <span>
                ${member?.avatar || '🦁'}
                <strong>${member?.nickname || 'Student'}</strong>
                needs help with
                <strong style="font-family:'Abyssinica SIL',serif; font-size:18px; margin:0 4px;">
                    ${flag.base_letter}
                </strong>
            </span>
            <button onclick="resolveHelpFlag('${flag.id}', '${mountId}')"
                    style="background:#166534; color:white; border:none; border-radius:8px;
                           padding:5px 12px; font-size:12px; font-weight:700; cursor:pointer;
                           flex-shrink:0; margin-left:8px;">
                Resolved ✓
            </button>
        `;
        mount.appendChild(card);
    });
}

async function resolveHelpFlag(flagId, mountId) {
    const { error } = await _supabase
        .from('help_flags')
        .update({ is_resolved: true })
        .eq('id', flagId);

    if (error) return showNotificationToast("Couldn't resolve: " + error.message);
    showNotificationToast("Help flag resolved ✓");
    await loadHelpFlags(mountId);
}

// ---------------------------------------------------------------------------
// Teacher: level completion approval queue
// Called from teacher.js / teacher dashboard
// ---------------------------------------------------------------------------

async function loadTeacherLevelCompletionQueue(mountId) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading...</p>`;

    const { data: requests, error } = await _supabase
        .from('level_completion_requests')
        .select(`
            id, level_number, submitted_at, student_id, team_id, status,
            profiles!level_completion_requests_student_id_fkey(nickname, avatar),
            teams!level_completion_requests_team_id_fkey(name)
        `)
        .eq('status', 'pending')
        .order('submitted_at', { ascending: true });

    if (error) {
        mount.innerHTML = `<p style="color:#ef4444; font-size:13px;">Error: ${error.message}</p>`;
        return;
    }

    if (!requests || requests.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No pending level completions!</p>`;
        return;
    }

    mount.innerHTML = "";
    requests.forEach(req => {
        const card = document.createElement('div');
        card.className = "teacher-submission-card";
        card.style.cssText = "flex-direction:column; gap:8px;";
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                    <strong style="font-size:14px;">
                        ${req.profiles?.avatar || '🦁'} ${req.profiles?.nickname || 'Student'}
                    </strong>
                    <span style="font-size:12px; color:#64748b; display:block; margin-top:2px;">
                        ${req.teams?.name || 'Team'} • Level ${req.level_number} completion
                    </span>
                </div>
                <span style="font-size:11px; color:#94a3b8; flex-shrink:0; margin-left:8px;">
                    ${new Date(req.submitted_at).toLocaleDateString()}
                </span>
            </div>
            <div style="display:flex; gap:8px;">
                <button class="btn-approve"
                        onclick="approveTeacherLevelCompletion('${req.id}', '${req.student_id}', ${req.level_number}, '${req.team_id}', '${mountId}')">
                    ✓ Approve Level ${req.level_number}
                </button>
                <button class="btn-reject"
                        onclick="rejectTeacherLevelCompletion('${req.id}', '${mountId}')">
                    ✗ Reject
                </button>
            </div>
        `;
        mount.appendChild(card);
    });
}

async function approveTeacherLevelCompletion(requestId, studentId, levelNumber, teamId, mountId) {
    showNotificationToast("Approving level completion...");

    const { error } = await _supabase
        .from('level_completion_requests')
        .update({
            status: 'approved',
            reviewed_by: currentUser.id,
            reviewed_at: new Date().toISOString()
        })
        .eq('id', requestId);

    if (error) return showNotificationToast("Failed: " + error.message);

    // Trigger the team level advancement check
    if (typeof checkAndUpdateTeamLevelCompletion === "function") {
        await checkAndUpdateTeamLevelCompletion(studentId);
    }

    showGobezToast("Level completion approved! 🌟");
    await loadTeacherLevelCompletionQueue(mountId);
    if (typeof loadTeacherClassroomOverview === "function") await loadTeacherClassroomOverview();
}

async function rejectTeacherLevelCompletion(requestId, mountId) {
    const { error } = await _supabase
        .from('level_completion_requests')
        .update({
            status: 'rejected',
            reviewed_by: currentUser.id,
            reviewed_at: new Date().toISOString()
        })
        .eq('id', requestId);

    if (error) return showNotificationToast("Failed: " + error.message);
    showNotificationToast("Level completion rejected.");
    await loadTeacherLevelCompletionQueue(mountId);
}

// ---------------------------------------------------------------------------
// Expose
// ---------------------------------------------------------------------------

window.saveStreakProgress = saveStreakProgress;
window.creditApprovedWritingToProgress = creditApprovedWritingToProgress;
window.renderTeamRaceView = renderTeamRaceView;
// Back-compat alias in case any other code still calls the old name directly.
window.renderCommunityTeamLeaderboard = (mountId) => renderTeamRaceView(mountId, { mode: 'compact' });
window.toggleRaceTeamDetail = toggleRaceTeamDetail;
window.renderLevelCompletionBanner = renderLevelCompletionBanner;
window.submitLevelCompletion = submitLevelCompletion;
window.flagNeedHelp = flagNeedHelp;
window.loadHelpFlags = loadHelpFlags;
window.resolveHelpFlag = resolveHelpFlag;
window.loadTeacherLevelCompletionQueue = loadTeacherLevelCompletionQueue;
window.approveTeacherLevelCompletion = approveTeacherLevelCompletion;
window.rejectTeacherLevelCompletion = rejectTeacherLevelCompletion;

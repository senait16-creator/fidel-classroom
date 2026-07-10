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
async function computeTeamRaceStandings() {
    const { data: teams } = await _supabase
        .from('teams')
        .select('id, name, current_level, last_advanced_at')
        .eq('is_active', true)
        .eq('is_test', false)
        .order('name');

    if (!teams || teams.length === 0) return [];

    // Each team can be on its own level (the teacher advances teams
    // independently), so families have to be looked up per-level, not
    // just once for "my" team and reused for everyone.
    const levelNumbers = [...new Set(teams.map(t => t.current_level || 1))];
    const { data: levelRows } = await _supabase
        .from('challenge_levels')
        .select('level_number, letter_families')
        .in('level_number', levelNumbers);
    const familiesByLevel = {};
    (levelRows || []).forEach(l => { familiesByLevel[l.level_number] = l.letter_families || []; });

    const teamIds = teams.map(t => t.id);
    const { data: allMembers } = await _supabase
        .from('profiles')
        .select('id, nickname, avatar, team_id, is_captain')
        .in('team_id', teamIds);

    const memberIds = (allMembers || []).map(m => m.id);
    let allProgress = [], pendingSubs = [], helpFlags = [], statusRows = [];
    if (memberIds.length > 0) {
        const [{ data: prog }, { data: subs }, { data: flags }, { data: statuses }] = await Promise.all([
            _supabase.from('student_family_progress')
                .select('student_id, base_letter, level_number, streak_passed, writing_passed, best_streak')
                .in('student_id', memberIds),
            _supabase.from('writing_submissions')
                .select('student_id, base_letter, level_number').eq('status', 'pending').in('student_id', memberIds),
            _supabase.from('help_flags')
                .select('student_id, base_letter').eq('is_resolved', false).in('student_id', memberIds),
            _supabase.from('team_level_status')
                .select('team_id, level_number, all_members_cleared, live_quiz_passed').in('team_id', teamIds)
        ]);
        allProgress = prog || [];
        pendingSubs = subs || [];
        helpFlags = flags || [];
        statusRows = statuses || [];
    }

    const standings = teams.map(team => {
        const level = team.current_level || 1;
        const families = familiesByLevel[level] || [];
        const members = (allMembers || []).filter(m => m.team_id === team.id);
        const memberCount = members.length;

        const readyForQuiz = statusRows.some(s =>
            s.team_id === team.id && s.level_number === level && s.all_members_cleared && !s.live_quiz_passed
        );

        if (memberCount === 0 || families.length === 0) {
            return { ...team, level, families, memberCount, overallPct: 0, familySummaries: [], memberStatuses: {}, readyForQuiz };
        }

        let earnedPoints = 0;
        const maxPoints = memberCount * families.length * 4;
        const memberStatuses = {}; // studentId -> [{family, status}]

        const familySummaries = families.map(fam => {
            let approved = 0, pending = 0, practicing = 0, notStarted = 0;
            members.forEach(m => {
                const row = allProgress.find(p => p.student_id === m.id && p.base_letter === fam && p.level_number === level);
                const hasPending = pendingSubs.some(s => s.student_id === m.id && s.base_letter === fam && s.level_number === level);
                const hasHelp = helpFlags.some(f => f.student_id === m.id && f.base_letter === fam);
                const status = computeRaceFamilyStatus(row, hasPending, hasHelp);
                earnedPoints += status.points;

                if (status.key === 'approved') approved++;
                else if (status.key === 'pending') pending++;
                else if (status.key === 'needs_writing' || status.key === 'practicing') practicing++;
                else notStarted++;

                if (!memberStatuses[m.id]) memberStatuses[m.id] = [];
                memberStatuses[m.id].push({ family: fam, status });
            });
            return { family: fam, approved, pending, practicing, notStarted, memberCount };
        });

        const overallPct = maxPoints > 0 ? Math.round((earnedPoints / maxPoints) * 100) : 0;

        return { ...team, level, families, memberCount, overallPct, familySummaries, memberStatuses, members, readyForQuiz };
    });

    standings.sort((a, b) => b.overallPct - a.overallPct);
    return standings;
}

async function renderTeamRaceView(mountId) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    mount.innerHTML = `<p style="color:#94a3b8;font-size:13px;padding:8px 0;">Loading race...</p>`;

    try {
        const standings = await computeTeamRaceStandings();

        if (standings.length === 0) {
            mount.innerHTML = `<p style="color:#94a3b8;font-size:13px;">No teams yet.</p>`;
            return;
        }

        const getTeamColor = getRaceTeamColor;
        const getTeamInitial = getRaceTeamInitial;
        const medals = ['🥇', '🥈', '🥉'];

        mount.innerHTML = '';
        const standings_div = document.createElement('div');
        standings_div.className = 'race-standings';
        _raceStandingsCache[mountId] = standings;

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

            row.innerHTML = `
                <div class="race-row-header" onclick="toggleRaceTeamDetail('${mountId}', '${team.id}', '${rowId}')">
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
                    <div class="race-expand-arrow">▾</div>
                </div>
                <div class="race-family-lines">${familyLinesHtml}</div>
                <div class="race-team-detail" id="${rowId}" style="display:none;"></div>
            `;

            standings_div.appendChild(row);
        });

        mount.appendChild(standings_div);

    } catch(e) {
        console.error('Race render error:', e);
        mount.innerHTML = `<p style="color:#94a3b8;font-size:13px;">Couldn't load race standings.</p>`;
    }
}

// ---------------------------------------------------------------------------
// Community's lighter version — same standings data, but Community is a
// celebration feed, not a work dashboard, so this deliberately drops the
// per-family breakdown and tap-to-expand student detail (that stays on the
// Challenge dashboard, via renderTeamRaceView). Just rank, level, a simple
// bar, and a couple of recent team-level-up "wins" for a bit of buzz.
// ---------------------------------------------------------------------------

async function renderCommunityTeamLeaderboard(mountId) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    mount.innerHTML = `<p style="color:#94a3b8;font-size:13px;padding:8px 0;">Loading...</p>`;

    try {
        const standings = await computeTeamRaceStandings();

        if (standings.length === 0) {
            mount.innerHTML = `<p style="color:#94a3b8;font-size:13px;">No teams yet.</p>`;
            return;
        }

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

    } catch (e) {
        console.error('Community race render error:', e);
        mount.innerHTML = `<p style="color:#94a3b8;font-size:13px;">Couldn't load team standings.</p>`;
    }
}

// Cache keyed by mountId so a tap-to-expand on one instance (e.g. the
// Community page) can find its own render's data without re-fetching.
const _raceStandingsCache = {};

function toggleRaceTeamDetail(mountId, teamId, rowId) {
    const el = document.getElementById(rowId);
    if (!el) return;

    if (el.style.display !== 'none') {
        el.style.display = 'none';
        return;
    }

    const standings = _raceStandingsCache[mountId] || [];
    const team = standings.find(t => t.id === teamId);

    if (!team || !team.members) {
        el.innerHTML = `<p style="color:#94a3b8; font-size:12px; padding:6px 0;">No student detail available.</p>`;
        el.style.display = 'block';
        return;
    }

    const sortedMembers = [...team.members].sort((a, b) => (b.is_captain ? 1 : 0) - (a.is_captain ? 1 : 0));

    el.innerHTML = sortedMembers.map(m => {
        const statuses = team.memberStatuses[m.id] || [];
        const line = statuses.map(s => {
            const label = RACE_STATUS_LABEL[s.status.key];
            const streakSuffix = s.status.key === 'practicing' && s.status.streak > 0 ? ` ${s.status.streak}/${STREAK_THRESHOLD}` : '';
            const helpPrefix = s.status.needsHelp ? '🆘 ' : '';
            return `<span class="race-student-family race-student-${s.status.needsHelp ? 'help' : s.status.key}">${s.family} ${helpPrefix}${label}${streakSuffix}</span>`;
        }).join(' ');

        return `
            <div class="race-student-row">
                <span class="race-student-avatar">${m.avatar || '🦁'}</span>
                <span class="race-student-name">${m.nickname}${m.is_captain ? ' 👑' : ''}</span>
                <span class="race-student-line">${line}</span>
            </div>`;
    }).join('');

    el.style.display = 'block';
}

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

window.renderTeamRaceView = renderTeamRaceView;
window.renderCommunityTeamLeaderboard = renderCommunityTeamLeaderboard;
window.toggleRaceTeamDetail = toggleRaceTeamDetail;
window.renderLevelCompletionBanner = renderLevelCompletionBanner;
window.submitLevelCompletion = submitLevelCompletion;
window.flagNeedHelp = flagNeedHelp;
window.loadHelpFlags = loadHelpFlags;
window.resolveHelpFlag = resolveHelpFlag;
window.loadTeacherLevelCompletionQueue = loadTeacherLevelCompletionQueue;
window.approveTeacherLevelCompletion = approveTeacherLevelCompletion;
window.rejectTeacherLevelCompletion = rejectTeacherLevelCompletion;

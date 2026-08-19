// =============================================================================
// CHALLENGE.JS
// =============================================================================

let challengeLevelsCache = null;
let activeChallengeLevel = null;
let activeChallengeFamilyObj = null;
let activeChallengeFamilyLevel = null;
// Where the family detail screen's "Back" button should go: 'dashboard' when
// reached via the Continue button's direct jump, 'picker' when reached via
// the Level Overview (family picker) grid or its own "View All Families" link.
let challengeFamilyDetailReturnTo = 'picker';

const TEAM_COLORS = {
    Red: '#b91c1c',
    Blue: '#1d4ed8',
    Green: '#166534',
    Yellow: '#a16207',
    Purple: '#7e22ce',
    Black: '#111827'
};

function getTeamHex(teamName) {
    for (const [key, hex] of Object.entries(TEAM_COLORS)) {
        if (teamName && teamName.includes(key)) return hex;
    }
    return '#166534';
}

// Program Week 1 runs Sunday July 5, 2026 → Saturday July 11, 2026; each
// following Sun–Sat span increments by one. Confirmed with the teacher.
const PROGRAM_WEEK_ONE_START = new Date(2026, 6, 5); // month is 0-indexed: 6 = July

function getProgramWeekNumber() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.floor((startOfToday - PROGRAM_WEEK_ONE_START) / (1000 * 60 * 60 * 24));
    return Math.max(1, Math.floor(diffDays / 7) + 1);
}

// -----------------------------------------------------------------------------
// Home — landing point after login, and where every "back to home"/"exit"
// flow across the app returns to. Name kept as enterModeSelect() since it's
// called from many existing files (guide.js, auth.js, reading.js,
// community.js, candostatement.js, letterboard.js, team/hub.js) — renaming
// it would mean touching every one of those call sites for no functional
// gain. It now opens the student shell's Home tab instead of the old
// separate Mode Select screen.
// -----------------------------------------------------------------------------

function enterModeSelect() {
    if (typeof enterStudentShellHomeTab === 'function') {
        enterStudentShellHomeTab();
    } else {
        // Defensive fallback in case studentshell.js hasn't loaded yet.
        showScreen("studentShellScreen");
    }

    localStorage.setItem('fidel_has_visited', '1');
}

function chooseModePractice() {
    if (typeof openLetterBoard === 'function') {
        openLetterBoard();
    } else {
        launchDashboard("student");
    }
}

async function chooseModeChallenge() {
    if (!currentProfile?.team_id) {
        showNotificationToast("Fidel Challenge is team-based. Your teacher will assign you to a team soon!");
        return;
    }

    if (typeof enterStudentShellCompetitionTab === "function") {
        await enterStudentShellCompetitionTab();
    } else {
        // Defensive fallback in case studentshell.js hasn't loaded yet.
        showScreen("studentShellScreen");
        await renderChallengeDashboard();
    }
}

async function renderChallengeDashboard() {
    const [team, levels, myLevel] = await Promise.all([
        getTeamBoardInfo(),
        fetchChallengeLevels(),
        getMyCurrentLevel()
    ]);

    const teamHex = getTeamHex(team.name);

    // Note: the hero (team dot, meta line, progress bar) lives on the Home
    // tab and is rendered once by enterStudentShellHomeTab() — this
    // Competition-tab render used to redundantly re-render it too (both
    // pulled from team.current_level so they never disagreed), but now
    // that the hero shows the student's own individual progress, only
    // Home should own it.

    // ── Your Team — collapsed to one row (dot, name, rank/percent),
    //    tap to expand the full status panel below. Team is information
    //    on this page, not a separate destination. Captains get the
    //    richer Captain Dashboard's Team Progress card instead, so this
    //    whole card is hidden for them to avoid showing the same
    //    information twice. ──
    const teamStatusSection = document.getElementById("challengeTeamStatusMount");
    const teamBtn = document.getElementById("challengeYourTeamBtn");
    const teamDot = document.getElementById("challengeYourTeamDot");
    const teamNameEl = document.getElementById("challengeYourTeamName");
    const teamStatEl = document.getElementById("challengeYourTeamStat");
    const statusContent = document.getElementById("challengeTeamStatusContent");
    if (currentProfile?.is_captain) {
        if (teamStatusSection) teamStatusSection.style.display = "none";
    } else {
        if (teamStatusSection) teamStatusSection.style.display = "";
        if (teamDot) teamDot.style.background = teamHex;
        if (teamNameEl) teamNameEl.innerText = team.name;
        if (teamStatEl && typeof computeTeamRaceStandings === "function") {
            const ordinals = ["1st", "2nd", "3rd", "4th", "5th", "6th"];
            computeTeamRaceStandings().then(standings => {
                const rankIdx = standings.findIndex(s => s.id === currentProfile.team_id);
                if (rankIdx !== -1) {
                    teamStatEl.innerText = `${standings[rankIdx].overallPct}% (${ordinals[rankIdx] || `${rankIdx + 1}th`})`;
                }
            });
        }
        if (teamBtn) {
            teamBtn.onclick = () => {
                if (!statusContent) return;
                const isOpen = statusContent.style.display === "block";
                statusContent.style.display = isOpen ? "none" : "block";
            };
        }
        if (statusContent) statusContent.style.display = "none";
    }

    // ── Weekly Team Meeting, read-only for students — captains already
    //    have the editable version in the Captain Dashboard above. ──
    const studentMeetingCard = document.getElementById("studentMeetingCard");
    if (currentProfile?.is_captain) {
        if (studentMeetingCard) studentMeetingCard.style.display = "none";
    } else if (typeof loadStudentMeetingDisplay === "function") {
        await loadStudentMeetingDisplay();
    }

    // ── Captain team card + Team Hub — prominent team summary and one
    //    entry point into the leadership tools, replacing the old
    //    always-open Captain Dashboard. ─────
    if (typeof renderCaptainTeamCard === "function") await renderCaptainTeamCard();

    // Pending Writing Reviews — collapsed behind the CTA button,
    // loadCaptainWritingQueue() also fills in the count pill.
    const reviewMount = document.getElementById("captainWritingQueueMount");
    const reviewToggleBtn = document.getElementById("captainReviewToggleBtn");
    if (reviewToggleBtn && reviewMount) {
        reviewToggleBtn.onclick = () => {
            const isOpen = reviewMount.style.display === "block";
            reviewMount.style.display = isOpen ? "none" : "block";
            reviewToggleBtn.innerText = isOpen ? "📝 Review Writing" : "📝 Hide Review Queue";
        };
    }

    if (currentProfile?.is_captain) {
        if (typeof loadCaptainWritingQueue === "function") await loadCaptainWritingQueue();
        if (typeof loadCaptainRecentlyApproved === "function") await loadCaptainRecentlyApproved();
        if (typeof loadCaptainTeamProgress === "function") await loadCaptainTeamProgress();
        if (typeof loadHelpFlags === "function") await loadHelpFlags('helpFlagsMount');
        if (typeof renderStarPicker === "function") await renderStarPicker("starPickerMount");
    }

    // Note: the "Continue Level" card (challengeCurrentLevelCard) and the
    // level-completion approval banner both live on the Home tab and are
    // fully owned by enterStudentShellHomeTab() — this used to redundantly
    // re-render them here too on every Competition-tab visit.

    // ── Render Competition-tab sections ────────────────────────
    await renderTeamUrgencyCard(team);
    await renderChallengeTeamStatus(team);
    await renderChallengeDashboardRace();
    if (typeof renderTimelinePreview === "function") await renderTimelinePreview();
    wireCurrentLevelResources(levels, myLevel);
}

// The resource videos/links themselves are the same regardless of level
// (general Fidel alphabet resources), so this just labels the card with
// the student's actual current level and points Practice at it.
function wireCurrentLevelResources(levels, myLevel) {
    const currentLevel = levels.find(l => l.level_number === (myLevel || 1)) || levels[0];

    const title = document.getElementById("currentLevelResourcesTitle");
    if (title && currentLevel) title.innerText = `📚 Level ${currentLevel.level_number} Resources`;

    const practiceBtn = document.getElementById("currentLevelPracticeBtn");
    if (practiceBtn && currentLevel) {
        practiceBtn.onclick = () => openChallengeFamilyPicker(currentLevel);
    }
}

// Makes the team part of the challenge feel real: instead of a flat
// percentage, tell the student whether their team is waiting on them,
// or whether they're waiting on their team. Captains skip this — they
// get the richer per-member Team Progress card in the Captain Dashboard.
async function renderTeamUrgencyCard(team) {
    const card = document.getElementById("challengeTeamUrgencyCard");
    const mount = document.getElementById("teamUrgencyMount");
    if (!card || !mount) return;

    if (currentProfile?.is_captain || !currentProfile?.team_id) {
        card.style.display = "none";
        return;
    }

    const currentLevel = team.current_level || 1;

    const { data: members } = await _supabase
        .from('profiles')
        .select('id, nickname, is_captain')
        .eq('team_id', currentProfile.team_id);

    const teammates = (members || []).filter(m => !m.is_captain && m.id !== currentUser.id);
    if (teammates.length === 0) {
        card.style.display = "none";
        return;
    }

    const { data: level } = await _supabase
        .from('challenge_levels')
        .select('letter_families')
        .eq('level_number', currentLevel)
        .maybeSingle();

    const families = level?.letter_families || [];
    if (families.length === 0) {
        card.style.display = "none";
        return;
    }

    const memberIds = [currentUser.id, ...teammates.map(m => m.id)];
    const { data: progressRows } = await _supabase
        .from('student_family_progress')
        .select('student_id, base_letter, streak_passed, writing_passed')
        .in('student_id', memberIds)
        .eq('level_number', currentLevel);

    const isDone = (studentId) => families.every(fam => {
        const row = (progressRows || []).find(r => r.student_id === studentId && r.base_letter === fam);
        return row?.streak_passed && row?.writing_passed;
    });

    const iAmDone = isDone(currentUser.id);
    const doneTeammates = teammates.filter(m => isDone(m.id));
    const waitingTeammates = teammates.filter(m => !isDone(m.id));

    card.style.display = "block";

    if (iAmDone && waitingTeammates.length === 0) {
        // Whole team cleared — the top-of-page banner already covers this.
        card.style.display = "none";
        return;
    }

    let html;
    if (!iAmDone && doneTeammates.length > 0) {
        html = `
            <div class="team-urgency-title">🏁 ${team.name}</div>
            <p class="team-urgency-body">${doneTeammates.length} teammate${doneTeammates.length > 1 ? 's are' : ' is'} waiting on you.</p>
            <p class="team-urgency-sub">Finish today and your team can advance.</p>`;
    } else if (iAmDone && waitingTeammates.length > 0) {
        const names = waitingTeammates.map(m => m.nickname || 'a teammate').join(', ');
        html = `
            <div class="team-urgency-title">🏁 ${team.name}</div>
            <p class="team-urgency-body">You're done! Waiting on: ${names}.</p>
            <p class="team-urgency-sub">Encourage them so your team can move on together.</p>`;
    } else {
        html = `
            <div class="team-urgency-title">🏁 ${team.name}</div>
            <p class="team-urgency-body">Everyone's working on Level ${currentLevel} together.</p>
            <p class="team-urgency-sub">Keep practicing. Every family you clear helps the team.</p>`;
    }

    mount.innerHTML = html;
}

async function renderChallengeTeamStatus(team) {
    // Render into the inner content div — NOT challengeTeamStatusMount,
    // which is the whole card (writing there would destroy the toggle button).
    const mount = document.getElementById("challengeTeamStatusContent");
    if (!mount) return;

    const currentLevel = team.current_level || 1;

    const { data: members, error: memberError } = await _supabase
        .from('profiles')
        .select('id, nickname, avatar, is_captain')
        .eq('team_id', currentProfile.team_id)
        .order('is_captain', { ascending: false })
        .order('nickname');

    if (memberError) {
        mount.innerHTML = `<p style="color:#ef4444;font-size:13px;">Could not load team: ${memberError.message}</p>`;
        return;
    }

    const memberIds = (members || []).map(m => m.id);
    const { data: level } = await _supabase
        .from('challenge_levels')
        .select('letter_families')
        .eq('level_number', currentLevel)
        .maybeSingle();

    const families = level?.letter_families || [];

    let progressRows = [];
    let pendingSubs = [];
    if (memberIds.length > 0 && families.length > 0) {
        const [{ data: progress }, { data: subs }] = await Promise.all([
            _supabase
                .from('student_family_progress')
                .select('student_id, base_letter, streak_passed, writing_passed, best_streak')
                .in('student_id', memberIds)
                .eq('level_number', currentLevel),
            _supabase
                .from('writing_submissions')
                .select('student_id, base_letter, status')
                .in('student_id', memberIds)
                .eq('status', 'pending')
        ]);
        progressRows = progress || [];
        pendingSubs = subs || [];
    }

    const rows = (members || []).map(member => {
        if (member.is_captain) {
            return `
                <div class="teammate-card">
                    <div class="teammate-avatar">${member.avatar || '👑'}</div>
                    <div>
                        <div class="teammate-name">${member.nickname || 'Captain'}</div>
                        <div class="teammate-meta">Level ${currentLevel}</div>
                    </div>
                    <div class="teammate-status captain">Captain</div>
                </div>`;
        }

        const cleared = families.filter(letter => {
            const row = progressRows.find(r => r.student_id === member.id && r.base_letter === letter);
            return row?.streak_passed && row?.writing_passed;
        }).length;

        const nextNeeded = families.find(letter => {
            const row = progressRows.find(r => r.student_id === member.id && r.base_letter === letter);
            return !(row?.streak_passed && row?.writing_passed);
        });

        const hasPending = pendingSubs.some(s => s.student_id === member.id);

        let statusHtml;
        if (!nextNeeded) {
            statusHtml = `<div class="teammate-status approved">Approved ✓</div>`;
        } else if (hasPending) {
            statusHtml = `<div class="teammate-status pending">Pending review</div>`;
        } else {
            statusHtml = '';
        }

        const meta = nextNeeded
            ? `Level ${currentLevel} • ${nextNeeded} family`
            : `Level ${currentLevel} • all ${families.length || 3} families`;

        return `
            <div class="teammate-card">
                <div class="teammate-avatar">${member.avatar || '🦁'}</div>
                <div>
                    <div class="teammate-name">${member.nickname || 'Student'}</div>
                    <div class="teammate-meta">${meta}</div>
                </div>
                ${statusHtml}
            </div>`;
    }).join('');

    mount.innerHTML = `
        <div class="challenge-team-summary">
            <div class="challenge-team-swatch" style="background:${teamHexForStatus(team.name)}"></div>
            <div>
                <strong>${team.name}</strong>
                <small>Current mission: Level ${currentLevel}</small>
            </div>
        </div>
        <div class="challenge-team-member-list">
            ${rows || '<p style="color:#94a3b8;font-size:13px;">No teammates found yet.</p>'}
        </div>
    `;
}

function teamHexForStatus(teamName) {
    return typeof getTeamHex === 'function' ? getTeamHex(teamName) : '#166534';
}

// The whole page answers one question — "what should I do next?" — so
// this is now just the single next action: continue the specific
// next-incomplete family in the current level. No separate Today's Goal
// card, no Next Up preview of the following (locked) level, no "view all
// levels" browse list — the Continue button already tells you what's
// next, and the Team Race / Level Resources cards below cover everything
// else this page used to spread across three sections.
async function renderChallengeDashboardMap(levels, myLevel) {
    const mount = document.getElementById("challengeDashMapMount");
    if (!mount) return;

    const currentLevelNumber = myLevel || 1;
    const currentLevel = levels.find(l => l.level_number === currentLevelNumber) || levels[0];

    if (!currentLevel) {
        mount.innerHTML = `<p style="font-size:13px; color:#94a3b8;">No challenge levels found yet.</p>`;
        return;
    }

    let targetFamily = null;
    const families = currentLevel.letter_families || [];
    if (!currentProfile?.is_captain && families.length > 0) {
        const { data: progressRows } = await _supabase
            .from('student_family_progress')
            .select('base_letter, streak_passed, writing_passed')
            .eq('student_id', currentUser.id)
            .eq('level_number', currentLevel.level_number);

        targetFamily = families.find(fam => {
            const row = (progressRows || []).find(r => r.base_letter === fam);
            return !(row?.streak_passed && row?.writing_passed);
        });
    }

    mount.innerHTML = `
        <button class="challenge-continue-btn" id="challengeGoalBtn">Continue Level ${currentLevel.level_number} →</button>
        <p class="challenge-continue-next">Next: ${families.join(' ')}</p>
    `;

    const goalBtn = document.getElementById("challengeGoalBtn");
    if (goalBtn) {
        goalBtn.onclick = () => {
            // Jump straight to the current family — the Level Overview
            // (family picker) is no longer a required stop along the way.
            // It's still reachable as an optional browse screen via the
            // family detail page's "View All Families" link.
            activeChallengeLevel = currentLevel;
            const fidelObj = targetFamily ? alphabetData.find(f => f.base === targetFamily) : null;
            if (fidelObj) {
                openChallengeFamilyDetail(fidelObj, currentLevel.level_number, 'dashboard');
            } else {
                openChallengeFamilyPicker(currentLevel);
            }
        };
    }
}

// Still used by the Challenge Map overlay (js/team/map.js) to jump
// straight to a specific level, even though the dashboard's own "view all
// levels" browse list (which used to call this too) is gone.
function openChallengeFamilyPickerByNumber(levelNumber) {
    if (!challengeLevelsCache) return;

    const level = challengeLevelsCache.find(l => l.level_number === levelNumber);
    if (!level) return;

    openChallengeFamilyPicker(level);
}
async function renderChallengeDashboardRace() {
    const mount = document.getElementById("challengeDashRaceMount");
    if (!mount) return;

    if (typeof renderTeamRaceView === "function") {
        await renderTeamRaceView("challengeDashRaceMount", { mode: "top3" });
    } else {
        mount.innerHTML = `<p style="font-size:13px; color:#94a3b8;">Team race loading soon.</p>`;
    }
}

async function exitChallengeBackToDashboard() {
    const challengeLevels = document.getElementById("challengeLevelsScreen");
    const teamHub = document.getElementById("teamHubScreen");

    if (challengeLevels) challengeLevels.style.display = "none";
    if (teamHub) teamHub.style.display = "none";

    if (typeof chooseModeChallenge === "function") await chooseModeChallenge();
}

// -----------------------------------------------------------------------------
// Challenge levels screen (fallback)
// -----------------------------------------------------------------------------

async function fetchChallengeLevels() {
    if (challengeLevelsCache) return challengeLevelsCache;
    const { data, error } = await _supabase
        .from('challenge_levels')
        .select('level_number, letter_families, title')
        .order('level_number', { ascending: true });
    if (error) { console.error("Failed to load challenge levels:", error); return []; }
    challengeLevelsCache = data || [];
    return challengeLevelsCache;
}

async function getTeamBoardInfo() {
    if (!currentProfile?.team_id) return { name: "No Team Yet", current_level: 1, streak_count: 0 };
    const { data: team, error } = await _supabase
        .from('teams')
        .select('name, current_level, streak_count')
        .eq('id', currentProfile.team_id)
        .maybeSingle();
    if (error || !team) return { name: "No Team Yet", current_level: 1, streak_count: 0 };
    return { name: team.name || "Your Team", current_level: team.current_level || 1, streak_count: team.streak_count || 0 };
}

// Individual progression: each student's own unlocked level, independent
// of their team (teams.current_level is now purely observational — see
// getTeamBoardInfo(), still used for team name/social display). Fetched
// fresh every time, same as getTeamBoardInfo(), since a teacher approval
// can advance it mid-session and currentProfile is only refreshed at
// login — reading a cached value here would go stale.
async function getMyCurrentLevel() {
    if (!currentUser?.id) return 1;
    const { data } = await _supabase
        .from('profiles')
        .select('current_level')
        .eq('id', currentUser.id)
        .maybeSingle();
    return data?.current_level || 1;
}
window.getMyCurrentLevel = getMyCurrentLevel;

function renderChallengeBoardHeader(team, totalLevels) {
    document.getElementById("challengeBoardTeamName").innerText = team.name;
    document.getElementById("challengeBoardTeamSub").innerText = `Level ${team.current_level} of ${totalLevels}`;
    document.getElementById("challengeBoardStreakValue").innerText = team.streak_count;
    const percent = Math.min(100, Math.round(((team.current_level - 1) / totalLevels) * 100));
    document.getElementById("challengeBoardProgressFill").style.width = `${percent}%`;
    document.getElementById("challengeBoardTeamSwatch").style.background = getTeamHex(team.name);
}

async function renderChallengeLevelsView() {
    const container = document.getElementById("challengeLevelsGrid");
    container.innerHTML = `<p style="color:#94a3b8;">Loading levels...</p>`;
    const [levels, team] = await Promise.all([fetchChallengeLevels(), getTeamBoardInfo()]);
    renderChallengeBoardHeader(team, levels.length || 12);
    container.innerHTML = "";

    levels.forEach(level => {
        const isCompleted = level.level_number < team.current_level;
        const isCurrent = level.level_number === team.current_level;
        const isUnlocked = level.level_number <= team.current_level;
        const stateClass = isCompleted ? 'completed' : (isUnlocked ? 'unlocked' : 'locked');
        const card = document.createElement('div');
        card.className = `challenge-level-card ${stateClass} ${isCurrent ? 'current' : ''}`;
        card.innerHTML = `
            <div class="challenge-level-number-badge">${isUnlocked ? level.level_number : '🔒'}</div>
            <div class="challenge-level-title">${level.title || `Level ${level.level_number}`}</div>
            <div class="challenge-level-families">${(level.letter_families || []).join(' ')}</div>
            ${level.level_number === 12 ? '<div class="challenge-capstone-badge">⭐ Capstone</div>' : ''}
        `;
        if (isUnlocked) card.onclick = () => openChallengeFamilyPicker(level);
        container.appendChild(card);
    });
}

// -----------------------------------------------------------------------------
// Family picker
// -----------------------------------------------------------------------------

async function openChallengeFamilyPicker(level) {
    activeChallengeLevel = level;

    const studentShell = document.getElementById("studentShellScreen");
    const challengeLevels = document.getElementById("challengeLevelsScreen");
    const challengeFamily = document.getElementById("challengeFamilyScreen");
    const challengeFamilyDetail = document.getElementById("challengeFamilyDetailScreen");

    if (studentShell) studentShell.style.display = "none";
    if (challengeLevels) challengeLevels.style.display = "none";
    if (challengeFamilyDetail) challengeFamilyDetail.style.display = "none";
    if (challengeFamily) challengeFamily.style.display = "block";

    await renderChallengeFamilyPicker();
}

async function returnToChallengeFamilyPicker() {
    document.getElementById("gameWorkspace").style.display = "none";

    // Team-hub-launched games (Letter Board) return to their own practice
    // sheet — check that context first, before falling back to the
    // Competition flow's own state.
    if (typeof embeddedActiveFamily !== "undefined" && embeddedActiveFamily) {
        document.getElementById("familyPracticeSheet").style.display = "flex";
        return;
    }

    if (activeChallengeFamilyObj) {
        document.getElementById("challengeFamilyDetailScreen").style.display = "block";
        renderChallengeFamilyDetailGiantRow(activeChallengeFamilyObj);
        await refreshChallengeDetailWritingGate(activeChallengeFamilyObj, activeChallengeFamilyLevel);
    } else if (activeChallengeLevel) {
        document.getElementById("challengeFamilyScreen").style.display = "block";
        await renderChallengeFamilyPicker();
    } else {
        // Shouldn't happen given the current navigation graph, but fail
        // safe to the Competition dashboard instead of a blank screen.
        if (typeof chooseModeChallenge === "function") await chooseModeChallenge();
    }
}

async function fetchStudentFamilyProgressForLevel(levelNumber) {
    const { data, error } = await _supabase
        .from('student_family_progress')
        .select('base_letter, best_streak, streak_passed, writing_passed, completed_at')
        .eq('student_id', currentUser.id)
        .eq('level_number', levelNumber);
    if (error) { console.error("Failed to load family progress:", error); return []; }
    return data || [];
}

async function renderChallengeFamilyPicker() {
    const level = activeChallengeLevel;
    const title = document.getElementById("challengeFamilyTitle");
    const container = document.getElementById("challengeFamilyGrid");

    if (!level || !container) return;

    if (title) {
        title.innerText = level.title || `Level ${level.level_number}`;
    }

    container.innerHTML = `<p style="color:#94a3b8;">Loading...</p>`;

    const progressRows = await fetchStudentFamilyProgressForLevel(level.level_number);
    const progressByLetter = {};
    progressRows.forEach(row => { progressByLetter[row.base_letter] = row; });

    container.innerHTML = `
        <details class="challenge-start-here">
            <summary>
                <span>${icon('books')} Start Here</span>
                <small>songs + lesson + writing videos</small>
            </summary>

            <div class="challenge-lesson-briefing">
                <div class="challenge-lesson-icon">${icon('books')}</div>
                <div class="challenge-lesson-level">Level ${level.level_number}</div>
                <div class="challenge-lesson-families">${(level.letter_families || []).join(" ")}</div>
                <p>Listen to the songs and SING along! Watch the lesson video and writing stroke videos to make your writing T and pass this level.</p>
            </div>

            <div class="challenge-resource-card songs visual">
                <h3>${icon('music')} Music First! Lets Jam ${icon('music')}</h3>

                <div class="challenge-resource-icons">
                    <a href="https://www.youtube.com/watch?v=dWQQeHyIebk&list=RDdWQQeHyIebk&start_radio=1" target="_blank" rel="noopener">
                        <span>${icon('music')}</span>
                        <strong>Fidel Song</strong>
                    </a>

                    <a href="https://www.youtube.com/watch?v=gCXlWMXNfNw&list=RDdWQQeHyIebk&index=4" target="_blank" rel="noopener">
                        <span>${icon('music')}</span>
                        <strong>Fidel Rap</strong>
                    </a>

                    <a href="https://www.youtube.com/watch?v=MEhod-dvmCc&list=RDdWQQeHyIebk&index=10" target="_blank" rel="noopener">
                        <span>🎂</span>
                        <strong>Birthday</strong>
                    </a>
                </div>
            </div>

            <div class="challenge-resource-card lesson writing visual">
                <h3>🎥 Lesson & Writing Videos</h3>

                <div class="challenge-resource-icons">
                    <a href="https://www.youtube.com/watch?v=QgssO7_WkSk" target="_blank" rel="noopener">
                        <span>🎥</span>
                        <strong>Lesson</strong>
                    </a>

                    <a href="https://www.youtube.com/watch?v=4LIUwGr40dg&t=192s" target="_blank" rel="noopener">
                        <span>${icon('note-pencil')}</span>
                        <strong>Writing 1</strong>
                    </a>

                    <a href="https://www.youtube.com/watch?v=j0jaSbFA30w" target="_blank" rel="noopener">
                        <span>${icon('pencil')}</span>
                        <strong>Writing 2</strong>
                    </a>
                </div>
            </div>
        </details>

        <div class="challenge-family-divider"></div>
    `;

    const positionLabels = ["1st", "2nd", "3rd"];

    (level.letter_families || []).forEach((baseLetter, idx) => {
        const progress = progressByLetter[baseLetter] || { best_streak: 0, streak_passed: false, writing_passed: false };
        const fidelObj = alphabetData.find(item => item.base === baseLetter);
        if (!fidelObj) return;
        const card = document.createElement('div');
        card.className = `challenge-family-card pos-${idx + 1} ${progress.streak_passed && progress.writing_passed ? 'mastered' : ''}`;
        card.innerHTML = `
            <span class="challenge-family-position-tag">${positionLabels[idx] || `#${idx + 1}`}</span>
            <div class="challenge-family-letter">${baseLetter}</div>
            <div class="challenge-family-progress-row">
                <span class="challenge-family-pill ${progress.streak_passed ? 'done' : ''}">
                    ${progress.streak_passed ? '✓' : ''} Streak ${progress.best_streak}/${STREAK_THRESHOLD}
                </span>
                <span class="challenge-family-pill ${progress.writing_passed ? 'done' : ''}">
                    ${progress.writing_passed ? '✓ Writing approved' : 'Writing pending'}
                </span>
            </div>
        `;
        card.onclick = () => openChallengeFamilyDetail(fidelObj, level.level_number);
        container.appendChild(card);
    });

    // Word Builder pairs two Competition levels per level (1,2)->WB1,
    // (3,4)->WB2, etc. — same cross-link Fidel Practice offers, so a
    // student practicing through the team challenge sees the same bridge.
    const wbLevel = Math.ceil(level.level_number / 2);
    const wbLink = document.createElement('div');
    wbLink.className = 'lb-wordbuilder-link';
    wbLink.style.gridColumn = '1 / -1';
    wbLink.innerHTML = `${icon('book-open')} Word Builder ${wbLevel} <span class="lb-wordbuilder-link-arrow">→</span>`;
    wbLink.onclick = () => { if (typeof enterWordBuilder === 'function') enterWordBuilder(); };
    container.appendChild(wbLink);
}

// -----------------------------------------------------------------------------
// Family detail
// -----------------------------------------------------------------------------

async function openChallengeFamilyDetail(fidelObj, levelNumber, returnTo = 'picker') {
    activeChallengeFamilyObj = fidelObj;
    activeChallengeFamilyLevel = levelNumber;
    challengeFamilyDetailReturnTo = returnTo;
    document.getElementById("challengeFamilyScreen").style.display = "none";
    document.getElementById("studentShellScreen").style.display = "none";
    document.getElementById("challengeFamilyDetailScreen").style.display = "block";
    document.getElementById("challengeFamilyDetailTitle").innerText = `Family: "${fidelObj.base}"`;
    renderChallengeFamilyDetailGiantRow(fidelObj);

    const body = document.getElementById("challengeFamilyPracticeBody");

    if (currentProfile?.is_captain) {
        if (body) body.style.display = "none";
        const box = document.getElementById("challengeWritingStatusBox");
        box.style.display = "block";
        box.innerHTML = `<div class="challenge-writing-status approved">${icon('crown')} As team captain, you're exempt. Focus on reviewing your team's submissions!</div>`;
        return;
    }

    if (body) body.style.display = "block";
    renderWritingStatusForFamily(fidelObj.base);
    renderChallengeInlineFlashcard(fidelObj);

    const practiceTitle = document.getElementById("challengePracticeTitle");
    if (practiceTitle) practiceTitle.innerText = `Try writing "${fidelObj.base}" with your finger`;
    // Practice pad is collapsed by default (js/submissions.js's sketchpad
    // init sizes the canvas from its own rendered rect, so it can't run
    // while hidden anyway) — collapse it again here in case a previous
    // family's page left it open, and lazy-init on first expand instead.
    const practicePadBody = document.getElementById("challengePracticePadBody");
    if (practicePadBody) practicePadBody.style.display = "none";

    document.getElementById("challengeDetailPlayBtn").onclick = () => launchChallengeStreakGame(fidelObj, levelNumber);

    await refreshChallengeDetailWritingGate(fidelObj, levelNumber);
}

// Writing submission stays locked until the matching-game streak of
// STREAK_THRESHOLD is passed, and once unlocked it's photo-only (real paper
// handwriting) — see openWritingSubmitScreen's photoOnly option.
async function refreshChallengeDetailWritingGate(fidelObj, levelNumber) {
    const writeBtn = document.getElementById("challengeDetailWritingBtn");
    const lockCard = document.getElementById("challengeWritingLockCard");
    if (!writeBtn) return;
    const writeSub = document.getElementById("challengeDetailWritingSub");

    const { data: progress } = await _supabase
        .from('student_family_progress')
        .select('streak_passed')
        .eq('student_id', currentUser.id)
        .eq('base_letter', fidelObj.base)
        .eq('level_number', levelNumber)
        .maybeSingle();

    const streakDone = !!progress?.streak_passed;
    if (lockCard) lockCard.style.display = streakDone ? "none" : "block";
    writeBtn.style.display = streakDone ? "flex" : "none";
    if (writeSub) writeSub.innerText = "Submit for captain review";

    writeBtn.onclick = streakDone
        ? () => {
            openWritingSubmitScreen(fidelObj.base, 'challengeDetail', levelNumber, { photoOnly: true });
            document.getElementById("challengeFamilyDetailScreen").style.display = "none";
        }
        : null;
}

function exitChallengeFamilyDetail() {
    document.getElementById("challengeFamilyDetailScreen").style.display = "none";
    if (challengeFamilyDetailReturnTo === 'dashboard') {
        exitChallengeBackToDashboard();
    } else {
        document.getElementById("challengeFamilyScreen").style.display = "block";
    }
}

// Practice pad stays collapsed until tapped — its canvas can't size itself
// while hidden, so the sketchpad only gets initialized on first expand
// (initSketchpadWithUndo guards against re-running on later taps).
function toggleChallengePracticePad() {
    const body = document.getElementById("challengePracticePadBody");
    if (!body) return;
    const isOpen = body.style.display === "block";
    body.style.display = isOpen ? "none" : "block";
    if (!isOpen && typeof initChallengePracticePad === "function") initChallengePracticePad();
}
window.toggleChallengePracticePad = toggleChallengePracticePad;

// ---------------------------------------------------------------------------
// Inline flashcards — same deck data as the standalone Flashcard screen
// (buildFlashcardDeckForFamily), but mounted directly on the family detail
// page so there's no extra navigation between the letter row and practice.
// ---------------------------------------------------------------------------

let challengeFlashDeck = [];
let challengeFlashIndex = 0;
let challengeFlashFlipped = false;
let _challengeFlashTouchX = 0;
let _challengeFlashTouchY = 0;

function renderChallengeInlineFlashcard(fidelObj) {
    challengeFlashDeck = buildFlashcardDeckForFamily(fidelObj);
    challengeFlashIndex = 0;
    challengeFlashFlipped = false;
    renderChallengeFlashFace();

    const card = document.getElementById("challengeInlineFlashcard");
    if (!card) return;

    if (!card._wired) {
        card._wired = true;
        card.addEventListener("click", (e) => {
            if (e.target.closest('.flashcard-arrow')) return;
            challengeFlashFlipped = !challengeFlashFlipped;
            renderChallengeFlashFace();
        });
        card.addEventListener("touchstart", e => {
            _challengeFlashTouchX = e.changedTouches[0].screenX;
            _challengeFlashTouchY = e.changedTouches[0].screenY;
        }, { passive: true });
        card.addEventListener("touchend", e => {
            const dx = e.changedTouches[0].screenX - _challengeFlashTouchX;
            const dy = e.changedTouches[0].screenY - _challengeFlashTouchY;
            if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;
            challengeFlashStep(dx < 0 ? 1 : -1);
        }, { passive: true });
    }
}

function challengeFlashStep(dir) {
    if (!challengeFlashDeck.length) return;
    challengeFlashIndex = (challengeFlashIndex + dir + challengeFlashDeck.length) % challengeFlashDeck.length;
    challengeFlashFlipped = false;
    renderChallengeFlashFace();
}

function renderChallengeFlashFace() {
    const entry = challengeFlashDeck[challengeFlashIndex];
    if (!entry) return;

    const charEl = document.getElementById("challengeFlashChar");
    if (charEl) {
        charEl.innerText = challengeFlashFlipped ? entry.sound : entry.char;
        charEl.classList.toggle("flash-face-sound", challengeFlashFlipped);
    }

    // "Tap to flip" hint only on the very first card — the dots below
    // already show position for every card after that.
    const hint = document.getElementById("challengeFlashHint");
    if (hint) hint.style.display = challengeFlashIndex === 0 ? "block" : "none";

    const dots = document.getElementById("challengeFlashDots");
    if (dots) {
        dots.innerHTML = challengeFlashDeck.map((_, i) =>
            `<span class="${i === challengeFlashIndex ? 'active' : ''}"></span>`
        ).join("");
    }
}

// ---------------------------------------------------------------------------
// Level Resources overlay — same links as the "Current Level Resources"
// dashboard card, surfaced as an overlay so they're reachable from inside a
// family's detail screen too, without leaving the page.
// ---------------------------------------------------------------------------

function openLevelResourcesOverlay() {
    const overlay = document.getElementById("levelResourcesOverlay");
    if (overlay) overlay.style.display = "flex";
}

function closeLevelResourcesOverlay() {
    const overlay = document.getElementById("levelResourcesOverlay");
    if (overlay) overlay.style.display = "none";
}

function renderChallengeFamilyDetailGiantRow(fidelObj) {
    const mount = document.getElementById("challengeFamilyDetailGiantRow");
    mount.innerHTML = "";
    const subs = fidelObj.family.map((char, idx) => getIsolatedLetterPhonetic(fidelObj, idx));
    fidelObj.family.forEach((char, idx) => {
        const card = document.createElement('div');
        card.className = "giant-char-card";
        card.innerHTML = `<div class="letter">${char}</div><div class="sub">${subs[idx]}</div>`;
        mount.appendChild(card);
    });
}

// -----------------------------------------------------------------------------
// Streak game
// -----------------------------------------------------------------------------

async function recordStreakProgress(baseLetter, levelNumber, bestStreak, passed) {
    await saveStreakProgress(baseLetter, levelNumber, bestStreak, passed);
}

function launchChallengeStreakGame(fidelObj, levelNumber) {
    let best = 0;
    let matchesSinceLastSave = 0;

    activeChallengeContext = {
        baseLetter: fidelObj.base,
        levelNumber: levelNumber,
        onStreakUpdate: (streak) => {
            if (streak > best) best = streak;
            matchesSinceLastSave++;
            if (matchesSinceLastSave >= 5) {
                matchesSinceLastSave = 0;
                recordStreakProgress(fidelObj.base, levelNumber, best, false);
            }
        },
        onStreakPassed: async (finalStreak) => {
            await recordStreakProgress(fidelObj.base, levelNumber, finalStreak, true);
            showGobezToast(`${icon('fire')} Streak of ${STREAK_THRESHOLD} complete! "${fidelObj.base}" passed!`);
            executeVictoryConfettiCelebration();
            setTimeout(() => {
                document.getElementById('gameWorkspace').style.display = "none";
                activeChallengeContext = null;
                showPostStreakWritingPrompt(fidelObj, levelNumber, 'challenge');
            }, 1800);
        }
    };

    maybeShowStreakExplainer(() => {
        document.getElementById("challengeFamilyDetailScreen").style.display = "none";
        document.getElementById("challengeFamilyScreen").style.display = "none";
        openMatchingGameWorkspaceMode(fidelObj);
    });
}

async function exitChallengeFamilyPicker() {
    const challengeFamily = document.getElementById("challengeFamilyScreen");
    const challengeLevels = document.getElementById("challengeLevelsScreen");

    if (challengeFamily) challengeFamily.style.display = "none";

    if (typeof chooseModeChallenge === "function") {
        await chooseModeChallenge();
    } else if (challengeLevels) {
        challengeLevels.style.display = "block";
        renderChallengeLevelsView();
    }
}

// -----------------------------------------------------------------------------
// Expose
// -----------------------------------------------------------------------------

window.enterModeSelect = enterModeSelect;
window.chooseModePractice = chooseModePractice;
window.chooseModeChallenge = chooseModeChallenge;

window.exitChallengeBackToDashboard = exitChallengeBackToDashboard;

window.openChallengeFamilyPickerByNumber = openChallengeFamilyPickerByNumber;

window.exitChallengeFamilyPicker = exitChallengeFamilyPicker;
window.returnToChallengeFamilyPicker = returnToChallengeFamilyPicker;
window.launchChallengeStreakGame = launchChallengeStreakGame;
window.exitChallengeFamilyDetail = exitChallengeFamilyDetail;
window.openChallengeFamilyDetail = openChallengeFamilyDetail;
window.refreshChallengeDetailWritingGate = refreshChallengeDetailWritingGate;
window.renderChallengeInlineFlashcard = renderChallengeInlineFlashcard;
window.challengeFlashStep = challengeFlashStep;
window.openLevelResourcesOverlay = openLevelResourcesOverlay;
window.closeLevelResourcesOverlay = closeLevelResourcesOverlay;

window.getTeamHex = getTeamHex;

window.renderChallengeDashboard = renderChallengeDashboard;
window.renderChallengeDashboardMap = renderChallengeDashboardMap;
window.renderChallengeDashboardRace = renderChallengeDashboardRace;
window.renderChallengeTeamStatus = renderChallengeTeamStatus;

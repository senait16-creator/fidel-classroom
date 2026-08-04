// =============================================================================
// CHALLENGE.JS
// =============================================================================

let challengeLevelsCache = null;
let activeChallengeLevel = null;
let activeChallengeFamilyObj = null;
let activeChallengeFamilyLevel = null;

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
// Mode select — home screen after login, shown every time
// -----------------------------------------------------------------------------

function enterModeSelect() {
    showScreen("modeSelectScreen", "flex");

    if (typeof applyModeLockStyling === 'function') applyModeLockStyling();
    if (typeof refreshWordBuilderCupCard === 'function') refreshWordBuilderCupCard();

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

    showScreen("challengeDashboardScreen");
    await renderChallengeDashboard();
}

async function renderChallengeDashboard() {
    const [team, levels] = await Promise.all([
        getTeamBoardInfo(),
        fetchChallengeLevels()
    ]);

    const teamHex = getTeamHex(team.name);

    // ── Hero subtitle ────────────────────────────────────────
    const sub = document.getElementById("challengeDashSub");
    if (sub) {
        sub.innerText = `${team.name} • Level ${team.current_level} • 🔥 ${team.streak_count || 0} streak`;
    }

    // ── Progress to ፐ — shared hero, so this renders once and shows
    //    up automatically on both the student and captain dashboard. ──
    const totalLevels = levels.length > 0 ? Math.max(...levels.map(l => l.level_number)) : 12;
    const currentLevelNum = team.current_level || 1;
    const pePercent = Math.min(100, Math.max(0, Math.round(((currentLevelNum - 1) / totalLevels) * 100)));
    const peLabel = document.getElementById("peProgressLabel");
    const peFill = document.getElementById("peProgressFill");
    if (peLabel) peLabel.innerText = `Level ${currentLevelNum} of ${totalLevels}`;
    if (peFill) peFill.style.width = `${pePercent}%`;

    const peWeekLabel = document.getElementById("peWeekLabel");
    if (peWeekLabel && typeof getProgramWeekNumber === "function") {
        peWeekLabel.innerText = `📅 Week ${getProgramWeekNumber()}`;
    }

    // ── "View team status" button — toggles the inline panel.
    //    Team is information on this page, not a separate destination.
    //    Captains get the richer Captain Dashboard's Team Progress card
    //    instead, so this whole card is hidden for them to avoid showing
    //    the same information twice. ──
    const teamStatusSection = document.getElementById("challengeTeamStatusMount");
    const teamBtn = document.getElementById("challengeYourTeamBtn");
    const statusContent = document.getElementById("challengeTeamStatusContent");
    if (currentProfile?.is_captain) {
        if (teamStatusSection) teamStatusSection.style.display = "none";
    } else {
        if (teamStatusSection) teamStatusSection.style.display = "";
        if (teamBtn) {
            teamBtn.style.background = `linear-gradient(135deg, ${teamHex}, ${teamHex}cc)`;
            teamBtn.innerText = `View ${team.name} status ↓`;
            teamBtn.onclick = () => {
                if (!statusContent) return;
                const isOpen = statusContent.style.display === "block";
                statusContent.style.display = isOpen ? "none" : "block";
                teamBtn.innerText = isOpen
                    ? `View ${team.name} status ↓`
                    : `Hide ${team.name} status ↑`;
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

    // ── Captain Dashboard — one consolidated leadership zone ─────
    const captainZone = document.getElementById("captainZone");
    if (captainZone) {
        if (currentProfile?.is_captain) {
            captainZone.style.display = "block";
            const zoneSub = document.getElementById("captainZoneSub");
            if (zoneSub) zoneSub.innerText = `Your leadership tools for ${team.name}`;

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
            if (typeof loadCaptainWritingQueue === "function") await loadCaptainWritingQueue();
            if (typeof loadCaptainRecentlyApproved === "function") await loadCaptainRecentlyApproved();
            if (typeof loadCaptainTeamProgress === "function") await loadCaptainTeamProgress();
            if (typeof loadHelpFlags === "function") await loadHelpFlags('helpFlagsMount');
            if (typeof loadDailyTeamChallenge === "function") await loadDailyTeamChallenge();
            if (typeof loadWeeklyMeeting === "function") await loadWeeklyMeeting();
            if (typeof renderStarPicker === "function") await renderStarPicker("starPickerMount");
            if (typeof loadCaptainStats === "function") await loadCaptainStats();
        } else {
            captainZone.style.display = "none";
        }
    }

    // ── Captains lead, they don't need their own "Current Level" practice
    //    card taking up the top of this page — the Captain Dashboard above
    //    covers what they need here. Team Race and Start Here stay visible
    //    for everyone. ──
    const currentLevelCard = document.getElementById("challengeCurrentLevelCard");
    if (currentLevelCard) currentLevelCard.style.display = currentProfile?.is_captain ? "none" : "";

    // ── Level-completion approval banner (students only, relocated
    //    from team hub) — the function self-gates on is_captain/team_id ──
    if (typeof renderLevelCompletionBanner === "function") {
        await renderLevelCompletionBanner('levelCompletionMount');
    }

    // ── Render all dashboard sections ────────────────────────
    await renderChallengeDashboardMap(levels, team);
    await renderTeamUrgencyCard(team);
    await renderChallengeTeamStatus(team);
    await renderChallengeDashboardRace();
    wireCurrentLevelResources(levels, team);
}

// The resource videos/links themselves are the same regardless of level
// (general Fidel alphabet resources), so this just labels the card with
// the student's actual current level and points Practice at it.
function wireCurrentLevelResources(levels, team) {
    const currentLevel = levels.find(l => l.level_number === (team.current_level || 1)) || levels[0];

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

async function renderChallengeDashboardMap(levels, team) {
    const mount = document.getElementById("challengeDashMapMount");
    if (!mount) return;

    const currentLevelNumber = team.current_level || 1;
    const currentLevel = levels.find(l => l.level_number === currentLevelNumber) || levels[0];
    const nextLevel = levels.find(l => l.level_number === currentLevelNumber + 1);

    if (!currentLevel) {
        mount.innerHTML = `<p style="font-size:13px; color:#94a3b8;">No challenge levels found yet.</p>`;
        return;
    }

    const hiddenLevels = levels.filter(level =>
        level.level_number !== currentLevel.level_number &&
        (!nextLevel || level.level_number !== nextLevel.level_number)
    );

    // "Today's Goal" — the student's specific next-incomplete family in the
    // current level, with their live streak, instead of a flat level label.
    // Hidden once every family is cleared — the "cleared all 3" banner at
    // the very top of the page already covers that state.
    let goalHtml = '';
    let targetFamily = null;
    const families = currentLevel.letter_families || [];
    if (!currentProfile?.is_captain && families.length > 0) {
        const { data: progressRows } = await _supabase
            .from('student_family_progress')
            .select('base_letter, streak_passed, writing_passed, best_streak')
            .eq('student_id', currentUser.id)
            .eq('level_number', currentLevel.level_number);

        targetFamily = families.find(fam => {
            const row = (progressRows || []).find(r => r.base_letter === fam);
            return !(row?.streak_passed && row?.writing_passed);
        });

        if (targetFamily) {
            const row = (progressRows || []).find(r => r.base_letter === targetFamily);
            const streak = row?.best_streak || 0;
            const percent = Math.min(100, Math.round((streak / STREAK_THRESHOLD) * 100));
            goalHtml = `
                <div class="challenge-goal-card">
                    <div class="challenge-goal-eyebrow">🎯 Today's Goal</div>
                    <div class="challenge-goal-title">Complete the ${targetFamily} family</div>
                    <div class="challenge-goal-streak-row">
                        <span>Current streak</span><span>${streak} / ${STREAK_THRESHOLD}</span>
                    </div>
                    <div class="challenge-goal-track"><div class="challenge-goal-fill" style="width:${percent}%;"></div></div>
                    <button class="challenge-goal-btn" id="challengeGoalBtn">Continue Practicing →</button>
                </div>`;
        }
    }

    mount.innerHTML = `
        ${goalHtml}

        ${
            nextLevel
                ? `
                    <div class="challenge-next-card">
                        <div class="challenge-next-icon">🔒</div>
                        <div>
                            <div class="challenge-next-label">Next Up</div>
                            <div class="challenge-next-title">Level ${nextLevel.level_number} · ${(nextLevel.letter_families || []).join(" ")}</div>
                            <div class="challenge-next-copy">Unlock by completing Level ${currentLevel.level_number}.</div>
                        </div>
                    </div>
                `
                : `
                    <div class="challenge-next-card complete">
                        <div class="challenge-next-icon">🏁</div>
                        <div>
                            <div class="challenge-next-label">Final Stretch</div>
                            <div class="challenge-next-title">You are on the last level.</div>
                            <div class="challenge-next-copy">Finish strong with your team.</div>
                        </div>
                    </div>
                `
        }

        <button class="challenge-levels-toggle" onclick="toggleChallengeAllLevels()">
            🔒 View all levels <span id="challengeAllLevelsChevron">▼</span>
        </button>

        <div id="challengeAllLevelsList" class="challenge-all-levels-list" style="display:none;">
            ${hiddenLevels.map(level => {
                const isCompleted = level.level_number < currentLevelNumber;
                const isLocked = level.level_number > currentLevelNumber;

                return `
                    <div class="challenge-mini-level ${isCompleted ? "completed" : isLocked ? "locked" : "unlocked"}"
                         ${!isLocked ? `onclick="openChallengeFamilyPickerByNumber(${level.level_number})"` : ""}>
                        <span>${isCompleted ? "✓" : isLocked ? "🔒" : level.level_number}</span>
                        <div>
                            <strong>Level ${level.level_number}</strong>
                            <small>${(level.letter_families || []).join(" ")}</small>
                        </div>
                    </div>
                `;
            }).join("")}
        </div>
    `;

    const goalBtn = document.getElementById("challengeGoalBtn");
    if (goalBtn) {
        goalBtn.onclick = async () => {
            const fidelObj = targetFamily ? alphabetData.find(f => f.base === targetFamily) : null;
            // Go through the picker first so its navigation state (activeChallengeLevel,
            // the rendered family grid) is set up correctly for the "back" button,
            // then immediately layer the detail screen on top for a one-tap jump.
            await openChallengeFamilyPicker(currentLevel);
            if (fidelObj) openChallengeFamilyDetail(fidelObj, currentLevel.level_number);
        };
    }
}

function toggleChallengeAllLevels() {
    const list = document.getElementById("challengeAllLevelsList");
    const chevron = document.getElementById("challengeAllLevelsChevron");
    if (!list) return;

    const isOpen = list.style.display === "block";
    list.style.display = isOpen ? "none" : "block";

    if (chevron) {
        chevron.innerText = isOpen ? "▼" : "▲";
    }
}

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
        await renderTeamRaceView("challengeDashRaceMount", { mode: "challenge" });
    } else {
        mount.innerHTML = `<p style="font-size:13px; color:#94a3b8;">Team race loading soon.</p>`;
    }
}

async function exitChallengeBackToDashboard() {
    const challengeLevels = document.getElementById("challengeLevelsScreen");
    const challengeDashboard = document.getElementById("challengeDashboardScreen");
    const teamHub = document.getElementById("teamHubScreen");

    if (challengeLevels) challengeLevels.style.display = "none";
    if (teamHub) teamHub.style.display = "none";

    if (challengeDashboard) {
        challengeDashboard.style.display = "block";
        if (typeof renderChallengeDashboard === "function") {
            await renderChallengeDashboard();
        }
    } else if (typeof chooseModeChallenge === "function") {
        await chooseModeChallenge();
    }
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

    const challengeDashboard = document.getElementById("challengeDashboardScreen");
    const challengeLevels = document.getElementById("challengeLevelsScreen");
    const challengeFamily = document.getElementById("challengeFamilyScreen");

    if (challengeDashboard) challengeDashboard.style.display = "none";
    if (challengeLevels) challengeLevels.style.display = "none";
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
                <span>📚 Start Here</span>
                <small>songs + lesson + writing videos</small>
            </summary>

            <div class="challenge-lesson-briefing">
                <div class="challenge-lesson-icon">📚</div>
                <div class="challenge-lesson-level">Level ${level.level_number}</div>
                <div class="challenge-lesson-families">${(level.letter_families || []).join(" ")}</div>
                <p>Listen to the songs and SING along! Watch the lesson video and writing stroke videos to make your writing T and pass this level.</p>
            </div>

            <div class="challenge-resource-card songs visual">
                <h3>🎵 Music First! Lets Jam 🎵</h3>

                <div class="challenge-resource-icons">
                    <a href="https://www.youtube.com/watch?v=dWQQeHyIebk&list=RDdWQQeHyIebk&start_radio=1" target="_blank" rel="noopener">
                        <span>🎵</span>
                        <strong>Fidel Song</strong>
                    </a>

                    <a href="https://www.youtube.com/watch?v=gCXlWMXNfNw&list=RDdWQQeHyIebk&index=4" target="_blank" rel="noopener">
                        <span>🎶</span>
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
                        <span>📝</span>
                        <strong>Writing 1</strong>
                    </a>

                    <a href="https://www.youtube.com/watch?v=j0jaSbFA30w" target="_blank" rel="noopener">
                        <span>✏️</span>
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
}

// -----------------------------------------------------------------------------
// Family detail
// -----------------------------------------------------------------------------

const vowelSoundLabels = ["eh", "oo", "ee", "ah", "ay", "ih", "o"];

async function openChallengeFamilyDetail(fidelObj, levelNumber) {
    activeChallengeFamilyObj = fidelObj;
    activeChallengeFamilyLevel = levelNumber;
    document.getElementById("challengeFamilyScreen").style.display = "none";
    document.getElementById("challengeFamilyDetailScreen").style.display = "block";
    document.getElementById("challengeFamilyDetailTitle").innerText = `Family: "${fidelObj.base}"`;
    renderChallengeFamilyDetailGiantRow(fidelObj);

    const body = document.getElementById("challengeFamilyPracticeBody");

    if (currentProfile?.is_captain) {
        if (body) body.style.display = "none";
        const box = document.getElementById("challengeWritingStatusBox");
        box.style.display = "block";
        box.innerHTML = `<div class="challenge-writing-status approved">👑 As team captain, you're exempt. Focus on reviewing your team's submissions!</div>`;
        return;
    }

    if (body) body.style.display = "block";
    renderWritingStatusForFamily(fidelObj.base);
    renderChallengeInlineFlashcard(fidelObj);

    const practiceTitle = document.getElementById("challengePracticeTitle");
    if (practiceTitle) practiceTitle.innerText = `Try writing "${fidelObj.base}" with your finger`;
    if (typeof initChallengePracticePad === 'function') initChallengePracticePad();

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
    document.getElementById("challengeFamilyScreen").style.display = "block";
}

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
    const prevBtn = document.getElementById("challengeFlashPrevBtn");
    const nextBtn = document.getElementById("challengeFlashNextBtn");
    if (!card) return;

    if (prevBtn) prevBtn.onclick = (e) => { e.stopPropagation(); challengeFlashStep(-1); };
    if (nextBtn) nextBtn.onclick = (e) => { e.stopPropagation(); challengeFlashStep(1); };

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
    const count = document.getElementById("challengeFlashCount");
    if (count) count.innerText = `${challengeFlashIndex + 1} / ${challengeFlashDeck.length}`;

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
    const subs = (fidelObj.prefix === "h" || fidelObj.prefix === "ḥ")
        ? vowelFrameworkLabels
        : vowelSoundLabels.map(sub => `${fidelObj.prefix}${sub}`);
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
            showGobezToast(`🔥 Streak of ${STREAK_THRESHOLD} complete! "${fidelObj.base}" passed!`);
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
    const challengeDashboard = document.getElementById("challengeDashboardScreen");
    const challengeLevels = document.getElementById("challengeLevelsScreen");

    if (challengeFamily) challengeFamily.style.display = "none";

    if (challengeDashboard) {
        challengeDashboard.style.display = "block";
        await renderChallengeDashboard();
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
window.toggleChallengeAllLevels = toggleChallengeAllLevels;

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

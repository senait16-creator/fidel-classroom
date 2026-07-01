// =============================================================================
// CHALLENGE.JS
// Simplified — team hub, captain dashboard, and embedded level map have
// all moved to js/team/hub.js, js/team/levels.js, js/team/progress.js.
// This file keeps: mode select, old-style challenge screens (fallback),
// and the reading mode entry point.
//
// Loads LAST (after all team/ files). Relies on globals from app.js,
// auth.js, game.js, submissions.js, team/hub.js, team/levels.js,
// team/progress.js.
// =============================================================================

let challengeLevelsCache = null;
let activeChallengeLevel = null;
let activeChallengeFamilyObj = null;
let activeChallengeFamilyLevel = null;

const TEAM_COLORS = {
    Red: '#b91c1c', Blue: '#1d4ed8', Green: '#166534',
    Yellow: '#a16207', Purple: '#7e22ce'
};

function getTeamHex(teamName) {
    for (const [key, hex] of Object.entries(TEAM_COLORS)) {
        if (teamName && teamName.includes(key)) return hex;
    }
    return '#166534';
}

// -----------------------------------------------------------------------------
// Mode select — entry point after login
// After first visit, students with a team go straight to team hub
// -----------------------------------------------------------------------------

function enterModeSelect() {
    document.getElementById("studentDashboard").style.display = "none";
    document.getElementById("readingLevelsScreen").style.display = "none";
    document.getElementById("challengeLevelsScreen").style.display = "none";
    document.getElementById("challengeFamilyScreen").style.display = "none";
    document.getElementById("challengeFamilyDetailScreen").style.display = "none";
    document.getElementById("teamHubScreen").style.display = "none";
    document.getElementById("captainDashboardScreen").style.display = "none";

    // After first visit: students with a team go directly to the hub
    const hasVisited = localStorage.getItem('fidel_has_visited');
    if (hasVisited && currentProfile?.team_id) {
        enterTeamHub();
        return;
    }

    document.getElementById("modeSelectScreen").style.display = "block";

    // Hide captain banner — captain flow is inside the team hub now
    const banner = document.getElementById("captainModeSelectBanner");
    const captainOption = document.getElementById("modeSelectCaptainOption");
    if (banner) banner.style.display = "none";
    if (captainOption) captainOption.style.display = "none";

    const nickname = currentProfile?.nickname ? `, ${currentProfile.nickname}` : '';
    const nicknameEl = document.getElementById("modeSelectNickname");
    if (nicknameEl) nicknameEl.innerText = nickname;

    // First-time onboarding card
    if (!hasVisited) {
        localStorage.setItem('fidel_has_visited', 'true');
        showOnboardingCard();
    }
}

function chooseModePractice() {
    document.getElementById("modeSelectScreen").style.display = "none";
    launchDashboard("student");
}

function chooseModeChallenge() {
    if (!currentProfile?.team_id) {
        showNotificationToast("Fidel Challenge is a team competition — your teacher will assign you to a team soon!");
        return;
    }
    document.getElementById("modeSelectScreen").style.display = "none";
    enterTeamHub();
}

function chooseModeReading() {
    document.getElementById("modeSelectScreen").style.display = "none";
    document.getElementById("readingLevelsScreen").style.display = "block";
    if (typeof renderReadingLevelsList === "function") renderReadingLevelsList();
}

function exitChallengeBackToDashboard() {
    document.getElementById("challengeLevelsScreen").style.display = "none";
    document.getElementById("teamHubScreen").style.display = "block";
}

// -----------------------------------------------------------------------------
// Challenge levels screen (fallback — still accessible from team hub
// "Go to Challenge Levels" button for students who prefer the old view)
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
    const { data: team, error } = await _supabase.from('teams').select('name, current_level, streak_count').eq('id', currentProfile.team_id).maybeSingle();
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
    document.getElementById("challengeLevelsScreen").style.display = "none";
    document.getElementById("challengeFamilyScreen").style.display = "block";
    await renderChallengeFamilyPicker();
}

async function returnToChallengeFamilyPicker() {
    document.getElementById("gameWorkspace").style.display = "none";

    // Game launched from embedded level map — return to practice sheet
    if (!activeChallengeLevel) {
        if (typeof embeddedActiveFamily !== "undefined" && embeddedActiveFamily) {
            document.getElementById("familyPracticeSheet").style.display = "flex";
        } else {
            document.getElementById("teamHubScreen").style.display = "block";
        }
        return;
    }

    // Game launched from old-style challenge screens — return there
    if (activeChallengeFamilyObj) {
        document.getElementById("challengeFamilyDetailScreen").style.display = "block";
        renderChallengeFamilyDetailGiantRow(activeChallengeFamilyObj);
    } else {
        document.getElementById("challengeFamilyScreen").style.display = "block";
        await renderChallengeFamilyPicker();
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
    document.getElementById("challengeFamilyTitle").innerText = level.title || `Level ${level.level_number}`;
    const container = document.getElementById("challengeFamilyGrid");
    container.innerHTML = `<p style="color:#94a3b8;">Loading...</p>`;
    const progressRows = await fetchStudentFamilyProgressForLevel(level.level_number);
    const progressByLetter = {};
    progressRows.forEach(row => { progressByLetter[row.base_letter] = row; });
    container.innerHTML = "";
    const positionLabels = ["1st", "2nd", "3rd"];

    (level.letter_families || []).forEach((baseLetter, idx) => {
        const progress = progressByLetter[baseLetter] || { best_streak: 0, streak_passed: false, writing_passed: false };
        const fidelObj = alphabetData.find(item => item.base === baseLetter);
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

const vowelSoundLabels = ["-ä", "-u", "-ee", "-a", "-ay", "-ih", "-o"];

function openChallengeFamilyDetail(fidelObj, levelNumber) {
    activeChallengeFamilyObj = fidelObj;
    activeChallengeFamilyLevel = levelNumber;
    document.getElementById("challengeFamilyScreen").style.display = "none";
    document.getElementById("challengeFamilyDetailScreen").style.display = "block";
    document.getElementById("challengeFamilyDetailTitle").innerText = `Family: "${fidelObj.base}"`;
    renderChallengeFamilyDetailGiantRow(fidelObj);

    if (currentProfile?.is_captain) {
        document.getElementById("challengeDetailPlayBtn").style.display = "none";
        document.getElementById("challengeDetailFlashcardBtn").style.display = "none";
        document.getElementById("challengeDetailWritingBtn").style.display = "none";
        const box = document.getElementById("challengeWritingStatusBox");
        box.style.display = "block";
        box.innerHTML = `<div class="challenge-writing-status approved">👑 As team captain, you're exempt — focus on reviewing your team's submissions!</div>`;
        return;
    }

    document.getElementById("challengeDetailPlayBtn").style.display = "flex";
    document.getElementById("challengeDetailFlashcardBtn").style.display = "flex";
    document.getElementById("challengeDetailWritingBtn").style.display = "block";
    renderWritingStatusForFamily(fidelObj.base);

    document.getElementById("challengeDetailPlayBtn").onclick = () => launchChallengeStreakGame(fidelObj, levelNumber);
    document.getElementById("challengeDetailFlashcardBtn").onclick = () => {
        openFlashcardStudy(buildFlashcardDeckForFamily(fidelObj), `"${fidelObj.base}" Family`, () => {
            document.getElementById("challengeFamilyDetailScreen").style.display = "block";
        });
        document.getElementById("challengeFamilyDetailScreen").style.display = "none";
    };
    document.getElementById("challengeDetailWritingBtn").onclick = () => {
        openWritingSubmitScreen(fidelObj.base, () => {
            document.getElementById("challengeFamilyDetailScreen").style.display = "block";
            renderWritingStatusForFamily(fidelObj.base);
        });
        document.getElementById("challengeFamilyDetailScreen").style.display = "none";
    };
}

function exitChallengeFamilyDetail() {
    document.getElementById("challengeFamilyDetailScreen").style.display = "none";
    document.getElementById("challengeFamilyScreen").style.display = "block";
}

function renderChallengeFamilyDetailGiantRow(fidelObj) {
    const mount = document.getElementById("challengeFamilyDetailGiantRow");
    mount.innerHTML = "";
    const subs = (fidelObj.prefix === "h" || fidelObj.prefix === "ḥ")
        ? ["ha", "hu", "hee", "ha", "hay", "hih", "ho"]
        : vowelSoundLabels.map(sub => `${fidelObj.prefix}${sub}`);
    fidelObj.family.forEach((char, idx) => {
        const card = document.createElement('div');
        card.className = "giant-char-card";
        card.innerHTML = `<div class="letter">${char}</div><div class="sub">${subs[idx]}</div>`;
        mount.appendChild(card);
    });
}

// -----------------------------------------------------------------------------
// Streak game (old-style challenge screens fallback)
// Primary streak game now lives in team/levels.js (launchEmbeddedStreakGame)
// -----------------------------------------------------------------------------

async function recordStreakProgress(baseLetter, levelNumber, bestStreak, passed) {
    const { error } = await _supabase.from('student_family_progress').upsert({
        student_id: currentUser.id, base_letter: baseLetter,
        level_number: levelNumber, best_streak: bestStreak, streak_passed: passed
    }, { onConflict: 'student_id,base_letter' });
    if (error) console.error("Failed to save streak progress:", error);
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
                showPostStreakWritingPrompt(fidelObj, levelNumber);
            }, 1800);
        }
    };

    maybeShowStreakExplainer(() => {
        document.getElementById("challengeFamilyDetailScreen").style.display = "none";
        document.getElementById("challengeFamilyScreen").style.display = "none";
        openMatchingGameWorkspaceMode(fidelObj);
    });
}

function exitChallengeFamilyPicker() {
    document.getElementById("challengeFamilyScreen").style.display = "none";
    document.getElementById("challengeLevelsScreen").style.display = "block";
    renderChallengeLevelsView();
}

// -----------------------------------------------------------------------------
// Expose
// -----------------------------------------------------------------------------

window.enterModeSelect = enterModeSelect;
window.chooseModePractice = chooseModePractice;
window.chooseModeChallenge = chooseModeChallenge;
window.chooseModeReading = chooseModeReading;
window.exitChallengeBackToDashboard = exitChallengeBackToDashboard;
window.openChallengeFamilyPicker = openChallengeFamilyPicker;
window.exitChallengeFamilyPicker = exitChallengeFamilyPicker;
window.returnToChallengeFamilyPicker = returnToChallengeFamilyPicker;
window.launchChallengeStreakGame = launchChallengeStreakGame;
window.exitChallengeFamilyDetail = exitChallengeFamilyDetail;
window.getTeamHex = getTeamHex;

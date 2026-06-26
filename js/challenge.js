// =============================================================================
// FIDEL CHALLENGE — challenge.js
// Loads AFTER app.js. Relies on globals already defined there:
//   _supabase, currentUser, currentProfile, showNotificationToast, alphabetData
// =============================================================================

// STREAK_THRESHOLD is defined in app.js (loads first) and shared here.

let challengeLevelsCache = null; // loaded once from challenge_levels, reused across views

// -----------------------------------------------------------------------------
// Mode select
// -----------------------------------------------------------------------------

// Called from the student dashboard — e.g. a new "Fidel Challenge" button
// placed next to (or instead of) the existing "Matching Game Arena" button.
function enterModeSelect() {
    document.getElementById("studentDashboard").style.display = "none";
    document.getElementById("modeSelectScreen").style.display = "block";
}

function chooseModePractice() {
    // "Practice the Fidel" = exactly what already exists today. No gating,
    // no team dependency, doesn't touch challenge tables at all.
    document.getElementById("modeSelectScreen").style.display = "none";
    document.getElementById("studentDashboard").style.display = "block";
}

async function chooseModeChallenge() {
    document.getElementById("modeSelectScreen").style.display = "none";
    document.getElementById("challengeLevelsScreen").style.display = "block";
    await renderChallengeLevelsView();
}

function exitChallengeBackToDashboard() {
    document.getElementById("challengeLevelsScreen").style.display = "none";
    document.getElementById("studentDashboard").style.display = "block";
}

// -----------------------------------------------------------------------------
// Locked levels view (static for now — no gameplay wired up yet)
// -----------------------------------------------------------------------------

async function fetchChallengeLevels() {
    if (challengeLevelsCache) return challengeLevelsCache;

    const { data, error } = await _supabase
        .from('challenge_levels')
        .select('level_number, letter_families, title')
        .order('level_number', { ascending: true });

    if (error) {
        console.error("Failed to load challenge levels:", error);
        showNotificationToast("Couldn't load Fidel Challenge levels.");
        return [];
    }

    challengeLevelsCache = data || [];
    return challengeLevelsCache;
}

// Fetches the student's team row (name, current_level, streak_count).
// Falls back to sensible defaults if no team is assigned yet, so the board
// still renders something reasonable rather than breaking.
async function getTeamBoardInfo() {
    if (!currentProfile?.team_id) {
        return { name: "No Team Yet", current_level: 1, streak_count: 0 };
    }

    const { data: team, error } = await _supabase
        .from('teams')
        .select('name, current_level, streak_count')
        .eq('id', currentProfile.team_id)
        .maybeSingle();

    if (error || !team) {
        return { name: "No Team Yet", current_level: 1, streak_count: 0 };
    }

    return {
        name: team.name || "Your Team",
        current_level: team.current_level || 1,
        streak_count: team.streak_count || 0
    };
}

function renderChallengeBoardHeader(team, totalLevels) {
    document.getElementById("challengeBoardTeamName").innerText = team.name;
    document.getElementById("challengeBoardTeamSub").innerText = `Level ${team.current_level} of ${totalLevels}`;
    document.getElementById("challengeBoardStreakValue").innerText = team.streak_count;

    const percent = Math.min(100, Math.round(((team.current_level - 1) / totalLevels) * 100));
    document.getElementById("challengeBoardProgressFill").style.width = `${percent}%`;

    const swatch = document.getElementById("challengeBoardTeamSwatch");
    if (team.name && team.name.includes("Red")) swatch.style.background = "#ef4444";
    else if (team.name && team.name.includes("Blue")) swatch.style.background = "#3b82f6";
    else if (team.name && team.name.includes("Green")) swatch.style.background = "#10b981";
    else if (team.name && team.name.includes("Yellow")) swatch.style.background = "#f59e0b";
    else swatch.style.background = "var(--brand-primary)";
}

async function renderChallengeLevelsView() {
    const container = document.getElementById("challengeLevelsGrid");
    container.innerHTML = `<p style="color:#94a3b8;">Loading levels...</p>`;

    const [levels, team] = await Promise.all([
        fetchChallengeLevels(),
        getTeamBoardInfo()
    ]);

    renderChallengeBoardHeader(team, levels.length || 12);

    container.innerHTML = "";

    levels.forEach(level => {
        const card = document.createElement('div');
        const isCompleted = level.level_number < team.current_level;
        const isCurrent = level.level_number === team.current_level;
        const isUnlocked = level.level_number <= team.current_level;
        const isCapstone = level.level_number === 12;

        const stateClass = isCompleted ? 'completed' : (isUnlocked ? 'unlocked' : 'locked');
        card.className = `challenge-level-card ${stateClass} ${isCurrent ? 'current' : ''}`;

        const familiesPreview = (level.letter_families || []).join(' ');
        const badgeContent = isUnlocked ? level.level_number : '🔒';

        card.innerHTML = `
            <div class="challenge-level-number-badge">${badgeContent}</div>
            <div class="challenge-level-title">${level.title || `Level ${level.level_number}`}</div>
            <div class="challenge-level-families">${familiesPreview}</div>
            ${isCapstone ? '<div class="challenge-capstone-badge">⭐ Capstone</div>' : ''}
        `;

        if (isUnlocked) {
            card.onclick = () => openChallengeFamilyPicker(level);
        }

        container.appendChild(card);
    });
}

// -----------------------------------------------------------------------------
// Family picker — shown after clicking an unlocked level. Lets the student
// choose which of the level's families to drill next, and shows per-family
// progress (streak passed / writing passed) once that data exists.
// -----------------------------------------------------------------------------

let activeChallengeLevel = null; // the level object currently being viewed in the family picker

async function openChallengeFamilyPicker(level) {
    activeChallengeLevel = level;

    document.getElementById("challengeLevelsScreen").style.display = "none";
    document.getElementById("challengeFamilyScreen").style.display = "block";

    await renderChallengeFamilyPicker();
}

// Re-shown when exiting the matching game while in Challenge mode (hooked
// from app.js's openMatchingGameWorkspaceMode exit handler).
async function returnToChallengeFamilyPicker() {
    document.getElementById("gameWorkspace").style.display = "none";
    document.getElementById("challengeFamilyScreen").style.display = "block";
    await renderChallengeFamilyPicker();
}

function exitChallengeFamilyPicker() {
    document.getElementById("challengeFamilyScreen").style.display = "none";
    document.getElementById("challengeLevelsScreen").style.display = "block";
    renderChallengeLevelsView();
}

async function fetchStudentFamilyProgressForLevel(levelNumber) {
    const { data, error } = await _supabase
        .from('student_family_progress')
        .select('base_letter, best_streak, streak_passed, writing_passed, completed_at')
        .eq('student_id', currentUser.id)
        .eq('level_number', levelNumber);

    if (error) {
        console.error("Failed to load family progress:", error);
        return [];
    }
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

    (level.letter_families || []).forEach(baseLetter => {
        const progress = progressByLetter[baseLetter] || { best_streak: 0, streak_passed: false, writing_passed: false };
        const fidelObj = alphabetData.find(item => item.base === baseLetter);

        const card = document.createElement('div');
        card.className = `challenge-family-card ${progress.streak_passed && progress.writing_passed ? 'mastered' : ''}`;

        card.innerHTML = `
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

        card.onclick = () => launchChallengeStreakGame(fidelObj, level.level_number);
        container.appendChild(card);
    });
}

// -----------------------------------------------------------------------------
// Streak game launcher — sets activeChallengeContext, then reuses the
// existing shared matching game from app.js unchanged.
// -----------------------------------------------------------------------------

async function recordStreakProgress(baseLetter, levelNumber, bestStreak, passed) {
    const payload = {
        student_id: currentUser.id,
        base_letter: baseLetter,
        level_number: levelNumber,
        best_streak: bestStreak,
        streak_passed: passed
    };

    const { error } = await _supabase
        .from('student_family_progress')
        .upsert(payload, { onConflict: 'student_id,base_letter' });

    if (error) console.error("Failed to save streak progress:", error);
}

function launchChallengeStreakGame(fidelObj, levelNumber) {
    let bestStreakThisSession = 0;

    activeChallengeContext = {
        baseLetter: fidelObj.base,
        levelNumber: levelNumber,
        onStreakUpdate: (currentStreak) => {
            if (currentStreak > bestStreakThisSession) {
                bestStreakThisSession = currentStreak;
                recordStreakProgress(fidelObj.base, levelNumber, bestStreakThisSession, false);
            }
        },
        onStreakPassed: async (finalStreak) => {
            await recordStreakProgress(fidelObj.base, levelNumber, finalStreak, true);
            showNotificationToast(`🎉 Streak of ${STREAK_THRESHOLD}! "${fidelObj.base}" matching mastered!`);
            executeVictoryConfettiCelebration();
        }
    };

    document.getElementById("challengeFamilyScreen").style.display = "none";
    openMatchingGameWorkspaceMode(fidelObj);
}

// -----------------------------------------------------------------------------
// Expose functions used via inline onclick="" handlers in index.html
// -----------------------------------------------------------------------------

window.enterModeSelect = enterModeSelect;
window.chooseModePractice = chooseModePractice;
window.chooseModeChallenge = chooseModeChallenge;
window.exitChallengeBackToDashboard = exitChallengeBackToDashboard;
window.openChallengeFamilyPicker = openChallengeFamilyPicker;
window.exitChallengeFamilyPicker = exitChallengeFamilyPicker;
window.returnToChallengeFamilyPicker = returnToChallengeFamilyPicker;
window.launchChallengeStreakGame = launchChallengeStreakGame;

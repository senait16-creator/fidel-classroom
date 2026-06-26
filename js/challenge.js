// =============================================================================
// FIDEL CHALLENGE — challenge.js
// Loads AFTER app.js. Relies on globals already defined there:
//   _supabase, currentUser, currentProfile, showNotificationToast, alphabetData
// =============================================================================

const STREAK_THRESHOLD = 20; // matches the comment in fidel_challenge_schema.sql

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
            card.onclick = () => showNotificationToast(`Level ${level.level_number} gameplay coming soon!`);
        }

        container.appendChild(card);
    });
}

// -----------------------------------------------------------------------------
// Expose functions used via inline onclick="" handlers in index.html
// -----------------------------------------------------------------------------

window.enterModeSelect = enterModeSelect;
window.chooseModePractice = chooseModePractice;
window.chooseModeChallenge = chooseModeChallenge;
window.exitChallengeBackToDashboard = exitChallengeBackToDashboard;

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

// Determines the student's team's current level. For now (before team
// progression logic exists) this always returns 1, so every team sees
// Level 1 unlocked and everything else locked — matches "Level 1 with 12
// levels locked" from the original ask. Will be replaced once
// team_level_status / teams.current_level is actually being updated.
async function getTeamCurrentLevel() {
    if (!currentProfile?.team_id) return 1;

    const { data: team, error } = await _supabase
        .from('teams')
        .select('current_level')
        .eq('id', currentProfile.team_id)
        .maybeSingle();

    if (error || !team) return 1;
    return team.current_level || 1;
}

async function renderChallengeLevelsView() {
    const container = document.getElementById("challengeLevelsGrid");
    container.innerHTML = `<p style="color:#94a3b8;">Loading levels...</p>`;

    const [levels, teamCurrentLevel] = await Promise.all([
        fetchChallengeLevels(),
        getTeamCurrentLevel()
    ]);

    container.innerHTML = "";

    levels.forEach(level => {
        const card = document.createElement('div');
        const isUnlocked = level.level_number <= teamCurrentLevel;
        const isCurrent = level.level_number === teamCurrentLevel;

        card.className = `challenge-level-card ${isUnlocked ? 'unlocked' : 'locked'} ${isCurrent ? 'current' : ''}`;

        const familiesPreview = (level.letter_families || []).join(' ');

        card.innerHTML = `
            <div class="challenge-level-number">${isUnlocked ? level.level_number : '🔒'}</div>
            <div class="challenge-level-title">${level.title || `Level ${level.level_number}`}</div>
            <div class="challenge-level-families">${familiesPreview}</div>
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

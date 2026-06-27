// =============================================================================
// READING PATH — reading.js
// A separate mode for students who already know the Fidel and want to learn
// to read, translate, and understand real Amharic sentences. Individual,
// self-paced, sequential per level (read -> translate -> understand grammar).
// Loads AFTER app.js. Relies on globals already defined there:
//   _supabase, currentUser, showNotificationToast
// =============================================================================

let readingLevelsCache = null;
let activeReadingLevel = null;

// -----------------------------------------------------------------------------
// Entry point — called from wherever the "Reading Path" option lives
// (e.g. a button on the main dashboard or a future top-level mode picker).
// -----------------------------------------------------------------------------

function enterReadingPath() {
    document.getElementById("studentDashboard").style.display = "none";
    document.getElementById("readingLevelsScreen").style.display = "block";
    renderReadingLevelsList();
}

function exitReadingPath() {
    document.getElementById("readingLevelsScreen").style.display = "none";
    document.getElementById("studentDashboard").style.display = "block";
}

// -----------------------------------------------------------------------------
// Levels list
// -----------------------------------------------------------------------------

async function fetchReadingLevels() {
    if (readingLevelsCache) return readingLevelsCache;

    const { data, error } = await _supabase
        .from('reading_levels')
        .select('level_number, title, passage_amharic')
        .order('level_number', { ascending: true });

    if (error) {
        console.error("Failed to load reading levels:", error);
        showNotificationToast("Couldn't load reading levels.");
        return [];
    }

    readingLevelsCache = data || [];
    return readingLevelsCache;
}

async function fetchMyReadingProgress() {
    const { data, error } = await _supabase
        .from('reading_progress')
        .select('level_number, has_read, has_translated, has_understood_grammar, completed_at')
        .eq('student_id', currentUser.id);

    if (error) {
        console.error("Failed to load reading progress:", error);
        return [];
    }
    return data || [];
}

// A level is unlocked once the PREVIOUS level is fully completed (or it's
// level 1). This is individual self-paced progression, not team-gated —
// each student moves at their own speed through the reading ladder.
async function renderReadingLevelsList() {
    const container = document.getElementById("readingLevelsGrid");
    container.innerHTML = `<p style="color:#94a3b8;">Loading...</p>`;

    const [levels, progressRows] = await Promise.all([
        fetchReadingLevels(),
        fetchMyReadingProgress()
    ]);

    const progressByLevel = {};
    progressRows.forEach(row => { progressByLevel[row.level_number] = row; });

    container.innerHTML = "";

    let previousCompleted = true; // level 1 is always unlocked
    levels.forEach(level => {
        const progress = progressByLevel[level.level_number];
        const isCompleted = !!progress?.completed_at;
        const isUnlocked = previousCompleted;

        const card = document.createElement('div');
        card.className = `challenge-level-card ${isCompleted ? 'completed' : (isUnlocked ? 'unlocked' : 'locked')}`;
        card.innerHTML = `
            <div class="challenge-level-number-badge">${isUnlocked ? level.level_number : '🔒'}</div>
            <div class="challenge-level-title">${level.title}</div>
            <div class="challenge-level-families" style="font-size:16px;">${level.passage_amharic}</div>
        `;

        if (isUnlocked) {
            card.onclick = () => openReadingLevel(level.level_number);
        }

        container.appendChild(card);
        previousCompleted = isCompleted;
    });
}

// -----------------------------------------------------------------------------
// Per-level sequential flow: read -> translate -> grammar
// -----------------------------------------------------------------------------

async function openReadingLevel(levelNumber) {
    const { data: level, error } = await _supabase
        .from('reading_levels')
        .select('*')
        .eq('level_number', levelNumber)
        .maybeSingle();

    if (error || !level) {
        console.error("Failed to load level detail:", error);
        return showNotificationToast("Couldn't load this level.");
    }

    activeReadingLevel = level;

    const { data: progress } = await _supabase
        .from('reading_progress')
        .select('has_read, has_translated, has_understood_grammar')
        .eq('student_id', currentUser.id)
        .eq('level_number', levelNumber)
        .maybeSingle();

    document.getElementById("readingLevelsScreen").style.display = "none";
    document.getElementById("readingLevelDetailScreen").style.display = "block";
    document.getElementById("readingLevelDetailTitle").innerText = level.title;

    renderReadingStep(level, progress || { has_read: false, has_translated: false, has_understood_grammar: false });
}

function exitReadingLevelDetail() {
    document.getElementById("readingLevelDetailScreen").style.display = "none";
    document.getElementById("readingLevelsScreen").style.display = "block";
    renderReadingLevelsList();
}

// Renders whichever step the student is currently on, based on their
// progress so far. Strictly sequential: can't translate before reading,
// can't see the grammar note before translating.
function renderReadingStep(level, progress) {
    const container = document.getElementById("readingStepContent");

    if (!progress.has_read) {
        container.innerHTML = `
            <div class="reading-passage-card">
                <p class="reading-passage-amharic">${level.passage_amharic}</p>
            </div>
            <p class="subtitle" style="text-align:left;">Read the sentence above. When you're ready, mark it as read to move on.</p>
            <button class="btn-primary" id="readingMarkReadBtn">I've Read It →</button>
        `;
        document.getElementById("readingMarkReadBtn").onclick = () => markReadingStep(level.level_number, 'has_read', level, progress);
        return;
    }

    if (!progress.has_translated) {
        container.innerHTML = `
            <div class="reading-passage-card">
                <p class="reading-passage-amharic">${level.passage_amharic}</p>
            </div>
            <label class="subtitle" style="text-align:left; display:block; margin-bottom:8px;">Try translating it into English:</label>
            <input type="text" id="readingTranslateInput" placeholder="Type your translation...">
            <button class="btn-primary" id="readingCheckTranslationBtn">Check My Translation</button>
            <div id="readingTranslationFeedback" style="margin-top:10px;"></div>
        `;
        document.getElementById("readingCheckTranslationBtn").onclick = () => checkReadingTranslation(level, progress);
        return;
    }

    if (!progress.has_understood_grammar) {
        container.innerHTML = `
            <div class="reading-passage-card">
                <p class="reading-passage-amharic">${level.passage_amharic}</p>
                <p class="reading-passage-translation">"${level.passage_translation}"</p>
            </div>
            <div class="reading-grammar-note">
                <strong>Why it's structured this way:</strong>
                <p>${level.grammar_note || "No grammar note for this level yet."}</p>
            </div>
            <button class="btn-primary" id="readingFinishLevelBtn">Got It — Finish This Level 🎉</button>
        `;
        document.getElementById("readingFinishLevelBtn").onclick = () => markReadingStep(level.level_number, 'has_understood_grammar', level, progress, true);
        return;
    }

    // All three steps already done (e.g. revisiting a completed level).
    container.innerHTML = `
        <div class="reading-passage-card">
            <p class="reading-passage-amharic">${level.passage_amharic}</p>
            <p class="reading-passage-translation">"${level.passage_translation}"</p>
        </div>
        <div class="reading-grammar-note">
            <strong>Why it's structured this way:</strong>
            <p>${level.grammar_note || ""}</p>
        </div>
        <p class="subtitle" style="text-align:center; color:#10b981; font-weight:700;">✓ You've completed this level!</p>
    `;
}

async function markReadingStep(levelNumber, field, level, progress, isFinalStep) {
    const updatedProgress = { ...progress, [field]: true };

    const payload = {
        student_id: currentUser.id,
        level_number: levelNumber,
        has_read: updatedProgress.has_read,
        has_translated: updatedProgress.has_translated,
        has_understood_grammar: updatedProgress.has_understood_grammar
    };

    if (isFinalStep) payload.completed_at = new Date().toISOString();

    const { error } = await _supabase
        .from('reading_progress')
        .upsert(payload, { onConflict: 'student_id,level_number' });

    if (error) {
        console.error("Failed to save reading progress:", error);
        return showNotificationToast("Couldn't save progress: " + error.message);
    }

    if (isFinalStep) {
        showNotificationToast("🎉 Level complete!");
        executeVictoryConfettiCelebration();
    }

    renderReadingStep(level, updatedProgress);
}

// Simple, forgiving check: case-insensitive, trims whitespace, ignores
// punctuation differences. Not a strict grader — the goal is engagement
// with the translation, not penalizing minor phrasing differences.
function checkReadingTranslation(level, progress) {
    const input = document.getElementById("readingTranslateInput").value.trim();
    const feedback = document.getElementById("readingTranslationFeedback");

    if (!input) {
        feedback.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Type something first!</p>`;
        return;
    }

    const normalize = (s) => s.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const isClose = normalize(input) === normalize(level.passage_translation);

    if (isClose) {
        feedback.innerHTML = `<p style="color:#10b981; font-size:13px; font-weight:700;">✓ That's right!</p>`;
        setTimeout(() => markReadingStep(level.level_number, 'has_translated', level, progress), 800);
    } else {
        feedback.innerHTML = `
            <p style="color:#9a3412; font-size:13px;">Not quite — here's the correct translation:</p>
            <p style="font-weight:700; margin-top:4px;">"${level.passage_translation}"</p>
            <button class="btn-secondary" id="readingContinueAnywayBtn" style="margin-top:8px;">Continue Anyway</button>
        `;
        document.getElementById("readingContinueAnywayBtn").onclick = () => markReadingStep(level.level_number, 'has_translated', level, progress);
    }
}

// -----------------------------------------------------------------------------
// Expose functions used via inline onclick="" handlers in index.html
// -----------------------------------------------------------------------------

window.enterReadingPath = enterReadingPath;
window.exitReadingPath = exitReadingPath;
window.exitReadingLevelDetail = exitReadingLevelDetail;

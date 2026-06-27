// =============================================================================
// READING PATH — reading.js
// A separate mode for students who already know the Fidel and want to learn
// to read, translate, and understand real Amharic sentences. Individual,
// self-paced. Each level holds a SEQUENCE OF ITEMS (e.g. "Counting" = 10
// number-cards, "Greetings" = morning/afternoon/evening x male/female/group),
// each going through its own read -> translate -> grammar cycle, completed
// in order within the level. Loads AFTER app.js. Relies on globals already
// defined there: _supabase, currentUser, showNotificationToast
// =============================================================================

let readingLevelsCache = null;
let activeReadingLevel = null;
let activeReadingItems = [];
let activeReadingItemIndex = 0;

// -----------------------------------------------------------------------------
// Entry point
// -----------------------------------------------------------------------------

function enterReadingPath() {
    document.getElementById("modeSelectScreen").style.display = "none";
    document.getElementById("studentDashboard").style.display = "none";
    document.getElementById("readingLevelsScreen").style.display = "block";
    renderReadingLevelsList();
}

function exitReadingPath() {
    document.getElementById("readingLevelsScreen").style.display = "none";
    if (typeof enterModeSelect === "function") {
        enterModeSelect();
    } else {
        document.getElementById("studentDashboard").style.display = "block";
    }
}

// -----------------------------------------------------------------------------
// Levels list
// -----------------------------------------------------------------------------

async function fetchReadingLevels() {
    if (readingLevelsCache) return readingLevelsCache;

    const { data, error } = await _supabase
        .from('reading_levels')
        .select('level_number, title')
        .order('level_number', { ascending: true });

    if (error) {
        console.error("Failed to load reading levels:", error);
        showNotificationToast("Couldn't load reading levels.");
        return [];
    }

    readingLevelsCache = data || [];
    return readingLevelsCache;
}

async function fetchAllReadingItems() {
    const { data, error } = await _supabase
        .from('reading_items')
        .select('id, level_number, item_order, label, passage_amharic')
        .order('level_number', { ascending: true })
        .order('item_order', { ascending: true });

    if (error) {
        console.error("Failed to load reading items:", error);
        return [];
    }
    return data || [];
}

async function fetchMyReadingItemProgress() {
    const { data, error } = await _supabase
        .from('reading_item_progress')
        .select('item_id, has_read, has_translated, has_understood_grammar, completed_at')
        .eq('student_id', currentUser.id);

    if (error) {
        console.error("Failed to load reading item progress:", error);
        return [];
    }
    return data || [];
}

// NOTE: per request, the level-to-level lock has been removed — every
// level is openable regardless of whether earlier levels are complete.
// Items WITHIN a level still go strictly in order (see renderReadingStep),
// since that sequence matters pedagogically even if level-to-level doesn't.
async function renderReadingLevelsList() {
    const container = document.getElementById("readingLevelsGrid");
    container.innerHTML = `<p style="color:#94a3b8;">Loading...</p>`;

    const [levels, items, progressRows] = await Promise.all([
        fetchReadingLevels(),
        fetchAllReadingItems(),
        fetchMyReadingItemProgress()
    ]);

    const progressByItemId = {};
    progressRows.forEach(row => { progressByItemId[row.item_id] = row; });

    container.innerHTML = "";

    levels.forEach(level => {
        const itemsForLevel = items.filter(i => i.level_number === level.level_number);
        const completedCount = itemsForLevel.filter(i => !!progressByItemId[i.id]?.completed_at).length;
        const isLevelComplete = itemsForLevel.length > 0 && completedCount === itemsForLevel.length;
        const previewLetters = itemsForLevel.slice(0, 3).map(i => i.passage_amharic.split(' ')[0]).join(' ');

        const card = document.createElement('div');
        card.className = `challenge-level-card unlocked ${isLevelComplete ? 'completed' : ''}`;
        card.innerHTML = `
            <div class="challenge-level-number-badge">${level.level_number}</div>
            <div class="challenge-level-title">${level.title}</div>
            <div class="challenge-level-families" style="font-size:14px;">${previewLetters}</div>
            <div style="font-size:11px; color:#94a3b8; margin-top:6px;">${completedCount} / ${itemsForLevel.length} done</div>
        `;
        card.onclick = () => openReadingLevel(level.level_number);
        container.appendChild(card);
    });
}

// -----------------------------------------------------------------------------
// Per-level item sequence: read -> translate -> grammar, item by item
// -----------------------------------------------------------------------------

async function openReadingLevel(levelNumber) {
    const { data: level, error: levelError } = await _supabase
        .from('reading_levels')
        .select('*')
        .eq('level_number', levelNumber)
        .maybeSingle();

    if (levelError || !level) {
        console.error("Failed to load level detail:", levelError);
        return showNotificationToast("Couldn't load this level.");
    }

    const { data: items, error: itemsError } = await _supabase
        .from('reading_items')
        .select('*')
        .eq('level_number', levelNumber)
        .order('item_order', { ascending: true });

    if (itemsError || !items || items.length === 0) {
        console.error("Failed to load level items:", itemsError);
        return showNotificationToast("This level has no content yet.");
    }

    activeReadingLevel = level;
    activeReadingItems = items;

    const { data: progressRows } = await _supabase
        .from('reading_item_progress')
        .select('*')
        .eq('student_id', currentUser.id)
        .in('item_id', items.map(i => i.id));

    const progressByItemId = {};
    (progressRows || []).forEach(row => { progressByItemId[row.item_id] = row; });

    // Resume at the first not-yet-completed item, rather than always
    // restarting from item 1 — so returning to a level mid-way through
    // continues where the student left off.
    let resumeIndex = items.findIndex(item => !progressByItemId[item.id]?.completed_at);
    if (resumeIndex === -1) resumeIndex = items.length - 1; // all done — show the last item

    activeReadingItemIndex = resumeIndex;

    document.getElementById("readingLevelsScreen").style.display = "none";
    document.getElementById("readingLevelDetailScreen").style.display = "block";
    document.getElementById("readingLevelDetailTitle").innerText = level.title;

    renderCurrentReadingItem(progressByItemId);
}

function exitReadingLevelDetail() {
    document.getElementById("readingLevelDetailScreen").style.display = "none";
    document.getElementById("readingLevelsScreen").style.display = "block";
    renderReadingLevelsList();
}

function renderCurrentReadingItem(progressByItemId) {
    const item = activeReadingItems[activeReadingItemIndex];
    const progress = progressByItemId[item.id] || { has_read: false, has_translated: false, has_understood_grammar: false };
    renderReadingStep(item, progress, progressByItemId);
}

// Renders whichever step the student is currently on for the CURRENT item.
// Strictly sequential within an item: can't translate before reading,
// can't see the grammar note before translating.
function renderReadingStep(item, progress, progressByItemId) {
    const container = document.getElementById("readingStepContent");
    const itemLabel = `<p class="reading-item-label">${item.label} (${activeReadingItemIndex + 1} of ${activeReadingItems.length})</p>`;

    if (!progress.has_read) {
        container.innerHTML = `
            ${itemLabel}
            <div class="reading-passage-card">
                <p class="reading-passage-amharic">${item.passage_amharic}</p>
            </div>
            <p class="subtitle" style="text-align:left;">Read the sentence above. When you're ready, mark it as read to move on.</p>
            <button class="btn-primary" id="readingMarkReadBtn">I've Read It →</button>
        `;
        document.getElementById("readingMarkReadBtn").onclick = () => markReadingStep(item, 'has_read', progress, progressByItemId);
        return;
    }

    if (!progress.has_translated) {
        container.innerHTML = `
            ${itemLabel}
            <div class="reading-passage-card">
                <p class="reading-passage-amharic">${item.passage_amharic}</p>
            </div>
            <label class="subtitle" style="text-align:left; display:block; margin-bottom:8px;">Try translating it into English:</label>
            <input type="text" id="readingTranslateInput" placeholder="Type your translation...">
            <button class="btn-primary" id="readingCheckTranslationBtn">Check My Translation</button>
            <div id="readingTranslationFeedback" style="margin-top:10px;"></div>
        `;
        document.getElementById("readingCheckTranslationBtn").onclick = () => checkReadingTranslation(item, progress, progressByItemId);
        return;
    }

    if (!progress.has_understood_grammar) {
        container.innerHTML = `
            ${itemLabel}
            <div class="reading-passage-card">
                <p class="reading-passage-amharic">${item.passage_amharic}</p>
                <p class="reading-passage-translation">"${item.passage_translation}"</p>
            </div>
            <div class="reading-grammar-note">
                <strong>Why it's structured this way:</strong>
                <p>${item.grammar_note || "No grammar note for this item yet."}</p>
            </div>
            <button class="btn-primary" id="readingFinishItemBtn">Got It — Next →</button>
        `;
        document.getElementById("readingFinishItemBtn").onclick = () => markReadingStep(item, 'has_understood_grammar', progress, progressByItemId, true);
        return;
    }

    // This item is fully done — advance to the next one, or show the
    // level-complete state if this was the last item.
    advanceToNextReadingItem(progressByItemId);
}

async function markReadingStep(item, field, progress, progressByItemId, isFinalStep) {
    const updatedProgress = { ...progress, [field]: true };

    const payload = {
        student_id: currentUser.id,
        item_id: item.id,
        has_read: updatedProgress.has_read,
        has_translated: updatedProgress.has_translated,
        has_understood_grammar: updatedProgress.has_understood_grammar
    };

    if (isFinalStep) payload.completed_at = new Date().toISOString();

    const { error } = await _supabase
        .from('reading_item_progress')
        .upsert(payload, { onConflict: 'student_id,item_id' });

    if (error) {
        console.error("Failed to save reading progress:", error);
        return showNotificationToast("Couldn't save progress: " + error.message);
    }

    progressByItemId[item.id] = updatedProgress;

    if (isFinalStep) {
        showNotificationToast("✓ Nice work!");
        advanceToNextReadingItem(progressByItemId);
    } else {
        renderReadingStep(item, updatedProgress, progressByItemId);
    }
}

function advanceToNextReadingItem(progressByItemId) {
    if (activeReadingItemIndex < activeReadingItems.length - 1) {
        activeReadingItemIndex++;
        renderCurrentReadingItem(progressByItemId);
    } else {
        renderReadingLevelComplete();
    }
}

function renderReadingLevelComplete() {
    const container = document.getElementById("readingStepContent");
    container.innerHTML = `
        <div style="text-align:center; padding: 20px 0;">
            <p style="font-size:48px;">🎉</p>
            <p class="subtitle" style="font-size:16px; font-weight:700; color:#10b981;">You've completed every item in this level!</p>
        </div>
    `;
    executeVictoryConfettiCelebration();
}

// Simple, forgiving check: case-insensitive, trims whitespace, ignores
// punctuation differences. Not a strict grader — the goal is engagement
// with the translation, not penalizing minor phrasing differences.
function checkReadingTranslation(item, progress, progressByItemId) {
    const input = document.getElementById("readingTranslateInput").value.trim();
    const feedback = document.getElementById("readingTranslationFeedback");

    if (!input) {
        feedback.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Type something first!</p>`;
        return;
    }

    const normalize = (s) => s.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const isClose = normalize(input) === normalize(item.passage_translation);

    if (isClose) {
        feedback.innerHTML = `<p style="color:#10b981; font-size:13px; font-weight:700;">✓ That's right!</p>`;
        setTimeout(() => markReadingStep(item, 'has_translated', progress, progressByItemId), 800);
    } else {
        feedback.innerHTML = `
            <p style="color:#9a3412; font-size:13px;">Not quite — here's the correct translation:</p>
            <p style="font-weight:700; margin-top:4px;">"${item.passage_translation}"</p>
            <button class="btn-secondary" id="readingContinueAnywayBtn" style="margin-top:8px;">Continue Anyway</button>
        `;
        document.getElementById("readingContinueAnywayBtn").onclick = () => markReadingStep(item, 'has_translated', progress, progressByItemId);
    }
}

// -----------------------------------------------------------------------------
// Expose functions used via inline onclick="" handlers in index.html
// -----------------------------------------------------------------------------

window.enterReadingPath = enterReadingPath;
window.exitReadingPath = exitReadingPath;
window.exitReadingLevelDetail = exitReadingLevelDetail;

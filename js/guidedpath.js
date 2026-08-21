// =============================================================================
// GUIDED PATH — js/guidedpath.js
// A parallel, intentionally separate experiment inside Amharic Path: each
// chapter is built directly from a Word Builder level's vocabulary, adding
// more example sentences, grammar breakdowns, mini-dialogues, reading
// practice, comprehension, and culture/context around words the student
// already knows — instead of teaching vocabulary from scratch the way
// Original Path (js/reading.js) does.
//
// Kept fully separate from Original Path in both the database
// (guided_path_* tables) and progress — nothing here reads or writes
// reading_levels/chapter_lessons/reading_chapter_progress/etc, and nothing
// in reading.js touches guided_path_*. No progress is merged between the
// two tracks until one approach proves out.
//
// SHELL STAGE: chapters are listed (one per Word Builder level, with
// which level they're built from) but not yet playable — real content is
// a following stage of work. Tapping a chapter just confirms the routing
// works for now.
//
// Loads AFTER reading.js. Relies on globals defined in app.js/reading.js:
//   _supabase, currentUser, currentProfile, showScreen, showNotificationToast, icon
// =============================================================================

let guidedPathChaptersCache = null;

async function fetchGuidedPathChapters() {
    if (guidedPathChaptersCache) return guidedPathChaptersCache;

    const { data, error } = await _supabase
        .from('guided_path_chapters')
        .select('level_number, title, word_builder_level_number, status')
        .order('level_number', { ascending: true });

    if (error) {
        console.error('Failed to load Guided Path chapters:', error);
        return [];
    }

    guidedPathChaptersCache = data || [];
    return guidedPathChaptersCache;
}

async function enterGuidedPath() {
    showScreen('guidedPathScreen');
    await renderGuidedPathList();
}
window.enterGuidedPath = enterGuidedPath;

function exitGuidedPath() {
    showScreen('amharicPathTrackScreen');
}
window.exitGuidedPath = exitGuidedPath;

async function renderGuidedPathList() {
    const container = document.getElementById('guidedPathGrid');
    if (!container) return;
    container.innerHTML = `<p style="color:#94a3b8;">Loading...</p>`;

    const chapters = await fetchGuidedPathChapters();
    container.innerHTML = '';

    if (chapters.length === 0) {
        container.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No chapters yet, check back soon.</p>`;
        return;
    }

    chapters.forEach(ch => {
        const isReady = ch.status === 'published';
        const card = document.createElement('div');
        card.className = `chapter-list-card ${isReady ? '' : 'guided-path-locked'}`;
        card.innerHTML = `
            <div class="challenge-level-number-badge">${ch.level_number}</div>
            <div class="chapter-list-card-body">
                <div class="chapter-list-card-title">${ch.title}</div>
                <div class="chapter-list-card-meta">
                    Built from Word Builder ${ch.word_builder_level_number}${isReady ? '' : ' · Coming soon'}
                </div>
            </div>
        `;
        card.onclick = isReady
            ? () => openGuidedPathChapter(ch.level_number)
            : () => showNotificationToast("This chapter's content is still being built. Check back soon!");
        container.appendChild(card);
    });
}

// Placeholder — real chapter content (sentences, grammar, dialogue) is a
// later stage of work. For now this just confirms the routing works.
function openGuidedPathChapter(levelNumber) {
    showNotificationToast(`Chapter ${levelNumber} content is coming soon.`);
}
window.openGuidedPathChapter = openGuidedPathChapter;

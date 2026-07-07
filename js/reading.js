// =============================================================================
// MY AMHARIC PATH — reading.js
// The flagship guided course. reading.js is the ENGINE ONLY — navigation,
// rendering, progress, quizzes, lesson flow. The CURRICULUM lives entirely
// in Supabase: the app asks "what does Lesson 3 contain?" and renders
// whatever comes back. Adding Chapters 2-12 is a content/SQL job, not a
// JavaScript job.
//
// A chapter (reading_levels row) is a sequence of LESSONS (chapter_lessons),
// each walked through one step at a time, like a real class:
//   🎯 Today's Goal -> [lesson_sections, however many exist] -> [Quick Check
//   quiz, if any exists] -> 💬 Conversation -> 📖 Today's Words ->
//   🧠 Grammar Spotlight -> 📚 Read the Conversation Again -> 🎙 Speaking ->
//   ✍ Practice -> ✅ Lesson Complete
// followed by a final "Chapter Challenge" lesson (a short multiple-choice
// checkpoint quiz) once every regular lesson in the chapter is done.
//
// Sections and quiz questions are fully data-driven (lesson_sections /
// lesson_quiz_blocks) — the number of steps in a lesson varies, so the step
// container is a single reusable mount rather than one HTML panel per step
// type. Teach/Pattern/Examples/"deep dive" all turned out to be the same
// shape (heading + prose + optional phrase table + optional callout/link),
// so they're one generic section renderer now, distinguished only by
// section_type for future styling/analytics — not by separate code.
//
// Entry flow: Chapter List -> "🎯 Chapter Goals" or "▶️ Start Chapter" opens
// a chapter-intro card (what you're about to learn, ~20 seconds) — NOT a
// Can-Do mastery check anymore. Can-Do statements (js/candostatement.js)
// now surface after passing the Chapter Challenge, to track mastery of
// what was just learned, not to preview it.
//
// The "Read the Conversation Again" step reuses the original Reading Path
// flow verbatim (reading_items/reading_item_progress: read -> translate ->
// grammar-note), now scoped to a lesson instead of a whole chapter.
// Vocabulary and Grammar (verb conjugations) are reference lists scoped the
// same way. Practice is a lightweight review drill over that lesson's own
// vocabulary — no separate authored content. The Chapter Challenge is
// unchanged from the original checkpoint design (reading_checkpoint_questions
// / reading_chapter_progress), just presented as the final lesson.
//
// Loads AFTER app.js. Relies on globals already defined there:
//   _supabase, currentUser, showNotificationToast
// Also relies on renderCanDoRows() from js/candostatement.js.
// =============================================================================

let readingLevelsCache = null;
let activeReadingLevel = null;   // current chapter row: {level_number, title, can_do_category, intro_summary, intro_highlights}
let activeLessons = [];          // chapter_lessons rows for the current chapter, in order
let activeLessonIndex = 0;
let activeReadingItems = [];
let activeReadingItemIndex = 0;

let activeLessonSections = [];   // lesson_sections rows for the current lesson, in order
let activeLessonQuiz = [];       // lesson_quiz_blocks rows for the current lesson
let activeStepList = [];         // computed once per lesson entry: ['goal', 'section-0', 'section-1', 'quiz'?, 'conversation', ...]
let activeStepIndex = 0;

// -----------------------------------------------------------------------------
// Entry point
// -----------------------------------------------------------------------------

function enterAmharicPath() {
    showScreen("readingLevelsScreen");
    renderReadingLevelsList();
}

function exitAmharicPath() {
    if (typeof enterModeSelect === "function") {
        enterModeSelect();
    } else {
        showScreen("studentDashboard");
    }
}

// -----------------------------------------------------------------------------
// Chapter list
// -----------------------------------------------------------------------------

async function fetchReadingLevels() {
    if (readingLevelsCache) return readingLevelsCache;

    const { data, error } = await _supabase
        .from('reading_levels')
        .select('level_number, title, can_do_category, intro_summary, intro_highlights')
        .order('level_number', { ascending: true });

    if (error) {
        console.error("Failed to load chapters:", error);
        showNotificationToast("Couldn't load chapters.");
        return [];
    }

    readingLevelsCache = data || [];
    return readingLevelsCache;
}

async function fetchAllLessons() {
    const { data, error } = await _supabase
        .from('chapter_lessons')
        .select('id, level_number, lesson_order, title, is_challenge, learning_objective, estimated_minutes, difficulty, xp_value, lesson_focus')
        .order('level_number', { ascending: true })
        .order('lesson_order', { ascending: true });

    if (error) {
        console.error("Failed to load lessons:", error);
        return [];
    }
    return data || [];
}

async function fetchMyChapterProgressAll() {
    const { data, error } = await _supabase
        .from('reading_chapter_progress')
        .select('level_number, checkpoint_passed')
        .eq('student_id', currentUser.id);

    if (error) {
        console.error("Failed to load chapter progress:", error);
        return [];
    }
    return data || [];
}

// A chapter is considered "complete" once its Chapter Challenge checkpoint
// is passed — that single existing rollup is simpler and more meaningful
// than trying to combine six different per-lesson progress tables into one
// completion percentage just for a list card.
async function renderReadingLevelsList() {
    const container = document.getElementById("readingLevelsGrid");
    container.innerHTML = `<p style="color:#94a3b8;">Loading...</p>`;

    const [levels, lessons, chapterProgress] = await Promise.all([
        fetchReadingLevels(),
        fetchAllLessons(),
        fetchMyChapterProgressAll()
    ]);

    const passedByLevel = {};
    chapterProgress.forEach(row => { passedByLevel[row.level_number] = row.checkpoint_passed; });

    container.innerHTML = "";

    levels.forEach(level => {
        const lessonsForLevel = lessons.filter(l => l.level_number === level.level_number);
        const isComplete = !!passedByLevel[level.level_number];

        const card = document.createElement('div');
        card.className = `chapter-list-card ${isComplete ? 'completed' : ''}`;
        card.innerHTML = `
            <div class="challenge-level-number-badge">${level.level_number}</div>
            <div class="chapter-list-card-body">
                <div class="chapter-list-card-title">${level.title}</div>
                <div class="chapter-list-card-meta">
                    ${lessonsForLevel.length || 0} lesson${lessonsForLevel.length === 1 ? '' : 's'}${isComplete ? ' • Chapter complete ✓' : ''}
                </div>
                <div class="chapter-card-actions">
                    <button type="button" class="btn-secondary chapter-goals-btn">🎯 Chapter Goals</button>
                    <button type="button" class="btn-primary chapter-start-btn">▶️ Start Chapter</button>
                </div>
            </div>
        `;

        card.querySelector('.chapter-goals-btn').onclick = (e) => {
            e.stopPropagation();
            openChapterGoals(level, 'view');
        };
        card.querySelector('.chapter-start-btn').onclick = (e) => {
            e.stopPropagation();
            openChapterGoals(level, 'start');
        };

        container.appendChild(card);
    });
}

// -----------------------------------------------------------------------------
// Chapter intro card — shared by "🎯 Chapter Goals" and "▶️ Start Chapter".
// Answers "what am I about to learn?" in ~20 seconds. Can-Do mastery
// tracking happens later, after the Chapter Challenge is passed (see
// submitCheckpoint below) — not here.
// -----------------------------------------------------------------------------

function openChapterGoals(level, mode) {
    document.getElementById('chapterGoalsTitle').innerText = `📘 ${level.title}`;

    const summaryEl = document.getElementById('chapterGoalsSummary');
    summaryEl.innerHTML = `
        <p class="chapter-goals-intro">${level.intro_summary || 'Get ready to learn something new!'}</p>
        ${level.intro_highlights?.length ? `
            <ul class="chapter-goals-highlights">
                ${level.intro_highlights.map(h => `<li>${h}</li>`).join('')}
            </ul>
        ` : ''}
    `;

    const ctaBtn = document.getElementById('chapterGoalsCtaBtn');
    if (mode === 'start') {
        ctaBtn.innerText = 'Continue to Lesson 1 →';
        ctaBtn.onclick = () => { closeChapterGoals(); enterChapter(level.level_number); };
    } else {
        ctaBtn.innerText = 'Got it ✓';
        ctaBtn.onclick = closeChapterGoals;
    }

    document.getElementById('chapterGoalsOverlay').style.display = 'flex';
}

function closeChapterGoals() {
    document.getElementById('chapterGoalsOverlay').style.display = 'none';
}

// -----------------------------------------------------------------------------
// Lesson navigation — linear, page-through, resumes at the first lesson
// that isn't marked complete yet (chapter_lesson_progress)
// -----------------------------------------------------------------------------

async function enterChapter(levelNumber) {
    const levels = await fetchReadingLevels();
    activeReadingLevel = levels.find(l => l.level_number === levelNumber);
    if (!activeReadingLevel) return showNotificationToast("Couldn't find this chapter.");

    const { data: lessons, error } = await _supabase
        .from('chapter_lessons')
        .select('id, level_number, lesson_order, title, is_challenge, learning_objective, estimated_minutes, difficulty, xp_value, lesson_focus')
        .eq('level_number', levelNumber)
        .order('lesson_order', { ascending: true });

    if (error || !lessons || lessons.length === 0) {
        console.error("Failed to load lessons:", error);
        return showNotificationToast("This chapter has no lessons yet.");
    }

    activeLessons = lessons;

    const { data: progressRows } = await _supabase
        .from('chapter_lesson_progress')
        .select('lesson_id, completed_at')
        .eq('student_id', currentUser.id)
        .in('lesson_id', lessons.map(l => l.id));

    const completedIds = new Set((progressRows || []).filter(r => r.completed_at).map(r => r.lesson_id));

    let resumeIndex = lessons.findIndex(l => !completedIds.has(l.id));
    if (resumeIndex === -1) resumeIndex = lessons.length - 1;
    activeLessonIndex = resumeIndex;

    document.getElementById("readingLevelsScreen").style.display = "none";
    document.getElementById("readingLevelDetailScreen").style.display = "block";

    await openCurrentLesson();
}

async function openCurrentLesson() {
    const lesson = activeLessons[activeLessonIndex];

    document.getElementById("readingLevelDetailTitle").innerText =
        `${activeReadingLevel.title} · Lesson ${activeLessonIndex + 1} of ${activeLessons.length}: ${lesson.title}`;

    if (lesson.is_challenge) {
        document.getElementById("lessonNormalView").style.display = "none";
        document.getElementById("lessonChallengeView").style.display = "block";
        renderCheckpointSection(activeReadingLevel.level_number);
        return;
    }

    document.getElementById("lessonChallengeView").style.display = "none";
    document.getElementById("lessonNormalView").style.display = "block";
    document.getElementById("lessonStepProgress").innerText = "Loading...";
    document.getElementById("lessonStepMount").innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading...</p>`;

    const prevLink = document.getElementById("lessonPrevLessonLink");
    if (prevLink) prevLink.style.display = activeLessonIndex > 0 ? "inline" : "none";

    const [sections, quiz] = await Promise.all([
        fetchLessonSections(activeReadingLevel.level_number, lesson.lesson_order),
        fetchLessonQuiz(activeReadingLevel.level_number, lesson.lesson_order)
    ]);

    activeLessonSections = sections;
    activeLessonQuiz = quiz;

    activeStepList = ['goal', ...sections.map((_, i) => `section-${i}`)];
    if (quiz.length) activeStepList.push('quiz');
    activeStepList.push('conversation', 'vocab', 'grammar', 'reading', 'speaking', 'practice', 'complete');

    activeStepIndex = 0;
    renderCurrentStep();
}

async function goToNextLesson() {
    const lesson = activeLessons[activeLessonIndex];

    await _supabase.from('chapter_lesson_progress').upsert({
        student_id: currentUser.id,
        lesson_id: lesson.id,
        completed_at: new Date().toISOString()
    }, { onConflict: 'student_id,lesson_id' });

    if (activeLessonIndex < activeLessons.length - 1) {
        activeLessonIndex++;
        await openCurrentLesson();
    } else {
        exitReadingLevelDetail();
    }
}

function goToPrevLesson() {
    if (activeLessonIndex > 0) {
        activeLessonIndex--;
        openCurrentLesson();
    }
}

async function restartCurrentChapter() {
    const levelNumber = activeReadingLevel.level_number;
    const lessonIds = activeLessons.map(l => l.id);

    const { error } = await _supabase
        .from('chapter_lesson_progress')
        .delete()
        .eq('student_id', currentUser.id)
        .in('lesson_id', lessonIds);

    if (error) {
        console.error("Failed to reset chapter progress:", error);
        return showNotificationToast("Couldn't restart: " + error.message);
    }

    await _supabase
        .from('reading_chapter_progress')
        .delete()
        .eq('student_id', currentUser.id)
        .eq('level_number', levelNumber);

    activeLessonIndex = 0;
    await openCurrentLesson();
}

function exitReadingLevelDetail() {
    document.getElementById("readingLevelDetailScreen").style.display = "none";
    document.getElementById("readingLevelsScreen").style.display = "block";
    renderReadingLevelsList();
}

// -----------------------------------------------------------------------------
// Lesson sections and quiz — data-driven curriculum content
// -----------------------------------------------------------------------------

async function fetchLessonSections(levelNumber, lessonOrder) {
    const { data, error } = await _supabase
        .from('lesson_sections')
        .select('id, section_order, section_type, icon, heading, body_html, rows, notice, resource_url, resource_label')
        .eq('level_number', levelNumber)
        .eq('lesson_order', lessonOrder)
        .order('section_order', { ascending: true });

    if (error) {
        console.error("Failed to load lesson sections:", error);
        return [];
    }
    return data || [];
}

async function fetchLessonQuiz(levelNumber, lessonOrder) {
    const { data, error } = await _supabase
        .from('lesson_quiz_blocks')
        .select('id, prompt, answer')
        .eq('level_number', levelNumber)
        .eq('lesson_order', lessonOrder)
        .order('block_order', { ascending: true });

    if (error) {
        console.error("Failed to load lesson quiz:", error);
        return [];
    }
    return data || [];
}

const SECTION_TYPE_LABELS = {
    teach: 'Learn',
    pattern: 'Pattern',
    examples: 'Examples',
    culture: 'Culture',
    story: 'Story',
    video: 'Video',
    verse: 'Verse',
    historical_note: 'History'
};

function sectionTypeLabel(type) {
    return SECTION_TYPE_LABELS[type] || 'Learn';
}

// -----------------------------------------------------------------------------
// Lesson steps — walked through in a fixed order, one at a time, like a real
// class. Everything before "conversation" (Today's Goal, however many
// lesson_sections exist, the quiz if one exists) is fully data-driven — the
// step COUNT varies per lesson, so there's one reusable mount instead of one
// HTML panel per step type. Each step appends its own Continue/Back nav
// below its content — sections aren't gated on completion (consistent with
// the rest of the app), Continue just always moves forward.
// -----------------------------------------------------------------------------

async function renderCurrentStep() {
    const step = activeStepList[activeStepIndex];
    const mount = document.getElementById('lessonStepMount');

    document.getElementById('lessonStepProgress').innerText =
        `Step ${activeStepIndex + 1} of ${activeStepList.length}`;

    const lesson = activeLessons[activeLessonIndex];
    const levelNumber = activeReadingLevel.level_number;
    const lessonOrder = lesson.lesson_order;

    if (step === 'goal') {
        renderGoalStep(mount, lesson);
        appendStepNav(mount, { showBack: false, continueLabel: 'Start Lesson →' });
    } else if (step.startsWith('section-')) {
        const section = activeLessonSections[Number(step.split('-')[1])];
        renderSectionStep(mount, section);
        appendStepNav(mount, { showBack: true });
    } else if (step === 'quiz') {
        renderQuizStep(mount, activeLessonQuiz);
        appendStepNav(mount, { showBack: true });
    } else if (step === 'complete') {
        renderLessonCompleteStep(mount);
    } else {
        // These sections are async and replace mount.innerHTML wholesale
        // once their data loads, so the nav has to be appended AFTER they
        // finish — appending it first just gets wiped out by that replace.
        if (step === 'conversation') await renderConversationSection(mount, levelNumber, lessonOrder);
        else if (step === 'vocab') await renderVocabSection(mount, levelNumber, lessonOrder);
        else if (step === 'grammar') await renderConjugationSection(mount, levelNumber, lessonOrder);
        else if (step === 'reading') await renderLessonReadingSection(mount, levelNumber, lessonOrder);
        else if (step === 'speaking') await renderSpeakingSection(mount, levelNumber, lessonOrder);
        else if (step === 'practice') await renderPracticeSection(mount, levelNumber, lessonOrder);
        appendStepNav(mount, { showBack: true });
    }
}

function goToNextStep() {
    if (activeStepIndex < activeStepList.length - 1) {
        activeStepIndex++;
        renderCurrentStep();
    }
}

function goToPrevStep() {
    if (activeStepIndex > 0) {
        activeStepIndex--;
        renderCurrentStep();
    }
}

function appendStepNav(mount, { showBack = true, continueLabel = 'Continue →' } = {}) {
    const existingNav = mount.querySelector('.lesson-step-nav');
    if (existingNav) existingNav.remove();

    const nav = document.createElement('div');
    nav.className = 'lesson-step-nav';
    nav.innerHTML = `
        ${showBack ? `<button class="btn-secondary lesson-step-back">← Back</button>` : '<span></span>'}
        <button class="btn-primary lesson-step-continue">${continueLabel}</button>
    `;
    nav.querySelector('.lesson-step-continue').onclick = goToNextStep;
    const backBtn = nav.querySelector('.lesson-step-back');
    if (backBtn) backBtn.onclick = goToPrevStep;
    mount.appendChild(nav);
}

function renderGoalStep(mount, lesson) {
    mount.innerHTML = `
        <div class="lesson-goal-card">
            <div class="eyebrow">🎯 Today's Goal</div>
            <p class="lesson-goal-text">${lesson.learning_objective || 'Complete this lesson to build your Amharic skills.'}</p>
            ${lesson.estimated_minutes ? `<p class="lesson-goal-time">⏱ About ${lesson.estimated_minutes} minutes</p>` : ''}
        </div>
    `;
}

function renderExampleRows(rows) {
    return `
        <div class="lesson-example-list">
            ${rows.map(row => `
                <div class="lesson-example-row">
                    <div class="lesson-example-label">${row.label}</div>
                    <div class="lesson-example-main">
                        <div class="lesson-example-amharic">${row.amharic}</div>
                        <div class="lesson-example-translit">${row.transliteration || ''}</div>
                        <div class="lesson-example-english">${row.english || ''}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// One generic renderer for every "teaching" section type (teach, pattern,
// examples, culture, story, ...) — they're all the same shape: a heading,
// some prose, an optional phrase table, an optional callout, an optional
// external link. New section types are a content decision, not a code one.
function renderSectionStep(mount, section) {
    mount.innerHTML = `
        <div class="lesson-section-card">
            <div class="eyebrow">${section.icon || '📘'} ${sectionTypeLabel(section.section_type)}</div>
            <h3>${section.heading}</h3>
            ${section.body_html || ''}
            ${section.rows?.length ? renderExampleRows(section.rows) : ''}
            ${section.notice ? `<div class="lesson-notice">💡 ${section.notice}</div>` : ''}
            ${section.resource_url ? `
                <a class="lesson-resource-link" href="${section.resource_url}" target="_blank" rel="noopener">
                    🔗 ${section.resource_label || 'Open resource'}
                </a>
            ` : ''}
        </div>
    `;
}

function renderQuizStep(mount, quiz) {
    if (!quiz.length) {
        mount.innerHTML = `
            <div class="lesson-section-card">
                <div class="eyebrow">🧩 Quick Check</div>
                <p>No quick check has been added for this lesson yet.</p>
            </div>
        `;
        return;
    }

    mount.innerHTML = `
        <div class="lesson-section-card">
            <div class="eyebrow">🧩 Quick Check</div>
            <h3>Can you understand it?</h3>
            <p class="subtitle" style="text-align:left; margin-bottom:12px;">
                Read each prompt first. Tap to reveal the answer.
            </p>
            <div class="lesson-quiz-list">
                ${quiz.map((q, index) => `
                    <div class="lesson-quiz-card" onclick="this.classList.toggle('revealed')">
                        <div class="lesson-quiz-question">${index + 1}. ${q.prompt}</div>
                        <div class="lesson-quiz-answer">Answer: ${q.answer}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderLessonCompleteStep(mount) {
    mount.innerHTML = `
        <div style="text-align:center; padding:24px 0;">
            <p style="font-size:48px;">✅</p>
            <p class="subtitle" style="font-size:16px; font-weight:700; color:#10b981;">Lesson Complete!</p>
        </div>
        <button class="btn-primary lesson-complete-next-btn" style="width:100%;">Next Lesson →</button>
    `;
    mount.querySelector('.lesson-complete-next-btn').onclick = goToNextLesson;
    executeVictoryConfettiCelebration();
}

// -----------------------------------------------------------------------------
// Conversation step — a short dialogue (listen first), marked read when done
// -----------------------------------------------------------------------------

async function renderConversationSection(mount, levelNumber, lessonOrder) {
    mount.innerHTML = `<div class="eyebrow">💬 Conversation</div><p style="color:#94a3b8; font-size:13px;">Loading conversation...</p>`;

    const { data: lines, error } = await _supabase
        .from('lesson_conversations')
        .select('id, speaker_label, line_amharic, line_translation')
        .eq('level_number', levelNumber)
        .eq('lesson_order', lessonOrder)
        .order('item_order', { ascending: true });

    if (error || !lines || lines.length === 0) {
        mount.innerHTML = `<div class="eyebrow">💬 Conversation</div><p style="color:#94a3b8; font-size:13px;">No conversation added for this lesson yet.</p>`;
        return;
    }

    const { data: progress } = await _supabase
        .from('lesson_conversation_progress')
        .select('has_read')
        .eq('student_id', currentUser.id)
        .eq('level_number', levelNumber)
        .eq('lesson_order', lessonOrder)
        .maybeSingle();

    const hasRead = !!progress?.has_read;

    mount.innerHTML = `
        <div class="eyebrow">💬 Conversation</div>
        <div class="conversation-lines">
            ${lines.map(line => `
                <div class="conversation-line">
                    <span class="conversation-speaker">${line.speaker_label}</span>
                    <div class="conversation-bubble">
                        <p class="conversation-amharic">${line.line_amharic}</p>
                        ${line.line_translation ? `<p class="conversation-translation">${line.line_translation}</p>` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
        <button class="btn-primary conversation-read-btn" style="margin-top:14px;">${hasRead ? '✓ Read' : "I've Read It"}</button>
    `;

    mount.querySelector('.conversation-read-btn').onclick = () => markConversationRead(levelNumber, lessonOrder, mount);
}

async function markConversationRead(levelNumber, lessonOrder, mount) {
    const { error } = await _supabase
        .from('lesson_conversation_progress')
        .upsert({
            student_id: currentUser.id,
            level_number: levelNumber,
            lesson_order: lessonOrder,
            has_read: true,
            read_at: new Date().toISOString()
        }, { onConflict: 'student_id,level_number,lesson_order' });

    if (error) {
        console.error("Failed to save conversation progress:", error);
        return showNotificationToast("Couldn't save: " + error.message);
    }

    const btn = mount.querySelector('.conversation-read-btn');
    if (btn) btn.innerText = '✓ Read';
    showGobezToast('Nice work!');
}

// -----------------------------------------------------------------------------
// Vocabulary step — "Today's Words," drawn from the conversation
// -----------------------------------------------------------------------------

async function fetchChapterVocab(levelNumber, lessonOrder) {
    const { data, error } = await _supabase
        .from('reading_vocab')
        .select('id, amharic_word, transliteration, english_meaning, part_of_speech, example_sentence, example_translation')
        .eq('level_number', levelNumber)
        .eq('lesson_order', lessonOrder)
        .order('item_order', { ascending: true });

    if (error) {
        console.error("Failed to load lesson vocab:", error);
        return [];
    }
    return data || [];
}

async function fetchMyVocabProgress(vocabIds) {
    if (vocabIds.length === 0) return {};
    const { data, error } = await _supabase
        .from('reading_vocab_progress')
        .select('vocab_id, is_known')
        .eq('student_id', currentUser.id)
        .in('vocab_id', vocabIds);

    if (error) {
        console.error("Failed to load vocab progress:", error);
        return {};
    }
    const byId = {};
    (data || []).forEach(row => { byId[row.vocab_id] = row.is_known; });
    return byId;
}

async function saveVocabKnown(vocabId, isKnown) {
    return _supabase.from('reading_vocab_progress').upsert({
        student_id: currentUser.id,
        vocab_id: vocabId,
        is_known: isKnown,
        reviewed_at: new Date().toISOString()
    }, { onConflict: 'student_id,vocab_id' });
}

async function renderVocabSection(mount, levelNumber, lessonOrder) {
    mount.innerHTML = `<div class="eyebrow">📖 Today's Words</div><p style="color:#94a3b8; font-size:13px;">Loading vocabulary...</p>`;

    const words = await fetchChapterVocab(levelNumber, lessonOrder);
    if (words.length === 0) {
        mount.innerHTML = `<div class="eyebrow">📖 Today's Words</div><p style="color:#94a3b8; font-size:13px;">No vocabulary added for this lesson yet.</p>`;
        return;
    }

    const knownById = await fetchMyVocabProgress(words.map(w => w.id));

    mount.innerHTML = `
        <div class="eyebrow">📖 Today's Words</div>
        <p class="subtitle" style="text-align:left; margin-bottom:12px;">Tap a word to reveal its meaning. Mark it known once you've got it down.</p>
    `;

    words.forEach(word => {
        const isKnown = !!knownById[word.id];
        const card = document.createElement('div');
        card.className = `vocab-item ${isKnown ? 'known' : ''}`;
        card.innerHTML = `
            <div class="vocab-item-main">
                <div class="vocab-amharic">${word.amharic_word}</div>
                <div class="vocab-translit">${word.transliteration || ''}</div>
                <div class="vocab-meaning" style="display:none;">
                    <strong>${word.english_meaning}</strong>
                    ${word.part_of_speech ? `<span class="vocab-pos">${word.part_of_speech}</span>` : ''}
                    ${word.example_sentence ? `<p class="vocab-example">${word.example_sentence}${word.example_translation ? ` — "${word.example_translation}"` : ''}</p>` : ''}
                </div>
            </div>
            <button class="btn-secondary vocab-known-btn">${isKnown ? '✓ Known' : 'Mark Known'}</button>
        `;

        const meaningEl = card.querySelector('.vocab-meaning');
        card.querySelector('.vocab-item-main').onclick = () => {
            meaningEl.style.display = meaningEl.style.display === 'none' ? 'block' : 'none';
        };

        card.querySelector('.vocab-known-btn').onclick = (e) => {
            e.stopPropagation();
            toggleVocabKnown(word.id, !isKnown, card);
        };

        mount.appendChild(card);
    });
}

async function toggleVocabKnown(vocabId, nextKnown, card) {
    const { error } = await saveVocabKnown(vocabId, nextKnown);

    if (error) {
        console.error("Failed to save vocab progress:", error);
        return showNotificationToast("Couldn't save: " + error.message);
    }

    card.classList.toggle('known', nextKnown);
    const btn = card.querySelector('.vocab-known-btn');
    btn.innerText = nextKnown ? '✓ Known' : 'Mark Known';
    btn.onclick = (e) => {
        e.stopPropagation();
        toggleVocabKnown(vocabId, !nextKnown, card);
    };
}

// -----------------------------------------------------------------------------
// Grammar Spotlight step — one main verb conjugation concept
// -----------------------------------------------------------------------------

async function fetchChapterConjugations(levelNumber, lessonOrder) {
    const { data, error } = await _supabase
        .from('reading_conjugations')
        .select('id, verb_amharic, verb_english, forms')
        .eq('level_number', levelNumber)
        .eq('lesson_order', lessonOrder)
        .order('item_order', { ascending: true });

    if (error) {
        console.error("Failed to load conjugations:", error);
        return [];
    }
    return data || [];
}

async function fetchMyConjugationProgress(conjugationIds) {
    if (conjugationIds.length === 0) return {};
    const { data, error } = await _supabase
        .from('reading_conjugation_progress')
        .select('conjugation_id')
        .eq('student_id', currentUser.id)
        .in('conjugation_id', conjugationIds);

    if (error) {
        console.error("Failed to load conjugation progress:", error);
        return {};
    }
    const byId = {};
    (data || []).forEach(row => { byId[row.conjugation_id] = true; });
    return byId;
}

async function renderConjugationSection(mount, levelNumber, lessonOrder) {
    mount.innerHTML = `<div class="eyebrow">🧠 Grammar Spotlight</div><p style="color:#94a3b8; font-size:13px;">Loading grammar...</p>`;

    const verbs = await fetchChapterConjugations(levelNumber, lessonOrder);
    if (verbs.length === 0) {
        mount.innerHTML = `<div class="eyebrow">🧠 Grammar Spotlight</div><p style="color:#94a3b8; font-size:13px;">No grammar added for this lesson yet.</p>`;
        return;
    }

    const practicedById = await fetchMyConjugationProgress(verbs.map(v => v.id));

    mount.innerHTML = `<div class="eyebrow">🧠 Grammar Spotlight</div>`;

    verbs.forEach(verb => {
        const isPracticed = !!practicedById[verb.id];
        const card = document.createElement('div');
        card.className = 'conjugation-card';
        card.innerHTML = `
            <div class="conjugation-header">
                <strong>${verb.verb_amharic}</strong>
                <span>${verb.verb_english}</span>
            </div>
            <div class="conjugation-rows">
                ${(verb.forms || []).map(f => `
                    <div class="conjugation-row">
                        <span class="conjugation-pronoun">${f.pronoun}</span>
                        <span class="conjugation-amharic">${f.amharic}</span>
                        <span class="conjugation-translit">${f.transliteration || ''}</span>
                    </div>
                `).join('')}
            </div>
            <button class="btn-secondary conjugation-practiced-btn">${isPracticed ? '✓ Practiced' : 'Mark as Practiced'}</button>
        `;

        card.querySelector('.conjugation-practiced-btn').onclick = () => markConjugationPracticed(verb.id, card);
        mount.appendChild(card);
    });
}

async function markConjugationPracticed(conjugationId, card) {
    const { error } = await _supabase
        .from('reading_conjugation_progress')
        .upsert({
            student_id: currentUser.id,
            conjugation_id: conjugationId,
            practiced_at: new Date().toISOString()
        }, { onConflict: 'student_id,conjugation_id' });

    if (error) {
        console.error("Failed to save conjugation progress:", error);
        return showNotificationToast("Couldn't save: " + error.message);
    }

    card.querySelector('.conjugation-practiced-btn').innerText = '✓ Practiced';
}

// -----------------------------------------------------------------------------
// "Read the Conversation Again" step — the original Reading Path flow:
// read -> translate -> grammar, item by item, now scoped to a single lesson
// instead of a whole chapter.
// -----------------------------------------------------------------------------

async function renderLessonReadingSection(mount, levelNumber, lessonOrder) {
    mount.innerHTML = `<div class="eyebrow">📚 Read the Conversation Again</div><p style="color:#94a3b8; font-size:13px;">Loading...</p>`;

    const { data: items, error } = await _supabase
        .from('reading_items')
        .select('*')
        .eq('level_number', levelNumber)
        .eq('lesson_order', lessonOrder)
        .order('item_order', { ascending: true });

    if (error || !items || items.length === 0) {
        mount.innerHTML = `<div class="eyebrow">📚 Read the Conversation Again</div><p style="color:#94a3b8; font-size:13px;">No reading passages added for this lesson yet.</p>`;
        return;
    }

    activeReadingItems = items;

    const { data: progressRows } = await _supabase
        .from('reading_item_progress')
        .select('*')
        .eq('student_id', currentUser.id)
        .in('item_id', items.map(i => i.id));

    const progressByItemId = {};
    (progressRows || []).forEach(row => { progressByItemId[row.item_id] = row; });

    // Resume at the first not-yet-completed item, rather than always
    // restarting from item 1 — so returning to a lesson mid-way through
    // continues where the student left off.
    let resumeIndex = items.findIndex(item => !progressByItemId[item.id]?.completed_at);
    if (resumeIndex === -1) resumeIndex = items.length - 1; // all done — show the last item
    activeReadingItemIndex = resumeIndex;

    mount.innerHTML = `<div class="eyebrow">📚 Read the Conversation Again</div><div id="readingStepContent"></div>`;
    renderCurrentReadingItem(progressByItemId);
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
    // lesson-complete state if this was the last item.
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
            <p class="subtitle" style="font-size:16px; font-weight:700; color:#10b981;">You've completed every sentence in this lesson!</p>
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
// Speaking step — self-check prompts (no voice recognition; the student
// self-reports having practiced, same self-assessment pattern as Can-Do)
// -----------------------------------------------------------------------------

async function renderSpeakingSection(mount, levelNumber, lessonOrder) {
    mount.innerHTML = `<div class="eyebrow">🎙 Speaking</div><p style="color:#94a3b8; font-size:13px;">Loading speaking prompts...</p>`;

    const { data: prompts, error } = await _supabase
        .from('lesson_speaking')
        .select('id, prompt_english, prompt_amharic_hint')
        .eq('level_number', levelNumber)
        .eq('lesson_order', lessonOrder)
        .order('item_order', { ascending: true });

    if (error || !prompts || prompts.length === 0) {
        mount.innerHTML = `<div class="eyebrow">🎙 Speaking</div><p style="color:#94a3b8; font-size:13px;">No speaking prompts added for this lesson yet.</p>`;
        return;
    }

    const { data: progressRows } = await _supabase
        .from('lesson_speaking_progress')
        .select('prompt_id')
        .eq('student_id', currentUser.id)
        .in('prompt_id', prompts.map(p => p.id));

    const practicedIds = new Set((progressRows || []).map(r => r.prompt_id));

    mount.innerHTML = `<div class="eyebrow">🎙 Speaking</div>`;
    prompts.forEach(prompt => {
        const isPracticed = practicedIds.has(prompt.id);
        const card = document.createElement('div');
        card.className = 'speaking-prompt-card';
        card.innerHTML = `
            <p class="speaking-prompt-text">${prompt.prompt_english}</p>
            ${prompt.prompt_amharic_hint ? `<p class="speaking-prompt-hint">${prompt.prompt_amharic_hint}</p>` : ''}
            <button class="btn-secondary speaking-practiced-btn">${isPracticed ? '✓ Practiced' : 'I practiced this'}</button>
        `;
        card.querySelector('.speaking-practiced-btn').onclick = () => markSpeakingPracticed(prompt.id, card);
        mount.appendChild(card);
    });
}

async function markSpeakingPracticed(promptId, card) {
    const { error } = await _supabase
        .from('lesson_speaking_progress')
        .upsert({
            student_id: currentUser.id,
            prompt_id: promptId,
            practiced_at: new Date().toISOString()
        }, { onConflict: 'student_id,prompt_id' });

    if (error) {
        console.error("Failed to save speaking progress:", error);
        return showNotificationToast("Couldn't save: " + error.message);
    }

    card.querySelector('.speaking-practiced-btn').innerText = '✓ Practiced';
}

// -----------------------------------------------------------------------------
// Practice step — quick flip-through review drill over this lesson's own
// vocabulary. Not new authored content: reuses reading_vocab / the same
// reading_vocab_progress "known" flag as the Vocabulary step.
// -----------------------------------------------------------------------------

let practiceDeck = [];
let practiceIndex = 0;

async function renderPracticeSection(mount, levelNumber, lessonOrder) {
    mount.innerHTML = `<div class="eyebrow">✍ Practice</div><p style="color:#94a3b8; font-size:13px;">Loading practice...</p>`;

    const words = await fetchChapterVocab(levelNumber, lessonOrder);
    if (words.length === 0) {
        mount.innerHTML = `<div class="eyebrow">✍ Practice</div><p style="color:#94a3b8; font-size:13px;">Add vocabulary to this lesson to unlock a practice drill.</p>`;
        return;
    }

    practiceDeck = words;
    practiceIndex = 0;
    mount.innerHTML = `<div class="eyebrow">✍ Practice</div><div id="practiceCardMount"></div>`;
    renderPracticeCard(document.getElementById('practiceCardMount'));
}

function renderPracticeCard(mount) {
    if (practiceIndex >= practiceDeck.length) {
        mount.innerHTML = `
            <div style="text-align:center; padding:20px 0;">
                <p style="font-size:40px;">🎉</p>
                <p class="subtitle" style="font-weight:700; color:#10b981;">Nice work — you've reviewed every word in this lesson!</p>
                <button class="btn-secondary" id="practiceRestartBtn" style="margin-top:10px;">Review Again</button>
            </div>`;
        document.getElementById('practiceRestartBtn').onclick = () => { practiceIndex = 0; renderPracticeCard(mount); };
        return;
    }

    const word = practiceDeck[practiceIndex];
    mount.innerHTML = `
        <p style="font-size:12px; color:#94a3b8; text-align:center;">Card ${practiceIndex + 1} of ${practiceDeck.length}</p>
        <div class="vocab-item practice-card" id="practiceCard">
            <div class="vocab-item-main" style="text-align:center; cursor:pointer;">
                <div class="vocab-amharic">${word.amharic_word}</div>
                <div class="vocab-translit">${word.transliteration || ''}</div>
                <div class="vocab-meaning" id="practiceMeaning" style="display:none; margin-top:10px;"><strong>${word.english_meaning}</strong></div>
            </div>
        </div>
        <div style="display:flex; gap:10px; margin-top:14px;">
            <button class="btn-secondary" id="practiceStillLearningBtn" style="flex:1;">Still Learning</button>
            <button class="btn-primary" id="practiceKnowItBtn" style="flex:1;">I Know It</button>
        </div>
    `;

    document.getElementById('practiceCard').onclick = () => {
        const meaning = document.getElementById('practiceMeaning');
        meaning.style.display = meaning.style.display === 'none' ? 'block' : 'none';
    };
    document.getElementById('practiceStillLearningBtn').onclick = () => { practiceIndex++; renderPracticeCard(mount); };
    document.getElementById('practiceKnowItBtn').onclick = async () => {
        await saveVocabKnown(word.id, true);
        practiceIndex++;
        renderPracticeCard(mount);
    };
}

// -----------------------------------------------------------------------------
// Chapter Challenge — short multiple-choice quiz, scored on submit. Chapter-
// wide (not per-lesson), so it keeps the original level-only scoping. On a
// pass, this is also where Can-Do statements now surface (mastery check
// AFTER learning, not a preview before it).
// -----------------------------------------------------------------------------

let activeCheckpointQuestions = [];
let checkpointAnswers = {};

async function fetchChapterCheckpoint(levelNumber) {
    const { data, error } = await _supabase
        .from('reading_checkpoint_questions')
        .select('id, question_amharic, question_english, choices, correct_index')
        .eq('level_number', levelNumber)
        .order('item_order', { ascending: true });

    if (error) {
        console.error("Failed to load checkpoint questions:", error);
        return [];
    }
    return data || [];
}

async function fetchMyChapterProgress(levelNumber) {
    const { data, error } = await _supabase
        .from('reading_chapter_progress')
        .select('checkpoint_passed, checkpoint_score')
        .eq('student_id', currentUser.id)
        .eq('level_number', levelNumber)
        .maybeSingle();

    if (error) {
        console.error("Failed to load chapter progress:", error);
        return null;
    }
    return data;
}

async function renderCheckpointSection(levelNumber) {
    const mount = document.getElementById("chapterCheckpointMount");
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading checkpoint...</p>`;

    const [questions, myProgress] = await Promise.all([
        fetchChapterCheckpoint(levelNumber),
        fetchMyChapterProgress(levelNumber)
    ]);

    if (questions.length === 0) {
        mount.innerHTML = `
            <div class="lesson-goal-card">
                <div class="eyebrow">🏁 Chapter Challenge</div>
                <h3>Checkpoint coming soon</h3>
                <p>You finished this chapter's lessons. The final quiz hasn't been added yet.</p>
                <button class="btn-secondary" onclick="goToPrevLesson()">← Previous Lesson</button>
                <button class="btn-primary" onclick="exitReadingLevelDetail()" style="margin-top:10px;">Back to Chapters</button>
            </div>
        `;
        return;
    }

    activeCheckpointQuestions = questions;
    checkpointAnswers = {};

    mount.innerHTML = myProgress?.checkpoint_passed
        ? `<div class="checkpoint-result passed">✓ Passed — ${myProgress.checkpoint_score}% last time. Retake anytime.</div>`
        : "";

    questions.forEach((q, qIndex) => {
        const card = document.createElement('div');
        card.className = 'checkpoint-question';
        card.innerHTML = `
            <p class="checkpoint-question-text">${qIndex + 1}. ${q.question_amharic ? q.question_amharic + ' — ' : ''}${q.question_english}</p>
            <div class="checkpoint-choices">
                ${(q.choices || []).map((choice, cIndex) => `
                    <button class="checkpoint-choice" data-c="${cIndex}">${choice}</button>
                `).join('')}
            </div>
        `;
        card.querySelectorAll('.checkpoint-choice').forEach(btn => {
            btn.onclick = () => selectCheckpointAnswer(qIndex, Number(btn.dataset.c), card);
        });
        mount.appendChild(card);
    });

    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn-primary';
    submitBtn.style.marginTop = '12px';
    submitBtn.innerText = 'Submit Checkpoint';
    submitBtn.onclick = () => submitCheckpoint(levelNumber);
    mount.appendChild(submitBtn);
}

function selectCheckpointAnswer(qIndex, choiceIndex, card) {
    checkpointAnswers[qIndex] = choiceIndex;
    card.querySelectorAll('.checkpoint-choice').forEach(btn => {
        btn.classList.toggle('selected', Number(btn.dataset.c) === choiceIndex);
    });
}

async function submitCheckpoint(levelNumber) {
    const total = activeCheckpointQuestions.length;
    let correct = 0;
    activeCheckpointQuestions.forEach((q, qIndex) => {
        if (checkpointAnswers[qIndex] === q.correct_index) correct++;
    });

    const score = Math.round((correct / total) * 100);
    const passed = score >= 70;

    const { error } = await _supabase
        .from('reading_chapter_progress')
        .upsert({
            student_id: currentUser.id,
            level_number: levelNumber,
            checkpoint_passed: passed,
            checkpoint_score: score,
            completed_at: new Date().toISOString()
        }, { onConflict: 'student_id,level_number' });

    if (error) {
        console.error("Failed to save checkpoint result:", error);
        return showNotificationToast("Couldn't save: " + error.message);
    }

    const mount = document.getElementById("chapterCheckpointMount");
    let html = `
        <div class="checkpoint-result ${passed ? 'passed' : 'failed'}">
            ${passed ? '✓' : '✗'} You scored ${score}% (${correct} / ${total}) — ${passed ? 'Chapter Challenge passed!' : 'Try again to pass (70%+).'}
        </div>
    `;

    if (passed) {
        const lesson = activeLessons[activeLessonIndex];
        if (lesson) {
            await _supabase.from('chapter_lesson_progress').upsert({
                student_id: currentUser.id,
                lesson_id: lesson.id,
                completed_at: new Date().toISOString()
            }, { onConflict: 'student_id,lesson_id' });
        }

        html += `
            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
                <button class="btn-secondary" onclick="restartCurrentChapter()">↻ Restart Chapter ${levelNumber}</button>
                <button class="btn-primary" onclick="exitReadingLevelDetail()">Back to Chapters ✓</button>
            </div>
            <div class="eyebrow" style="margin-top:22px;">🎯 What You Can Now Do</div>
            <div id="chapterCompleteCanDoMount"></div>
        `;
    } else {
        html += `
            <button class="btn-secondary" style="margin-top:12px;" onclick="renderCheckpointSection(${levelNumber})">Retake Checkpoint</button>
            <div style="margin-top:12px;">
                <button class="btn-secondary" onclick="goToPrevLesson()">← Previous Lesson</button>
            </div>
        `;
    }

    mount.innerHTML = html;

    if (passed) {
        executeVictoryConfettiCelebration();
        if (activeReadingLevel?.can_do_category) {
            renderCanDoRows('chapterCompleteCanDoMount', activeReadingLevel.can_do_category);
        }
    }
}

// -----------------------------------------------------------------------------
// Expose functions used via inline onclick="" handlers in index.html
// -----------------------------------------------------------------------------

window.enterAmharicPath = enterAmharicPath;
window.exitAmharicPath = exitAmharicPath;
window.exitReadingLevelDetail = exitReadingLevelDetail;
window.renderCheckpointSection = renderCheckpointSection;
window.closeChapterGoals = closeChapterGoals;
window.goToPrevLesson = goToPrevLesson;
window.restartCurrentChapter = restartCurrentChapter;

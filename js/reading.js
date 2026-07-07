// =============================================================================
// MY AMHARIC PATH — reading.js
// The flagship guided course. A chapter (reading_levels row) is a sequence
// of LESSONS (chapter_lessons), each walked through like a real class, one
// step at a time, in a fixed order:
//   🎯 Today's Goal -> 💬 Conversation -> 📖 Today's Words -> 🧠 Grammar
//   Spotlight -> 📚 Read the Conversation Again -> 🎙 Speaking -> ✍ Practice
//   -> ✅ Lesson Complete
// followed by a final "Chapter Challenge" lesson (a short multiple-choice
// checkpoint quiz) once every regular lesson in the chapter is done.
//
// Entry flow: Chapter List -> "🎯 Chapter Goals" or "▶️ Start Chapter" opens
// the same Can-Do goals card (js/candostatement.js, filtered to the
// chapter's can_do_category); Start Chapter's card continues into the
// chapter's first not-yet-completed lesson. There's no separate lesson-list
// screen — lessons play out linearly, one step at a time, resuming at the
// first not-yet-completed lesson (chapter_lesson_progress).
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
let activeReadingLevel = null;   // current chapter row: {level_number, title, can_do_category}
let activeLessons = [];          // chapter_lessons rows for the current chapter, in order
let activeLessonIndex = 0;
let activeReadingItems = [];
let activeReadingItemIndex = 0;

const LESSON_STEPS = [
    'goal',
    'teach',
    'pattern',
    'examples',
    'conversation',
    'vocab',
    'grammar',
    'reading',
    'speaking',
    'practice',
    'complete'
];

const LESSON_TEACHING_CONTENT = {
    "1-1": {
        conceptTitle: "What is a greeting?",
        conceptBody: `
            <p><strong>ሰላም</strong> means hello, peace, or greeting.</p>
            <p>It is the easiest greeting to start with because it works for men, women, elders, and groups.</p>
            <p>In Amharic, many greetings change depending on who you are speaking to.</p>
        `,
        resourceUrl: "https://amharicteacher.com/module/greetings",
        resourceLabel: "Study greetings on AmharicTeacher",
        patternTitle: "Greeting forms change by audience",
        patternBody: `
            <p>Many Amharic phrases have different forms for:</p>
            <ul>
                <li>one man</li>
                <li>one woman</li>
                <li>an elder or polite/formal person</li>
                <li>a group</li>
            </ul>
        `,
        examplesTitle: "How are you?",
        examples: [
            { label: "Male", amharic: "እንዴት ነህ?", transliteration: "endaet neh", english: "How are you?"},
            { label: "Female", amharic: "እንዴት ነሽ?", transliteration: "endaet nesh", english: "How are you?"},
            { label: "Polite / Elder", amharic: "እንዴት ነዎት?", transliteration: "endaet newot", english: "How are you?"},
            { label: "Group", amharic: "እንዴት ናችሁ?", transliteration: "endaet nachhu", english: "How are you?"}
        ],
        notice: "Notice how the ending changes: ነህ, ነሽ, ነዎት, ናችሁ."
    }
};

function getLessonTeachingContent(levelNumber, lessonOrder) {
    return LESSON_TEACHING_CONTENT[`${levelNumber}-${lessonOrder}`] || null;
} 

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
        .select('level_number, title, can_do_category')
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
        .select('id, level_number, lesson_order, title, is_challenge, learning_objective, estimated_minutes')
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
        card.className = `challenge-level-card unlocked ${isComplete ? 'completed' : ''}`;
        card.innerHTML = `
            <div class="challenge-level-number-badge">${level.level_number}</div>
            <div class="challenge-level-title">${level.title}</div>
            <div style="font-size:11px; color:#94a3b8; margin:6px 0 12px;">
                ${lessonsForLevel.length || 0} lesson${lessonsForLevel.length === 1 ? '' : 's'}${isComplete ? ' • Chapter complete ✓' : ''}
            </div>
            <div class="chapter-card-actions">
                <button type="button" class="btn-secondary chapter-goals-btn">🎯 Chapter Goals</button>
                <button type="button" class="btn-primary chapter-start-btn">▶️ Start Chapter</button>
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
// Chapter Goals card — shared by "🎯 Chapter Goals" and "▶️ Start Chapter"
// -----------------------------------------------------------------------------

function openChapterGoals(level, mode) {
    document.getElementById('chapterGoalsTitle').innerText = `🎯 ${level.title} — Goals`;

    const ctaBtn = document.getElementById('chapterGoalsCtaBtn');
    if (mode === 'start') {
        ctaBtn.innerText = 'Continue to Lesson 1 →';
        ctaBtn.onclick = () => { closeChapterGoals(); enterChapter(level.level_number); };
    } else {
        ctaBtn.innerText = 'Got it ✓';
        ctaBtn.onclick = closeChapterGoals;
    }

    document.getElementById('chapterGoalsOverlay').style.display = 'flex';
    renderCanDoRows('chapterGoalsMount', level.can_do_category || null);
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
        .select('id, level_number, lesson_order, title, is_challenge, learning_objective, estimated_minutes')
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

    openCurrentLesson();
}

function openCurrentLesson() {
    const lesson = activeLessons[activeLessonIndex];

    document.getElementById("readingLevelDetailTitle").innerText =
        `${activeReadingLevel.title} · Lesson ${activeLessonIndex + 1} of ${activeLessons.length}: ${lesson.title}`;

    if (lesson.is_challenge) {
        document.getElementById("lessonNormalView").style.display = "none";
        document.getElementById("lessonChallengeView").style.display = "block";
        renderCheckpointSection(activeReadingLevel.level_number);
    } else {
        document.getElementById("lessonChallengeView").style.display = "none";
        document.getElementById("lessonNormalView").style.display = "block";
        activeStepIndex = 0;
        renderCurrentStep();
    }
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
        openCurrentLesson();
    } else {
        exitReadingLevelDetail();
    }
}

function exitReadingLevelDetail() {
    document.getElementById("readingLevelDetailScreen").style.display = "none";
    document.getElementById("readingLevelsScreen").style.display = "block";
    renderReadingLevelsList();
}

// -----------------------------------------------------------------------------
// Lesson steps — walked through in a fixed order, one at a time, like a real
// class: Today's Goal -> Conversation -> Today's Words -> Grammar Spotlight
// -> Read the Conversation Again -> Speaking -> Practice -> Lesson Complete.
// Each step appends its own Continue/Back nav below its content — sections
// aren't gated on completion (consistent with the rest of the app), Continue
// just always moves forward.
// -----------------------------------------------------------------------------

function renderCurrentStep() {
    const step = LESSON_STEPS[activeStepIndex];

    LESSON_STEPS.forEach(s => {
        const panel = document.getElementById(`lessonStep_${s}`);
        if (panel) panel.style.display = (s === step) ? 'block' : 'none';
    });

    const lesson = activeLessons[activeLessonIndex];
    const levelNumber = activeReadingLevel.level_number;
    const lessonOrder = lesson.lesson_order;
    const panelId = `lessonStep_${step}`;

if (step === 'goal') {
    renderGoalStep(lesson);
    appendStepNav(panelId, { showBack: false, continueLabel: 'Start Lesson →' });
} else if (step === 'teach') {
    renderTeachStep(levelNumber, lessonOrder);
    appendStepNav(panelId, { showBack: true });
} else if (step === 'pattern') {
    renderPatternStep(levelNumber, lessonOrder);
    appendStepNav(panelId, { showBack: true });
} else if (step === 'examples') {
    renderExamplesStep(levelNumber, lessonOrder);
    appendStepNav(panelId, { showBack: true });
} else if (step === 'complete') {
    renderLessonCompleteStep();
} else {
    appendStepNav(panelId, { showBack: true });
    if (step === 'conversation') renderConversationSection(levelNumber, lessonOrder);
    else if (step === 'vocab') renderVocabSection(levelNumber, lessonOrder);
    else if (step === 'grammar') renderConjugationSection(levelNumber, lessonOrder);
    else if (step === 'reading') renderLessonReadingSection(levelNumber, lessonOrder);
    else if (step === 'speaking') renderSpeakingSection(levelNumber, lessonOrder);
    else if (step === 'practice') renderPracticeSection(levelNumber, lessonOrder);
}
}
function goToNextStep() {
    if (activeStepIndex < LESSON_STEPS.length - 1) {
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

function appendStepNav(panelId, { showBack = true, continueLabel = 'Continue →' } = {}) {
    const panel = document.getElementById(panelId);
    const existingNav = panel.querySelector('.lesson-step-nav');
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
    panel.appendChild(nav);
}

function renderGoalStep(lesson) {
    const mount = document.getElementById('lessonStep_goal');
    mount.innerHTML = `
        <div class="lesson-goal-card">
            <div class="eyebrow">🎯 Today's Goal</div>
            <p class="lesson-goal-text">${lesson.learning_objective || 'Complete this lesson to build your Amharic skills.'}</p>
            ${lesson.estimated_minutes ? `<p class="lesson-goal-time">⏱ About ${lesson.estimated_minutes} minutes</p>` : ''}
        </div>
    `;
}

    function renderTeachStep(levelNumber, lessonOrder) {
    const mount = document.getElementById('lessonStep_teach');
    const content = getLessonTeachingContent(levelNumber, lessonOrder);

    if (!content) {
        mount.innerHTML = `
            <div class="lesson-teach-card">
                <div class="eyebrow">📘 Learn</div>
                <h3>Teacher Note</h3>
                <p>This lesson introduces a new Amharic skill. Read the examples carefully, then practice using them.</p>
            </div>
        `;
        return;
    }

    mount.innerHTML = `
        <div class="lesson-teach-card">
            <div class="eyebrow">📘 Learn</div>
            <h3>${content.conceptTitle}</h3>
            ${content.conceptBody}
            ${content.resourceUrl ? `
                <a class="lesson-resource-link" href="${content.resourceUrl}" target="_blank" rel="noopener">
                    🔗 ${content.resourceLabel || 'Open resource'}
                </a>
            ` : ''}
        </div>
    `;
}

function renderPatternStep(levelNumber, lessonOrder) {
    const mount = document.getElementById('lessonStep_pattern');
    const content = getLessonTeachingContent(levelNumber, lessonOrder);

    mount.innerHTML = `
        <div class="lesson-pattern-card">
            <div class="eyebrow">🧠 Pattern</div>
            <h3>${content?.patternTitle || 'Notice the pattern'}</h3>
            ${content?.patternBody || '<p>Look for how the Amharic words change depending on who is speaking or being spoken to.</p>'}
        </div>
    `;
}

function renderExamplesStep(levelNumber, lessonOrder) {
    const mount = document.getElementById('lessonStep_examples');
    const content = getLessonTeachingContent(levelNumber, lessonOrder);

    if (!content?.examples?.length) {
        mount.innerHTML = `
            <div class="lesson-examples-card">
                <div class="eyebrow">📌 Examples</div>
                <p>No example table has been added for this lesson yet.</p>
            </div>
        `;
        return;
    }

    mount.innerHTML = `
        <div class="lesson-examples-card">
            <div class="eyebrow">📌 Examples</div>
            <h3>${content.examplesTitle || 'Examples'}</h3>
            <div class="lesson-example-list">
                ${content.examples.map(ex => `
                    <div class="lesson-example-row">
                        <div class="lesson-example-label">${ex.label}</div>
                        <div class="lesson-example-main">
                            <div class="lesson-example-amharic">${ex.amharic}</div>
                            <div class="lesson-example-translit">${ex.transliteration || ''}</div>
                            <div class="lesson-example-english">${ex.english || ''}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
            ${content.notice ? `<div class="lesson-notice">💡 ${content.notice}</div>` : ''}
        </div>
    `;
}
function renderLessonCompleteStep() {
    const mount = document.getElementById('lessonStep_complete');
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

async function renderConversationSection(levelNumber, lessonOrder) {
    const mount = document.getElementById("lessonConversationMount");
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading conversation...</p>`;

    const { data: lines, error } = await _supabase
        .from('lesson_conversations')
        .select('id, speaker_label, line_amharic, line_translation')
        .eq('level_number', levelNumber)
        .eq('lesson_order', lessonOrder)
        .order('item_order', { ascending: true });

    if (error || !lines || lines.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No conversation added for this lesson yet.</p>`;
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

async function renderVocabSection(levelNumber, lessonOrder) {
    const mount = document.getElementById("lessonVocabMount");
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading vocabulary...</p>`;

    const words = await fetchChapterVocab(levelNumber, lessonOrder);
    if (words.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No vocabulary added for this lesson yet.</p>`;
        return;
    }

    const knownById = await fetchMyVocabProgress(words.map(w => w.id));

    mount.innerHTML = `<p class="subtitle" style="text-align:left; margin-bottom:12px;">Tap a word to reveal its meaning. Mark it known once you've got it down.</p>`;

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

async function renderConjugationSection(levelNumber, lessonOrder) {
    const mount = document.getElementById("lessonGrammarMount");
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading grammar...</p>`;

    const verbs = await fetchChapterConjugations(levelNumber, lessonOrder);
    if (verbs.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No grammar added for this lesson yet.</p>`;
        return;
    }

    const practicedById = await fetchMyConjugationProgress(verbs.map(v => v.id));

    mount.innerHTML = "";

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

async function renderLessonReadingSection(levelNumber, lessonOrder) {
    const mount = document.getElementById("lessonReadingMount");
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading...</p>`;

    const { data: items, error } = await _supabase
        .from('reading_items')
        .select('*')
        .eq('level_number', levelNumber)
        .eq('lesson_order', lessonOrder)
        .order('item_order', { ascending: true });

    if (error || !items || items.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No reading passages added for this lesson yet.</p>`;
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

    mount.innerHTML = `<div id="readingStepContent"></div>`;
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

async function renderSpeakingSection(levelNumber, lessonOrder) {
    const mount = document.getElementById("lessonSpeakingMount");
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading speaking prompts...</p>`;

    const { data: prompts, error } = await _supabase
        .from('lesson_speaking')
        .select('id, prompt_english, prompt_amharic_hint')
        .eq('level_number', levelNumber)
        .eq('lesson_order', lessonOrder)
        .order('item_order', { ascending: true });

    if (error || !prompts || prompts.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No speaking prompts added for this lesson yet.</p>`;
        return;
    }

    const { data: progressRows } = await _supabase
        .from('lesson_speaking_progress')
        .select('prompt_id')
        .eq('student_id', currentUser.id)
        .in('prompt_id', prompts.map(p => p.id));

    const practicedIds = new Set((progressRows || []).map(r => r.prompt_id));

    mount.innerHTML = "";
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
// reading_vocab_progress "known" flag as the Vocabulary tab.
// -----------------------------------------------------------------------------

let practiceDeck = [];
let practiceIndex = 0;

async function renderPracticeSection(levelNumber, lessonOrder) {
    const mount = document.getElementById("lessonPracticeMount");
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading practice...</p>`;

    const words = await fetchChapterVocab(levelNumber, lessonOrder);
    if (words.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Add vocabulary to this lesson to unlock a practice drill.</p>`;
        return;
    }

    practiceDeck = words;
    practiceIndex = 0;
    renderPracticeCard(mount);
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
// wide (not per-lesson), so it keeps the original level-only scoping.
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
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No checkpoint added for this chapter yet.</p>`;
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
        html += `<button class="btn-primary" style="margin-top:12px;" onclick="exitReadingLevelDetail()">Back to Chapters ✓</button>`;
    } else {
        html += `<button class="btn-secondary" style="margin-top:12px;" onclick="renderCheckpointSection(${levelNumber})">Retake Checkpoint</button>`;
    }

    mount.innerHTML = html;

    if (passed) executeVictoryConfettiCelebration();
}

// -----------------------------------------------------------------------------
// Expose functions used via inline onclick="" handlers in index.html
// -----------------------------------------------------------------------------

window.enterAmharicPath = enterAmharicPath;
window.exitAmharicPath = exitAmharicPath;
window.exitReadingLevelDetail = exitReadingLevelDetail;
window.renderCheckpointSection = renderCheckpointSection;
window.closeChapterGoals = closeChapterGoals;

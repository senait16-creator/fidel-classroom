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
let activeChapterCompletedIds = new Set(); // lesson ids completed, for the lesson picker
let activeReadingItems = [];
let activeReadingItemIndex = 0;

let activeLessonSections = [];   // lesson_sections rows for the current lesson, in order
let activeLessonQuiz = [];       // lesson_quiz_blocks rows for the current lesson
let activeStepList = [];         // computed once per lesson entry: ['goal', 'section-0', 'section-1', 'quiz'?, 'conversation', ...]
let activeStepIndex = 0;

// Which screen to return to when backing out of a lesson — the plain
// chapter grid (Independent Study) or the Study Together dashboard,
// depending on where the student entered the lesson from.
let readingLevelDetailReturnScreen = "readingLevelsScreen";

// Set while rendering the Study Together chapter card so its "Continue"
// button and the Chapter Feed post box both know the student's current
// chapter without a second fetch.
let studyTogetherCurrentLevel = null;

// Where the chapter LIST's own back button goes — null (default) means
// Independent Study, so it exits My Amharic Path entirely. Set to
// "studyTogetherScreen" when the list was opened via Study Together's
// "See All Chapters" link, so backing out (and finishing/backing out of
// any chapter started from that list) returns to Study Together instead.
let chapterListReturnScreen = null;

// -----------------------------------------------------------------------------
// Entry point — gated behind a self-reported "can you read the Fidel?"
// question, then a one-time choice between Independent Study (solo,
// self-paced) and Study Together (same chapters, plus a social layer).
// Both are remembered on the profile so returning students skip straight
// to their mode; a "Switch path" link on each mode's screen reopens the
// choice without re-asking the fluency question.
// -----------------------------------------------------------------------------

function enterAmharicPath() {
    if (!currentProfile) return;

    if (currentProfile.can_read_fidel !== true) {
        showScreen("amharicPathGateScreen");
        return;
    }

    if (currentProfile.amharic_path_mode === "study_together") {
        showScreen("studyTogetherScreen");
        renderStudyTogetherScreen();
    } else if (currentProfile.amharic_path_mode === "independent") {
        chapterListReturnScreen = null;
        showScreen("readingLevelsScreen");
        renderReadingLevelsList();
    } else {
        showScreen("amharicPathChooseScreen");
    }
}

// "Yes" persists the flag and moves on to the mode choice (or straight to
// an already-chosen mode). "Not yet" is intentionally NOT persisted — it
// just routes into the existing Fidel Practice flow, so the question is
// asked again next time in case the student has progressed since.
async function submitFidelGateAnswer(canRead) {
    if (!canRead) {
        if (typeof chooseModePractice === "function") chooseModePractice();
        return;
    }

    currentProfile.can_read_fidel = true;
    await _supabase.from('profiles').update({ can_read_fidel: true }).eq('id', currentUser.id);

    enterAmharicPath();
}

function openAmharicPathChooser() {
    showScreen("amharicPathChooseScreen");
}

async function chooseAmharicPathMode(mode) {
    currentProfile.amharic_path_mode = mode;
    await _supabase.from('profiles').update({ amharic_path_mode: mode }).eq('id', currentUser.id);

    if (mode === "study_together") {
        showScreen("studyTogetherScreen");
        renderStudyTogetherScreen();
    } else {
        chapterListReturnScreen = null;
        showScreen("readingLevelsScreen");
        renderReadingLevelsList();
    }
}

function exitAmharicPath() {
    if (typeof enterModeSelect === "function") {
        enterModeSelect();
    } else {
        showScreen("studentDashboard");
    }
}

// Opens the full chapter list from within Study Together — reuses the
// exact same list/grid Independent Study uses (chapters are shared
// between both modes), but remembers to route back to Study Together
// instead of exiting My Amharic Path entirely.
function openAllChaptersFromStudyTogether() {
    chapterListReturnScreen = "studyTogetherScreen";
    showScreen("readingLevelsScreen");
    renderReadingLevelsList();
}

function exitChapterList() {
    if (chapterListReturnScreen === "studyTogetherScreen") {
        chapterListReturnScreen = null;
        showScreen("studyTogetherScreen");
        renderStudyTogetherScreen();
    } else {
        exitAmharicPath();
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

// Powers the progress bar on each chapter card — every lesson (including
// the Chapter Challenge itself) gets a row here once completed, so
// completedCount/totalCount naturally reaches 100% exactly when
// reading_chapter_progress.checkpoint_passed does too.
async function fetchMyLessonProgressAll() {
    const { data, error } = await _supabase
        .from('chapter_lesson_progress')
        .select('lesson_id, completed_at')
        .eq('student_id', currentUser.id);

    if (error) {
        console.error("Failed to load lesson progress:", error);
        return [];
    }
    return data || [];
}

// A chapter is considered "complete" once its Chapter Challenge checkpoint
// is passed — that single existing rollup is simpler and more meaningful
// than trying to combine six different per-lesson progress tables into one
// completion flag. The progress BAR underneath, though, tracks real
// per-lesson completion so the card shows meaningful movement before the
// chapter is finished, not just an all-or-nothing state.
async function renderReadingLevelsList() {
    const container = document.getElementById("readingLevelsGrid");
    container.innerHTML = `<p style="color:#94a3b8;">Loading...</p>`;
    renderGrowthEntryCard();

    const [levels, lessons, chapterProgress, lessonProgress] = await Promise.all([
        fetchReadingLevels(),
        fetchAllLessons(),
        fetchMyChapterProgressAll(),
        fetchMyLessonProgressAll()
    ]);

    const passedByLevel = {};
    chapterProgress.forEach(row => { passedByLevel[row.level_number] = row.checkpoint_passed; });

    const completedLessonIds = new Set(
        lessonProgress.filter(row => row.completed_at).map(row => row.lesson_id)
    );

    container.innerHTML = "";

    levels.forEach(level => {
        const lessonsForLevel = lessons.filter(l => l.level_number === level.level_number);
        const isComplete = !!passedByLevel[level.level_number];
        const totalCount = lessonsForLevel.length;
        const completedCount = lessonsForLevel.filter(l => completedLessonIds.has(l.id)).length;
        const percent = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;

        const card = document.createElement('div');
        card.className = `chapter-list-card ${isComplete ? 'completed' : ''}`;
        card.innerHTML = `
            <div class="challenge-level-number-badge">${level.level_number}</div>
            <div class="chapter-list-card-body">
                <div class="chapter-list-card-title">${level.title}</div>
                <div class="chapter-list-card-meta">
                    ${completedCount} of ${totalCount} lesson${totalCount === 1 ? '' : 's'}${isComplete ? ' • Chapter complete ✓' : ''}
                </div>
                <div class="chapter-progress-track">
                    <div class="chapter-progress-fill" style="width:${percent}%;"></div>
                </div>
                <div class="chapter-card-actions">
                    <button type="button" class="btn-secondary chapter-goals-btn">🎯 Chapter Goals</button>
                    <button type="button" class="btn-primary chapter-start-btn">▶️ Start Chapter</button>
                </div>
            </div>
        `;

        card.querySelector('.chapter-start-btn').onclick = (e) => {
            e.stopPropagation();
            readingLevelDetailReturnScreen = chapterListReturnScreen === "studyTogetherScreen" ? "studyTogetherScreen" : "readingLevelsScreen";
            enterChapter(level.level_number);
        };
        card.querySelector('.chapter-goals-btn').onclick = (e) => {
            e.stopPropagation();
            openChapterGoals(level, 'view');
        };

        container.appendChild(card);
    });
}

// Same per-chapter progress computation as renderReadingLevelsList, but
// resolved down to a single "current chapter" (first incomplete, or the
// last one if everything's done) — used by the Study Together dashboard.
async function fetchCurrentChapterSummary() {
    const [levels, lessons, chapterProgress, lessonProgress] = await Promise.all([
        fetchReadingLevels(),
        fetchAllLessons(),
        fetchMyChapterProgressAll(),
        fetchMyLessonProgressAll()
    ]);

    if (!levels || levels.length === 0) return null;

    const passedByLevel = {};
    chapterProgress.forEach(row => { passedByLevel[row.level_number] = row.checkpoint_passed; });

    const completedLessonIds = new Set(
        lessonProgress.filter(row => row.completed_at).map(row => row.lesson_id)
    );

    const withProgress = levels.map(level => {
        const lessonsForLevel = lessons.filter(l => l.level_number === level.level_number);
        const isComplete = !!passedByLevel[level.level_number];
        const totalCount = lessonsForLevel.length;
        const completedCount = lessonsForLevel.filter(l => completedLessonIds.has(l.id)).length;
        const percent = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;
        return { level, isComplete, totalCount, completedCount, percent };
    });

    return withProgress.find(row => !row.isComplete) || withProgress[withProgress.length - 1];
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

// -----------------------------------------------------------------------------
// Study Together — the same chapters as Independent Study, plus a light
// social layer: Daily Wordle, Verse of the Day, the team's Lesson Schedule
// (Community Check-In), and a class-wide Chapter Feed. Voice Prompt is a
// placeholder for now — recording/playback doesn't exist anywhere in the
// app yet, so it's being scoped as its own project rather than bolted on
// here.
// -----------------------------------------------------------------------------

const STUDY_TOGETHER_VERSES = [
    { amharic: "አንድ ሰው ብቻውን ቢሮጥ፣ ሁለት ሰው ግን አብረው ይራመዳሉ።", english: "One person alone may run fast, but two people walking together go further." },
    { amharic: "ትንሽ ትንሽ እያለ ራስ ማርያም ይደርሳል።", english: "Little by little, even the mountain peak is reached. Small steps add up." },
    { amharic: "የሚተባበሩ ወንድሞች ተራራ ያፈርሳሉ።", english: "Siblings who work together can move a mountain." },
    { amharic: "ጠብታ ጠብታ ባሕር ይሆናል።", english: "Drop by drop becomes an ocean. Small, steady practice adds up." },
    { amharic: "እጅ ለእጅ ተያይዞ ሸክም ይቀላል።", english: "Hand in hand, the load gets lighter. You don't have to carry it alone." }
];

function getStudyTogetherVerseOfTheDay() {
    const dayIndex = Math.floor(Date.now() / 86400000);
    return STUDY_TOGETHER_VERSES[dayIndex % STUDY_TOGETHER_VERSES.length];
}

async function renderStudyTogetherScreen() {
    renderStudyTogetherChapterCard();
    renderStudyTogetherVerse();
    renderStudyTogetherCheckIn();
    renderStudyTogetherFeed();
}

async function renderStudyTogetherChapterCard() {
    const mount = document.getElementById('studyTogetherChapterMount');
    if (!mount) return;
    mount.innerHTML = `<p style="color:#94a3b8;">Loading...</p>`;

    const current = await fetchCurrentChapterSummary();
    studyTogetherCurrentLevel = current ? current.level.level_number : null;

    if (!current) {
        mount.innerHTML = `<p style="color:#94a3b8;">No chapters yet, check back soon.</p>`;
        return;
    }

    const { level, isComplete, totalCount, completedCount, percent } = current;

    mount.innerHTML = `
        <div class="challenge-level-number-badge">${level.level_number}</div>
        <div class="chapter-list-card-body">
            <div class="chapter-list-card-title">${level.title}</div>
            <div class="chapter-list-card-meta">
                ${completedCount} of ${totalCount} lesson${totalCount === 1 ? '' : 's'}${isComplete ? ' • Chapter complete ✓' : ''}
            </div>
            <div class="chapter-progress-track">
                <div class="chapter-progress-fill" style="width:${percent}%;"></div>
            </div>
            <button type="button" class="btn-primary study-together-continue-btn" style="width:100%; margin-top:10px;">
                ${isComplete ? 'Review Chapter →' : 'Continue Chapter →'}
            </button>
            <a href="javascript:void(0)" class="study-together-all-chapters-link">See all chapters →</a>
        </div>
    `;

    mount.querySelector('.study-together-continue-btn').onclick = () => {
        continueChapterFromStudyTogether(level.level_number);
    };
    mount.querySelector('.study-together-all-chapters-link').onclick = openAllChaptersFromStudyTogether;
}

function renderStudyTogetherVerse() {
    const mount = document.getElementById('studyTogetherVerseMount');
    if (!mount) return;
    const verse = getStudyTogetherVerseOfTheDay();
    mount.innerHTML = `
        <div class="study-together-verse-amharic">${verse.amharic}</div>
        <p class="study-together-verse-english">"${verse.english}"</p>
    `;
}

async function renderStudyTogetherCheckIn() {
    const card = document.getElementById('studyTogetherCheckInCard');
    const mount = document.getElementById('studyTogetherCheckInMount');
    if (!card || !mount) return;

    if (!currentProfile?.team_id || typeof buildLessonScheduleMarkup !== 'function') {
        card.style.display = 'none';
        return;
    }

    const markup = await buildLessonScheduleMarkup(currentProfile.team_id);
    if (!markup) { card.style.display = 'none'; return; }

    card.style.display = 'block';
    mount.innerHTML = markup;
}

async function renderStudyTogetherFeed() {
    const mount = document.getElementById('studyTogetherFeedMount');
    if (!mount) return;
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading...</p>`;

    const { data: posts, error } = await _supabase
        .from('chapter_feed_posts')
        .select('id, student_id, level_number, body_text, created_at, profiles!chapter_feed_posts_student_id_fkey(nickname, avatar)')
        .order('created_at', { ascending: false })
        .limit(30);

    if (error) {
        mount.innerHTML = `<p style="color:#ef4444; font-size:13px;">Couldn't load the feed: ${error.message}</p>`;
        return;
    }

    if (!posts || posts.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No posts yet. Be the first to share something from your chapter.</p>`;
        return;
    }

    mount.innerHTML = posts.map(post => `
        <div class="study-together-feed-post">
            <span class="study-together-feed-avatar">${post.profiles?.avatar || '🦁'}</span>
            <div>
                <div class="study-together-feed-name">${escapeHtml(post.profiles?.nickname || 'A student')}</div>
                <div class="study-together-feed-text">${escapeHtml(post.body_text)}</div>
                <div class="study-together-feed-meta">Chapter ${post.level_number} • ${new Date(post.created_at).toLocaleDateString()}</div>
            </div>
        </div>
    `).join('');
}

async function postChapterFeedUpdate() {
    const input = document.getElementById('studyTogetherFeedInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    if (!studyTogetherCurrentLevel) return showNotificationToast("Couldn't figure out your current chapter. Try again in a moment.");

    const { error } = await _supabase.from('chapter_feed_posts').insert({
        student_id: currentUser.id,
        level_number: studyTogetherCurrentLevel,
        body_text: text
    });

    if (error) return showNotificationToast("Couldn't post: " + error.message);

    input.value = '';
    renderStudyTogetherFeed();
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
        ctaBtn.onclick = () => { closeChapterGoals(); readingLevelDetailReturnScreen = chapterListReturnScreen === "studyTogetherScreen" ? "studyTogetherScreen" : "readingLevelsScreen"; enterChapter(level.level_number); };
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

    activeChapterCompletedIds = new Set((progressRows || []).filter(r => r.completed_at).map(r => r.lesson_id));

    let resumeIndex = lessons.findIndex(l => !activeChapterCompletedIds.has(l.id));
    if (resumeIndex === -1) resumeIndex = lessons.length - 1;
    activeLessonIndex = resumeIndex;

    document.getElementById("readingLevelsScreen").style.display = "none";
    const studyTogetherScreenEl = document.getElementById("studyTogetherScreen");
    if (studyTogetherScreenEl) studyTogetherScreenEl.style.display = "none";
    document.getElementById("readingLevelDetailScreen").style.display = "block";

    openLessonPicker();
}

// Shown first when entering a chapter — every lesson in order, completion
// marked, and the resume point (first not-yet-completed lesson) called out
// so returning students still land somewhere sensible without being forced
// to pick manually.
function openLessonPicker() {
    document.getElementById("lessonNormalView").style.display = "none";
    document.getElementById("lessonChallengeView").style.display = "none";
    document.getElementById("lessonPickerView").style.display = "block";
    document.getElementById("readingLevelDetailTitle").innerText = activeReadingLevel.title;

    const mount = document.getElementById("lessonPickerList");
    mount.innerHTML = "";

    activeLessons.forEach((lesson, index) => {
        const isDone = activeChapterCompletedIds.has(lesson.id);
        const isResume = index === activeLessonIndex;

        const row = document.createElement('button');
        row.type = 'button';
        row.className = `lesson-picker-row${isDone ? ' done' : ''}${isResume ? ' resume' : ''}`;
        row.innerHTML = `
            <span class="lesson-picker-num">${isDone ? '✓' : (index + 1)}</span>
            <span class="lesson-picker-body">
                <span class="lesson-picker-title">${lesson.title}</span>
                <span class="lesson-picker-meta">${lesson.is_challenge ? 'Chapter Challenge' : (lesson.lesson_focus || '')}</span>
            </span>
            ${isResume ? '<span class="lesson-picker-tag">Continue here</span>' : ''}
        `;
        row.onclick = () => {
            activeLessonIndex = index;
            openCurrentLesson();
        };
        mount.appendChild(row);
    });
}

// Entry point used by the Study Together "Continue Lesson →" card, so
// backing out of the lesson returns to the dashboard instead of the plain
// chapter grid.
function continueChapterFromStudyTogether(levelNumber) {
    readingLevelDetailReturnScreen = "studyTogetherScreen";
    enterChapter(levelNumber);
}

async function openCurrentLesson() {
    const lesson = activeLessons[activeLessonIndex];

    document.getElementById("lessonPickerView").style.display = "none";
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

    activeChapterCompletedIds.add(lesson.id);

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

    activeChapterCompletedIds = new Set();
    activeLessonIndex = 0;
    await openCurrentLesson();
}

function exitReadingLevelDetail() {
    document.getElementById("readingLevelDetailScreen").style.display = "none";

    if (readingLevelDetailReturnScreen === "studyTogetherScreen") {
        document.getElementById("studyTogetherScreen").style.display = "block";
        renderStudyTogetherScreen();
    } else {
        document.getElementById("readingLevelsScreen").style.display = "block";
        renderReadingLevelsList();
    }
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

    const percent = Math.round(((activeStepIndex + 1) / activeStepList.length) * 100);

document.getElementById('lessonStepProgress').innerHTML = `
    <div class="lesson-progress-mini">
        <div class="lesson-progress-mini-fill" style="width:${percent}%"></div>
    </div>
    <div class="lesson-progress-mini-label">
        Step ${activeStepIndex + 1} of ${activeStepList.length} · ${percent}%
    </div>
`;

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
    const lesson = activeLessons[activeLessonIndex];

    mount.innerHTML = `
        <div class="lesson-complete-card">
            <div class="lesson-complete-badge">ጎበዝ!</div>
            <p class="lesson-complete-icon">🎉</p>
            <h3>Lesson Complete</h3>
            <p>You finished <strong>${lesson?.title || 'this lesson'}</strong>.</p>
            <p class="lesson-complete-sub">You’re building real Amharic step by step.</p>
        </div>
        <button class="btn-primary lesson-complete-next-btn" style="width:100%;">Next Lesson →</button>
    `;

    mount.querySelector('.lesson-complete-next-btn').onclick = goToNextLesson;

    if (typeof showGobezToast === "function") {
        showGobezToast("ጎበዝ! Lesson complete!");
    }

    if (typeof executeVictoryConfettiCelebration === "function") {
        executeVictoryConfettiCelebration();
    }
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
                    ${word.example_sentence ? `<p class="vocab-example">${word.example_sentence}${word.example_translation ? ` ("${word.example_translation}")` : ''}</p>` : ''}
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
            <button class="btn-primary" id="readingFinishItemBtn">Got It, Next →</button>
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
            <p style="color:#9a3412; font-size:13px;">Not quite. Here's the correct translation:</p>
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
                <p class="subtitle" style="font-weight:700; color:#10b981;">Nice work. You've reviewed every word in this lesson!</p>
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
        ? `<div class="checkpoint-result passed">✓ Passed: ${myProgress.checkpoint_score}% last time. Retake anytime.</div>`
        : "";

    const preSubmitNav = document.createElement('div');
    preSubmitNav.style.cssText = 'display:flex; flex-wrap:wrap; gap:10px; margin-bottom:14px;';
    preSubmitNav.innerHTML = `
        <button class="btn-secondary" onclick="goToPrevLesson()">← Previous Lesson</button>
        <button class="btn-secondary" onclick="openLessonPicker()">☰ All Lessons</button>
        <button class="btn-secondary" onclick="renderCheckpointSection(${levelNumber})">↻ Start Over</button>
    `;
    mount.appendChild(preSubmitNav);

    questions.forEach((q, qIndex) => {
        const card = document.createElement('div');
        card.className = 'checkpoint-question';
        card.innerHTML = `
            <p class="checkpoint-question-text">${qIndex + 1}. ${q.question_amharic ? q.question_amharic + ': ' : ''}${q.question_english}</p>
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
            ${passed ? '✓' : '✗'} You scored ${score}% (${correct} / ${total}). ${passed ? 'Chapter Challenge passed!' : 'Try again to pass (70%+).'}
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
// My Growth — a cumulative, cross-chapter view of what a student has
// actually picked up so far: vocabulary marked known, grammar notes
// reached, Can-Do skills checked off, and a "Today" strip of activity.
// Every per-lesson screen above only ever shows ONE lesson's worth of
// content; this is deliberately the only place that aggregates across all
// of them, so progress reads as accumulating instead of resetting on every
// lesson.
// -----------------------------------------------------------------------------

function startOfTodayISO() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
}

// Small counts for the entry card on the chapter list — cheap enough to
// run every time that screen loads.
async function renderGrowthEntryCard(targetId = 'growthEntryMount') {
    const mount = document.getElementById(targetId);
    if (!mount) return;

    const [{ count: vocabCount }, { count: grammarCount }, { count: canDoCount }] = await Promise.all([
        _supabase.from('reading_vocab_progress').select('vocab_id', { count: 'exact', head: true })
            .eq('student_id', currentUser.id).eq('is_known', true),
        _supabase.from('reading_item_progress').select('item_id', { count: 'exact', head: true })
            .eq('student_id', currentUser.id).eq('has_understood_grammar', true),
        _supabase.from('can_do_progress').select('statement_key', { count: 'exact', head: true })
            .eq('student_id', currentUser.id)
    ]);

    mount.innerHTML = `
        <div class="growth-entry-card" onclick="enterMyGrowth()">
            <div class="growth-entry-icon">🌱</div>
            <div>
                <div class="growth-entry-title">My Growth</div>
                <div class="growth-entry-sub">${vocabCount || 0} words · ${grammarCount || 0} grammar points · ${canDoCount || 0} Can-Dos</div>
            </div>
            <div class="growth-entry-arrow">→</div>
        </div>`;
}

function enterMyGrowth() {
    showScreen("myGrowthScreen");
    loadMyGrowthScreen();
}

function exitMyGrowth() {
    showScreen("readingLevelsScreen");
    renderReadingLevelsList();
}

async function loadMyGrowthScreen() {
    const levels = await fetchReadingLevels();
    const chapterTitleByLevel = {};
    levels.forEach(l => { chapterTitleByLevel[l.level_number] = l.title; });

    await Promise.all([
        renderGrowthToday(chapterTitleByLevel),
        renderGrowthVocab(chapterTitleByLevel),
        renderGrowthGrammar(chapterTitleByLevel),
        renderGrowthCanDo()
    ]);
}

async function renderGrowthToday(chapterTitleByLevel) {
    const mount = document.getElementById('growthTodayMount');
    if (!mount) return;
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading...</p>`;

    const todayISO = startOfTodayISO();

    const [{ data: lessonRows }, { data: vocabRows }, { data: canDoRows }] = await Promise.all([
        _supabase.from('chapter_lesson_progress').select('lesson_id, completed_at')
            .eq('student_id', currentUser.id).gte('completed_at', todayISO),
        _supabase.from('reading_vocab_progress').select('vocab_id, reviewed_at')
            .eq('student_id', currentUser.id).eq('is_known', true).gte('reviewed_at', todayISO),
        _supabase.from('can_do_progress').select('statement_key, self_assessed_at')
            .eq('student_id', currentUser.id).gte('self_assessed_at', todayISO)
    ]);

    const rows = [];

    if (lessonRows?.length) {
        const allLessons = await fetchAllLessons();
        lessonRows.forEach(row => {
            const lesson = allLessons.find(l => l.id === row.lesson_id);
            const chapterTitle = lesson ? chapterTitleByLevel[lesson.level_number] : null;
            rows.push({
                icon: '📖',
                text: lesson
                    ? `Completed ${lesson.is_challenge ? 'the Chapter Challenge' : lesson.title}${chapterTitle ? ` · ${chapterTitle}` : ''}`
                    : 'Completed a lesson'
            });
        });
    }

    if (vocabRows?.length) {
        rows.push({ icon: '🔤', text: `Learned ${vocabRows.length} new word${vocabRows.length === 1 ? '' : 's'}` });
    }

    if (canDoRows?.length) {
        canDoRows.forEach(row => {
            const statement = CAN_DO_STATEMENTS.find(s => s.key === row.statement_key);
            rows.push({ icon: '✅', text: `Checked off "${statement?.text || row.statement_key}"` });
        });
    }

    const dateLabel = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric' });

    mount.innerHTML = `
        <div class="growth-today-strip">
            <div class="growth-today-date">${dateLabel}</div>
            ${rows.length
                ? rows.map(r => `<div class="growth-today-row"><span class="growth-today-icon">${r.icon}</span> ${r.text}</div>`).join('')
                : `<div class="growth-today-empty">Nothing yet today. Pick a lesson to get started!</div>`}
        </div>`;
}

async function renderGrowthVocab(chapterTitleByLevel) {
    const mount = document.getElementById('growthVocabMount');
    const countEl = document.getElementById('growthVocabCount');
    if (!mount) return;
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading...</p>`;

    const { data: progressRows } = await _supabase
        .from('reading_vocab_progress')
        .select('vocab_id')
        .eq('student_id', currentUser.id)
        .eq('is_known', true);

    const vocabIds = (progressRows || []).map(r => r.vocab_id);
    if (countEl) countEl.innerText = `${vocabIds.length} word${vocabIds.length === 1 ? '' : 's'}`;

    if (vocabIds.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No words marked known yet. They'll show up here as you work through lessons.</p>`;
        return;
    }

    const { data: words } = await _supabase
        .from('reading_vocab')
        .select('id, level_number, amharic_word, transliteration, english_meaning')
        .in('id', vocabIds);

    const byLevel = {};
    (words || []).forEach(w => {
        if (!byLevel[w.level_number]) byLevel[w.level_number] = [];
        byLevel[w.level_number].push(w);
    });

    mount.innerHTML = Object.keys(byLevel).sort((a, b) => a - b).map(levelNumber => {
        const chapterWords = byLevel[levelNumber];
        const chapterTitle = chapterTitleByLevel[levelNumber] || `Chapter ${levelNumber}`;
        return `
            <div class="growth-vocab-chapter">
                <div class="growth-vocab-chapter-title">${chapterTitle}</div>
                <div class="vocab-grid">
                    ${chapterWords.map(w => `
                        <div class="vocab-chip">
                            <div class="vocab-chip-word">${w.amharic_word}</div>
                            <div class="vocab-chip-meaning">${w.english_meaning}</div>
                        </div>
                    `).join('')}
                </div>
                <button type="button" class="vocab-review-btn" onclick="reviewGrowthVocabDeck(${levelNumber})">🗂️ Review as Flashcards</button>
            </div>`;
    }).join('');

    _growthVocabByLevel = byLevel;
}

let _growthVocabByLevel = {};

function reviewGrowthVocabDeck(levelNumber) {
    const words = _growthVocabByLevel[levelNumber] || [];
    if (words.length === 0) return;
    const deck = words.map(w => ({ char: w.amharic_word, sound: w.english_meaning }));
    document.getElementById('myGrowthScreen').style.display = 'none';
    openFlashcardStudy(deck, 'My Growth Vocabulary', () => {
        document.getElementById('myGrowthScreen').style.display = 'block';
    });
}

async function renderGrowthGrammar(chapterTitleByLevel) {
    const mount = document.getElementById('growthGrammarMount');
    const countEl = document.getElementById('growthGrammarCount');
    if (!mount) return;
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading...</p>`;

    const { data: progressRows } = await _supabase
        .from('reading_item_progress')
        .select('item_id')
        .eq('student_id', currentUser.id)
        .eq('has_understood_grammar', true);

    const itemIds = (progressRows || []).map(r => r.item_id);

    if (itemIds.length === 0) {
        if (countEl) countEl.innerText = 0;
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No grammar notes reached yet. They'll show up here as you read through lessons.</p>`;
        return;
    }

    const { data: items } = await _supabase
        .from('reading_items')
        .select('id, level_number, lesson_order, label, grammar_note')
        .in('id', itemIds)
        .not('grammar_note', 'is', null);

    // Count from the same filtered list being rendered, not the raw
    // progress-row count — some completed items have no grammar_note yet,
    // and the label should never claim more cards than actually show.
    if (countEl) countEl.innerText = (items || []).length;

    mount.innerHTML = (items || []).map(item => `
        <div class="grammar-card">
            <div class="grammar-pattern">${item.label || 'Grammar note'}</div>
            <div class="grammar-note">${item.grammar_note}</div>
            <div class="grammar-lesson-tag">${chapterTitleByLevel[item.level_number] || `Chapter ${item.level_number}`} · Lesson ${item.lesson_order}</div>
        </div>
    `).join('');
}

async function renderGrowthCanDo() {
    const mount = document.getElementById('growthCanDoMount');
    if (!mount) return;
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading...</p>`;

    const progressMap = await loadCanDoProgressMapWithAutoCheck();
    const doneKeys = Object.keys(progressMap).filter(key => candoIsDone(progressMap[key]));
    const total = CAN_DO_STATEMENTS.length;
    const percent = total ? Math.round((doneKeys.length / total) * 100) : 0;

    const categories = [...new Set(CAN_DO_STATEMENTS.map(s => s.category))];
    const catRows = categories.map(category => {
        const inCategory = CAN_DO_STATEMENTS.filter(s => s.category === category);
        const doneInCategory = inCategory.filter(s => candoIsDone(progressMap[s.key])).length;
        return `<div class="candoo-cat-row"><span>${category}</span><span class="candoo-cat-count">${doneInCategory} / ${inCategory.length}</span></div>`;
    }).join('');

    mount.innerHTML = `
        <div class="candoo-summary-card">
            <div class="candoo-summary-top">
                <span class="candoo-summary-count">${doneKeys.length}</span>
                <span class="candoo-summary-of">of ${total} checked off</span>
            </div>
            <div class="candoo-summary-track"><div class="candoo-summary-fill" style="width:${percent}%;"></div></div>
            ${catRows}
        </div>`;
}

// -----------------------------------------------------------------------------
// Expose functions used via inline onclick="" handlers in index.html
// -----------------------------------------------------------------------------

window.enterAmharicPath = enterAmharicPath;
window.exitAmharicPath = exitAmharicPath;
window.submitFidelGateAnswer = submitFidelGateAnswer;
window.openAmharicPathChooser = openAmharicPathChooser;
window.openAllChaptersFromStudyTogether = openAllChaptersFromStudyTogether;
window.exitChapterList = exitChapterList;
window.chooseAmharicPathMode = chooseAmharicPathMode;
window.continueChapterFromStudyTogether = continueChapterFromStudyTogether;
window.postChapterFeedUpdate = postChapterFeedUpdate;
window.exitReadingLevelDetail = exitReadingLevelDetail;
window.openLessonPicker = openLessonPicker;
window.renderCheckpointSection = renderCheckpointSection;
window.closeChapterGoals = closeChapterGoals;
window.goToPrevLesson = goToPrevLesson;
window.restartCurrentChapter = restartCurrentChapter;
window.fetchAllLessons = fetchAllLessons;
window.fetchMyLessonProgressAll = fetchMyLessonProgressAll;
window.renderGrowthEntryCard = renderGrowthEntryCard;
window.enterMyGrowth = enterMyGrowth;
window.exitMyGrowth = exitMyGrowth;
window.reviewGrowthVocabDeck = reviewGrowthVocabDeck;

// =============================================================================
// WORD BUILDER — js/wordbuilder.js
// Self-paced reading path, independent of Fidel Competition's team/level
// progress but loosely mirrors its 12 levels' letter families, paired up
// two at a time into 6 Word Builder levels. The card itself is always
// open — each individual LEVEL unlocks on its own once
// the student has learned that level's letters, checked primarily
// against Fidel Practice (available to every student, team or solo)
// with Competition's streak progress also counting if they have it.
//
// Loads AFTER app.js/reading.js — relies on globals defined there:
//   _supabase, currentUser, currentProfile, showNotificationToast, showScreen
// =============================================================================

// Each Word Builder level pairs TWO Competition levels' families (6
// letters, 42 characters) rather than one (3 letters, 21 characters) —
// three letters alone turned out too sparse to write real words with,
// confirmed while drafting actual Level 1 content. Built from the real
// challenge_levels.letter_families data, paired up: (1,2) (3,4) (5,6)
// (7,8) (9,10) (11,12). Level 12 only has one letter (ፐ), so the last
// pair is 4 letters instead of 6.
const WORD_BUILDER_LEVEL_LETTERS = {
    1: ['ሀ', 'ለ', 'ሐ', 'መ', 'ሠ', 'ረ'],
    2: ['ሰ', 'ሸ', 'ቀ', 'በ', 'ቨ', 'ተ'],
    3: ['ቸ', 'ኀ', 'ነ', 'ኘ', 'አ', 'ከ'],
    4: ['ኸ', 'ወ', 'ዐ', 'ዘ', 'ዠ', 'የ'],
    5: ['ደ', 'ጀ', 'ገ', 'ጠ', 'ጨ', 'ጰ'],
    6: ['ጸ', 'ፀ', 'ፈ', 'ፐ']
};

let wordBuilderCurrentLevel = null;
let wordBuilderWords = [];
let wordBuilderReadWordIds = new Set();
let wordBuilderIndex = 0;
let wordBuilderSentencesByWordId = {};
let wordBuilderSentenceForWordId = null;
let wordBuilderSentenceTapped = new Set();  // indices into this word's gloss array the learner has tapped

// One challenge at a time, Duolingo-style, instead of one busy page: each
// word walks through the same fixed sequence, one screen per step, so the
// learner only ever thinks about the thing in front of them. A step is
// skipped automatically when its content doesn't exist yet for a word
// (no picture authored, no sentence authored, not enough other words in
// the level to build a believable multiple-choice match) rather than
// showing a broken or trivial step.
const WORD_BUILDER_STEPS = ['build', 'picture', 'sentence', 'flashcard', 'spell', 'match'];
let wordBuilderStepIndex = 0;
let wordBuilderFlashcardFlipped = false;
let wordBuilderSpellForWordId = null;
let wordBuilderSpellPool = [];   // [{ch, placed}], shuffled once per word
let wordBuilderSpellSlots = [];  // per-slot: index into wordBuilderSpellPool, or null
let wordBuilderMatchChoicesForWordId = null;
let wordBuilderMatchChoices = [];

// ---------------------------------------------------------------------------
// Per-level unlock check
// ---------------------------------------------------------------------------

// Returns a Set of level numbers (1-12) the student has earned access to —
// a level counts as unlocked once every one of its letters is either
// mastered in Fidel Practice or streak-passed in Fidel Competition.
async function getWordBuilderUnlockedLevels() {
    if (!currentUser) return new Set();

    const [{ data: familyRows }, { data: practiceRow }] = await Promise.all([
        _supabase.from('student_family_progress')
            .select('base_letter, streak_passed')
            .eq('student_id', currentUser.id),
        _supabase.from('user_progress')
            .select('mastered_letters')
            .eq('user_id', currentUser.id)
            .maybeSingle()
    ]);

    const streakPassedLetters = new Set((familyRows || []).filter(r => r.streak_passed).map(r => r.base_letter));
    const masteredLetters = new Set(practiceRow?.mastered_letters || []);

    const unlocked = new Set();
    Object.keys(WORD_BUILDER_LEVEL_LETTERS).forEach(levelKey => {
        const levelNumber = Number(levelKey);
        const knowsAll = WORD_BUILDER_LEVEL_LETTERS[levelNumber].every(
            letter => streakPassedLetters.has(letter) || masteredLetters.has(letter)
        );
        if (knowsAll) unlocked.add(levelNumber);
    });
    return unlocked;
}

// ---------------------------------------------------------------------------
// Entry point — the card itself is always open now; individual levels
// carry their own lock state inside the list.
// ---------------------------------------------------------------------------

function enterWordBuilder() {
    showScreen('wordBuilderLevelsScreen');
    renderWordBuilderLevelsList();
}
window.enterWordBuilder = enterWordBuilder;

// ---------------------------------------------------------------------------
// Level list
// ---------------------------------------------------------------------------

async function renderWordBuilderLevelsList() {
    const mount = document.getElementById('wordBuilderLevelsMount');
    if (!mount) return;
    mount.innerHTML = '<p style="color:#94a3b8; font-size:13px;">Loading...</p>';

    const [{ data: levels }, { data: wordRows }, { data: levelProgress }, unlockedLevels] = await Promise.all([
        _supabase.from('word_builder_levels').select('level_number, topic_title').order('level_number'),
        _supabase.from('word_builder_words').select('id, level_number'),
        _supabase.from('word_builder_level_progress').select('level_number').eq('student_id', currentUser.id),
        getWordBuilderUnlockedLevels()
    ]);

    if (!levels || levels.length === 0) {
        mount.innerHTML = '<p style="color:#94a3b8; font-size:13px;">No levels set up yet, check back soon.</p>';
        return;
    }

    const wordCountByLevel = {};
    (wordRows || []).forEach(w => { wordCountByLevel[w.level_number] = (wordCountByLevel[w.level_number] || 0) + 1; });

    const completedLevels = new Set((levelProgress || []).map(r => r.level_number));

    mount.innerHTML = levels.map(level => {
        const done = completedLevels.has(level.level_number);
        const hasWords = (wordCountByLevel[level.level_number] || 0) > 0;
        const practiceUnlocked = unlockedLevels.has(level.level_number);
        const locked = !done && !practiceUnlocked;
        const clickable = !locked && hasWords;

        const stateIcon = done ? '✓' : (locked ? icon('lock', { color: '#94a3b8' }) : level.level_number);
        const numBg = done ? 'rgba(22,101,52,0.1)' : (locked ? '#e2e8f0' : '#fffbeb');
        const numColor = done ? '#166534' : (locked ? '#94a3b8' : '#d97706');

        let subLabel;
        if (!practiceUnlocked && !done) {
            subLabel = `${icon('lock', { color: '#94a3b8' })} ${WORD_BUILDER_LEVEL_LETTERS[level.level_number].join(' ')}`;
        } else if (!hasWords) {
            subLabel = 'Coming soon';
        } else {
            subLabel = `${wordCountByLevel[level.level_number]} words`;
        }

        return `
            <div class="word-builder-level-row" style="display:flex; align-items:center; gap:12px; background:white;
                        border:1px solid #e2e8f0; border-radius:14px; padding:12px 14px; margin-bottom:9px;
                        ${!clickable ? 'opacity:0.6;' : 'cursor:pointer;'}"
                 ${clickable ? `onclick="openWordBuilderLevel(${level.level_number})"` : ''}>
                <div style="width:32px; height:32px; border-radius:10px; display:flex; align-items:center; justify-content:center;
                            font-weight:800; font-size:13px; flex-shrink:0; background:${numBg}; color:${numColor};">${stateIcon}</div>
                <div style="flex:1;">
                    <div style="font-size:13.5px; font-weight:700; color:#1e293b;">${level.level_number}${level.topic_title ? ` · ${level.topic_title}` : ''}</div>
                    <div style="font-size:11px; color:#94a3b8; margin-top:1px;">${subLabel}</div>
                </div>
                ${done ? '<span style="font-size:15px; color:#166534;">✓</span>' : ''}
            </div>`;
    }).join('');
}
window.renderWordBuilderLevelsList = renderWordBuilderLevelsList;

// ---------------------------------------------------------------------------
// Inside a level — one word at a time
// ---------------------------------------------------------------------------

async function openWordBuilderLevel(levelNumber) {
    const { data: level } = await _supabase
        .from('word_builder_levels')
        .select('level_number, topic_title')
        .eq('level_number', levelNumber)
        .maybeSingle();

    const { data: words } = await _supabase
        .from('word_builder_words')
        .select('id, item_order, amharic_text, transliteration, english_meaning, grammar_note, emoji')
        .eq('level_number', levelNumber)
        .order('item_order');

    const { data: progress } = await _supabase
        .from('word_builder_progress')
        .select('word_id')
        .eq('student_id', currentUser.id);

    const wordIds = (words || []).map(w => w.id);
    const { data: sentenceRows } = wordIds.length
        ? await _supabase.from('word_builder_sentences')
            .select('id, word_id, amharic_sentence, translation, grammar_notice')
            .in('word_id', wordIds)
        : { data: [] };

    const sentenceIds = (sentenceRows || []).map(s => s.id);
    const { data: glossRows } = sentenceIds.length
        ? await _supabase.from('word_builder_sentence_glosses')
            .select('sentence_id, item_order, amharic_chunk, transliteration, gloss_meaning, is_target')
            .in('sentence_id', sentenceIds)
            .order('item_order')
        : { data: [] };

    wordBuilderCurrentLevel = level;
    wordBuilderWords = words || [];
    wordBuilderReadWordIds = new Set((progress || []).map(r => r.word_id));
    wordBuilderSentencesByWordId = {};
    (sentenceRows || []).forEach(s => {
        wordBuilderSentencesByWordId[s.word_id] = {
            ...s,
            glosses: (glossRows || []).filter(g => g.sentence_id === s.id)
        };
    });

    if (wordBuilderWords.length === 0) {
        showScreen('wordBuilderLessonScreen');
        document.getElementById('wordBuilderLessonCrumb').innerText = `LEVEL ${levelNumber}`;
        document.getElementById('wordBuilderLessonMount').innerHTML =
            '<p style="color:#94a3b8; font-size:13px; text-align:center; margin-top:40px;">No words in this level yet, check back soon.</p>';
        return;
    }

    wordBuilderIndex = wordBuilderWords.findIndex(w => !wordBuilderReadWordIds.has(w.id));
    if (wordBuilderIndex === -1) wordBuilderIndex = 0;

    showScreen('wordBuilderLessonScreen');
    renderWordBuilderWordCard();
}
window.openWordBuilderLevel = openWordBuilderLevel;

function renderWordBuilderWordCard() {
    wordBuilderStepIndex = 0;
    wordBuilderFlashcardFlipped = false;
    renderWordBuilderStep();
}

// A step is skipped when its content doesn't exist for this word — rather
// than rendering a broken or trivial screen — so the sequence gracefully
// shrinks to whatever content has actually been authored.
function wordBuilderStepShouldSkip(word, stepName) {
    if (stepName === 'picture') return !word.emoji;
    if (stepName === 'sentence') {
        const s = wordBuilderSentencesByWordId[word.id];
        return !s || !s.glosses || s.glosses.length === 0;
    }
    if (stepName === 'match') {
        if (!word.emoji) return true;
        const distractorPool = wordBuilderWords.filter(w => w.id !== word.id && w.emoji);
        return distractorPool.length < 3;
    }
    return false;
}

// Central dispatcher — one screen per step, like a level in a game rather
// than a page of reading. advanceWordBuilderStep() below just increments
// wordBuilderStepIndex and calls back in here.
function renderWordBuilderStep() {
    const crumb = document.getElementById('wordBuilderLessonCrumb');
    const mount = document.getElementById('wordBuilderLessonMount');
    if (!crumb || !mount) return;

    const level = wordBuilderCurrentLevel;
    const word = wordBuilderWords[wordBuilderIndex];

    while (wordBuilderStepIndex < WORD_BUILDER_STEPS.length &&
           wordBuilderStepShouldSkip(word, WORD_BUILDER_STEPS[wordBuilderStepIndex])) {
        wordBuilderStepIndex++;
    }

    if (wordBuilderStepIndex >= WORD_BUILDER_STEPS.length) {
        finishWordBuilderWord();
        return;
    }

    crumb.innerText = `LEVEL ${level.level_number}${level.topic_title ? ` · ${level.topic_title.toUpperCase()}` : ''}`;

    const stepName = WORD_BUILDER_STEPS[wordBuilderStepIndex];
    const stepBuilders = {
        build: wbStepBuildHtml,
        picture: wbStepPictureHtml,
        sentence: wbStepSentenceHtml,
        flashcard: wbStepFlashcardHtml,
        spell: wbStepSpellHtml,
        match: wbStepMatchHtml
    };
    const dots = WORD_BUILDER_STEPS.map((_, i) => `
        <span style="width:7px; height:7px; border-radius:50%; background:${
            i === wordBuilderStepIndex ? '#166534' : (i < wordBuilderStepIndex ? '#86efac' : '#e2e8f0')
        };"></span>
    `).join('');

    mount.innerHTML = `
        ${stepBuilders[stepName](word)}
        <div style="display:flex; justify-content:center; gap:6px; margin-top:20px;">${dots}</div>
        <p style="font-size:11px; color:#cbd5e1; text-align:center; margin-top:6px;">Word ${wordBuilderIndex + 1} of ${wordBuilderWords.length}</p>
    `;
}

function advanceWordBuilderStep() {
    wordBuilderStepIndex++;
    renderWordBuilderStep();
}
window.advanceWordBuilderStep = advanceWordBuilderStep;

// Step 1 — Build: the word, its breakdown into letters, "I Built It".
function wbStepBuildHtml(word) {
    // Ethiopic syllables are each a single Unicode code point already, so
    // splitting the string into an array of characters is enough to get
    // one chip per Fidel character — no combining marks to worry about.
    const letters = Array.from(word.amharic_text.replace(/\s+/g, ''));
    return `
        <div style="background:white; border:1px solid #e2e8f0; border-radius:18px; padding:30px 20px;
                    text-align:center; box-shadow:0 4px 20px rgba(20,83,45,0.07);">
            <div style="font-family:'Abyssinica SIL',serif; font-size:44px; color:#1e293b; margin-bottom:10px;">${word.amharic_text}</div>
            ${word.transliteration ? `<div style="font-size:13px; color:#64748b; margin-bottom:4px;">${word.transliteration}</div>` : ''}
            ${word.english_meaning ? `<div style="font-size:13.5px; color:#94a3b8; font-style:italic;">"${word.english_meaning}"</div>` : ''}
            <div style="display:flex; flex-wrap:wrap; gap:6px; justify-content:center; align-items:center; margin-top:16px;">
                ${letters.map((ch, i) => `${i > 0 ? '<span style="color:#cbd5e1; font-size:16px; font-weight:700;">+</span>' : ''}<span style="font-family:'Abyssinica SIL',serif; font-size:20px; background:#fffbeb; color:#d97706; border-radius:10px; padding:6px 12px; cursor:pointer;" onclick="showWordBuilderLetterInfo('${ch}')">${ch}</span>`).join('')}
            </div>
            <div style="font-size:10px; color:#cbd5e1; margin-top:8px;">tap a letter to hear how it fits in</div>
        </div>
        ${word.grammar_note ? `
        <div style="background:#eef2ff; border:1px solid #c7d2fe; border-radius:14px; padding:14px 16px; margin-top:14px;">
            <div style="font-size:10.5px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#4f46e5; margin-bottom:5px;">Why this word looks this way</div>
            <div style="font-size:13px; color:#3730a3; line-height:1.5;">${word.grammar_note}</div>
        </div>` : ''}
        <button class="btn-primary" style="width:100%; margin-top:16px;" onclick="advanceWordBuilderStep()">I Built It</button>
    `;
}

// Step 2 — Picture: the payoff for building the word, shown as a small
// celebration (not just a label) so the picture becomes the memory anchor
// every later step leans on.
const WORD_BUILDER_CELEBRATE_LINES = [
    "Great! You built your first word.",
    "Nice! You've got this word now.",
    "That's another word you can read.",
    "You're building real vocabulary."
];

function wbStepPictureHtml(word) {
    const meaning = word.english_meaning ? word.english_meaning.charAt(0).toUpperCase() + word.english_meaning.slice(1) : '';
    const celebrateLine = wordBuilderIndex === 0
        ? WORD_BUILDER_CELEBRATE_LINES[0]
        : WORD_BUILDER_CELEBRATE_LINES[Math.min(wordBuilderIndex, WORD_BUILDER_CELEBRATE_LINES.length - 1)];
    return `
        <div style="background:white; border:1px solid #e2e8f0; border-radius:18px; padding:44px 20px;
                    text-align:center; box-shadow:0 4px 20px rgba(20,83,45,0.07);">
            <div style="font-size:64px; margin-bottom:14px;">${word.emoji}</div>
            <div style="font-family:'Abyssinica SIL',serif; font-size:32px; color:#1e293b; margin-bottom:6px;">${word.amharic_text}</div>
            ${word.transliteration ? `<div style="font-size:13px; color:#94a3b8; margin-bottom:6px;">${word.transliteration}</div>` : ''}
            ${meaning ? `<div style="font-size:15px; font-weight:700; color:#166534;">${meaning}</div>` : ''}
        </div>
        <p style="font-size:12.5px; color:#94a3b8; text-align:center; margin-top:12px;">${celebrateLine}</p>
        <button class="btn-primary" style="width:100%; margin-top:6px;" onclick="advanceWordBuilderStep()">Continue</button>
    `;
}

// Step 3 — Sentence: tap each word to explore what it means, one at a
// time, instead of a single reveal-everything button. The translation and
// grammar note only show up once every word's been tapped — so the
// grammar note answers a question the learner has actually just had
// ("why does the verb come last?"), instead of being dumped up front.
function wbStepSentenceHtml(word) {
    const sentence = wordBuilderSentencesByWordId[word.id];

    if (wordBuilderSentenceForWordId !== word.id) {
        wordBuilderSentenceForWordId = word.id;
        wordBuilderSentenceTapped = new Set();
    }

    const allTapped = sentence.glosses.every((_, i) => wordBuilderSentenceTapped.has(i));

    return `
        <div style="background:#f7f5ef; border:1px solid #e2e8f0; border-radius:14px; padding:20px 16px;">
            <div style="font-size:10.5px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#94a3b8; margin-bottom:14px; text-align:center;">See it in a sentence</div>
            <div style="display:flex; flex-wrap:wrap; justify-content:center; gap:14px;">
                ${sentence.glosses.map((g, i) => `
                    <div onclick="tapWordBuilderSentenceWord(${i})" style="cursor:pointer; text-align:center; min-width:44px;">
                        <div style="font-family:'Abyssinica SIL',serif; font-size:24px; color:${wordBuilderSentenceTapped.has(i) ? '#166534' : '#1e293b'};">${g.amharic_chunk}</div>
                        <div style="font-size:11px; color:#94a3b8; min-height:14px; margin-top:2px;">${wordBuilderSentenceTapped.has(i) ? g.gloss_meaning : ''}</div>
                    </div>
                `).join('')}
            </div>
            ${!allTapped ? `<p style="font-size:11.5px; color:#94a3b8; text-align:center; margin-top:10px;">Tap each word to see what it means</p>` : ''}
            ${allTapped ? `
                <div style="border-top:1px solid #e2e8f0; margin-top:16px; padding-top:14px;">
                    <div style="font-size:13.5px; color:#64748b; text-align:center; font-style:italic; margin-bottom:${sentence.grammar_notice ? '12px' : '0'};">"${sentence.translation}"</div>
                    ${sentence.grammar_notice ? `<div style="font-size:12.5px; color:#78350f; background:#fffbeb; border:1px solid #fde68a; border-radius:10px; padding:10px 12px;">💡 ${sentence.grammar_notice}</div>` : ''}
                </div>
            ` : ''}
        </div>
        ${allTapped ? `<button class="btn-primary" style="width:100%; margin-top:16px;" onclick="advanceWordBuilderStep()">Continue</button>` : ''}
    `;
}

function tapWordBuilderSentenceWord(i) {
    wordBuilderSentenceTapped.add(i);
    renderWordBuilderStep();
}
window.tapWordBuilderSentenceWord = tapWordBuilderSentenceWord;

// Step 4 — Flashcard: front is the picture (or the word itself if this
// word has no picture yet), back is word + transliteration + meaning.
function wbStepFlashcardHtml(word) {
    const front = word.emoji
        ? `<div style="font-size:64px;">${word.emoji}</div>`
        : `<div style="font-family:'Abyssinica SIL',serif; font-size:40px; color:#1e293b;">${word.amharic_text}</div>`;
    const back = `
        ${word.emoji ? `<div style="font-size:44px; margin-bottom:8px;">${word.emoji}</div>` : ''}
        <div style="font-family:'Abyssinica SIL',serif; font-size:32px; color:#1e293b; margin-bottom:6px;">${word.amharic_text}</div>
        ${word.transliteration ? `<div style="font-size:13px; color:#64748b; margin-bottom:4px;">${word.transliteration}</div>` : ''}
        ${word.english_meaning ? `<div style="font-size:15px; font-weight:700; color:#166534;">${word.english_meaning}</div>` : ''}
    `;
    return `
        <div onclick="flipWordBuilderFlashcard()"
             style="background:white; border:1px solid #e2e8f0; border-radius:18px; padding:44px 20px; text-align:center;
                    box-shadow:0 4px 20px rgba(20,83,45,0.07); cursor:pointer; min-height:160px;
                    display:flex; flex-direction:column; align-items:center; justify-content:center;">
            ${wordBuilderFlashcardFlipped ? back : front}
        </div>
        <p style="font-size:11px; color:#94a3b8; text-align:center; margin-top:10px;">${wordBuilderFlashcardFlipped ? 'Tap to flip back' : 'Tap the card to flip it'}</p>
        ${wordBuilderFlashcardFlipped ? `<button class="btn-primary" style="width:100%; margin-top:6px;" onclick="advanceWordBuilderStep()">Continue</button>` : ''}
    `;
}

function flipWordBuilderFlashcard() {
    wordBuilderFlashcardFlipped = !wordBuilderFlashcardFlipped;
    renderWordBuilderStep();
}
window.flipWordBuilderFlashcard = flipWordBuilderFlashcard;

// Step 5 — Spell: tap letter tiles into slots in order (tap-to-place
// rather than literal drag-and-drop — the standard mobile-friendly
// substitute; real HTML5 drag events are unreliable on touch, and this is
// the same interaction Duolingo itself actually uses). Tap a filled slot
// to send its tile back to the pool.
function wbStepSpellHtml(word) {
    const letters = Array.from(word.amharic_text.replace(/\s+/g, ''));

    if (wordBuilderSpellForWordId !== word.id) {
        wordBuilderSpellForWordId = word.id;
        wordBuilderSpellPool = wordBuilderShuffle(letters.map(ch => ({ ch, placed: false })));
        wordBuilderSpellSlots = new Array(letters.length).fill(null);
    }

    const allPlaced = wordBuilderSpellSlots.every(s => s !== null);
    const isCorrect = allPlaced &&
        wordBuilderSpellSlots.map(i => wordBuilderSpellPool[i].ch).join('') === letters.join('');

    return `
        <div style="background:white; border:1px solid #e2e8f0; border-radius:18px; padding:26px 20px;
                    text-align:center; box-shadow:0 4px 20px rgba(20,83,45,0.07);">
            ${word.emoji ? `
                <div style="font-size:48px; margin-bottom:8px;">${word.emoji}</div>
                <div style="font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#94a3b8; margin-bottom:16px;">Build this word</div>
            ` : `
                <div style="font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#94a3b8; margin-bottom:16px;">Spell "${word.english_meaning || word.amharic_text}"</div>
            `}
            <div style="display:flex; justify-content:center; gap:8px; margin-bottom:22px; flex-wrap:wrap;">
                ${wordBuilderSpellSlots.map((poolIdx, slotIdx) => `
                    <div ${poolIdx !== null ? `onclick="unplaceWordBuilderSpellTile(${slotIdx})"` : ''}
                         style="width:44px; height:52px; border:2px ${poolIdx !== null ? 'solid #166534' : 'dashed #cbd5e1'}; border-radius:10px;
                                display:flex; align-items:center; justify-content:center; font-family:'Abyssinica SIL',serif; font-size:22px;
                                background:${poolIdx !== null ? '#f0fdf4' : '#fafaf9'}; cursor:${poolIdx !== null ? 'pointer' : 'default'};">
                        ${poolIdx !== null ? wordBuilderSpellPool[poolIdx].ch : ''}
                    </div>
                `).join('')}
            </div>
            <div style="display:flex; justify-content:center; gap:8px; flex-wrap:wrap;">
                ${wordBuilderSpellPool.map((tile, i) => tile.placed ? '' : `
                    <button onclick="placeWordBuilderSpellTile(${i})"
                            style="width:44px; height:44px; border:1px solid #e2e8f0; border-radius:10px; background:#fffbeb; color:#d97706;
                                   font-family:'Abyssinica SIL',serif; font-size:20px; cursor:pointer;">${tile.ch}</button>
                `).join('')}
            </div>
        </div>
        ${allPlaced ? (isCorrect
            ? `<p style="text-align:center; color:#166534; font-weight:700; font-size:13px; margin-top:12px;">✓ That's it!</p>
               <button class="btn-primary" style="width:100%; margin-top:6px;" onclick="advanceWordBuilderStep()">Continue</button>`
            : `<p style="text-align:center; color:#dc2626; font-weight:700; font-size:13px; margin-top:12px;">Not quite. Tap a tile to take it back.</p>`)
        : ''}
    `;
}

function placeWordBuilderSpellTile(poolIdx) {
    const slotIdx = wordBuilderSpellSlots.findIndex(s => s === null);
    if (slotIdx === -1) return;
    wordBuilderSpellPool[poolIdx].placed = true;
    wordBuilderSpellSlots[slotIdx] = poolIdx;
    renderWordBuilderStep();
}
window.placeWordBuilderSpellTile = placeWordBuilderSpellTile;

function unplaceWordBuilderSpellTile(slotIdx) {
    const poolIdx = wordBuilderSpellSlots[slotIdx];
    if (poolIdx === null) return;
    wordBuilderSpellPool[poolIdx].placed = false;
    wordBuilderSpellSlots[slotIdx] = null;
    renderWordBuilderStep();
}
window.unplaceWordBuilderSpellTile = unplaceWordBuilderSpellTile;

// Step 6 — Match: the final victory. This word plus 3 picture distractors
// from the same level, prompted by the WORD itself (not the picture) so
// the learner has to recall the picture from the Fidel text — the
// opposite retrieval direction from every step before it. A correct tap
// gets its own "quest complete" beat instead of just advancing straight
// through.
function wbStepMatchHtml(word) {
    if (wordBuilderMatchChoicesForWordId !== word.id) {
        wordBuilderMatchChoicesForWordId = word.id;
        const distractors = wordBuilderShuffle(wordBuilderWords.filter(w => w.id !== word.id && w.emoji)).slice(0, 3);
        wordBuilderMatchChoices = wordBuilderShuffle([word, ...distractors]);
    }

    return `
        <div style="text-align:center;">
            <div style="font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#94a3b8; margin-bottom:8px;">Which picture is</div>
            <div style="font-family:'Abyssinica SIL',serif; font-size:30px; color:#1e293b; margin-bottom:20px;">${word.amharic_text}</div>
            <div id="wbMatchChoices" style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                ${wordBuilderMatchChoices.map(c => `
                    <button onclick="answerWordBuilderMatchStep(this, '${c.id}')"
                            style="font-size:44px; padding:22px; background:white; border:1px solid #e2e8f0;
                                   border-radius:14px; cursor:pointer;">${c.emoji}</button>
                `).join('')}
            </div>
        </div>
    `;
}

function answerWordBuilderMatchStep(btnEl, chosenId) {
    const word = wordBuilderWords[wordBuilderIndex];
    const buttons = document.querySelectorAll('#wbMatchChoices button');
    buttons.forEach(btn => btn.setAttribute('disabled', 'true'));

    if (chosenId === word.id) {
        btnEl.style.borderColor = '#166534';
        btnEl.style.background = 'rgba(22,101,52,0.08)';
        setTimeout(() => renderWordBuilderMatchSuccess(), 500);
    } else {
        btnEl.style.borderColor = '#dc2626';
        btnEl.style.background = 'rgba(220,38,38,0.06)';
        setTimeout(() => buttons.forEach(btn => btn.removeAttribute('disabled')), 700);
    }
}
window.answerWordBuilderMatchStep = answerWordBuilderMatchStep;

function renderWordBuilderMatchSuccess() {
    const mount = document.getElementById('wordBuilderLessonMount');
    if (mount) {
        mount.innerHTML = `
            <div style="text-align:center; padding:40px 20px;">
                <div style="font-size:44px; margin-bottom:10px;">✨</div>
                <div style="font-size:18px; font-weight:800; color:#166534;">Correct!</div>
                <div style="font-size:13px; color:#94a3b8; margin-top:6px;">Word Complete ✓</div>
            </div>
        `;
    }
    setTimeout(() => advanceWordBuilderStep(), 1100);
}

// Looks up which family/pronunciation a tapped syllable belongs to, reusing
// the same verified alphabetData/vowel-label tables Fidel Practice uses
// (js/app.js) rather than a separate, unverified lookup for Word Builder.
function getWordBuilderLetterInfo(ch) {
    for (const fam of alphabetData) {
        const idx = fam.family.indexOf(ch);
        if (idx !== -1) {
            const phonetic = (fam.prefix === 'h' || fam.prefix === 'ḥ')
                ? vowelFrameworkLabels[idx]
                : `${fam.prefix}${standardVowelSubscripts[idx]}`;
            return { base: fam.base, phonetic };
        }
    }
    return null;
}

function showWordBuilderLetterInfo(ch) {
    const info = getWordBuilderLetterInfo(ch);
    if (!info) return;
    showNotificationToast(`${ch} = "${info.phonetic}" · ${info.base} family in Fidel Practice`);
}
window.showWordBuilderLetterInfo = showWordBuilderLetterInfo;

// Called once a word has run through every step of its sequence — replaces
// the old manual "I Read It" tap with an automatic save the moment the
// learner has actually done the work.
async function finishWordBuilderWord() {
    const word = wordBuilderWords[wordBuilderIndex];

    const { error } = await _supabase.from('word_builder_progress').upsert({
        student_id: currentUser.id,
        word_id: word.id,
        read_at: new Date().toISOString()
    }, { onConflict: 'student_id,word_id' });

    if (error) {
        console.error('Failed to save word progress:', error);
        showNotificationToast("Couldn't save progress: " + error.message);
    }

    wordBuilderReadWordIds.add(word.id);
    advanceWordBuilderWord();
}

async function advanceWordBuilderWord() {
    wordBuilderSpellForWordId = null;
    wordBuilderMatchChoicesForWordId = null;
    wordBuilderSentenceForWordId = null;
    if (wordBuilderIndex < wordBuilderWords.length - 1) {
        wordBuilderIndex++;
        renderWordBuilderWordCard();
    } else {
        startWordBuilderReviewSequence();
    }
}
window.advanceWordBuilderWord = advanceWordBuilderWord;

// ---------------------------------------------------------------------------
// End-of-level review sequence, shown once after the last word:
//   Quick Review (one "which word means X" question per word)
//   -> Read What You Know (full word list, no hints, twice — ordered then
//      shuffled, for reading speed)
//   -> Find the Word (same matching mechanic, reversed framing, 2 words)
//   -> Final Challenge (the word list once more, then level complete)
// Skipped entirely for very small levels — not enough words to build
// believable wrong answers from.
// ---------------------------------------------------------------------------

function wordBuilderShuffle(arr) {
    return [...arr].sort(() => Math.random() - 0.5);
}

let wordBuilderMatchRest = [];
let wordBuilderMatchOpts = null;
let wordBuilderMatchOnDone = null;

function startWordBuilderReviewSequence() {
    const pool = wordBuilderWords.filter(w => w.english_meaning);
    if (pool.length < 3) {
        return completeWordBuilderLevel();
    }
    renderWordBuilderMatchStage(wordBuilderShuffle(pool), {
        crumb: 'QUICK REVIEW', title: 'Quick Review', promptLabel: 'Which word means'
    }, renderWordBuilderReadWhatYouKnow);
}
window.startWordBuilderReviewSequence = startWordBuilderReviewSequence;

// A single "pick the matching word" question, reused for both Quick Review
// (asks about every word once) and Find the Word (asks about a couple).
function renderWordBuilderMatchStage(queue, opts, onStageDone) {
    if (queue.length === 0) return onStageDone();

    const target = queue[0];
    const rest = queue.slice(1);
    const pool = wordBuilderWords.filter(w => w.english_meaning && w.id !== target.id);
    const distractors = wordBuilderShuffle(pool).slice(0, 2);
    const choices = wordBuilderShuffle([target, ...distractors]);

    wordBuilderMatchRest = rest;
    wordBuilderMatchOpts = opts;
    wordBuilderMatchOnDone = onStageDone;

    const crumb = document.getElementById('wordBuilderLessonCrumb');
    if (crumb) crumb.innerText = opts.crumb;

    const mount = document.getElementById('wordBuilderLessonMount');
    if (!mount) return;

    mount.innerHTML = `
        <div style="text-align:center; padding-top:16px;">
            <div style="font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#94a3b8; margin-bottom:10px;">${opts.title}</div>
            <div style="font-size:20px; font-weight:800; color:#1e293b; margin-bottom:22px;">${opts.promptLabel} "${target.english_meaning}"?</div>
            <div id="wbQuizChoices" style="display:flex; flex-direction:column; gap:10px;">
                ${choices.map(c => `
                    <button style="font-family:'Abyssinica SIL',serif; font-size:22px; padding:14px; background:white;
                                   border:1px solid #e2e8f0; border-radius:14px; cursor:pointer; color:#1e293b;"
                            onclick="answerWordBuilderMatch(this, '${c.id}', '${target.id}')">${c.amharic_text}</button>
                `).join('')}
            </div>
        </div>
    `;
}

function answerWordBuilderMatch(btnEl, chosenId, correctId) {
    const buttons = document.querySelectorAll('#wbQuizChoices button');
    buttons.forEach(btn => btn.setAttribute('disabled', 'true'));

    if (chosenId === correctId) {
        btnEl.style.borderColor = '#166534';
        btnEl.style.background = 'rgba(22,101,52,0.08)';
        if (typeof showGobezToast === 'function') showGobezToast('Nice! ✓');
    } else {
        btnEl.style.borderColor = '#dc2626';
        btnEl.style.background = 'rgba(220,38,38,0.06)';
        showNotificationToast('Not quite. Take another look at the words.');
    }

    setTimeout(() => {
        renderWordBuilderMatchStage(wordBuilderMatchRest, wordBuilderMatchOpts, wordBuilderMatchOnDone);
    }, chosenId === correctId ? 500 : 1100);
}
window.answerWordBuilderMatch = answerWordBuilderMatch;

// A passive recap: the word list with no hints, one "Continue" button.
// Reused for both "Read What You Know" (twice — ordered, then shuffled)
// and "Final Challenge" (once more, right before level completion).
function renderWordBuilderRecapScreen(words, title, subtitle, onContinue) {
    const crumb = document.getElementById('wordBuilderLessonCrumb');
    if (crumb) crumb.innerText = title.toUpperCase();

    window.wordBuilderRecapOnContinue = onContinue;

    const mount = document.getElementById('wordBuilderLessonMount');
    if (!mount) return;

    mount.innerHTML = `
        <div style="text-align:center; padding-top:10px;">
            <div style="font-size:12.5px; color:#94a3b8; margin-bottom:18px;">${subtitle}</div>
            <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:22px;">
                ${words.map(w => `
                    <div style="background:white; border:1px solid #e2e8f0; border-radius:14px; padding:16px;
                                font-family:'Abyssinica SIL',serif; font-size:26px; color:#1e293b;">${w.amharic_text}</div>
                `).join('')}
            </div>
            <button class="btn-primary" onclick="wordBuilderRecapOnContinue()">Continue →</button>
        </div>
    `;
}

function renderWordBuilderReadWhatYouKnow() {
    renderWordBuilderRecapScreen(
        wordBuilderWords, 'Read What You Know', "These are the words you've learned. No hints this time.",
        () => renderWordBuilderRecapScreen(
            wordBuilderShuffle(wordBuilderWords), 'Read What You Know', 'Now try them in a different order.',
            renderWordBuilderFindWordStage
        )
    );
}

function renderWordBuilderFindWordStage() {
    const pool = wordBuilderWords.filter(w => w.english_meaning);
    const subset = wordBuilderShuffle(pool).slice(0, Math.min(2, pool.length));
    renderWordBuilderMatchStage(subset, {
        crumb: 'FIND THE WORD', title: 'Find the Word', promptLabel: 'Find the word for'
    }, renderWordBuilderFindInSentenceStage);
}

// The payoff game — tap the target word right inside a real sentence,
// instead of picking it out of an isolated multiple-choice list. Only
// runs for words that actually have a sentence authored (via the
// "See it in a sentence" feature); skips straight to Final Challenge if
// this level has none yet, or once its 1-2 questions are done.
let wordBuilderSentenceGameQueue = [];

function renderWordBuilderFindInSentenceStage() {
    const pool = wordBuilderWords.filter(w => wordBuilderSentencesByWordId[w.id]);
    if (pool.length === 0) {
        return renderWordBuilderFinalChallenge();
    }
    wordBuilderSentenceGameQueue = wordBuilderShuffle(pool).slice(0, Math.min(2, pool.length));
    renderWordBuilderFindInSentenceQuestion();
}

function renderWordBuilderFindInSentenceQuestion() {
    if (wordBuilderSentenceGameQueue.length === 0) {
        return renderWordBuilderFinalChallenge();
    }

    const target = wordBuilderSentenceGameQueue[0];
    const sentence = wordBuilderSentencesByWordId[target.id];

    const crumb = document.getElementById('wordBuilderLessonCrumb');
    if (crumb) crumb.innerText = 'FIND IT IN THE SENTENCE';

    const mount = document.getElementById('wordBuilderLessonMount');
    if (!mount) return;

    mount.innerHTML = `
        <div style="text-align:center; padding-top:16px;">
            <div style="font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#94a3b8; margin-bottom:10px;">Find</div>
            <div style="font-size:20px; font-weight:800; color:#1e293b; margin-bottom:22px;">"${target.english_meaning}"</div>
            <div id="wbSentenceGameRow" style="font-family:'Abyssinica SIL',serif; font-size:26px; margin-bottom:14px; line-height:1.9;">
                ${sentence.glosses.map(g => `<span style="cursor:pointer; padding:3px 6px; border-radius:8px;" onclick="answerWordBuilderFindInSentence(this, '${g.is_target}')">${g.amharic_chunk}</span>`).join(' ')}
            </div>
            <p style="font-size:11.5px; color:#94a3b8;">Tap the word that means "${target.english_meaning}"</p>
        </div>
    `;
}

function answerWordBuilderFindInSentence(spanEl, isTargetStr) {
    const isTarget = isTargetStr === 'true';

    if (isTarget) {
        spanEl.style.background = 'rgba(22,101,52,0.12)';
        spanEl.style.color = '#166534';
        spanEl.style.fontWeight = '700';
        document.getElementById('wbSentenceGameRow').querySelectorAll('span').forEach(s => s.style.pointerEvents = 'none');
        if (typeof showGobezToast === 'function') showGobezToast('Found it! ✓');
        setTimeout(() => {
            wordBuilderSentenceGameQueue = wordBuilderSentenceGameQueue.slice(1);
            renderWordBuilderFindInSentenceQuestion();
        }, 700);
    } else {
        spanEl.style.background = 'rgba(220,38,38,0.1)';
        spanEl.style.color = '#dc2626';
        spanEl.style.pointerEvents = 'none';
    }
}
window.answerWordBuilderFindInSentence = answerWordBuilderFindInSentence;

function renderWordBuilderFinalChallenge() {
    renderWordBuilderRecapScreen(
        wordBuilderWords, 'Final Challenge', 'Read all of these without any hints.',
        completeWordBuilderLevel
    );
}

// ---------------------------------------------------------------------------
// Level complete
// ---------------------------------------------------------------------------

async function completeWordBuilderLevel() {
    const level = wordBuilderCurrentLevel;

    const { error } = await _supabase.from('word_builder_level_progress').upsert({
        student_id: currentUser.id,
        level_number: level.level_number,
        completed_at: new Date().toISOString()
    }, { onConflict: 'student_id,level_number' });

    if (error) console.error('Failed to save level completion:', error);

    // Finishing a level doesn't automatically mean the NEXT level's
    // letters have been learned yet — that's tracked separately via
    // Fidel Practice/Competition — so check before offering to continue
    // straight into it.
    const [{ data: nextLevel }, unlockedLevels] = await Promise.all([
        _supabase.from('word_builder_levels').select('level_number, topic_title').eq('level_number', level.level_number + 1).maybeSingle(),
        getWordBuilderUnlockedLevels()
    ]);
    const nextLevelReady = nextLevel && unlockedLevels.has(nextLevel.level_number);

    const crumb = document.getElementById('wordBuilderLessonCrumb');
    if (crumb) crumb.innerText = '';

    const mount = document.getElementById('wordBuilderLessonMount');
    if (!mount) return;

    mount.innerHTML = `
        <div style="text-align:center; padding-top:36px;">
            <div style="font-size:52px; margin-bottom:10px;">${icon('confetti')}</div>
            <div style="font-size:19px; font-weight:800; color:#1e293b; margin-bottom:4px;">You can now read:</div>
            <div style="font-size:13px; color:#64748b; margin-bottom:22px;">Level ${level.level_number}${level.topic_title ? ` · ${level.topic_title}` : ''}</div>
            <div style="background:white; border:1px solid #e2e8f0; border-radius:16px; padding:18px;
                        box-shadow:0 4px 20px rgba(20,83,45,0.07); text-align:left; margin-bottom:20px;">
                <div style="font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#94a3b8; margin-bottom:10px;">
                    Real words you just read
                </div>
                ${wordBuilderWords.map(w => `
                    <div style="display:flex; align-items:center; gap:10px; padding:6px 0; font-size:14px; font-weight:600;">
                        <span style="color:#166534; font-size:15px;">✓</span>
                        <span style="font-family:'Abyssinica SIL',serif;">${w.amharic_text}</span>
                        ${w.english_meaning ? `<span style="color:#94a3b8; font-weight:400; font-size:12.5px;">"${w.english_meaning}"</span>` : ''}
                    </div>`).join('')}
            </div>
            ${nextLevelReady
                ? `<button class="btn-primary" onclick="openWordBuilderLevel(${nextLevel.level_number})">Continue to Level ${nextLevel.level_number} →</button>`
                : `<button class="btn-primary" onclick="showScreen('wordBuilderLevelsScreen'); renderWordBuilderLevelsList();">Back to Levels</button>`}
            ${(nextLevel && !nextLevelReady)
                ? `<p style="font-size:11.5px; color:#94a3b8; margin-top:12px;">Level ${nextLevel.level_number} unlocks once you've learned ${WORD_BUILDER_LEVEL_LETTERS[nextLevel.level_number].join(' ')} in Fidel Practice.</p>`
                : ''}
            <a href="javascript:void(0)" onclick="if (typeof enterAmharicPath === 'function') enterAmharicPath();"
               style="display:block; margin-top:16px; font-size:12.5px; font-weight:700; color:#4338ca; text-decoration:none;">
                ${icon('book')} Ready to read full sentences? Try Amharic Path →
            </a>
        </div>
    `;

    if (typeof showGobezToast === 'function') showGobezToast(`Level ${level.level_number} complete! ${icon('confetti')}`);
}

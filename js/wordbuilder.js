// =============================================================================
// WORD BUILDER — js/wordbuilder.js
// Self-paced reading path, independent of Fidel Competition's team/level
// progress but tracking its 11 levels' letter families 1:1 (10 Word
// Builder levels since Level 1 here covers Competition's first two). The
// card itself is always open — each individual LEVEL unlocks on its own
// once the student has learned every letter readable by it (this level's
// and all earlier), checked primarily against Fidel Practice (available
// to every student, team or solo) with Competition's streak progress
// also counting if they have it.
//
// Loads AFTER app.js/reading.js — relies on globals defined there:
//   _supabase, currentUser, currentProfile, showNotificationToast, showScreen
// =============================================================================

// Curriculum Lab structure (Senait's Notion page: "🌱 Curriculum Lab —
// Fidel → Word Builder → Amharic Path 2.0"): 10 levels, tracking Fidel
// Competition's 11 levels 1:1 except Level 1 here covers Competition's
// first two levels (6 letters) — three letters alone turned out too
// sparse to write real words with, confirmed while drafting actual
// Level 1 content. Each entry is that level's own NEW families only;
// use getWordBuilderCumulativeLetters() for "every letter readable by
// this level," since words may use any letter from that level or earlier.
const WORD_BUILDER_LEVEL_LETTERS = {
    1: ['ሀ', 'ለ', 'ሐ', 'መ', 'ሠ', 'ረ'],
    2: ['ሰ', 'ሸ', 'ቀ'],
    3: ['በ', 'ተ', 'ቸ'],
    4: ['ኀ', 'ነ', 'ኘ'],
    5: ['አ', 'ከ', 'ኸ'],
    6: ['ወ', 'ዐ', 'ዘ'],
    7: ['ዠ', 'የ', 'ደ'],
    8: ['ጀ', 'ገ', 'ጠ'],
    9: ['ጨ', 'ጰ', 'ጸ'],
    10: ['ፀ', 'ፈ', 'ፐ']
};

function getWordBuilderCumulativeLetters(levelNumber) {
    let letters = [];
    for (let n = 1; n <= levelNumber; n++) {
        letters = letters.concat(WORD_BUILDER_LEVEL_LETTERS[n] || []);
    }
    return letters;
}

let wordBuilderCurrentLevel = null;
// wordBuilderWords: every word in the level (core + expansion) -- the pool
// used for review/Final Challenge/distractor choices. wordBuilderCoreWords:
// just the core words, in the fixed order they're walked through one at a
// time. Expansion words are recognition-only -- they show up in review and
// Final Challenge but never get their own full build/picture/spell/etc walk.
let wordBuilderWords = [];
let wordBuilderCoreWords = [];
let wordBuilderReadWordIds = new Set();
let wordBuilderIndex = 0;
let wordBuilderSentencesByWordId = {};
let wordBuilderSentenceForWordId = null;
let wordBuilderSentenceTapped = new Set();  // indices into this word's gloss array the learner has tapped

// Three screens per word, Duolingo-style: Read it (word only, then a Check
// reveal), Build it (the spelling step, unchanged), Use it (a sentence if
// one's authored, otherwise one meaning-recall question -- picture choices
// if the word has an emoji, English choices otherwise).
const WORD_BUILDER_STEPS = ['read', 'build', 'use'];
let wordBuilderStepIndex = 0;
let wordBuilderReadRevealedForWordId = null;
let wordBuilderSpellForWordId = null;
let wordBuilderSpellPool = [];   // [{ch, placed}], shuffled once per word
let wordBuilderSpellSlots = [];  // per-slot: index into wordBuilderSpellPool, or null
let wordBuilderMatchChoicesForWordId = null;
let wordBuilderMatchChoices = [];

// ---------------------------------------------------------------------------
// Per-level unlock check
// ---------------------------------------------------------------------------

// Every Fidel letter this student currently knows, merging Fidel Practice
// mastery with Fidel Competition streak-passes -- the single source both
// level-unlock and per-word (Topic view) readability checks build on.
async function getWordBuilderKnownLetters() {
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

    const known = new Set(practiceRow?.mastered_letters || []);
    (familyRows || []).forEach(r => { if (r.streak_passed) known.add(r.base_letter); });
    return known;
}

// Returns a Set of level numbers (1-12) the student has earned access to —
// a level counts as unlocked once every one of its letters is either
// mastered in Fidel Practice or streak-passed in Fidel Competition.
async function getWordBuilderUnlockedLevels() {
    const known = await getWordBuilderKnownLetters();
    const unlocked = new Set();
    Object.keys(WORD_BUILDER_LEVEL_LETTERS).forEach(levelKey => {
        const levelNumber = Number(levelKey);
        // Cumulative, not just this level's own new letters -- a word at
        // this level can use any letter from here or earlier, so "ready
        // for this level" has to mean all of those, not just the newest 3.
        if (getWordBuilderCumulativeLetters(levelNumber).every(letter => known.has(letter))) {
            unlocked.add(levelNumber);
        }
    });
    return unlocked;
}

// The letters (this level's own + every earlier level's) this student
// hasn't learned yet -- empty means the word is readable. Used by the
// Topic view, where words are browsed independent of level sequence.
function wordBuilderMissingLettersForLevel(levelNumber, known) {
    return getWordBuilderCumulativeLetters(levelNumber).filter(letter => !known.has(letter));
}

// ---------------------------------------------------------------------------
// Entry point — the card itself is always open now; individual levels
// carry their own lock state inside the list.
// ---------------------------------------------------------------------------

function enterWordBuilder() {
    showScreen('wordBuilderLevelsScreen', '');
    renderWordBuilderLevelsList();
}
window.enterWordBuilder = enterWordBuilder;

// ---------------------------------------------------------------------------
// Word Builder Home — leads with the actual learning content (current
// level's words, a Continue button, the practice-flow preview) instead of
// progression/gating rules. The Fidel-practice prerequisite, when it
// blocks the *next* level, is a small note at the bottom, not the
// centerpiece — the student can still see and continue whatever they've
// already unlocked.
// ---------------------------------------------------------------------------

async function enterWordBuilderHome() {
    showScreen('wordBuilderHomeScreen', '');
    if (typeof applyModeLockStyling === 'function') applyModeLockStyling();

    const mount = document.getElementById('wordBuilderHomeMount');
    if (!mount) return;

    const [{ data: levels }, { data: wordRows }, { data: levelProgress }, { data: wordProgress }, unlockedLevels] = await Promise.all([
        _supabase.from('word_builder_levels').select('level_number, topic_title').order('level_number'),
        _supabase.from('word_builder_words').select('id, level_number, item_order, amharic_text, english_meaning').is('archived_at', null).order('item_order'),
        _supabase.from('word_builder_level_progress').select('level_number').eq('student_id', currentUser.id),
        _supabase.from('word_builder_progress').select('word_id').eq('student_id', currentUser.id),
        getWordBuilderUnlockedLevels()
    ]);

    const allLevels = levels || [];
    const totalLevels = allLevels.length || Object.keys(WORD_BUILDER_LEVEL_LETTERS).length;
    const completedLevels = new Set((levelProgress || []).map(r => r.level_number));
    const readWordIds = new Set((wordProgress || []).map(r => r.word_id));

    const wordsByLevel = {};
    (wordRows || []).forEach(w => { (wordsByLevel[w.level_number] ||= []).push(w); });

    // Sequential but open: every level with words is browsable/jumpable
    // regardless of Fidel letter mastery (unlockedLevels only softens
    // sub-labels now, never blocks). "Current Level" — what Continue
    // Learning resumes — prefers wherever the student left off (the
    // highest-numbered level with any unfinished progress), since they're
    // free to jump ahead; falls back to the first level with words that
    // isn't complete for a student who hasn't started anything yet.
    let targetLevel = null;
    for (const l of allLevels) {
        const words = wordsByLevel[l.level_number] || [];
        if (words.length === 0 || completedLevels.has(l.level_number)) continue;
        if (words.some(w => readWordIds.has(w.id))) targetLevel = l;
    }
    if (!targetLevel) {
        targetLevel = allLevels.find(l =>
            !completedLevels.has(l.level_number) && (wordsByLevel[l.level_number] || []).length > 0
        );
    }

    if (!targetLevel) {
        const allDone = allLevels.length > 0 && allLevels.every(l => completedLevels.has(l.level_number));
        mount.innerHTML = allDone
            ? `
                <div class="wb-home-continue-card">
                    <div class="wb-home-continue-title">All Levels Complete 🎉</div>
                    <div class="wb-home-continue-sub">You've finished every Word Builder level. Go back through any of them any time.</div>
                    <button class="wb-home-continue-btn" onclick="enterWordBuilder()">Review Word Builder →</button>
                </div>
              `
            : `
                <div class="wb-home-continue-card">
                    <div class="wb-home-continue-title">Word Builder</div>
                    <div class="wb-home-continue-sub">No levels have content yet — check back soon.</div>
                </div>
              `;
        return;
    }

    const levelWords = wordsByLevel[targetLevel.level_number] || [];
    const readCount = levelWords.filter(w => readWordIds.has(w.id)).length;
    // Only words already read -- anything still ahead hasn't hit its own
    // Read-it/Check reveal yet, so showing its meaning here would spoil it.
    const previewWords = levelWords.filter(w => readWordIds.has(w.id)).slice(0, 4);
    const levelsDoneCount = completedLevels.size;

    const wordRowsHtml = previewWords.length
        ? previewWords.map(w => `
            <div class="wb-home-word-row">
                <span class="wb-home-word-amharic">${w.amharic_text}</span>
                <span class="wb-home-word-meaning">${w.english_meaning || ''}</span>
            </div>
        `).join('')
        : `<div style="padding:14px 0; text-align:center; color:#94a3b8; font-size:12.5px;">Nothing read yet — tap Continue Learning to start.</div>`;

    // "Up Next" — an invitation forward, not a lock. Always the very next
    // level with words, whether or not its letters are Fidel-known yet.
    const nextLevel = allLevels.find(l => l.level_number > targetLevel.level_number && (wordsByLevel[l.level_number] || []).length > 0);
    const upNextHtml = nextLevel
        ? `
            <div class="wb-home-upnext-note" onclick="openWordBuilderLevelPage(${nextLevel.level_number})">
                <span>Up Next — Level ${nextLevel.level_number}${nextLevel.topic_title ? ` · ${nextLevel.topic_title}` : ''}</span>
                <span>→</span>
            </div>
          `
        : '';

    const miniProgressPercent = totalLevels > 0 ? Math.min(100, Math.round((levelsDoneCount / totalLevels) * 100)) : 0;

    mount.innerHTML = `
        <div class="wb-home-continue-card">
            <div class="wb-home-continue-title">Level ${targetLevel.level_number}${targetLevel.topic_title ? ` · ${targetLevel.topic_title}` : ''}</div>
            <div class="wb-home-continue-sub">New words to learn using letters you already know.</div>
            <div class="wb-home-continue-track"><div class="wb-home-continue-fill" style="width:${levelWords.length ? Math.round((readCount / levelWords.length) * 100) : 0}%;"></div></div>
            <div class="wb-home-continue-caption">${readCount} / ${levelWords.length} words</div>
            <button class="wb-home-continue-btn" onclick="openWordBuilderLevel(${targetLevel.level_number})">Continue Learning →</button>
        </div>

        <div class="wb-home-section-label">Your Words</div>
        <div class="wb-home-words-card">
            ${wordRowsHtml}
        </div>
        <div class="wb-home-view-all-link" onclick="openWordBuilderLevelPage(${targetLevel.level_number})">View all ${levelWords.length} words →</div>
        <div class="wb-home-view-all-link" onclick="enterWordBuilder()">Browse by level or topic →</div>

        <div class="wb-home-progress-mini" style="margin-top:14px;">
            <span>Level ${targetLevel.level_number} of ${totalLevels}</span>
            <div class="wb-home-progress-mini-track"><div class="wb-home-progress-mini-fill" style="width:${miniProgressPercent}%;"></div></div>
        </div>

        ${upNextHtml}
    `;
}
window.enterWordBuilderHome = enterWordBuilderHome;

// ---------------------------------------------------------------------------
// By Level / By Topic / My Words toggle. Words above the student's current
// level are still shown (a preview, not a lock) with a small "needs X" tag.
// ---------------------------------------------------------------------------

const WORD_BUILDER_TOPICS = [
    { name: 'Greetings & Polite Words', emoji: '👋' },
    { name: 'Family & People', emoji: '👪' },
    { name: 'Food & Drink', emoji: '🍽️' },
    { name: 'At Home', emoji: '🏠' },
    { name: 'Numbers', emoji: '🔢' },
    { name: 'Colors', emoji: '🎨' },
    { name: 'My Body', emoji: '🙆' },
    { name: 'Animals', emoji: '🐾' },
    { name: 'Days & Time', emoji: '🕐' },
    { name: 'Feelings', emoji: '😊' },
    { name: 'Around Town', emoji: '🏘️' },
    { name: 'Describing Words', emoji: '🔤' }
];

let wordBuilderLevelsViewMode = 'level'; // 'level' | 'topic' | 'mywords'
let wordBuilderCurrentTopic = null;
// Set while a single word is being practiced in isolation (from a Topic
// list, a Level page, or My Words), so finishing it returns to wherever it
// was tapped from instead of falling into the full end-of-level review/
// Final Challenge sequence (which is level-scoped).
let wordBuilderTopicPracticeMode = false;

const WB_VIEW_TOGGLE_BTN_BASE = 'flex:1; border:none; border-radius:9px; padding:9px; font-size:12px; font-weight:700; cursor:pointer;';

function updateWordBuilderLevelsToggleUI() {
    const levelBtn = document.getElementById('wbViewLevelBtn');
    const topicBtn = document.getElementById('wbViewTopicBtn');
    const myWordsBtn = document.getElementById('wbViewMyWordsBtn');
    if (!levelBtn || !topicBtn || !myWordsBtn) return;
    const active = WB_VIEW_TOGGLE_BTN_BASE + 'background:white; color:#166534; box-shadow:0 1px 3px rgba(0,0,0,0.08);';
    const inactive = WB_VIEW_TOGGLE_BTN_BASE + 'background:none; color:#64748b;';
    levelBtn.setAttribute('style', wordBuilderLevelsViewMode === 'level' ? active : inactive);
    topicBtn.setAttribute('style', wordBuilderLevelsViewMode === 'topic' ? active : inactive);
    myWordsBtn.setAttribute('style', wordBuilderLevelsViewMode === 'mywords' ? active : inactive);
}

function switchWordBuilderLevelsView(mode) {
    wordBuilderLevelsViewMode = mode;
    renderWordBuilderLevelsList();
}
window.switchWordBuilderLevelsView = switchWordBuilderLevelsView;

// ---------------------------------------------------------------------------
// Shared word-card grid -- one look for a word everywhere it's browsable
// (a Level page, a Topic's word list, My Words): read words show full
// detail and a check; unread core words show only the emoji/word plus a
// "New" tag, so nothing here spoils a word the student hasn't reached yet;
// expansion words always carry a "Bonus" tag and only ever open the
// read-only preview, never the practice walk; words whose letters aren't
// unlocked yet (Topic/My Words only -- a Level page's words share one
// unlock state) carry a small "needs X" note instead.
// ---------------------------------------------------------------------------

let wordBuilderWordCardCache = [];
let wordBuilderCardReturnContext = null; // { type: 'topic' } | { type: 'level', levelNumber } | { type: 'mywords' }

function wbWordCardInnerHtml(word, opts) {
    const missingLetters = opts.missingLetters;
    const read = opts.read;
    const locked = !word.is_expansion && missingLetters && missingLetters.length > 0;
    const tagHtml = word.is_expansion
        ? '<span class="wb-card-tag wb-card-tag-bonus">Bonus</span>'
        : (!read && !locked ? '<span class="wb-card-tag wb-card-tag-new">New</span>' : '');
    return `
        ${tagHtml}
        ${word.emoji ? `<div class="wb-card-emoji">${word.emoji}</div>` : ''}
        <div class="wb-card-amharic${word.emoji ? '' : ' wb-card-amharic-large'}">${word.amharic_text}</div>
        ${read ? `
            ${word.transliteration ? `<div class="wb-card-translit">${word.transliteration}</div>` : ''}
            <div class="wb-card-meaning">${word.english_meaning || ''}</div>
            <div class="wb-card-check">✓</div>
        ` : ''}
        ${locked ? `<div class="wb-card-locked">Level ${word.level_number} · needs ${missingLetters.slice(0, 2).join(', ')}</div>` : ''}
    `;
}

function wbWordCardHtml(word, opts, onclickExpr) {
    return `<div class="wb-word-card" onclick="${onclickExpr}">${wbWordCardInnerHtml(word, opts)}</div>`;
}

// Decides what tapping a card actually does: expansion and locked words
// always preview; an unread core word on a Level page starts the level's
// walk at that word (continuing through the rest of the level after);
// everything else (read words anywhere, unlocked words in Topic/My Words)
// runs the 3-step practice for just that one word.
function wbWordCardTapExpr(word, opts) {
    if (word.is_expansion) return `previewWordBuilderWordCard('${word.id}')`;
    if (opts.missingLetters && opts.missingLetters.length > 0) return `previewWordBuilderWordCard('${word.id}')`;
    if (opts.context === 'level' && !opts.read) return `openWordBuilderLevel(${opts.levelNumber}, '${word.id}')`;
    return `openWordBuilderSingleWordPractice('${word.id}')`;
}

// A locked-for-now or bonus/expansion word: picture + meaning only, no
// practice yet -- a preview, not a wall, matching the rest of Word
// Builder's soft-nudge approach to letters the student hasn't learned yet.
function previewWordBuilderWordCard(wordId) {
    const word = wordBuilderWordCardCache.find(w => w.id === wordId);
    const mount = document.getElementById('wordBuilderLessonMount');
    if (!word || !mount) return;

    const ctx = wordBuilderCardReturnContext;
    const backLabel = ctx && ctx.type === 'level' ? '← Back to level' : ctx && ctx.type === 'mywords' ? '← Back to My Words' : '← Back to topic';
    const backExpr = ctx && ctx.type === 'level' ? `openWordBuilderLevelPage(${ctx.levelNumber})`
        : ctx && ctx.type === 'mywords' ? `renderWordBuilderMyWords()`
        : `openWordBuilderTopic(wordBuilderCurrentTopic)`;
    const note = word.is_expansion
        ? 'This is a bonus recognition word — a sneak peek, not part of the main practice walk.'
        : `This word is Level ${word.level_number} — a sneak peek for now. Practice unlocks once you know its letters.`;

    mount.innerHTML = `
        <div style="background:white; border:1px solid #e2e8f0; border-radius:18px; padding:44px 20px;
                    text-align:center; box-shadow:0 4px 20px rgba(20,83,45,0.07);">
            ${word.emoji ? `<div style="font-size:56px; margin-bottom:10px;">${word.emoji}</div>` : ''}
            <div style="font-family:'Abyssinica SIL',serif; font-size:40px; color:#1e293b; margin-bottom:6px;">${word.amharic_text}</div>
            ${word.english_meaning ? `<div style="font-size:16px; font-weight:700; color:#166534;">${word.english_meaning}</div>` : ''}
        </div>
        <p style="font-size:11.5px; color:#94a3b8; text-align:center; margin-top:12px;">${note}</p>
        <button class="btn-secondary" style="width:100%; margin-top:10px;" onclick="${backExpr}">${backLabel}</button>
    `;
}
window.previewWordBuilderWordCard = previewWordBuilderWordCard;

// Full practice for one word tapped from a card grid -- reuses the same
// Read it / Build it / Use it walk as a normal level, scoped to just this
// word (wordBuilderCoreWords has one entry) while still pulling the rest
// of its real level's words into wordBuilderWords for decoy/distractor
// pools, exactly like the core/expansion split already does.
async function openWordBuilderSingleWordPractice(wordId) {
    const cached = wordBuilderWordCardCache.find(w => w.id === wordId);
    if (!cached) return;

    const [{ data: level }, { data: levelWords }, { data: progress }, { data: sentenceRows }] = await Promise.all([
        _supabase.from('word_builder_levels').select('level_number, topic_title').eq('level_number', cached.level_number).maybeSingle(),
        _supabase.from('word_builder_words')
            .select('id, item_order, amharic_text, transliteration, english_meaning, grammar_note, emoji, is_expansion')
            .eq('level_number', cached.level_number).is('archived_at', null).order('item_order'),
        _supabase.from('word_builder_progress').select('word_id').eq('student_id', currentUser.id),
        _supabase.from('word_builder_sentences')
            .select('id, word_id, amharic_sentence, translation, grammar_notice').eq('word_id', wordId)
    ]);

    const sentenceIds = (sentenceRows || []).map(s => s.id);
    const { data: glossRows } = sentenceIds.length
        ? await _supabase.from('word_builder_sentence_glosses')
            .select('sentence_id, item_order, amharic_chunk, transliteration, gloss_meaning, is_target')
            .in('sentence_id', sentenceIds).order('item_order')
        : { data: [] };

    const fullWord = (levelWords || []).find(w => w.id === wordId) || cached;

    wordBuilderCurrentLevel = level;
    wordBuilderWords = levelWords && levelWords.length ? levelWords : [fullWord];
    wordBuilderCoreWords = [fullWord];
    wordBuilderReadWordIds = new Set((progress || []).map(r => r.word_id));
    wordBuilderSentencesByWordId = {};
    (sentenceRows || []).forEach(s => {
        wordBuilderSentencesByWordId[s.word_id] = { ...s, glosses: (glossRows || []).filter(g => g.sentence_id === s.id) };
    });

    wordBuilderTopicPracticeMode = true;
    wordBuilderIndex = 0;
    showScreen('wordBuilderLessonScreen', '');
    renderWordBuilderWordCard();
}
window.openWordBuilderSingleWordPractice = openWordBuilderSingleWordPractice;

function finishWordBuilderSingleWordPractice() {
    const mount = document.getElementById('wordBuilderLessonMount');
    if (mount) {
        mount.innerHTML = `
            <div style="text-align:center; padding:40px 20px;">
                <div style="font-size:44px; margin-bottom:10px;">✅</div>
                <div style="font-size:18px; font-weight:800; color:#166534;">Word Complete</div>
            </div>
        `;
    }
    wordBuilderTopicPracticeMode = false;
    const ctx = wordBuilderCardReturnContext;
    setTimeout(() => {
        if (ctx && ctx.type === 'level') openWordBuilderLevelPage(ctx.levelNumber);
        else if (ctx && ctx.type === 'mywords') renderWordBuilderMyWords();
        else openWordBuilderTopic(wordBuilderCurrentTopic);
    }, 1100);
}

async function renderWordBuilderTopicGrid() {
    const mount = document.getElementById('wordBuilderLevelsMount');
    if (!mount) return;
    mount.innerHTML = '<p style="color:#94a3b8; font-size:13px;">Loading...</p>';

    const [{ data: wordRows }, { data: wordProgress }] = await Promise.all([
        _supabase.from('word_builder_words').select('id, topic').is('archived_at', null).not('topic', 'is', null),
        _supabase.from('word_builder_progress').select('word_id').eq('student_id', currentUser.id)
    ]);

    const readWordIds = new Set((wordProgress || []).map(r => r.word_id));
    const countsByTopic = {};
    (wordRows || []).forEach(w => {
        const c = (countsByTopic[w.topic] ||= { total: 0, read: 0 });
        c.total++;
        if (readWordIds.has(w.id)) c.read++;
    });

    const cardsHtml = WORD_BUILDER_TOPICS.map(t => {
        const c = countsByTopic[t.name] || { total: 0, read: 0 };
        const clickable = c.total > 0;
        return `
            <div ${clickable ? `onclick="openWordBuilderTopic('${t.name.replace(/'/g, "\\'")}')"` : ''}
                 style="background:white; border:1px solid #e2e8f0; border-radius:14px; padding:16px 12px; text-align:center;
                        ${clickable ? 'cursor:pointer;' : 'opacity:0.5;'}">
                <div style="font-size:28px; margin-bottom:6px;">${t.emoji}</div>
                <div style="font-size:12.5px; font-weight:700; color:#1e293b; margin-bottom:4px;">${t.name}</div>
                <div style="font-size:10.5px; color:#94a3b8;">${c.total ? `${c.read} of ${c.total} words you can read` : 'No words yet'}</div>
            </div>
        `;
    }).join('');

    mount.innerHTML = `<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">${cardsHtml}</div>`;
}

// The Lesson screen's back button is one static element shared by every
// kind of content shown there (a level walk, Mixed Review, a Topic word
// list) -- its label and destination have to be set explicitly for
// whichever one is currently showing, rather than always saying "Levels".
function setWordBuilderLessonBackButton(mode) {
    const btn = document.getElementById('wordBuilderLessonBackBtn');
    if (!btn) return;
    if (mode === 'topic') {
        btn.textContent = '← Topics';
        btn.setAttribute('onclick', "switchWordBuilderLevelsView('topic'); showScreen('wordBuilderLevelsScreen', '');");
    } else {
        btn.textContent = '← Levels';
        btn.setAttribute('onclick', "switchWordBuilderLevelsView('level'); showScreen('wordBuilderLevelsScreen', '');");
    }
}

async function openWordBuilderTopic(topicName) {
    wordBuilderCurrentTopic = topicName;
    showScreen('wordBuilderLessonScreen', '');
    setWordBuilderLessonBackButton('topic');
    const crumb = document.getElementById('wordBuilderLessonCrumb');
    if (crumb) crumb.innerText = topicName.toUpperCase();

    const mount = document.getElementById('wordBuilderLessonMount');
    if (mount) mount.innerHTML = '<p style="color:#94a3b8; font-size:13px;">Loading...</p>';

    const [{ data: wordRows }, { data: wordProgress }, known] = await Promise.all([
        _supabase.from('word_builder_words')
            .select('id, level_number, item_order, amharic_text, transliteration, english_meaning, emoji, is_expansion, topic')
            .eq('topic', topicName).is('archived_at', null).order('level_number', { ascending: true }).order('item_order', { ascending: true }),
        _supabase.from('word_builder_progress').select('word_id').eq('student_id', currentUser.id),
        getWordBuilderKnownLetters()
    ]);

    wordBuilderWordCardCache = wordRows || [];
    wordBuilderCardReturnContext = { type: 'topic' };
    const readWordIds = new Set((wordProgress || []).map(r => r.word_id));

    const cardsHtml = wordBuilderWordCardCache.map(w => {
        const read = readWordIds.has(w.id);
        const missing = w.is_expansion ? [] : wordBuilderMissingLettersForLevel(w.level_number, known);
        const opts = { read: read, missingLetters: missing, context: 'topic' };
        return wbWordCardHtml(w, opts, wbWordCardTapExpr(w, opts));
    }).join('');

    if (mount) {
        mount.innerHTML = wordBuilderWordCardCache.length
            ? `<div class="wb-word-grid">${cardsHtml}</div>`
            : '<p style="color:#94a3b8; font-size:13px;">No words in this topic yet.</p>';
    }
}
window.openWordBuilderTopic = openWordBuilderTopic;

// ---------------------------------------------------------------------------
// My Words -- every word this student has read, newest first, with Level
// and Topic filter chips. Cards flip in place to reveal the meaning
// (rather than navigating away like Level page/Topic cards do), since
// browsing what you already know is the point here, not launching practice.
// ---------------------------------------------------------------------------

let wordBuilderMyWordsLevelFilter = null;
let wordBuilderMyWordsTopicFilter = null;
let wordBuilderMyWordsFlipped = new Set();

async function renderWordBuilderMyWords() {
    // Self-sufficient like openWordBuilderTopic/openWordBuilderLevelPage --
    // reachable both from the toggle bar (already on this screen) and from
    // finishing a single-word practice session (currently on the Lesson
    // screen), so it has to switch screens itself rather than assume.
    showScreen('wordBuilderLevelsScreen', '');
    wordBuilderLevelsViewMode = 'mywords';
    updateWordBuilderLevelsToggleUI();

    const mount = document.getElementById('wordBuilderLevelsMount');
    if (!mount) return;
    mount.innerHTML = '<p style="color:#94a3b8; font-size:13px;">Loading...</p>';

    const { data: progressRows } = await _supabase
        .from('word_builder_progress')
        .select('word_id, read_at')
        .eq('student_id', currentUser.id)
        .order('read_at', { ascending: false });

    const orderedIds = (progressRows || []).map(r => r.word_id);
    if (orderedIds.length === 0) {
        mount.innerHTML = '<p style="color:#94a3b8; font-size:13px; text-align:center; margin-top:20px;">Nothing read yet — words you finish will show up here.</p>';
        return;
    }

    const { data: wordRows } = await _supabase
        .from('word_builder_words')
        .select('id, level_number, item_order, amharic_text, transliteration, english_meaning, emoji, is_expansion, topic')
        .in('id', orderedIds).is('archived_at', null);

    const byId = {};
    (wordRows || []).forEach(w => { byId[w.id] = w; });
    const allReadWords = orderedIds.map(id => byId[id]).filter(Boolean); // newest-first, from progressRows' order

    wordBuilderWordCardCache = allReadWords;
    wordBuilderCardReturnContext = { type: 'mywords' };

    const levelsPresent = [...new Set(allReadWords.map(w => w.level_number))].sort((a, b) => a - b);
    const topicsPresent = [...new Set(allReadWords.map(w => w.topic).filter(Boolean))];

    const filtered = allReadWords.filter(w =>
        (wordBuilderMyWordsLevelFilter === null || w.level_number === wordBuilderMyWordsLevelFilter) &&
        (wordBuilderMyWordsTopicFilter === null || w.topic === wordBuilderMyWordsTopicFilter)
    );

    const chip = (label, active, onclick) =>
        `<button type="button" class="wb-filter-chip${active ? ' wb-filter-chip-active' : ''}" onclick="${onclick}">${label}</button>`;

    const levelChipsHtml = chip('All Levels', wordBuilderMyWordsLevelFilter === null, "setWordBuilderMyWordsFilter('level', null)")
        + levelsPresent.map(l => chip(`Level ${l}`, wordBuilderMyWordsLevelFilter === l, `setWordBuilderMyWordsFilter('level', ${l})`)).join('');
    const topicChipsHtml = chip('All Topics', wordBuilderMyWordsTopicFilter === null, "setWordBuilderMyWordsFilter('topic', null)")
        + topicsPresent.map(t => chip(t, wordBuilderMyWordsTopicFilter === t, `setWordBuilderMyWordsFilter('topic', '${t.replace(/'/g, "\\'")}')`)).join('');

    const cardsHtml = filtered.map(w => wbMyWordsCardHtml(w)).join('');

    mount.innerHTML = `
        <div style="font-size:13px; font-weight:700; color:#166534; margin-bottom:12px;">You can read ${allReadWords.length} word${allReadWords.length === 1 ? '' : 's'}.</div>
        <div class="wb-filter-chip-row">${levelChipsHtml}</div>
        <div class="wb-filter-chip-row" style="margin-bottom:14px;">${topicChipsHtml}</div>
        <div class="wb-word-grid">${cardsHtml || '<p style="color:#94a3b8; font-size:13px; grid-column:1/-1;">No words match this filter.</p>'}</div>
    `;
}
window.renderWordBuilderMyWords = renderWordBuilderMyWords;

function setWordBuilderMyWordsFilter(kind, value) {
    if (kind === 'level') wordBuilderMyWordsLevelFilter = value;
    else wordBuilderMyWordsTopicFilter = value;
    renderWordBuilderMyWords();
}
window.setWordBuilderMyWordsFilter = setWordBuilderMyWordsFilter;

function wbMyWordsCardHtml(word) {
    if (wordBuilderMyWordsFlipped.has(word.id)) {
        return `
            <div class="wb-word-card wb-word-card-flipped" onclick="toggleWordBuilderMyWordsFlip('${word.id}')">
                <div class="wb-card-amharic${word.emoji ? '' : ' wb-card-amharic-large'}">${word.amharic_text}</div>
                ${word.transliteration ? `<div class="wb-card-translit">${word.transliteration}</div>` : ''}
                <div class="wb-card-meaning">${word.english_meaning || ''}</div>
                <div class="wb-card-practice-link" onclick="event.stopPropagation(); openWordBuilderSingleWordPractice('${word.id}')">Practice →</div>
            </div>`;
    }
    const tagHtml = word.is_expansion ? '<span class="wb-card-tag wb-card-tag-bonus">Bonus</span>' : '';
    return `
        <div class="wb-word-card" onclick="toggleWordBuilderMyWordsFlip('${word.id}')">
            ${tagHtml}
            ${word.emoji ? `<div class="wb-card-emoji">${word.emoji}</div>` : ''}
            <div class="wb-card-amharic${word.emoji ? '' : ' wb-card-amharic-large'}">${word.amharic_text}</div>
            <div class="wb-card-check">✓</div>
        </div>`;
}

function toggleWordBuilderMyWordsFlip(wordId) {
    if (wordBuilderMyWordsFlipped.has(wordId)) wordBuilderMyWordsFlipped.delete(wordId);
    else wordBuilderMyWordsFlipped.add(wordId);
    renderWordBuilderMyWords();
}
window.toggleWordBuilderMyWordsFlip = toggleWordBuilderMyWordsFlip;

async function renderWordBuilderLevelsList() {
    const mount = document.getElementById('wordBuilderLevelsMount');
    if (!mount) return;
    updateWordBuilderLevelsToggleUI();
    if (wordBuilderLevelsViewMode === 'topic') {
        return renderWordBuilderTopicGrid();
    }
    if (wordBuilderLevelsViewMode === 'mywords') {
        return renderWordBuilderMyWords();
    }
    mount.innerHTML = '<p style="color:#94a3b8; font-size:13px;">Loading...</p>';

    const [{ data: levels }, { data: wordRows }, { data: levelProgress }, { data: wordProgress }, unlockedLevels] = await Promise.all([
        _supabase.from('word_builder_levels').select('level_number, topic_title').order('level_number'),
        _supabase.from('word_builder_words').select('id, level_number').is('archived_at', null),
        _supabase.from('word_builder_level_progress').select('level_number').eq('student_id', currentUser.id),
        _supabase.from('word_builder_progress').select('word_id').eq('student_id', currentUser.id),
        getWordBuilderUnlockedLevels()
    ]);

    if (!levels || levels.length === 0) {
        mount.innerHTML = '<p style="color:#94a3b8; font-size:13px;">No levels set up yet, check back soon.</p>';
        return;
    }

    const wordIdsByLevel = {};
    (wordRows || []).forEach(w => { (wordIdsByLevel[w.level_number] ||= []).push(w.id); });

    const readWordIds = new Set((wordProgress || []).map(r => r.word_id));
    const completedLevels = new Set((levelProgress || []).map(r => r.level_number));

    // Sequential but open: every level with real words is browsable and
    // jumpable regardless of Fidel letter mastery. unlockedLevels now only
    // softens the sub-label (a nudge, not a wall) -- it never blocks a tap.
    mount.innerHTML = levels.map(level => {
        const wordIds = wordIdsByLevel[level.level_number] || [];
        const hasWords = wordIds.length > 0;
        const readCount = wordIds.filter(id => readWordIds.has(id)).length;
        const done = completedLevels.has(level.level_number);
        const practiceRecommended = !unlockedLevels.has(level.level_number);
        const clickable = hasWords;
        const letters = WORD_BUILDER_LEVEL_LETTERS[level.level_number] || [];

        const stateIcon = done ? '✓' : level.level_number;
        const numBg = done ? 'rgba(22,101,52,0.1)' : '#fffbeb';
        const numColor = done ? '#166534' : '#d97706';

        let subLabel;
        if (!hasWords) {
            subLabel = 'Coming soon';
        } else if (practiceRecommended && !done) {
            subLabel = `${readCount} of ${wordIds.length} words · new letters, Fidel Practice helps`;
        } else {
            subLabel = `${readCount} of ${wordIds.length} words`;
        }

        return `
            <div class="word-builder-level-row" style="display:flex; align-items:center; gap:12px; background:white;
                        border:1px solid #e2e8f0; border-radius:14px; padding:12px 14px; margin-bottom:9px;
                        ${!clickable ? 'opacity:0.6;' : 'cursor:pointer;'}"
                 ${clickable ? `onclick="openWordBuilderLevelPage(${level.level_number})"` : ''}>
                <div style="width:32px; height:32px; border-radius:10px; display:flex; align-items:center; justify-content:center;
                            font-weight:800; font-size:13px; flex-shrink:0; background:${numBg}; color:${numColor};">${stateIcon}</div>
                <div style="flex:1; min-width:0;">
                    <div style="font-size:13.5px; font-weight:700; color:#1e293b;">${level.topic_title || `Level ${level.level_number}`}</div>
                    ${letters.length ? `<div style="font-family:'Abyssinica SIL',serif; font-size:13px; color:#94a3b8; margin-top:2px;">${letters.join(' ')}</div>` : ''}
                    <div style="font-size:11px; color:#94a3b8; margin-top:2px;">${subLabel}</div>
                </div>
                ${done ? '<span style="font-size:15px; color:#166534;">✓</span>' : ''}
            </div>`;
    }).join('');
}
window.renderWordBuilderLevelsList = renderWordBuilderLevelsList;

// ---------------------------------------------------------------------------
// Level page — a browsable gallery of every word in the level (core +
// expansion), reached by tapping a level. Distinct from the actual lesson
// walk (openWordBuilderLevel), which this page's Continue button launches.
// ---------------------------------------------------------------------------

async function openWordBuilderLevelPage(levelNumber) {
    showScreen('wordBuilderLessonScreen', '');
    setWordBuilderLessonBackButton('level');
    const crumb = document.getElementById('wordBuilderLessonCrumb');
    const mount = document.getElementById('wordBuilderLessonMount');
    if (crumb) crumb.innerText = `LEVEL ${levelNumber}`;
    if (mount) mount.innerHTML = '<p style="color:#94a3b8; font-size:13px;">Loading...</p>';

    const [{ data: level }, { data: words }, { data: levelProgress }, { data: wordProgress }, known] = await Promise.all([
        _supabase.from('word_builder_levels').select('level_number, topic_title').eq('level_number', levelNumber).maybeSingle(),
        _supabase.from('word_builder_words')
            .select('id, item_order, amharic_text, transliteration, english_meaning, emoji, is_expansion, level_number')
            .eq('level_number', levelNumber).is('archived_at', null).order('item_order'),
        _supabase.from('word_builder_level_progress').select('level_number').eq('student_id', currentUser.id),
        _supabase.from('word_builder_progress').select('word_id').eq('student_id', currentUser.id),
        getWordBuilderKnownLetters()
    ]);

    if (!words || words.length === 0) {
        if (mount) mount.innerHTML = '<p style="color:#94a3b8; font-size:13px; text-align:center; margin-top:40px;">No words in this level yet, check back soon.</p>';
        return;
    }

    if (crumb) crumb.innerText = `LEVEL ${level.level_number}${level.topic_title ? ` · ${level.topic_title.toUpperCase()}` : ''}`;

    wordBuilderWordCardCache = words;
    wordBuilderCardReturnContext = { type: 'level', levelNumber: levelNumber };

    const readWordIds = new Set((wordProgress || []).map(r => r.word_id));
    const readCount = words.filter(w => readWordIds.has(w.id)).length;
    const letters = WORD_BUILDER_LEVEL_LETTERS[levelNumber] || [];
    const isComplete = new Set((levelProgress || []).map(r => r.level_number)).has(levelNumber);

    const cardsHtml = words.map(w => {
        const read = readWordIds.has(w.id);
        const missing = w.is_expansion ? [] : wordBuilderMissingLettersForLevel(w.level_number, known);
        const opts = { read: read, missingLetters: missing, context: 'level', levelNumber: levelNumber };
        return wbWordCardHtml(w, opts, wbWordCardTapExpr(w, opts));
    }).join('');

    if (mount) {
        mount.innerHTML = `
            <div style="background:white; border:1px solid #e2e8f0; border-radius:18px; padding:20px; margin-bottom:18px;">
                ${letters.length ? `<div style="font-family:'Abyssinica SIL',serif; font-size:28px; font-weight:700; color:#1e293b; margin-bottom:10px;">${letters.join(' ')}</div>` : ''}
                <div style="font-size:12.5px; font-weight:700; color:#94a3b8; margin-bottom:14px;">${readCount} of ${words.length} words</div>
                <button class="btn-primary" style="width:100%;" onclick="openWordBuilderLevel(${levelNumber})">Continue →</button>
            </div>
            <div class="wb-word-grid">${cardsHtml}</div>
            ${isComplete ? `<button class="btn-secondary" style="width:100%; margin-top:18px;" onclick="rerunWordBuilderFinalChallenge(${levelNumber})">Final Challenge</button>` : ''}
        `;
    }
}
window.openWordBuilderLevelPage = openWordBuilderLevelPage;

async function rerunWordBuilderFinalChallenge(levelNumber) {
    const [{ data: level }, { data: words }] = await Promise.all([
        _supabase.from('word_builder_levels').select('level_number, topic_title').eq('level_number', levelNumber).maybeSingle(),
        _supabase.from('word_builder_words').select('id, amharic_text, english_meaning').eq('level_number', levelNumber).is('archived_at', null)
    ]);
    wordBuilderCurrentLevel = level;
    wordBuilderWords = words || [];
    showScreen('wordBuilderLessonScreen', '');
    setWordBuilderLessonBackButton('level');
    const crumb = document.getElementById('wordBuilderLessonCrumb');
    if (crumb) crumb.innerText = `LEVEL ${level.level_number}${level.topic_title ? ` · ${level.topic_title.toUpperCase()}` : ''}`;
    renderWordBuilderFinalChallengeStart();
}
window.rerunWordBuilderFinalChallenge = rerunWordBuilderFinalChallenge;

// ---------------------------------------------------------------------------
// Inside a level — one word at a time. `startAtWordId`, when given, begins
// the walk at that specific word instead of the first unread one (used by
// the Level page's unread-word cards); otherwise this is the normal
// Continue behavior.
// ---------------------------------------------------------------------------

async function openWordBuilderLevel(levelNumber, startAtWordId) {
    wordBuilderTopicPracticeMode = false;
    setWordBuilderLessonBackButton('level');
    const { data: level } = await _supabase
        .from('word_builder_levels')
        .select('level_number, topic_title')
        .eq('level_number', levelNumber)
        .maybeSingle();

    const { data: words } = await _supabase
        .from('word_builder_words')
        .select('id, item_order, amharic_text, transliteration, english_meaning, grammar_note, emoji, is_expansion')
        .eq('level_number', levelNumber)
        .is('archived_at', null)
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
    wordBuilderCoreWords = wordBuilderWords.filter(w => !w.is_expansion);
    wordBuilderReadWordIds = new Set((progress || []).map(r => r.word_id));
    wordBuilderSentencesByWordId = {};
    (sentenceRows || []).forEach(s => {
        wordBuilderSentencesByWordId[s.word_id] = {
            ...s,
            glosses: (glossRows || []).filter(g => g.sentence_id === s.id)
        };
    });

    if (wordBuilderWords.length === 0) {
        showScreen('wordBuilderLessonScreen', '');
        document.getElementById('wordBuilderLessonCrumb').innerText = `LEVEL ${levelNumber}`;
        document.getElementById('wordBuilderLessonMount').innerHTML =
            '<p style="color:#94a3b8; font-size:13px; text-align:center; margin-top:40px;">No words in this level yet, check back soon.</p>';
        return;
    }

    if (startAtWordId) {
        const idx = wordBuilderCoreWords.findIndex(w => w.id === startAtWordId);
        wordBuilderIndex = idx !== -1 ? idx : 0;
    } else {
        wordBuilderIndex = wordBuilderCoreWords.findIndex(w => !wordBuilderReadWordIds.has(w.id));
        if (wordBuilderIndex === -1) wordBuilderIndex = 0;
    }

    showScreen('wordBuilderLessonScreen', '');
    renderWordBuilderWordCard();
}
window.openWordBuilderLevel = openWordBuilderLevel;

function renderWordBuilderWordCard() {
    wordBuilderStepIndex = 0;
    renderWordBuilderStep();
}

// All three steps always show for every word -- "Use it" adapts its own
// content internally (sentence, picture choices, or English choices)
// rather than the step itself being skipped.
function wordBuilderStepShouldSkip(word, stepName) {
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
    const word = wordBuilderCoreWords[wordBuilderIndex];

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
        read: wbStepReadHtml,
        build: wbStepSpellHtml,
        use: wbStepUseHtml
    };
    const dots = WORD_BUILDER_STEPS.map((_, i) => `
        <span style="width:7px; height:7px; border-radius:50%; background:${
            i === wordBuilderStepIndex ? '#166534' : (i < wordBuilderStepIndex ? '#86efac' : '#e2e8f0')
        };"></span>
    `).join('');

    mount.innerHTML = `
        ${stepBuilders[stepName](word)}
        <div style="display:flex; justify-content:center; gap:6px; margin-top:20px;">${dots}</div>
        <p style="font-size:11px; color:#cbd5e1; text-align:center; margin-top:6px;">Word ${wordBuilderIndex + 1} of ${wordBuilderCoreWords.length}</p>
    `;
}

function advanceWordBuilderStep() {
    wordBuilderStepIndex++;
    renderWordBuilderStep();
}
window.advanceWordBuilderStep = advanceWordBuilderStep;

// Step 1 — Read it: the word alone, nothing else, so the learner actually
// has to sound it out before a "Check" reveals transliteration, picture
// (if there is one) and meaning together as one payoff moment.
function wbStepReadHtml(word) {
    const revealed = wordBuilderReadRevealedForWordId === word.id;

    if (!revealed) {
        return `
            <div style="background:white; border:1px solid #e2e8f0; border-radius:18px; padding:56px 20px;
                        text-align:center; box-shadow:0 4px 20px rgba(20,83,45,0.07);">
                <div style="font-family:'Abyssinica SIL',serif; font-size:48px; color:#1e293b;">${word.amharic_text}</div>
            </div>
            <p style="font-size:11.5px; color:#94a3b8; text-align:center; margin-top:10px;">Sound it out, then check yourself</p>
            <button class="btn-primary" style="width:100%; margin-top:10px;" onclick="revealWordBuilderRead()">Check</button>
        `;
    }

    const meaning = word.english_meaning ? word.english_meaning.charAt(0).toUpperCase() + word.english_meaning.slice(1) : '';
    return `
        <div style="background:white; border:1px solid #e2e8f0; border-radius:18px; padding:36px 20px;
                    text-align:center; box-shadow:0 4px 20px rgba(20,83,45,0.07);">
            ${word.emoji ? `<div style="font-size:56px; margin-bottom:10px;">${word.emoji}</div>` : ''}
            <div style="font-family:'Abyssinica SIL',serif; font-size:40px; color:#1e293b; margin-bottom:6px;">${word.amharic_text}</div>
            ${word.transliteration ? `<div style="font-size:13px; color:#64748b; margin-bottom:6px;">${word.transliteration}</div>` : ''}
            ${meaning ? `<div style="font-size:16px; font-weight:700; color:#166534;">${meaning}</div>` : ''}
        </div>
        ${word.grammar_note ? `
        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:14px; padding:14px 16px; margin-top:14px;">
            <div style="font-size:10.5px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#166534; margin-bottom:5px;">Why this word looks this way</div>
            <div style="font-size:13px; color:#14532d; line-height:1.5;">${word.grammar_note}</div>
        </div>` : ''}
        <button class="btn-primary" style="width:100%; margin-top:16px;" onclick="advanceWordBuilderStep()">Continue</button>
    `;
}

function revealWordBuilderRead() {
    wordBuilderReadRevealedForWordId = wordBuilderCoreWords[wordBuilderIndex].id;
    renderWordBuilderStep();
}
window.revealWordBuilderRead = revealWordBuilderRead;

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

// Step 2 — Spell: tap letter tiles into slots in order (tap-to-place
// rather than literal drag-and-drop — the standard mobile-friendly
// substitute; real HTML5 drag events are unreliable on touch, and this is
// the same interaction Duolingo itself actually uses). Tap a filled slot
// to send its tile back to the pool.
// Decoys: other vowel-order forms of the same families used in the word
// (e.g. ሚ/ሞ/ሩ for ማር, which uses the መ and ረ families) -- reading the
// word right means telling ማ apart from its siblings ሚ/ሙ/ሜ/ም/ሞ, not
// just recognizing loose letter shapes.
function getWordBuilderSpellDecoys(wordLetters, count) {
    const usedChars = new Set(wordLetters);
    const families = [];
    const seenBase = new Set();
    wordLetters.forEach(ch => {
        const fam = typeof alphabetData !== 'undefined' ? alphabetData.find(f => f.family.includes(ch)) : null;
        if (fam && !seenBase.has(fam.base)) {
            seenBase.add(fam.base);
            families.push(fam);
        }
    });
    let pool = [];
    families.forEach(fam => {
        fam.family.forEach(ch => { if (!usedChars.has(ch)) pool.push(ch); });
    });
    return wordBuilderShuffle(pool).slice(0, count);
}

function wbStepSpellHtml(word) {
    const letters = Array.from(word.amharic_text.replace(/\s+/g, ''));

    if (wordBuilderSpellForWordId !== word.id) {
        wordBuilderSpellForWordId = word.id;
        const decoys = getWordBuilderSpellDecoys(letters, 3);
        wordBuilderSpellPool = wordBuilderShuffle(
            letters.map(ch => ({ ch, placed: false }))
                .concat(decoys.map(ch => ({ ch, placed: false })))
        );
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

// "Use it" picture-choice mode: this word plus 3 picture distractors from
// the same level, prompted by the WORD itself (not the picture) so the
// learner has to recall the picture from the Fidel text. A correct tap
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
    const word = wordBuilderCoreWords[wordBuilderIndex];
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

// "Use it" English-choice mode: same multiple-choice mechanic, English
// meaning choices instead of picture choices, for words with no emoji or
// too small a picture-distractor pool (ሁሉ, ሙሉ, ሌላ, ...).
let wordBuilderWhichMeaningChoicesForWordId = null;
let wordBuilderWhichMeaningChoices = [];

function wbStepWhichMeaningHtml(word) {
    if (wordBuilderWhichMeaningChoicesForWordId !== word.id) {
        wordBuilderWhichMeaningChoicesForWordId = word.id;
        const distractors = wordBuilderShuffle(wordBuilderWords.filter(w => w.id !== word.id && w.english_meaning)).slice(0, 3);
        wordBuilderWhichMeaningChoices = wordBuilderShuffle([word, ...distractors]);
    }

    return `
        <div style="text-align:center;">
            <div style="font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#94a3b8; margin-bottom:8px;">Which meaning?</div>
            <div style="font-family:'Abyssinica SIL',serif; font-size:30px; color:#1e293b; margin-bottom:20px;">${word.amharic_text}</div>
            <div id="wbWhichMeaningChoices" style="display:flex; flex-direction:column; gap:10px;">
                ${wordBuilderWhichMeaningChoices.map(c => `
                    <button onclick="answerWordBuilderWhichMeaningStep(this, '${c.id}')"
                            style="font-size:15px; font-weight:700; padding:16px; background:white; border:1px solid #e2e8f0;
                                   border-radius:14px; cursor:pointer; color:#1e293b;">${c.english_meaning}</button>
                `).join('')}
            </div>
        </div>
    `;
}

function answerWordBuilderWhichMeaningStep(btnEl, chosenId) {
    const word = wordBuilderCoreWords[wordBuilderIndex];
    const buttons = document.querySelectorAll('#wbWhichMeaningChoices button');
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
window.answerWordBuilderWhichMeaningStep = answerWordBuilderWhichMeaningStep;

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

// Step 3 — Use it: a sentence if one's authored, otherwise one
// meaning-recall question -- picture choices if the word has an emoji and
// enough other picture words to build a real choice set, English choices
// otherwise. Falls all the way through to a plain Continue only if a word
// has neither, so the step never renders broken.
function wbUseStepMode(word) {
    const sentence = wordBuilderSentencesByWordId[word.id];
    if (sentence && sentence.glosses && sentence.glosses.length > 0) return 'sentence';
    if (word.emoji) {
        const picturePool = wordBuilderWords.filter(w => w.id !== word.id && w.emoji);
        if (picturePool.length >= 3) return 'picture';
    }
    const englishPool = wordBuilderWords.filter(w => w.id !== word.id && w.english_meaning);
    if (word.english_meaning && englishPool.length >= 1) return 'english';
    return 'none';
}

function wbStepUseHtml(word) {
    const mode = wbUseStepMode(word);
    if (mode === 'sentence') return wbStepSentenceHtml(word);
    if (mode === 'picture') return wbStepMatchHtml(word);
    if (mode === 'english') return wbStepWhichMeaningHtml(word);
    return `
        <div style="text-align:center; padding:30px 20px; color:#94a3b8; font-size:13px;">Nothing more to practice for this word yet.</div>
        <button class="btn-primary" style="width:100%; margin-top:10px;" onclick="advanceWordBuilderStep()">Continue</button>
    `;
}

// Called once a word has run through every step of its sequence — replaces
// the old manual "I Read It" tap with an automatic save the moment the
// learner has actually done the work.
async function finishWordBuilderWord() {
    const word = wordBuilderCoreWords[wordBuilderIndex];

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
    if (wordBuilderIndex < wordBuilderCoreWords.length - 1) {
        wordBuilderIndex++;
        renderWordBuilderWordCard();
    } else if (wordBuilderTopicPracticeMode) {
        finishWordBuilderSingleWordPractice();
    } else {
        startWordBuilderReviewSequence();
    }
}
window.advanceWordBuilderWord = advanceWordBuilderWord;

// ---------------------------------------------------------------------------
// End-of-level review sequence, shown once after the last word:
//   Quick Review (one "which word means X" question per word)
//   -> Find the Word (same matching mechanic, reversed framing, 2 words)
//   -> Find It In The Sentence (tap the word inside a real sentence)
//   -> Final Challenge (every word, no hints, scored -- see below)
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
    }, renderWordBuilderFindWordStage);
}
window.startWordBuilderReviewSequence = startWordBuilderReviewSequence;

// ---------------------------------------------------------------------------
// Mixed Review — 10 words pulled from any level the student has already
// completed (not the current level's own end-of-level review above).
// This is what Home's "5-minute review" button opens; previously that
// button was just an alias for Fidel Practice regardless of which app
// area it was pressed from.
// ---------------------------------------------------------------------------

async function startWordBuilderMixedReview() {
    if (!currentUser) return;
    setWordBuilderLessonBackButton('level');

    const { data: levelProgress } = await _supabase
        .from('word_builder_level_progress')
        .select('level_number')
        .eq('student_id', currentUser.id);
    const completedLevels = (levelProgress || []).map(r => r.level_number);

    if (completedLevels.length === 0) {
        showNotificationToast("Finish a Word Builder level first, then come back for a mixed review!");
        return;
    }

    const { data: words } = await _supabase
        .from('word_builder_words')
        .select('id, level_number, item_order, amharic_text, transliteration, english_meaning, grammar_note, emoji')
        .in('level_number', completedLevels)
        .is('archived_at', null)
        .order('item_order');

    const pool = (words || []).filter(w => w.english_meaning);
    if (pool.length < 3) {
        showNotificationToast("Not enough words yet for a mixed review — keep learning!");
        return;
    }

    // renderWordBuilderMatchStage's distractor pool reads this global, so
    // it needs to reflect the mixed cross-level pool, not any one level's
    // words, for the rest of this review.
    wordBuilderWords = pool;
    const reviewSet = wordBuilderShuffle(pool).slice(0, Math.min(10, pool.length));

    showScreen('wordBuilderLessonScreen', '');

    renderWordBuilderMatchStage(reviewSet, {
        crumb: 'MIXED REVIEW', title: 'Mixed Review', promptLabel: 'Which word means'
    }, () => {
        const crumb = document.getElementById('wordBuilderLessonCrumb');
        if (crumb) crumb.innerText = 'MIXED REVIEW';
        const mount = document.getElementById('wordBuilderLessonMount');
        if (mount) {
            mount.innerHTML = `
                <div style="text-align:center; padding-top:40px;">
                    <div style="font-size:44px; margin-bottom:10px;">${icon('confetti')}</div>
                    <div style="font-size:18px; font-weight:800; color:#166534; margin-bottom:6px;">Nice review!</div>
                    <div style="font-size:13px; color:#94a3b8; margin-bottom:24px;">You went through ${reviewSet.length} words from levels you've already learned.</div>
                    <button class="btn-primary" style="width:100%;" onclick="enterStudentShellHomeTab()">Back to Home</button>
                </div>
            `;
        }
    });
}
window.startWordBuilderMixedReview = startWordBuilderMixedReview;

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
        return renderWordBuilderFinalChallengeStart();
    }
    wordBuilderSentenceGameQueue = wordBuilderShuffle(pool).slice(0, Math.min(2, pool.length));
    renderWordBuilderFindInSentenceQuestion();
}

function renderWordBuilderFindInSentenceQuestion() {
    if (wordBuilderSentenceGameQueue.length === 0) {
        return renderWordBuilderFinalChallengeStart();
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

// The real Final Challenge: every word, no hints, choose its meaning,
// scored ("7 of 8"). Anything missed comes back once more at the end for
// reinforcement, but the score itself only counts first attempts.
let wordBuilderFinalQueue = [];
let wordBuilderFinalMissed = [];
let wordBuilderFinalTotal = 0;
let wordBuilderFinalCorrectCount = 0;
let wordBuilderFinalRetryRound = false;

function renderWordBuilderFinalChallengeStart() {
    // Reached from mid-lesson without a showScreen() call, so nothing else
    // resets scroll on the way in -- whatever position the last word's
    // steps left behind would otherwise carry straight into the test.
    window.scrollTo(0, 0);

    const pool = wordBuilderWords.filter(w => w.english_meaning);
    if (pool.length < 2) {
        return completeWordBuilderLevel();
    }
    wordBuilderFinalQueue = wordBuilderShuffle(pool);
    wordBuilderFinalMissed = [];
    wordBuilderFinalTotal = pool.length;
    wordBuilderFinalCorrectCount = 0;
    wordBuilderFinalRetryRound = false;
    renderWordBuilderFinalChallengeQuestion();
}

function renderWordBuilderFinalChallengeQuestion() {
    if (wordBuilderFinalQueue.length === 0) {
        if (!wordBuilderFinalRetryRound && wordBuilderFinalMissed.length > 0) {
            wordBuilderFinalRetryRound = true;
            wordBuilderFinalQueue = wordBuilderShuffle(wordBuilderFinalMissed);
            wordBuilderFinalMissed = [];
        } else {
            return renderWordBuilderFinalChallengeScore();
        }
    }

    const target = wordBuilderFinalQueue[0];
    const pool = wordBuilderWords.filter(w => w.english_meaning && w.id !== target.id);
    const distractors = wordBuilderShuffle(pool).slice(0, 3);
    const choices = wordBuilderShuffle([target, ...distractors]);

    const mount = document.getElementById('wordBuilderLessonMount');
    if (!mount) return;

    mount.innerHTML = `
        <div style="text-align:center; padding-top:16px;">
            <div style="font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#94a3b8; margin-bottom:10px;">${wordBuilderFinalRetryRound ? 'One more try' : 'Final Challenge · no hints'}</div>
            <div style="font-family:'Abyssinica SIL',serif; font-size:32px; color:#1e293b; margin-bottom:22px;">${target.amharic_text}</div>
            <div id="wbFinalChoices" style="display:flex; flex-direction:column; gap:10px;">
                ${choices.map(c => `
                    <button onclick="answerWordBuilderFinalChallenge(this, '${c.id}', '${target.id}')"
                            style="font-size:15px; font-weight:700; padding:16px; background:white; border:1px solid #e2e8f0;
                                   border-radius:14px; cursor:pointer; color:#1e293b;">${c.english_meaning}</button>
                `).join('')}
            </div>
        </div>
    `;
}

function answerWordBuilderFinalChallenge(btnEl, chosenId, correctId) {
    const buttons = document.querySelectorAll('#wbFinalChoices button');
    buttons.forEach(btn => btn.setAttribute('disabled', 'true'));

    const target = wordBuilderFinalQueue[0];
    wordBuilderFinalQueue = wordBuilderFinalQueue.slice(1);

    if (chosenId === correctId) {
        btnEl.style.borderColor = '#166534';
        btnEl.style.background = 'rgba(22,101,52,0.08)';
        if (!wordBuilderFinalRetryRound) wordBuilderFinalCorrectCount++;
    } else {
        btnEl.style.borderColor = '#dc2626';
        btnEl.style.background = 'rgba(220,38,38,0.06)';
        wordBuilderFinalMissed.push(target);
    }

    setTimeout(() => renderWordBuilderFinalChallengeQuestion(), chosenId === correctId ? 500 : 1000);
}
window.answerWordBuilderFinalChallenge = answerWordBuilderFinalChallenge;

function renderWordBuilderFinalChallengeScore() {
    const mount = document.getElementById('wordBuilderLessonMount');
    if (!mount) return;

    mount.innerHTML = `
        <div style="text-align:center; padding-top:40px;">
            <div style="font-size:44px; margin-bottom:10px;">${icon('star')}</div>
            <div style="font-size:22px; font-weight:800; color:#1e293b; margin-bottom:6px;">${wordBuilderFinalCorrectCount} of ${wordBuilderFinalTotal}</div>
            <div style="font-size:13px; color:#94a3b8; margin-bottom:24px;">words read correctly on the first try</div>
            <button class="btn-primary" style="width:100%;" onclick="completeWordBuilderLevel()">Continue →</button>
        </div>
    `;
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

    // Levels are sequential but open — always offer to continue into the
    // next one. Fidel unlock status is a soft note, not a gate.
    const [{ data: nextLevel }, unlockedLevels] = await Promise.all([
        _supabase.from('word_builder_levels').select('level_number, topic_title').eq('level_number', level.level_number + 1).maybeSingle(),
        getWordBuilderUnlockedLevels()
    ]);
    const nextLevelReady = !!nextLevel;
    const nextLevelNewLetters = nextLevel && !unlockedLevels.has(nextLevel.level_number);

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
                : `<button class="btn-primary" onclick="showScreen('wordBuilderLevelsScreen', ''); renderWordBuilderLevelsList();">Back to Levels</button>`}
            ${nextLevelNewLetters
                ? `<p style="font-size:11.5px; color:#94a3b8; margin-top:12px;">Level ${nextLevel.level_number} uses some new letters (${WORD_BUILDER_LEVEL_LETTERS[nextLevel.level_number].join(' ')}) — Fidel Practice can help, but you can dive in now too.</p>`
                : ''}
            <a href="javascript:void(0)" onclick="if (typeof enterAmharicPath === 'function') enterAmharicPath();"
               style="display:block; margin-top:16px; font-size:12.5px; font-weight:700; color:#166534; text-decoration:none;">
                ${icon('book')} Ready to read full sentences? Try Amharic Path →
            </a>
        </div>
    `;

    if (typeof showGobezToast === 'function') showGobezToast(`Level ${level.level_number} complete! ${icon('confetti')}`);
}

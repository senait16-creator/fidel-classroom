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
let wordBuilderCurrentWordMarkedRead = false;
let wordBuilderSentencesByWordId = {};
let wordBuilderSentenceRevealed = false;

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
        _supabase.from('word_builder_levels').select('level_number, topic_title, topic_emoji').order('level_number'),
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

        const stateIcon = done ? '✓' : (locked ? '🔒' : level.level_number);
        const numBg = done ? 'rgba(22,101,52,0.1)' : (locked ? '#e2e8f0' : '#fffbeb');
        const numColor = done ? '#166534' : (locked ? '#94a3b8' : '#d97706');

        let subLabel;
        if (!practiceUnlocked && !done) {
            subLabel = `🔒 Learn ${WORD_BUILDER_LEVEL_LETTERS[level.level_number].join(' ')} in Fidel Practice first`;
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
                    <div style="font-size:13.5px; font-weight:700; color:#1e293b;">${level.level_number} · ${level.topic_emoji || ''} ${level.topic_title}</div>
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
        .select('level_number, topic_title, topic_emoji')
        .eq('level_number', levelNumber)
        .maybeSingle();

    const { data: words } = await _supabase
        .from('word_builder_words')
        .select('id, item_order, amharic_text, transliteration, english_meaning, grammar_note')
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
            .select('sentence_id, item_order, amharic_chunk, gloss_meaning, is_target')
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
    const crumb = document.getElementById('wordBuilderLessonCrumb');
    const mount = document.getElementById('wordBuilderLessonMount');
    if (!crumb || !mount) return;

    wordBuilderCurrentWordMarkedRead = false;
    wordBuilderSentenceRevealed = false;

    const level = wordBuilderCurrentLevel;
    const word = wordBuilderWords[wordBuilderIndex];
    crumb.innerText = `LEVEL ${level.level_number} · ${(level.topic_title || '').toUpperCase()}`;

    // Ethiopic syllables are each a single Unicode code point already, so
    // splitting the string into an array of characters is enough to get
    // one chip per Fidel character — no combining marks to worry about.
    const letters = Array.from(word.amharic_text.replace(/\s+/g, ''));
    const progressPct = Math.round((wordBuilderIndex / wordBuilderWords.length) * 100);

    mount.innerHTML = `
        <div style="background:white; border:1px solid #e2e8f0; border-radius:18px; padding:26px 20px;
                    text-align:center; box-shadow:0 4px 20px rgba(20,83,45,0.07); margin-bottom:16px;">
            <div style="font-family:'Abyssinica SIL',serif; font-size:42px; color:#1e293b; margin-bottom:10px;">${word.amharic_text}</div>
            ${word.transliteration ? `<div style="font-size:13px; color:#64748b; margin-bottom:4px;">${word.transliteration}</div>` : ''}
            ${word.english_meaning ? `<div style="font-size:13.5px; color:#94a3b8; font-style:italic;">"${word.english_meaning}"</div>` : ''}
            <div style="display:flex; flex-wrap:wrap; gap:6px; justify-content:center; align-items:center; margin-top:14px;">
                ${letters.map((ch, i) => `${i > 0 ? '<span style="color:#cbd5e1; font-size:16px; font-weight:700;">+</span>' : ''}<span style="font-family:'Abyssinica SIL',serif; font-size:20px; background:#fffbeb; color:#d97706; border-radius:10px; padding:6px 12px; cursor:pointer;" onclick="showWordBuilderLetterInfo('${ch}')">${ch}</span>`).join('')}
            </div>
            <div style="font-size:10px; color:#cbd5e1; margin-top:8px;">tap a letter to hear how it fits in</div>
        </div>
        ${word.grammar_note ? `
        <div style="background:#eef2ff; border:1px solid #c7d2fe; border-radius:14px; padding:14px 16px; margin-bottom:16px;">
            <div style="font-size:10.5px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#4f46e5; margin-bottom:5px;">Why this word looks this way</div>
            <div style="font-size:13px; color:#3730a3; line-height:1.5;">${word.grammar_note}</div>
        </div>` : ''}
        <div id="wbSentenceMount"></div>
        <div id="wbActionMount"></div>
        <div style="height:6px; background:#e2e8f0; border-radius:999px; overflow:hidden; margin-top:16px;">
            <div style="height:100%; width:${progressPct}%; background:#166534; border-radius:999px;"></div>
        </div>
        <p style="font-size:11.5px; color:#94a3b8; text-align:center; margin-top:8px;">${wordBuilderIndex + 1} / ${wordBuilderWords.length}</p>
    `;
    renderWordBuilderSentenceSection();
    renderWordBuilderActionButton();
}

// "See it in a sentence" — shown only when the current word has one
// authored. Starts collapsed: the sentence is visible but every word
// except the target is grayed out, so it reads as a gentle preview rather
// than a second decoding task. Tapping "Learn from the sentence" reveals
// the translation, a word-by-word gloss table, and the grammar notice.
function renderWordBuilderSentenceSection() {
    const mount = document.getElementById('wbSentenceMount');
    if (!mount) return;

    const word = wordBuilderWords[wordBuilderIndex];
    const sentence = wordBuilderSentencesByWordId[word.id];
    if (!sentence || !sentence.glosses || sentence.glosses.length === 0) {
        mount.innerHTML = '';
        return;
    }

    const revealed = wordBuilderSentenceRevealed;

    mount.innerHTML = `
        <div style="background:#f7f5ef; border:1px solid #e2e8f0; border-radius:14px; padding:16px; margin-bottom:16px;">
            <div style="font-size:10.5px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#94a3b8; margin-bottom:10px;">See it in a sentence</div>
            <div style="font-family:'Abyssinica SIL',serif; font-size:22px; text-align:center; margin-bottom:10px; line-height:1.7;">
                ${sentence.glosses.map(g => `<span style="color:${(g.is_target || revealed) ? '#1e293b' : '#cbd5e1'}; transition:color .2s;">${g.amharic_chunk}</span>`).join(' ')}
            </div>
            ${revealed ? `
                <div style="font-size:13px; color:#64748b; text-align:center; font-style:italic; margin-bottom:14px;">"${sentence.translation}"</div>
                <div style="border-top:1px solid #e2e8f0; padding-top:12px;">
                    ${sentence.glosses.map(g => `
                        <div style="display:flex; justify-content:space-between; align-items:baseline; padding:4px 0; font-size:13px;">
                            <span style="font-family:'Abyssinica SIL',serif; font-size:15px; font-weight:${g.is_target ? '700' : '400'}; color:${g.is_target ? '#166534' : '#1e293b'};">${g.amharic_chunk}</span>
                            <span style="color:#94a3b8;">${g.gloss_meaning}</span>
                        </div>`).join('')}
                </div>
                ${sentence.grammar_notice ? `<div style="margin-top:12px; font-size:12.5px; color:#78350f; background:#fffbeb; border:1px solid #fde68a; border-radius:10px; padding:10px 12px;">💡 ${sentence.grammar_notice}</div>` : ''}
            ` : `
                <button onclick="toggleWordBuilderSentenceReveal()"
                        style="display:block; margin:0 auto; background:none; border:1px solid #d97706; color:#d97706;
                               font-size:12.5px; font-weight:700; border-radius:999px; padding:7px 16px; cursor:pointer;">
                    Learn from the sentence
                </button>
            `}
        </div>
    `;
}

function toggleWordBuilderSentenceReveal() {
    wordBuilderSentenceRevealed = !wordBuilderSentenceRevealed;
    renderWordBuilderSentenceSection();
}
window.toggleWordBuilderSentenceReveal = toggleWordBuilderSentenceReveal;

function renderWordBuilderActionButton() {
    const actionMount = document.getElementById('wbActionMount');
    if (!actionMount) return;
    const isLast = wordBuilderIndex === wordBuilderWords.length - 1;
    actionMount.innerHTML = wordBuilderCurrentWordMarkedRead
        ? `<button class="btn-primary" onclick="advanceWordBuilderWord()">${isLast ? 'Finish Level →' : 'Next →'}</button>`
        : `<button class="btn-primary" onclick="markWordBuilderWordRead()">✓ I Read It</button>`;
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

async function markWordBuilderWordRead() {
    const word = wordBuilderWords[wordBuilderIndex];

    const { error } = await _supabase.from('word_builder_progress').upsert({
        student_id: currentUser.id,
        word_id: word.id,
        read_at: new Date().toISOString()
    }, { onConflict: 'student_id,word_id' });

    if (error) {
        console.error('Failed to save word progress:', error);
        return showNotificationToast("Couldn't save progress: " + error.message);
    }

    wordBuilderReadWordIds.add(word.id);
    wordBuilderCurrentWordMarkedRead = true;
    renderWordBuilderActionButton();
}
window.markWordBuilderWordRead = markWordBuilderWordRead;

async function advanceWordBuilderWord() {
    if (wordBuilderIndex < wordBuilderWords.length - 1) {
        wordBuilderIndex++;
        renderWordBuilderWordCard();
    } else {
        await renderWordBuilderReviewQuiz();
    }
}
window.advanceWordBuilderWord = advanceWordBuilderWord;

// ---------------------------------------------------------------------------
// Quick recognition check — shown once, after the last word, before the
// level-complete screen. Skipped for very small levels (not enough words
// to build believable wrong answers from).
// ---------------------------------------------------------------------------

function wordBuilderShuffle(arr) {
    return [...arr].sort(() => Math.random() - 0.5);
}

async function renderWordBuilderReviewQuiz() {
    const pool = wordBuilderWords.filter(w => w.english_meaning);
    if (pool.length < 3) {
        return completeWordBuilderLevel();
    }

    const target = pool[Math.floor(Math.random() * pool.length)];
    const distractors = wordBuilderShuffle(pool.filter(w => w.id !== target.id)).slice(0, 2);
    const choices = wordBuilderShuffle([target, ...distractors]);

    const crumb = document.getElementById('wordBuilderLessonCrumb');
    if (crumb) crumb.innerText = 'QUICK CHECK';

    const mount = document.getElementById('wordBuilderLessonMount');
    if (!mount) return;

    mount.innerHTML = `
        <div style="text-align:center; padding-top:16px;">
            <div style="font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#94a3b8; margin-bottom:10px;">Which one says</div>
            <div style="font-size:20px; font-weight:800; color:#1e293b; margin-bottom:22px;">"${target.english_meaning}"</div>
            <div id="wbQuizChoices" style="display:flex; flex-direction:column; gap:10px;">
                ${choices.map(c => `
                    <button style="font-family:'Abyssinica SIL',serif; font-size:22px; padding:14px; background:white;
                                   border:1px solid #e2e8f0; border-radius:14px; cursor:pointer; color:#1e293b;"
                            onclick="answerWordBuilderQuiz(this, '${c.id}', '${target.id}')">${c.amharic_text}</button>
                `).join('')}
            </div>
        </div>
    `;
}

function answerWordBuilderQuiz(btnEl, chosenId, correctId) {
    const buttons = document.querySelectorAll('#wbQuizChoices button');
    buttons.forEach(btn => btn.setAttribute('disabled', 'true'));

    if (chosenId === correctId) {
        btnEl.style.borderColor = '#166534';
        btnEl.style.background = 'rgba(22,101,52,0.08)';
        if (typeof showGobezToast === 'function') showGobezToast('Nice! ✓');
    } else {
        btnEl.style.borderColor = '#dc2626';
        btnEl.style.background = 'rgba(220,38,38,0.06)';
        showNotificationToast('Not quite — take another look at the words.');
    }

    setTimeout(() => completeWordBuilderLevel(), chosenId === correctId ? 500 : 1100);
}
window.answerWordBuilderQuiz = answerWordBuilderQuiz;

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
            <div style="font-size:52px; margin-bottom:10px;">🎉</div>
            <div style="font-size:19px; font-weight:800; color:#1e293b; margin-bottom:4px;">You can now read:</div>
            <div style="font-size:13px; color:#64748b; margin-bottom:22px;">Level ${level.level_number} · ${level.topic_title}</div>
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
        </div>
    `;

    if (typeof showGobezToast === 'function') showGobezToast(`Level ${level.level_number} complete! 🎉`);
}

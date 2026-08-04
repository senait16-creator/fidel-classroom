// =============================================================================
// WORD BUILDER — js/wordbuilder.js
// Self-paced reading path, independent of Fidel Competition's team/level
// progress but loosely mirrors its 12 levels' letter families. The card
// itself is always open — each individual LEVEL unlocks on its own once
// the student has learned that level's letters, checked primarily
// against Fidel Practice (available to every student, team or solo)
// with Competition's streak progress also counting if they have it.
//
// Loads AFTER app.js/reading.js — relies on globals defined there:
//   _supabase, currentUser, currentProfile, showNotificationToast, showScreen
// =============================================================================

// Mirrors challenge_levels.letter_families exactly (pulled from Supabase,
// not guessed) — kept as a constant here since Word Builder's own level
// rows are a separate table and need this mapping to check unlock state.
const WORD_BUILDER_LEVEL_LETTERS = {
    1: ['ሀ', 'ለ', 'ሐ'],
    2: ['መ', 'ሠ', 'ረ'],
    3: ['ሰ', 'ሸ', 'ቀ'],
    4: ['በ', 'ቨ', 'ተ'],
    5: ['ቸ', 'ኀ', 'ነ'],
    6: ['ኘ', 'አ', 'ከ'],
    7: ['ኸ', 'ወ', 'ዐ'],
    8: ['ዘ', 'ዠ', 'የ'],
    9: ['ደ', 'ጀ', 'ገ'],
    10: ['ጠ', 'ጨ', 'ጰ'],
    11: ['ጸ', 'ፀ', 'ፈ'],
    12: ['ፐ']
};

let wordBuilderCurrentLevel = null;
let wordBuilderWords = [];
let wordBuilderReadWordIds = new Set();
let wordBuilderIndex = 0;

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
        .select('id, item_order, amharic_text, transliteration, english_meaning')
        .eq('level_number', levelNumber)
        .order('item_order');

    const { data: progress } = await _supabase
        .from('word_builder_progress')
        .select('word_id')
        .eq('student_id', currentUser.id);

    wordBuilderCurrentLevel = level;
    wordBuilderWords = words || [];
    wordBuilderReadWordIds = new Set((progress || []).map(r => r.word_id));

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

    const level = wordBuilderCurrentLevel;
    const word = wordBuilderWords[wordBuilderIndex];
    crumb.innerText = `LEVEL ${level.level_number} · ${(level.topic_title || '').toUpperCase()}`;

    // Ethiopic syllables are each a single Unicode code point already, so
    // splitting the string into an array of characters is enough to get
    // one chip per Fidel character — no combining marks to worry about.
    const letters = Array.from(word.amharic_text.replace(/\s+/g, ''));

    mount.innerHTML = `
        <div style="background:white; border:1px solid #e2e8f0; border-radius:18px; padding:26px 20px;
                    text-align:center; box-shadow:0 4px 20px rgba(20,83,45,0.07); margin-bottom:16px;">
            <div style="font-family:'Abyssinica SIL',serif; font-size:42px; color:#1e293b; margin-bottom:10px;">${word.amharic_text}</div>
            ${word.transliteration ? `<div style="font-size:13px; color:#64748b; margin-bottom:4px;">${word.transliteration}</div>` : ''}
            ${word.english_meaning ? `<div style="font-size:13.5px; color:#94a3b8; font-style:italic;">"${word.english_meaning}"</div>` : ''}
            <div style="display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-top:14px;">
                ${letters.map(ch => `<span style="font-family:'Abyssinica SIL',serif; font-size:20px; background:#fffbeb; color:#d97706; border-radius:10px; padding:6px 12px;">${ch}</span>`).join('')}
            </div>
        </div>
        <button class="btn-primary" onclick="markWordBuilderWordRead()">I Read It ✓ ${wordBuilderIndex < wordBuilderWords.length - 1 ? 'Next Word →' : 'Finish Level →'}</button>
        <p style="font-size:11.5px; color:#94a3b8; text-align:center; margin-top:14px;">Word ${wordBuilderIndex + 1} of ${wordBuilderWords.length}</p>
    `;
}

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

    if (wordBuilderIndex < wordBuilderWords.length - 1) {
        wordBuilderIndex++;
        renderWordBuilderWordCard();
    } else {
        await completeWordBuilderLevel();
    }
}
window.markWordBuilderWordRead = markWordBuilderWordRead;

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

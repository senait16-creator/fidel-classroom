// =============================================================================
// WORD BUILDER — js/wordbuilder.js
// Self-paced reading path, independent of Fidel Competition's team/level
// progress but loosely mirrors its 12 levels' letter families. Unlocks
// once a student clears their very first letter family (via Competition's
// streak game OR solo Fidel Practice mastery — whichever happens first,
// so students without a team aren't locked out).
//
// Loads AFTER app.js/reading.js — relies on globals defined there:
//   _supabase, currentUser, currentProfile, showNotificationToast, showScreen
// =============================================================================

const WORD_BUILDER_LEVEL_1_LETTERS = ['ሀ', 'ለ', 'ሐ'];

let wordBuilderCurrentLevel = null;
let wordBuilderWords = [];
let wordBuilderReadWordIds = new Set();
let wordBuilderIndex = 0;

// ---------------------------------------------------------------------------
// Unlock check
// ---------------------------------------------------------------------------

async function checkWordBuilderUnlocked() {
    if (!currentUser) return false;

    const [{ data: familyRows }, { data: practiceRow }] = await Promise.all([
        _supabase.from('student_family_progress')
            .select('base_letter, streak_passed')
            .eq('student_id', currentUser.id)
            .in('base_letter', WORD_BUILDER_LEVEL_1_LETTERS),
        _supabase.from('user_progress')
            .select('mastered_letters')
            .eq('user_id', currentUser.id)
            .maybeSingle()
    ]);

    const clearedViaCompetition = WORD_BUILDER_LEVEL_1_LETTERS.every(letter =>
        (familyRows || []).some(r => r.base_letter === letter && r.streak_passed)
    );
    const masteredViaPractice = WORD_BUILDER_LEVEL_1_LETTERS.every(letter =>
        (practiceRow?.mastered_letters || []).includes(letter)
    );

    return clearedViaCompetition || masteredViaPractice;
}

// Called from enterModeSelect() so the cup card reflects real unlock
// state every time the home screen is shown, not just once at login.
async function refreshWordBuilderCupCard() {
    const card = document.getElementById('wordBuilderCupCard');
    const desc = document.getElementById('wordBuilderCupDesc');
    if (!card || !desc) return;

    const unlocked = await checkWordBuilderUnlocked();
    card.classList.toggle('cup-card-locked', !unlocked);

    let lockNote = card.querySelector('.cup-card-lock-note');
    if (!unlocked) {
        desc.innerText = 'Sound out real words, one small step at a time';
        if (!lockNote) {
            lockNote = document.createElement('div');
            lockNote.className = 'cup-card-lock-note';
            card.appendChild(lockNote);
        }
        lockNote.innerText = '🔒 Unlocks after your first letter family';
    } else if (lockNote) {
        lockNote.remove();
    }
}
window.refreshWordBuilderCupCard = refreshWordBuilderCupCard;

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function enterWordBuilder() {
    const unlocked = await checkWordBuilderUnlocked();
    if (!unlocked) {
        return showNotificationToast('🔒 Word Builder unlocks after your first letter family — keep going in Fidel Practice or Competition!');
    }
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

    const [{ data: levels }, { data: wordRows }, { data: levelProgress }] = await Promise.all([
        _supabase.from('word_builder_levels').select('level_number, topic_title, topic_emoji').order('level_number'),
        _supabase.from('word_builder_words').select('id, level_number'),
        _supabase.from('word_builder_level_progress').select('level_number').eq('student_id', currentUser.id)
    ]);

    if (!levels || levels.length === 0) {
        mount.innerHTML = '<p style="color:#94a3b8; font-size:13px;">No levels set up yet, check back soon.</p>';
        return;
    }

    const wordCountByLevel = {};
    (wordRows || []).forEach(w => { wordCountByLevel[w.level_number] = (wordCountByLevel[w.level_number] || 0) + 1; });

    const completedLevels = new Set((levelProgress || []).map(r => r.level_number));

    // Resume at the first not-yet-completed level with content — same
    // "first incomplete" pattern used everywhere else in the app.
    let reachedFirstIncomplete = false;

    mount.innerHTML = levels.map(level => {
        const done = completedLevels.has(level.level_number);
        const hasWords = (wordCountByLevel[level.level_number] || 0) > 0;
        const isNext = !done && hasWords && !reachedFirstIncomplete;
        if (isNext) reachedFirstIncomplete = true;
        const locked = !done && !isNext;

        const stateIcon = done ? '✓' : (locked ? '🔒' : level.level_number);
        const rowStyle = locked
            ? 'opacity:0.55;'
            : '';
        const numBg = done ? 'rgba(22,101,52,0.1)' : (locked ? '#e2e8f0' : '#fffbeb');
        const numColor = done ? '#166534' : (locked ? '#94a3b8' : '#d97706');

        return `
            <div class="word-builder-level-row" style="display:flex; align-items:center; gap:12px; background:white;
                        border:1px solid #e2e8f0; border-radius:14px; padding:12px 14px; margin-bottom:9px; ${rowStyle}
                        ${!locked ? 'cursor:pointer;' : ''}"
                 ${!locked ? `onclick="openWordBuilderLevel(${level.level_number})"` : ''}>
                <div style="width:32px; height:32px; border-radius:10px; display:flex; align-items:center; justify-content:center;
                            font-weight:800; font-size:13px; flex-shrink:0; background:${numBg}; color:${numColor};">${stateIcon}</div>
                <div style="flex:1;">
                    <div style="font-size:13.5px; font-weight:700; color:#1e293b;">${level.level_number} · ${level.topic_emoji || ''} ${level.topic_title}</div>
                    <div style="font-size:11px; color:#94a3b8; margin-top:1px;">${hasWords ? `${wordCountByLevel[level.level_number]} words` : 'Coming soon'}</div>
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

    const { data: nextLevel } = await _supabase
        .from('word_builder_levels')
        .select('level_number, topic_title')
        .eq('level_number', level.level_number + 1)
        .maybeSingle();

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
            ${nextLevel
                ? `<button class="btn-primary" onclick="openWordBuilderLevel(${nextLevel.level_number})">Continue to Level ${nextLevel.level_number} →</button>`
                : `<button class="btn-primary" onclick="showScreen('wordBuilderLevelsScreen'); renderWordBuilderLevelsList();">Back to Levels</button>`}
        </div>
    `;

    if (typeof showGobezToast === 'function') showGobezToast(`Level ${level.level_number} complete! 🎉`);
}

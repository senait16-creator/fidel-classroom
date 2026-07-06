// =============================================================================
// letterboard.js — Full Letter Board (free exploration, no levels)
// All 33+ Amharic families in traditional Ge'ez order, grouped by 8.
// Load order: after app.js, before challenge.js
// =============================================================================

const FIDEL_BOARD_GROUPS = [
    {
        label: 'Group 1 · ሀ ለ ሐ መ',
        families: [
            { base: 'ሀ', sound: 'ha' },
            { base: 'ለ', sound: 'le' },
            { base: 'ሐ', sound: 'ḥa' },
            { base: 'መ', sound: 'me' },
        ]
    },
    {
        label: 'Group 2 · ሠ ረ ሰ ሸ',
        families: [
            { base: 'ሠ', sound: 'śe' },
            { base: 'ረ', sound: 're' },
            { base: 'ሰ', sound: 'se' },
            { base: 'ሸ', sound: 'she' },
        ]
    },
    {
        label: 'Group 3 · ቀ በ',
        families: [
            { base: 'ቀ', sound: 'qe' },
            { base: 'በ', sound: 'be' },
            { base: 'ተ', sound: 'te' },
            { base: 'ቸ', sound: 'che' },
        ]
    },
    {
        label: 'Group 4 · ተ ቸ ኀ ነ',
        families: [
            { base: 'ኀ', sound: 'ḫa' },
            { base: 'ነ', sound: 'ne' },
            { base: 'ኘ', sound: 'ñe' },
            { base: 'አ', sound: 'a' },
        ]
    },
    {
        label: 'Group 5 · ኘ አ ከ ኸ',
        families: [
            { base: 'ከ', sound: 'ke' },
            { base: 'ኸ', sound: 'ḵe' },
             { base: 'ወ', sound: 'we' },
            { base: 'ዐ', sound: 'ʿa' },
        ]
    },
    {
        label: 'Group 6 · ወ ዐ ዘ ዠ',
        families: [
            { base: 'ዘ', sound: 'ze' },
            { base: 'ዠ', sound: 'zhe' },
             { base: 'የ', sound: 'ye' },
            { base: 'ደ', sound: 'de' },
        ]
    },
    {
        label: 'Group 7 · የ ደ ጀ ገ',
        families: [
            { base: 'ጀ', sound: 'je' },
            { base: 'ገ', sound: 'ge' },
             { base: 'ጠ', sound: 'ṭe' },
            { base: 'ጨ', sound: 'č̣e' },
        ]
    },
    {
        label: 'Group 8 · ጠ ጨ ጰ ጸ ፀ ፈ ፐ',
        families: [
            { base: 'ጰ', sound: 'p̣e' },
            { base: 'ጸ', sound: 'ṣe' },
            { base: 'ፀ', sound: 'ṣ́e' },
            { base: 'ፈ', sound: 'fe' },
            { base: 'ፐ', sound: 'pe' },
        ]
    }
];

let _lbProgressCache = null;
let _lbSearchQuery = '';

async function openLetterBoard() {
    const screen = document.getElementById('letterBoardScreen');
    if (!screen) return;

    showScreen('letterBoardScreen', 'flex');

    // Load progress
    await loadLetterBoardProgress();
    renderLetterBoard('');

    // Wire search
    const search = document.getElementById('lbSearchInput');
    if (search) {
        search.oninput = (e) => {
            _lbSearchQuery = e.target.value.trim().toLowerCase();
            renderLetterBoard(_lbSearchQuery);
        };
    }
}
window.openLetterBoard = openLetterBoard;

function closeLetterBoard() {
    const screen = document.getElementById('letterBoardScreen');
    if (screen) screen.style.display = 'none';
    // Return to mode select
    if (typeof enterModeSelect === 'function') enterModeSelect();
}
window.closeLetterBoard = closeLetterBoard;

function openLetterBoardFlashcards() {
    const screen = document.getElementById('letterBoardScreen');
    if (screen) screen.style.display = 'none';

    if (typeof openFlashcardStudy === 'function') {
        const boardLetters = FIDEL_BOARD_GROUPS.flatMap(group => group.families.map(fam => fam.base));
        const boardDeck = alphabetData
            .filter(item => boardLetters.includes(item.base))
            .flatMap(item => item.family.map((char, idx) => ({ char, sound: subs[idx] })));

        openFlashcardStudy(boardDeck, 'All Letters', () => {
            if (screen) screen.style.display = 'flex';
        });
    }
}
window.openLetterBoardFlashcards = openLetterBoardFlashcards;

async function loadLetterBoardProgress() {
    if (!currentUser) return;
    try {
        const { data } = await _supabase
            .from('student_family_progress')
            .select('base_letter, streak_passed, writing_passed')
            .eq('student_id', currentUser.id);

        _lbProgressCache = {};
        (data || []).forEach(row => {
            if (row.streak_passed && row.writing_passed) {
                _lbProgressCache[row.base_letter] = 'mastered';
            } else if (row.streak_passed || row.writing_passed) {
                _lbProgressCache[row.base_letter] = 'practicing';
            }
        });

        // Also check mastered letters from practice mode (best_streak >= threshold)
        const { data: practiceData } = await _supabase
            .from('student_family_progress')
            .select('base_letter, best_streak')
            .eq('student_id', currentUser.id)
            .gte('best_streak', 10);

        (practiceData || []).forEach(row => {
            if (!_lbProgressCache[row.base_letter]) {
                _lbProgressCache[row.base_letter] = 'practicing';
            }
        });
    } catch(e) {
        _lbProgressCache = {};
    }
}

function renderLetterBoard(query) {
    const mount = document.getElementById('lbBodyMount');
    if (!mount) return;
    mount.innerHTML = '';

    const progress = _lbProgressCache || {};

    // Legend
    const legend = document.createElement('div');
    legend.className = 'lb-legend';
    legend.innerHTML = `
        <div class="lb-legend-item"><div class="lb-legend-dot" style="background:#10b981;"></div>Mastered</div>
        <div class="lb-legend-item"><div class="lb-legend-dot" style="background:#ca8a04;"></div>Practicing</div>
        <div class="lb-legend-item"><div class="lb-legend-dot" style="background:#e2e8f0;"></div>Not started</div>
    `;
    mount.appendChild(legend);

    FIDEL_BOARD_GROUPS.forEach(group => {
        const filtered = query
            ? group.families.filter(f =>
                f.sound.toLowerCase().includes(query) ||
                f.base.includes(query)
              )
            : group.families;

        if (filtered.length === 0) return;

        const groupLabel = document.createElement('div');
        groupLabel.className = 'lb-group-label';
        groupLabel.innerText = group.label;
        mount.appendChild(groupLabel);

        const grid = document.createElement('div');
        grid.className = 'lb-family-grid';

        filtered.forEach(fam => {
            const status = progress[fam.base] || 'empty';
            const tile = document.createElement('div');
            tile.className = `lb-family-tile ${
                status === 'mastered'  ? 'lbt-mastered'  :
                status === 'practicing' ? 'lbt-practicing' : ''
            } ${
                query && (fam.sound.toLowerCase().includes(query) || fam.base.includes(query))
                    ? 'lbt-highlighted' : ''
            }`;

            tile.innerHTML = `
                <div class="lbt-letter">${fam.base}</div>
                <div class="lbt-sound">${fam.sound}</div>
                <div class="lbt-dot ${
                    status === 'mastered'   ? 'dot-done'     :
                    status === 'practicing' ? 'dot-progress' : 'dot-empty'
                }"></div>
            `;

            tile.onclick = () => openFamilyFromBoard(fam.base);
            grid.appendChild(tile);
        });

        mount.appendChild(grid);
    });

    if (mount.querySelectorAll('.lb-family-tile').length === 0) {
        mount.innerHTML += `
            <div style="text-align:center;padding:32px 16px;color:#94a3b8;font-size:13px;">
                No families match "${query}"
            </div>
        `;
    }
}

async function openFamilyFromBoard(baseLetter) {
    const fidelObj = alphabetData.find(item => item.base === baseLetter);
    if (!fidelObj) return;

    if (typeof openEmbeddedFamilyPractice !== 'function') {
        // Fallback: open matching game
        return openMatchingGameWorkspaceMode(fidelObj);
    }

    // Look up this family's real progress so the practice sheet's writing
    // step is gated correctly (locked until the matching-game streak passes).
    const { data: progress } = await _supabase
        .from('student_family_progress')
        .select('best_streak, streak_passed, writing_passed')
        .eq('student_id', currentUser.id)
        .eq('base_letter', baseLetter)
        .maybeSingle();

    document.getElementById('letterBoardScreen').style.display = 'none';
    openEmbeddedFamilyPractice(fidelObj, null, progress || {}, 'letterBoard');
}
window.openFamilyFromBoard = openFamilyFromBoard;

window.openLetterBoard  = openLetterBoard;
window.closeLetterBoard = closeLetterBoard;

// =============================================================================
// letterboard.js — Full Letter Board (free exploration, no levels)
// All 34 Amharic families in traditional Ge'ez order, grouped in rows of 3 —
// one row per Fidel Competition level, so a student practicing solo sees the
// exact same level boundaries a Competition team would. Every 2 rows (6
// letters) lines up with one Word Builder level, so a link to that level
// appears after every 2nd row.
// Load order: after app.js, before challenge.js
// =============================================================================

const FIDEL_BOARD_LEVELS = [
    { level: 1,  families: [{ base: 'ሀ', sound: 'ha' },  { base: 'ለ', sound: 'le' },   { base: 'ሐ', sound: 'ḥa' }] },
    { level: 2,  families: [{ base: 'መ', sound: 'me' },  { base: 'ሠ', sound: 'śe' },   { base: 'ረ', sound: 're' }] },
    { level: 3,  families: [{ base: 'ሰ', sound: 'se' },  { base: 'ሸ', sound: 'she' },  { base: 'ቀ', sound: 'qe' }] },
    { level: 4,  families: [{ base: 'በ', sound: 'be' },  { base: 'ቨ', sound: 've' },   { base: 'ተ', sound: 'te' }] },
    { level: 5,  families: [{ base: 'ቸ', sound: 'che' }, { base: 'ኀ', sound: 'ḫa' },   { base: 'ነ', sound: 'ne' }] },
    { level: 6,  families: [{ base: 'ኘ', sound: 'ñe' },  { base: 'አ', sound: 'a' },    { base: 'ከ', sound: 'ke' }] },
    { level: 7,  families: [{ base: 'ኸ', sound: 'ḵe' },  { base: 'ወ', sound: 'we' },   { base: 'ዐ', sound: 'ʿa' }] },
    { level: 8,  families: [{ base: 'ዘ', sound: 'ze' },  { base: 'ዠ', sound: 'zhe' },  { base: 'የ', sound: 'ye' }] },
    { level: 9,  families: [{ base: 'ደ', sound: 'de' },  { base: 'ጀ', sound: 'je' },   { base: 'ገ', sound: 'ge' }] },
    { level: 10, families: [{ base: 'ጠ', sound: 'ṭe' },  { base: 'ጨ', sound: 'č̣e' },  { base: 'ጰ', sound: 'p̣e' }] },
    { level: 11, families: [{ base: 'ጸ', sound: 'ṣe' },  { base: 'ፀ', sound: 'ṣ́e' },  { base: 'ፈ', sound: 'fe' }] },
    { level: 12, families: [{ base: 'ፐ', sound: 'pe' }] },
];

// ቐ isn't part of the Competition/Word Builder level system (34 families,
// not 35) — kept as a standalone bonus row at the end rather than dropped.
const FIDEL_BOARD_BONUS_FAMILY = { base: 'ቐ', sound: 'qʷe' };

// "1st set", "2nd set" ... instead of "Level N" — Fidel Practice is free
// play, not a leveled mode, so "set" better matches what it actually is.
const ORDINAL_WORDS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];
function ordinalSetLabel(n) {
    return `${ORDINAL_WORDS[n - 1] || `${n}th`} set`;
}

let _lbProgressCache = null;
let _lbSearchQuery = '';

// Carried over from the retired Explore page — external/quick-access links
// that don't belong to a specific letter family, so they live below the
// board itself rather than needing their own destination screen.
const LETTER_BOARD_QUICK_LINKS = [
    {
        icon: '🗂️', label: 'Flashcards',
        desc: 'Flip through the full Fidel alphabet',
        action: () => {
            document.getElementById('letterBoardScreen').style.display = 'none';
            openFlashcardStudy(buildFlashcardDeckForFullAlphabet(), 'All Letters', () => {
                document.getElementById('letterBoardScreen').style.display = 'flex';
            });
        }
    },
    {
        icon: '🟩', label: 'Daily Wordle',
        desc: "Today's Amharic word puzzle",
        action: () => openWordleOverlay(true)
    },
    {
        icon: '▶️', label: 'Start Here Video',
        desc: 'Watch the intro before starting the challenge',
        href: 'https://www.youtube.com/watch?v=QgssO7_WkSk&t=160s'
    },
    {
        icon: icon('speaker'), label: 'Letter Sounds',
        desc: 'Hear Fidel sounds pronounced out loud',
        href: 'https://amharicteacher.com/hahu'
    },
    {
        icon: icon('music'), label: 'Alphabet Songs',
        desc: 'Use music for extra letter review',
        href: 'https://www.youtube.com/results?search_query=amharic+alphabet+song'
    },
    {
        icon: icon('globe'), label: 'AmharicTeacher.com',
        desc: 'Full external course library',
        href: 'https://amharicteacher.com'
    }
];

function renderLetterBoardQuickLinks() {
    const mount = document.getElementById('lbQuickLinksMount');
    if (!mount) return;

    mount.innerHTML = '';
    LETTER_BOARD_QUICK_LINKS.forEach(item => {
        const el = document.createElement(item.href ? 'a' : 'div');
        el.className = 'challenge-resource-link';
        if (item.href) {
            el.href = item.href;
            el.target = '_blank';
            el.rel = 'noopener';
        } else {
            el.style.cursor = 'pointer';
            el.onclick = item.action;
        }
        el.innerHTML = `
            <span>${item.icon}</span>
            <div>
                <strong>${item.label}</strong>
                <small>${item.desc}</small>
            </div>`;
        mount.appendChild(el);
    });
}

async function openLetterBoard() {
    const screen = document.getElementById('letterBoardScreen');
    if (!screen) return;

    showScreen('letterBoardScreen', 'flex');

    // Load progress
    await loadLetterBoardProgress();
    renderLetterBoard('');
    renderLetterBoardQuickLinks();

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

    const renderFamilyRow = (label, families) => {
        const filtered = query
            ? families.filter(f =>
                f.sound.toLowerCase().includes(query) ||
                f.base.includes(query)
              )
            : families;

        if (filtered.length === 0) return;

        const groupLabel = document.createElement('div');
        groupLabel.className = 'lb-group-label';
        groupLabel.innerText = label;
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
    };

    FIDEL_BOARD_LEVELS.forEach(row => {
        const label = `${ordinalSetLabel(row.level)} · ${row.families.map(f => f.base).join(' ')}`;
        renderFamilyRow(label, row.families);

        // Every 2 rows = 6 letters = one Word Builder level's worth of
        // Fidel, so a solo practicer can jump straight there once they've
        // covered them — mirrors how Competition levels pair up already.
        if (row.level % 2 === 0 && !query) {
            const wbLevel = row.level / 2;
            const link = document.createElement('div');
            link.className = 'lb-wordbuilder-link';
            link.innerHTML = `${icon('book-open')} Go to Word Builder Level ${wbLevel} <span class="lb-wordbuilder-link-arrow">→</span>`;
            link.onclick = () => { if (typeof enterWordBuilder === 'function') enterWordBuilder(); };
            mount.appendChild(link);
        }
    });

    renderFamilyRow('Extra · not in a Competition level', [FIDEL_BOARD_BONUS_FAMILY]);

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

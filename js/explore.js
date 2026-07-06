// =============================================================================
// EXPLORE.JS
// The content library: "let me browse everything." Deliberately does not
// store or duplicate content — it links into things that already exist
// (flashcards, Wordle) plus external resources. Categories with no real
// destination yet render as locked rows instead of dead links, so the map
// of what's coming is visible without faking a feature that isn't built.
//
// Loads AFTER: app.js, game.js (flashcards), wordle.js.
// =============================================================================

const EXPLORE_CATEGORIES = [
    {
        title: '🔤 Flashcards',
        items: [
            {
                icon: '🗂️', label: 'Study All Letters',
                desc: 'Flip through the full Fidel alphabet',
                action: () => {
                    document.getElementById('exploreScreen').style.display = 'none';
                    openFlashcardStudy(buildFlashcardDeckForFullAlphabet(), 'All Letters', () => {
                        document.getElementById('exploreScreen').style.display = 'block';
                    });
                }
            }
        ]
    },
    {
        title: '🎮 Games',
        items: [
            {
                icon: '🟩', label: 'Daily Wordle',
                desc: "Today's Amharic word puzzle",
                action: () => openWordleOverlay(true)
            }
        ]
    },
    {
        title: '🎵 Songs & Pronunciation',
        items: [
            {
                icon: '▶️', label: 'Start Here Video',
                desc: 'Watch the intro before starting the challenge',
                href: 'https://www.youtube.com/watch?v=QgssO7_WkSk&t=160s'
            },
            {
                icon: '🔊', label: 'Letter Sounds',
                desc: 'Hear Fidel sounds pronounced out loud',
                href: 'https://amharicteacher.com/hahu'
            },
            {
                icon: '🎵', label: 'Alphabet Songs',
                desc: 'Use music for extra letter review',
                href: 'https://www.youtube.com/results?search_query=amharic+alphabet+song'
            }
        ]
    },
    {
        title: '📖 Reading',
        locked: true,
        items: [
            { icon: '📖', label: 'Reading Practice', desc: 'Real Amharic sentences' }
        ]
    },
    {
        title: '🗣️ Conversation Practice',
        locked: true,
        items: [
            { icon: '💬', label: 'Speaking Prompts', desc: 'Practice real conversations' }
        ]
    },
    {
        title: '🇪🇹 Ethiopian Culture',
        locked: true,
        items: [
            { icon: '🇪🇹', label: 'Culture Lessons', desc: 'History, holidays, and traditions' }
        ]
    },
    {
        title: '🔗 More Resources',
        items: [
            {
                icon: '🌐', label: 'AmharicTeacher.com',
                desc: 'Full external course library',
                href: 'https://amharicteacher.com'
            }
        ]
    }
];

// In-app actions can't be inlined into an HTML string as real closures, so
// they're kept in this array and dispatched by index instead.
let _exploreActionHandlers = [];

function renderExploreItem(category, item) {
    if (category.locked || (!item.href && !item.action)) {
        return `
            <div class="challenge-resource-link explore-link-locked">
                <span>${item.icon}</span>
                <div>
                    <strong>${item.label}</strong>
                    <small>🔒 Coming soon — ${item.desc}</small>
                </div>
            </div>`;
    }

    if (item.href) {
        return `
            <a class="challenge-resource-link" href="${item.href}" target="_blank" rel="noopener">
                <span>${item.icon}</span>
                <div>
                    <strong>${item.label}</strong>
                    <small>${item.desc}</small>
                </div>
            </a>`;
    }

    const handlerId = _exploreActionHandlers.length;
    _exploreActionHandlers.push(item.action);
    return `
        <a class="challenge-resource-link" href="javascript:void(0)" onclick="runExploreAction(${handlerId})">
            <span>${item.icon}</span>
            <div>
                <strong>${item.label}</strong>
                <small>${item.desc}</small>
            </div>
        </a>`;
}

function runExploreAction(handlerId) {
    const fn = _exploreActionHandlers[handlerId];
    if (typeof fn === 'function') fn();
}

function renderExploreCategories() {
    const mount = document.getElementById('exploreCategoriesMount');
    if (!mount) return;

    _exploreActionHandlers = [];

    mount.innerHTML = EXPLORE_CATEGORIES.map(category => `
        <div class="explore-category">
            <div class="explore-category-title">${category.title}</div>
            <div class="challenge-resource-links">
                ${category.items.map(item => renderExploreItem(category, item)).join('')}
            </div>
        </div>
    `).join('');
}

// ---------------------------------------------------------------------------
// Entry / exit
// ---------------------------------------------------------------------------

function chooseModeExplore() {
    showScreen("exploreScreen");
    renderExploreCategories();
}

function exitExplore() {
    const screen = document.getElementById("exploreScreen");
    if (screen) screen.style.display = "none";
    if (typeof enterModeSelect === "function") enterModeSelect();
}

// ---------------------------------------------------------------------------
// Expose
// ---------------------------------------------------------------------------

window.chooseModeExplore = chooseModeExplore;
window.exitExplore = exitExplore;
window.runExploreAction = runExploreAction;
window.renderExploreCategories = renderExploreCategories;

// =============================================================================
// NAVIGATION.JS
// One centralized screen manager. Every full-page destination reachable
// after login is listed in ALL_SCREENS; showScreen() is the ONLY function
// that should ever toggle one of these on. It always hides every other
// listed screen first, so two of them can never end up visible at once —
// regardless of which of the several entry points (mode-select, hamburger
// menu, a "back" button, an internal redirect) the user took to get there.
//
// This replaced ~8 separate, drifting hide-lists that had accumulated
// across community.js, explore.js, candostatements.js, challenge.js,
// menu.js, submissions.js, team/hub.js, and this file's own old version —
// each one written at a different point in the app's life, so none of them
// agreed on the full set of screens that needed hiding. That's what caused
// screens to visibly overlap: e.g. switchModeFromMenu() never knew about
// communityScreen/exploreScreen/canDoScreen because it was written before
// those existed.
//
// Pre-login screens (authScreen, profileSetupScreen, forgotPasswordScreen,
// newPasswordScreen) are deliberately NOT in this list — that flow is a
// linear wizard managed entirely by auth.js, already hides itself correctly
// before handing off to launchDashboard(), and touching it isn't needed to
// fix the reported bug (which is screens overlapping AFTER login).
//
// Loads FIRST, before any feature file that calls showScreen()/hideAllScreens().
// =============================================================================

const ALL_SCREENS = [
    "modeSelectScreen",
    "studentDashboard",
    "teacherOnlyDashboard",
    "captainDashboardScreen",
    "challengeDashboardScreen",
    "challengeLevelsScreen",
    "challengeFamilyScreen",
    "challengeFamilyDetailScreen",
    "amharicPathGateScreen",
    "amharicPathChooseScreen",
    "amharicPathTrackScreen",
    "guidedPathScreen",
    "amharicPathHomeScreen",
    "readingLevelsScreen",
    "readingLevelDetailScreen",
    "studyTogetherScreen",
    "myGrowthScreen",
    "letterBoardScreen",
    "writingSubmitScreen",
    "communityScreen",
    "canDoScreen",
    "gameWorkspace",
    "flashcardScreen",
    "familyPracticeSheet",
    "wordBuilderLevelsScreen",
    "wordBuilderLessonScreen"
];

function hideAllScreens() {
    ALL_SCREENS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
    });
}

// The hamburger button used to float fixed over every screen, covering
// content while scrolling and showing up even on focused practice screens
// that already have their own Back button. Now it's a single shared DOM
// node that gets physically moved into a small header slot on just the two
// screens that are real navigation hubs with no Back button of their own —
// everywhere else it's hidden, since Back already gets you where you need
// to go.
const HAMBURGER_HOST_SLOTS = {
    modeSelectScreen: "modeSelectMenuSlot",
    challengeDashboardScreen: "challengeDashMenuSlot"
};

function syncHamburgerHost(screenId) {
    const hamburger = document.getElementById("hamburgerBtn");
    if (!hamburger) return;

    const slotId = HAMBURGER_HOST_SLOTS[screenId];
    if (!slotId) {
        hamburger.style.display = "none";
        return;
    }

    const slot = document.getElementById(slotId);
    if (slot) slot.appendChild(hamburger);
    hamburger.style.display = "flex";
}

function showScreen(screenId, displayMode) {
    hideAllScreens();

    const target = document.getElementById(screenId);
    if (target) target.style.display = displayMode || "block";

    syncHamburgerHost(screenId);

    // Community's icon only makes sense as a shortcut off the home
    // screen — everywhere else it'd just be a second, confusing way
    // back into a screen the hamburger menu already reaches.
    const communityIcon = document.getElementById("communityIconBtn");
    if (communityIcon) communityIcon.style.display = (screenId === "modeSelectScreen") ? "flex" : "none";
}

window.showScreen = showScreen;
window.hideAllScreens = hideAllScreens;
window.syncHamburgerHost = syncHamburgerHost;
window.ALL_SCREENS = ALL_SCREENS;

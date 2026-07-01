// =============================================================================
// JS/MENU.JS
// Hamburger menu — available on all screens after login.
// Contains: Profile, Rules, Resources, Switch Mode, Log Out.
// Loads AFTER app.js, auth.js, challenge.js.
// =============================================================================

// ---------------------------------------------------------------------------
// Open / Close
// ---------------------------------------------------------------------------

function openHamburgerMenu() {
    document.getElementById('hamburgerMenuOverlay').style.display = 'block';
    document.getElementById('hamburgerMenuPanel').style.transform = 'translateX(0)';
}

function closeHamburgerMenu() {
    document.getElementById('hamburgerMenuPanel').style.transform = 'translateX(100%)';
    setTimeout(() => {
        document.getElementById('hamburgerMenuOverlay').style.display = 'none';
    }, 250);
}

// ---------------------------------------------------------------------------
// Rules card
// ---------------------------------------------------------------------------

function showRulesCard() {
    closeHamburgerMenu();
    setTimeout(() => {
        document.getElementById('rulesCardOverlay').style.display = 'flex';
    }, 260);
}

function closeRulesCard() {
    document.getElementById('rulesCardOverlay').style.display = 'none';
}

// ---------------------------------------------------------------------------
// Resources card
// ---------------------------------------------------------------------------

function showResourcesCard() {
    closeHamburgerMenu();
    setTimeout(() => {
        document.getElementById('resourcesCardOverlay').style.display = 'flex';
    }, 260);
}

function closeResourcesCard() {
    document.getElementById('resourcesCardOverlay').style.display = 'none';
}

// ---------------------------------------------------------------------------
// Switch Mode — shows mode select screen from anywhere
// ---------------------------------------------------------------------------

function switchModeFromMenu() {
    closeHamburgerMenu();
    setTimeout(() => {
        // Hide all screens
        document.getElementById('studentDashboard').style.display = 'none';
        document.getElementById('teamHubScreen').style.display = 'none';
        document.getElementById('challengeLevelsScreen').style.display = 'none';
        document.getElementById('challengeFamilyScreen').style.display = 'none';
        document.getElementById('challengeFamilyDetailScreen').style.display = 'none';
        document.getElementById('readingLevelsScreen').style.display = 'none';
        document.getElementById('captainDashboardScreen').style.display = 'none';
        document.getElementById('familyPracticeSheet').style.display = 'none';
        document.getElementById('gameWorkspace').style.display = 'none';
        document.getElementById('flashcardScreen').style.display = 'none';
        // Show mode select
        document.getElementById('modeSelectScreen').style.display = 'block';
        const nickname = currentProfile?.nickname ? `, ${currentProfile.nickname}` : '';
        const nicknameEl = document.getElementById('modeSelectNickname');
        if (nicknameEl) nicknameEl.innerText = nickname;
    }, 260);
}

// ---------------------------------------------------------------------------
// Profile edit from menu
// ---------------------------------------------------------------------------

function openProfileFromMenu() {
    closeHamburgerMenu();
    setTimeout(() => {
        openProfileEdit();
    }, 260);
}

// ---------------------------------------------------------------------------
// Log out from menu
// ---------------------------------------------------------------------------

function logoutFromMenu() {
    closeHamburgerMenu();
    setTimeout(() => {
        logout();
    }, 260);
}

// ---------------------------------------------------------------------------
// Show/hide the hamburger button based on login state
// Call this after login and after logout
// ---------------------------------------------------------------------------

function showHamburgerBtn() {
    const btn = document.getElementById('hamburgerBtn');
    if (btn) btn.style.display = 'flex';
}

function hideHamburgerBtn() {
    const btn = document.getElementById('hamburgerBtn');
    if (btn) btn.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Expose
// ---------------------------------------------------------------------------

window.openHamburgerMenu = openHamburgerMenu;
window.closeHamburgerMenu = closeHamburgerMenu;
window.showRulesCard = showRulesCard;
window.closeRulesCard = closeRulesCard;
window.showResourcesCard = showResourcesCard;
window.closeResourcesCard = closeResourcesCard;
window.switchModeFromMenu = switchModeFromMenu;
window.openProfileFromMenu = openProfileFromMenu;
window.logoutFromMenu = logoutFromMenu;
window.showHamburgerBtn = showHamburgerBtn;
window.hideHamburgerBtn = hideHamburgerBtn;

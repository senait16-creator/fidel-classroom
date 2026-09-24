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
    const panel = document.getElementById('hamburgerMenuPanel');
    panel.style.transform = 'translateX(0)';
    panel.style.boxShadow = '-8px 0 32px rgba(0,0,0,0.15)';
    if (typeof updatePushMenuButton === 'function') updatePushMenuButton();
}

function closeHamburgerMenu() {
    document.getElementById('hamburgerMenuPanel').style.transform = 'translateX(100%)';
    setTimeout(() => {
        document.getElementById('hamburgerMenuOverlay').style.display = 'none';
        // The panel sits just off-screen at rest -- its own box-shadow, left
        // on unconditionally, bled ~40px past the panel's edge into the
        // viewport as a permanent gray sliver down the right side of every
        // screen. Clearing it once the slide-out finishes removes that.
        document.getElementById('hamburgerMenuPanel').style.boxShadow = 'none';
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
        showScreen('modeSelectScreen', 'flex');
        if (typeof applyModeLockStyling === 'function') applyModeLockStyling();
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

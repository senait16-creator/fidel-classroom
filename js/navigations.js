function showScreen(screenId) {
    [
        "modeSelectScreen",
        "studentDashboard",
        "challengeDashboardScreen",
        "challengeLevelsScreen",
        "challengeFamilyScreen",
        "challengeFamilyDetailScreen",
        "teamHubScreen",
        "captainDashboardScreen",
        "readingLevelsScreen",
        "letterBoardScreen",
        "gameWorkspace"
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
    });

    const target = document.getElementById(screenId);
    if (target) target.style.display = "block";

    const hamburger = document.getElementById("hamburgerBtn");
    if (hamburger) hamburger.style.display = "flex";
}

window.showScreen = showScreen;

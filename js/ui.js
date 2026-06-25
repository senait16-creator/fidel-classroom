export function showScreen(screenId) {
    // Hide all screens
    document.querySelectorAll('.app-card, #teacherOnlyDashboard, #studentDashboard').forEach(el => {
        el.style.display = 'none';
    });
    // Show only the one requested
    document.getElementById(screenId).style.display = 'block';
}

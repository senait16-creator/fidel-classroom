// js/state.js
export function updateAuthState(user) {
    const authScreen = document.getElementById('authScreen');
    const studentDashboard = document.getElementById('studentDashboard');
    const teacherOnlyDashboard = document.getElementById('teacherOnlyDashboard');

    if (user) {
        // User is logged in
        authScreen.style.display = 'none';
        // Logic: Check if teacher or student here
        studentDashboard.style.display = 'block'; 
    } else {
        // User is logged out
        authScreen.style.display = 'block';
        studentDashboard.style.display = 'none';
        teacherOnlyDashboard.style.display = 'none';
    }
}

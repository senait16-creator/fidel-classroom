async function loadTeacherRoster() {
    const { data, error } = await _supabase
        .from('profiles')
        .select('display_name, team_color, role')
        .neq('role', 'teacher'); // We usually don't need to roster the teacher

    if (error) return showNotificationToast("Error loading roster: " + error.message);

    const tbody = document.getElementById('teacherRosterTableBody');
    tbody.innerHTML = data.map(student => `
        <tr>
            <td>${student.display_name}</td>
            <td>${student.team_color || 'Unassigned'}</td>
            <td>${student.role}</td>
        </tr>
    `).join('');
}
async function teacherAssignStudentToPod(studentId, newTeamColor) {
    const { error } = await _supabase
        .from('profiles')
        .update({ team_color: newTeamColor })
        .eq('id', studentId);

    if (error) {
        showNotificationToast("Failed to assign: " + error.message);
    } else {
        showNotificationToast("Team updated successfully!");
        loadTeacherRoster(); // Refresh the list
    }
}

async function initTeacherDashboard() {
    // 1. Load the table
    loadTeacherRoster();

    // 2. Populate the 'Student' dropdown
    const { data: students } = await _supabase.from('profiles').select('id, display_name');
    const studentSelect = document.getElementById('teacherStudentSelect');
    studentSelect.innerHTML = students.map(s => `<option value="${s.id}">${s.display_name}</option>`).join('');

    // 3. Populate the 'Team' dropdown
    const podSelect = document.getElementById('teacherPodSelect');
    podSelect.innerHTML = CLASSROOM_COLORS.map(c => `<option value="${c}">${c}</option>`).join('');
}

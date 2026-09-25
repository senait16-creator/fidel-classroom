// =============================================================================
// PREVIEW.JS — "Preview as student" UI. Lets an is_admin account browse the
// student side of the app as if it belonged to a chosen team, without ever
// writing to that team or changing the admin's own profile.team_id in the
// database. The core state (previewTeamId, getEffectiveTeamId(),
// isPreviewingStudent(), blockIfPreviewing()) lives in app.js since it's
// read from dozens of files across the student UI; this file is just the
// entry point (team picker), the persistent banner, and exit.
//
// Loads LAST — depends on enterStudentShellHomeTab() (studentshell.js) and
// the same active-team fetch pattern already used elsewhere (team/map.js).
// =============================================================================

async function openPreviewTeamPicker() {
    if (!currentProfile?.is_admin) return;

    const { data: teams, error } = await _supabase
        .from('teams')
        .select('id, name')
        .eq('is_active', true)
        .eq('is_test', false)
        .order('name');

    if (error) {
        console.error("Failed to load teams for preview:", error);
        return showNotificationToast("Couldn't load teams.");
    }
    if (!teams || teams.length === 0) {
        return showNotificationToast("No teams to preview yet.");
    }

    const select = document.getElementById('previewTeamPickerSelect');
    select.innerHTML = teams.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
    if (previewTeamId) select.value = previewTeamId;

    document.getElementById('previewTeamPickerOverlay').style.display = 'flex';
}
window.openPreviewTeamPicker = openPreviewTeamPicker;

function closePreviewTeamPicker() {
    document.getElementById('previewTeamPickerOverlay').style.display = 'none';
}
window.closePreviewTeamPicker = closePreviewTeamPicker;

async function confirmPreviewTeamPicker() {
    const select = document.getElementById('previewTeamPickerSelect');
    const teamId = select.value;
    const teamName = select.options[select.selectedIndex]?.text || 'this team';
    if (!teamId) return;

    previewTeamId = teamId;
    previewTeamName = teamName;

    closePreviewTeamPicker();
    showPreviewBanner();

    if (typeof enterStudentShellHomeTab === 'function') {
        await enterStudentShellHomeTab();
    }
    showNotificationToast(`Previewing ${teamName} as a student.`);
}
window.confirmPreviewTeamPicker = confirmPreviewTeamPicker;

function showPreviewBanner() {
    const banner = document.getElementById('previewBanner');
    const textEl = document.getElementById('previewBannerText');
    if (textEl) textEl.innerText = `Previewing ${previewTeamName || 'a team'} as a student`;
    if (banner) banner.style.display = 'flex';
    document.body.classList.add('previewing-as-student');
}

async function exitPreviewAsStudent() {
    previewTeamId = null;
    previewTeamName = null;

    const banner = document.getElementById('previewBanner');
    if (banner) banner.style.display = 'none';
    document.body.classList.remove('previewing-as-student');

    if (typeof enterStudentShellHomeTab === 'function') {
        await enterStudentShellHomeTab();
    }
}
window.exitPreviewAsStudent = exitPreviewAsStudent;

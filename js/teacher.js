// =============================================================================
// TEACHER DASHBOARD — teacher.js
// Everything specific to the teacher/admin view: roster, captain assignment,
// writing submission approval, team level progress + advancement. Split out
// of app.js once it grew large enough to warrant its own file, mirroring the
// challenge.js / reading.js split done earlier for those features.
//
// Loads AFTER app.js. Relies on globals already defined there:
//   _supabase, currentUser, showNotificationToast
// =============================================================================

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

async function loadTeacherRosterData() {
    const tbody = document.getElementById("teacherRosterTableBody");
    tbody.innerHTML = '<tr><td colspan="3" style="color:#94a3b8; text-align:center;">Loading class roster...</td></tr>';

    const { data: students } = await _supabase
        .from('profiles')
        .select('id, nickname, avatar, email, team_id, is_admin, teams!profiles_team_id_fkey(name)')
        .order('nickname', { ascending: true });

    const { data: progress } = await _supabase
        .from('user_progress')
        .select('user_id, mastered_letters');

    const progressMap = {};
    progress?.forEach(rec => { progressMap[rec.user_id] = rec.mastered_letters || []; });

    tbody.innerHTML = '';

    // Don't list the admin account itself as a "student" in the roster.
    const realStudents = (students || []).filter(s => !s.is_admin);

    if (realStudents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="color:#94a3b8; text-align:center;">No students registered yet.</td></tr>';
        return;
    }

    realStudents.forEach(s => {
        const masteredCount = (progressMap[s.id] || []).length;
        const teamName = s.teams?.name;
        const teamDisplay = teamName
            ? `<span style="font-weight:700;">${teamName}</span>`
            : '<span style="color:#0d9488; font-style:italic;">Practicing Solo</span>';

        // Only show the removal action for students currently ON a team —
        // someone already solo has nothing to remove. This is a reversible,
        // safe action (sets team_id to null) — NOT account deletion, which
        // can't be done securely from browser JS (requires Supabase's
        // service-role key, which must never be exposed client-side).
        const removeBtn = teamName
            ? `<button class="btn-secondary" style="font-size:11px; padding:6px 10px; color:#ef4444; border:1px solid #fecaca;" onclick="removeStudentFromTeam('${s.id}', '${s.nickname.replace(/'/g, "\\'")}')">Remove from Team</button>`
            : '';
        const resetLevelBtn = `<button class="btn-secondary" style="font-size:11px; padding:6px 10px; color:#b45309; border:1px solid #fed7aa;" onclick="teacherResetStudentLevel('${s.id}', '${s.nickname.replace(/'/g, "\\'")}')">🔄 Reset a Level</button>`;
        const actionButtons = `<div style="display:flex; flex-direction:column; gap:6px; align-items:flex-start;">${removeBtn}${resetLevelBtn}</div>`;

        tbody.innerHTML += `
            <tr>
                <td data-label="Student" style="font-weight:500;">${s.avatar || '🦁'} ${s.nickname}<br><span style="font-size:11px; color:#94a3b8; font-weight:400;">${s.email || ''}</span></td>
                <td data-label="Team">${teamDisplay}</td>
                <td data-label="Progress"><strong>${masteredCount} / 34 rows</strong> complete</td>
                <td data-label="Action">${actionButtons}</td>
            </tr>
        `;
    });
}

// Removes a student from their current team, setting them to "Practicing
// Solo" — they keep their account, their progress, and can rejoin a team
// later (via teacherAssignStudentToPod). This is the safe, reversible
// action; true account deletion is intentionally not built here since it
// requires Supabase's secret service-role key, which cannot be used from
// browser-side JavaScript without exposing it to anyone who opens dev tools.
async function removeStudentFromTeam(studentId, nickname) {
    if (!confirm(`Remove ${nickname} from their team? They'll switch to "Practicing Solo" and can be reassigned later.`)) return;

    showNotificationToast("Removing from team...");

    const { error } = await _supabase
        .from('profiles')
        .update({ team_id: null })
        .eq('id', studentId);

    if (error) {
        console.error("Failed to remove student from team:", error);
        return showNotificationToast("Failed: " + error.message);
    }

    showNotificationToast(`${nickname} is now Practicing Solo.`);
    await loadTeacherRosterData();
    await teacherRefreshConfigurationDropdowns();
}

// Resets ONE student's progress on ONE Fidel Challenge level — e.g. they
// passed Level 1 but the teacher wants them to redo the whole thing. Only
// that student and only that level are touched: their streaks, writing
// submissions, and any level-completion request for that level number are
// cleared, and — if their team had already been marked "ready for live
// quiz" for that level based on their old progress — that flag is reset
// too, since it's no longer accurate. Nothing else (other levels, other
// students, the team's current_level) is affected.
async function teacherResetStudentLevel(studentId, nickname) {
    const levelInput = prompt(`Reset which level for ${nickname}? Enter a level number (e.g. 1).`);
    if (!levelInput) return;

    const levelNumber = parseInt(levelInput, 10);
    if (!Number.isInteger(levelNumber) || levelNumber < 1) {
        return showNotificationToast("Enter a valid level number.");
    }

    if (!confirm(`Reset ${nickname}'s Level ${levelNumber}? They'll need to redo every family's streak and writing submission for that level. This only affects ${nickname} — not their team or any other level.`)) return;

    showNotificationToast(`Resetting Level ${levelNumber} for ${nickname}...`);

    const [{ error: progressError }, { error: subError }, { error: reqError }] = await Promise.all([
        _supabase.from('student_family_progress').delete()
            .eq('student_id', studentId).eq('level_number', levelNumber),
        _supabase.from('writing_submissions').delete()
            .eq('student_id', studentId).eq('level_number', levelNumber),
        _supabase.from('level_completion_requests').delete()
            .eq('student_id', studentId).eq('level_number', levelNumber)
    ]);

    if (progressError || subError || reqError) {
        console.error("Failed to reset student level:", progressError, subError, reqError);
        return showNotificationToast("Reset had errors — check the console.");
    }

    // If this reset means the team is no longer fully cleared for this
    // level, un-flag it so the teacher doesn't see a stale "ready" state.
    const { data: student } = await _supabase.from('profiles').select('team_id').eq('id', studentId).maybeSingle();
    if (student?.team_id) {
        await _supabase.from('team_level_status')
            .update({ all_members_cleared: false, all_members_cleared_at: null })
            .eq('team_id', student.team_id)
            .eq('level_number', levelNumber);
    }

    showGobezToast(`${nickname}'s Level ${levelNumber} was reset.`);
    await loadTeacherRosterData();
    if (typeof loadTeacherTeamProgress === "function") await loadTeacherTeamProgress();
    if (typeof loadTeacherClassroomOverview === "function") await loadTeacherClassroomOverview();
}

async function teacherRefreshConfigurationDropdowns() {
    const { data: students } = await _supabase.from('profiles').select('id, nickname');

    const sSelect = document.getElementById("teacherStudentSelect");
    sSelect.innerHTML = '<option value="">Select Student...</option>';
    students?.forEach(s => { sSelect.innerHTML += `<option value="${s.id}">${s.nickname}</option>`; });

    const { data: teamRows } = await _supabase.from('teams').select('id, name').order('name');
    const pSelect = document.getElementById("teacherPodSelect");
    pSelect.innerHTML = '<option value="">Select Color Team...</option>';
    (teamRows || []).forEach(t => { pSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`; });
}

async function teacherAssignStudentToPod() {
    const studentId = document.getElementById("teacherStudentSelect").value;
    const chosenTeamId = document.getElementById("teacherPodSelect").value;
    const chosenTeamLabel = document.getElementById("teacherPodSelect").selectedOptions[0]?.text;

    if (!studentId || !chosenTeamId) {
        return showNotificationToast("Please pick both a student and a team color.");
    }

    showNotificationToast("Updating team assignment...");

    const { error } = await _supabase
        .from('profiles')
        .update({ team_id: chosenTeamId })
        .eq('id', studentId);

    if (error) {
        console.error("Error moving student:", error);
        return showNotificationToast("Failed to move student: " + error.message);
    }

    showNotificationToast(`Student assigned to ${chosenTeamLabel}!`);

    await loadTeacherRosterData();
    await teacherRefreshConfigurationDropdowns();
}

// ---------------------------------------------------------------------------
// Captain assignment
// ---------------------------------------------------------------------------

async function populateCaptainTeamDropdown() {
    const { data: teams } = await _supabase.from('teams').select('id, name').order('name');
    const select = document.getElementById('captainTeamSelect');
    select.innerHTML = '<option value="">Select Team...</option>';
    (teams || []).forEach(t => { select.innerHTML += `<option value="${t.id}">${t.name}</option>`; });
}

// Only shows students who are actually ON the selected team — a captain
// has to be a member of the team they're captaining, so the dropdown is
// filtered rather than listing every student in the class.
async function populateCaptainStudentDropdown(teamId) {
    const studentSelect = document.getElementById('captainStudentSelect');

    if (!teamId) {
        studentSelect.innerHTML = '<option value="">Select Team First...</option>';
        studentSelect.disabled = true;
        return;
    }

    const { data: members } = await _supabase
        .from('profiles')
        .select('id, nickname')
        .eq('team_id', teamId)
        .order('nickname');

    studentSelect.disabled = false;
    studentSelect.innerHTML = '<option value="">Select Student...</option>';
    (members || []).forEach(m => { studentSelect.innerHTML += `<option value="${m.id}">${m.nickname}</option>`; });
}

async function setTeamCaptain() {
    const teamId = document.getElementById('captainTeamSelect').value;
    const studentId = document.getElementById('captainStudentSelect').value;
    const studentLabel = document.getElementById('captainStudentSelect').selectedOptions[0]?.text;

    if (!teamId || !studentId) {
        return showNotificationToast("Please pick both a team and a student.");
    }

    showNotificationToast("Setting captain...");

    // If this team already has a different captain, clear THEIR is_captain
    // flag first — otherwise a replaced captain would stay permanently
    // exempt from Fidel Challenge even after losing the role.
    const { data: existingTeam } = await _supabase
        .from('teams')
        .select('captain_id')
        .eq('id', teamId)
        .maybeSingle();

    if (existingTeam?.captain_id && existingTeam.captain_id !== studentId) {
        await _supabase
            .from('profiles')
            .update({ is_captain: false })
            .eq('id', existingTeam.captain_id);
    }

    const { error } = await _supabase
        .from('teams')
        .update({ captain_id: studentId })
        .eq('id', teamId);

    if (error) {
        console.error("Failed to set captain:", error);
        return showNotificationToast("Failed: " + error.message);
    }

    // Mark the new captain's own profile as exempt from Fidel Challenge
    // gates — teams.captain_id alone only tells us which team has a
    // captain, not whether THIS person should skip the streak/writing
    // requirements, which is what profiles.is_captain is for.
    const { error: flagError } = await _supabase
        .from('profiles')
        .update({ is_captain: true })
        .eq('id', studentId);

    if (flagError) console.error("Failed to set is_captain flag:", flagError);

    showNotificationToast(`${studentLabel} is now the captain! 👑`);
    await loadCurrentCaptains();
}

async function loadCurrentCaptains() {
    const mount = document.getElementById('currentCaptainsMount');
    if (!mount) return;

    const { data: teams } = await _supabase
        .from('teams')
        .select('id, name, captain_id, profiles!teams_captain_id_fkey(nickname, avatar)')
        .order('name');

    mount.innerHTML = '';
    (teams || []).forEach(team => {
        if (!team.captain_id) return;
        const row = document.createElement('div');
        row.className = 'current-captain-row';
        row.innerHTML = `<span>${team.name}</span><strong>👑 ${team.profiles?.avatar || '🦁'} ${team.profiles?.nickname || 'Unknown'}</strong>`;
        mount.appendChild(row);
    });

    if (!mount.innerHTML) {
        mount.innerHTML = '<p style="color:#94a3b8; font-size:12px;">No captains assigned yet.</p>';
    }
}

// ---------------------------------------------------------------------------
// Writing submission review queue (teacher/captain approval)
// ---------------------------------------------------------------------------

async function loadTeacherWritingQueue() {
    const mount = document.getElementById("teacherWritingQueueMount");
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading...</p>`;

    const { data: submissions, error } = await _supabase
        .from('writing_submissions')
        .select('id, base_letter, image_url, status, submitted_at, student_id, profiles!writing_submissions_student_id_fkey(nickname, avatar)')
        .eq('status', 'pending')
        .order('submitted_at', { ascending: true });

    if (error) {
        console.error("Failed to load writing queue:", error);
        mount.innerHTML = `<p style="color:#ef4444; font-size:13px;">Couldn't load submissions: ${error.message}</p>`;
        return;
    }

    if (!submissions || submissions.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No pending submissions — all caught up!</p>`;
        return;
    }

    mount.innerHTML = "";
    submissions.forEach(sub => {
        const card = document.createElement('div');
        card.className = "teacher-submission-card";
        card.innerHTML = `
            <img src="${sub.image_url}" alt="Writing sample">
            <div class="teacher-submission-meta">
                <strong>${sub.profiles?.avatar || '🦁'} ${sub.profiles?.nickname || 'Student'}</strong>
                <span class="letter">${sub.base_letter}</span>
                <div class="teacher-submission-actions">
                    <button class="btn-approve" data-id="${sub.id}" data-student="${sub.student_id}" data-letter="${sub.base_letter}">✓ Approve</button>
                    <button class="btn-reject" data-id="${sub.id}">✗ Reject</button>
                </div>
                <input type="text" class="teacher-reject-note-input" placeholder="Optional note for rejection..." style="display:none;">
            </div>
        `;

        const approveBtn = card.querySelector('.btn-approve');
        const rejectBtn = card.querySelector('.btn-reject');
        const noteInput = card.querySelector('.teacher-reject-note-input');

        approveBtn.onclick = () => approveWritingSubmission(sub.id, sub.student_id, sub.base_letter);

        rejectBtn.onclick = () => {
            if (noteInput.style.display === "none") {
                noteInput.style.display = "block";
                rejectBtn.innerText = "Confirm Reject";
            } else {
                rejectWritingSubmission(sub.id, noteInput.value.trim());
            }
        };

        mount.appendChild(card);
    });
}

async function approveWritingSubmission(submissionId, studentId, baseLetter) {
    showNotificationToast("Approving...");

    const { error: subError } = await _supabase
        .from('writing_submissions')
        .update({ status: 'approved', reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() })
        .eq('id', submissionId);

    if (subError) {
        console.error("Failed to approve submission:", subError);
        return showNotificationToast("Approval failed: " + subError.message);
    }

    // Flip writing_passed on the student's family progress row, and mark
    // completed_at if the streak gate is also already passed.
    const { data: progressRow } = await _supabase
        .from('student_family_progress')
        .select('streak_passed')
        .eq('student_id', studentId)
        .eq('base_letter', baseLetter)
        .maybeSingle();

    const updatePayload = { writing_passed: true };
    if (progressRow?.streak_passed) updatePayload.completed_at = new Date().toISOString();

    const { error: progressError } = await _supabase
        .from('student_family_progress')
        .update(updatePayload)
        .eq('student_id', studentId)
        .eq('base_letter', baseLetter);

    if (progressError) console.error("Failed to update family progress:", progressError);

    showNotificationToast("Submission approved! ✓");
    await loadTeacherWritingQueue();
    await checkAndUpdateTeamLevelCompletion(studentId);
    if (typeof loadTeacherClassroomOverview === 'function') await loadTeacherClassroomOverview();
}

async function rejectWritingSubmission(submissionId, note) {
    showNotificationToast("Rejecting submission...");

    const { error } = await _supabase
        .from('writing_submissions')
        .update({
            status: 'rejected',
            reviewed_by: currentUser.id,
            reviewed_at: new Date().toISOString(),
            reviewer_note: note || null
        })
        .eq('id', submissionId);

    if (error) {
        console.error("Failed to reject submission:", error);
        return showNotificationToast("Reject failed: " + error.message);
    }

    showNotificationToast("Submission rejected — student can resubmit.");
    await loadTeacherWritingQueue();
    if (typeof loadTeacherClassroomOverview === 'function') await loadTeacherClassroomOverview();
}

// ---------------------------------------------------------------------------
// Team level progress + advancement
// ---------------------------------------------------------------------------

// After any approval, check whether the approved student's whole team has
// now cleared every family in their current level — if so, flag the team
// as ready for the live quiz on the teacher dashboard.
async function checkAndUpdateTeamLevelCompletion(studentId) {
    const { data: student } = await _supabase.from('profiles').select('team_id').eq('id', studentId).maybeSingle();
    if (!student?.team_id) return;

    const { data: team } = await _supabase.from('teams').select('id, current_level').eq('id', student.team_id).maybeSingle();
    if (!team) return;

    const { data: level } = await _supabase.from('challenge_levels').select('letter_families').eq('level_number', team.current_level).maybeSingle();
    if (!level) return;

    // Captains are exempt from Fidel Challenge gates entirely (they already
    // know Amharic — their job is leading the team, not racing through
    // levels), so they're excluded from the "did everyone clear every
    // family" check. Without this, a team with a captain could never
    // advance, since the captain would never have student_family_progress
    // rows to begin with.
    const { data: members } = await _supabase.from('profiles').select('id, is_captain').eq('team_id', team.id);
    const memberIds = (members || []).filter(m => !m.is_captain).map(m => m.id);
    if (memberIds.length === 0) return;

    const { data: progressRows } = await _supabase
        .from('student_family_progress')
        .select('student_id, base_letter, streak_passed, writing_passed')
        .in('student_id', memberIds)
        .eq('level_number', team.current_level);

    const allCleared = memberIds.every(memberId =>
        (level.letter_families || []).every(letter => {
            const row = (progressRows || []).find(r => r.student_id === memberId && r.base_letter === letter);
            return row?.streak_passed && row?.writing_passed;
        })
    );

    if (allCleared) {
        await _supabase.from('team_level_status').upsert({
            team_id: team.id,
            level_number: team.current_level,
            all_members_cleared: true,
            all_members_cleared_at: new Date().toISOString()
        }, { onConflict: 'team_id,level_number' });

        await loadTeacherTeamProgress();
    }
}

async function loadTeacherTeamProgress() {
    const mount = document.getElementById("teacherTeamProgressMount");
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading...</p>`;

    const { data: teams } = await _supabase.from('teams').select('id, name, current_level, streak_count').order('name');
    if (!teams || teams.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No teams yet.</p>`;
        return;
    }

    const { data: statusRows } = await _supabase.from('team_level_status').select('team_id, level_number, all_members_cleared, live_quiz_passed');

    mount.innerHTML = "";
    teams.forEach(team => {
        const status = (statusRows || []).find(s => s.team_id === team.id && s.level_number === team.current_level);
        const isReady = status?.all_members_cleared && !status?.live_quiz_passed;

        const row = document.createElement('div');
        row.className = `teacher-team-row-wrapper`;
        row.innerHTML = `
            <div class="teacher-team-row ${isReady ? 'ready' : ''}" style="cursor:pointer;">
                <div class="teacher-team-row-info">
                    <strong>${team.name}</strong>
                    <span>Level ${team.current_level} • Streak: ${team.streak_count || 0}${isReady ? ' • Ready for live quiz! 🎉' : ''}</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <button class="btn-advance" ${isReady ? '' : 'disabled'}>Mark Quiz Passed & Advance</button>
                    <button class="team-members-toggle" aria-label="Show team members">▼</button>
                </div>
            </div>
            <div class="team-members-list" id="teamMembers-${team.id}"></div>
        `;

        row.querySelector('.btn-advance').onclick = (e) => {
            e.stopPropagation();
            advanceTeamLevel(team.id, team.current_level);
        };

        const toggleBtn = row.querySelector('.team-members-toggle');
        const membersList = row.querySelector(`#teamMembers-${team.id}`);
        toggleBtn.onclick = (e) => {
            e.stopPropagation();
            toggleBtn.classList.toggle('collapsed');
            membersList.classList.toggle('open');
            if (membersList.classList.contains('open') && !membersList.dataset.loaded) {
                membersList.dataset.loaded = "true";
                loadTeamMembersForRoster(team.id, team.current_level, membersList);
            }
        };

        mount.appendChild(row);
    });
}

// Fetches and renders one team's members + their individual progress for
// the team's current level (how many of that level's families they've
// fully cleared) — shown when the teacher expands a team row.
async function loadTeamMembersForRoster(teamId, currentLevel, mountEl) {
    mountEl.innerHTML = `<p style="color:#94a3b8; font-size:12px; padding:8px 0;">Loading members...</p>`;

    const { data: members } = await _supabase
        .from('profiles')
        .select('id, nickname, avatar, is_captain')
        .eq('team_id', teamId)
        .order('nickname');

    if (!members || members.length === 0) {
        mountEl.innerHTML = `<p style="color:#94a3b8; font-size:12px; padding:8px 0;">No members on this team yet.</p>`;
        return;
    }

    const { data: level } = await _supabase
        .from('challenge_levels')
        .select('letter_families')
        .eq('level_number', currentLevel)
        .maybeSingle();

    const familyCount = (level?.letter_families || []).length;

    const { data: progressRows } = await _supabase
        .from('student_family_progress')
        .select('student_id, base_letter, streak_passed, writing_passed')
        .in('student_id', members.map(m => m.id))
        .eq('level_number', currentLevel);

    mountEl.innerHTML = "";
    members.forEach(member => {
        const memberRow = document.createElement('div');
        memberRow.className = 'team-member-row';

        if (member.is_captain) {
            memberRow.innerHTML = `
                <span>${member.avatar || '🦁'} ${member.nickname}</span>
                <span class="team-member-progress" style="color:#b45309;">👑 Captain — exempt</span>
            `;
        } else {
            const clearedCount = (level?.letter_families || []).filter(letter => {
                const row = (progressRows || []).find(r => r.student_id === member.id && r.base_letter === letter);
                return row?.streak_passed && row?.writing_passed;
            }).length;

            memberRow.innerHTML = `
                <span>${member.avatar || '🦁'} ${member.nickname}</span>
                <span class="team-member-progress">${clearedCount} / ${familyCount} families cleared</span>
            `;
        }

        mountEl.appendChild(memberRow);
    });
}

async function advanceTeamLevel(teamId, currentLevel) {
    showNotificationToast("Advancing team...");

    const { error: statusError } = await _supabase
        .from('team_level_status')
        .update({ live_quiz_passed: true, live_quiz_passed_at: new Date().toISOString() })
        .eq('team_id', teamId)
        .eq('level_number', currentLevel);

    if (statusError) {
        console.error("Failed to mark live quiz passed:", statusError);
        return showNotificationToast("Failed: " + statusError.message);
    }

    // streak_count tracks consecutive levels advanced — increment it here.
    // It only resets to zero via the separate "stuck team" detector (not yet
    // built) if too much time passes without an advance, not on advance itself.
    const { data: teamRow } = await _supabase.from('teams').select('streak_count').eq('id', teamId).maybeSingle();
    const newStreak = (teamRow?.streak_count || 0) + 1;

    const { error: teamError } = await _supabase
        .from('teams')
        .update({
            current_level: currentLevel + 1,
            streak_count: newStreak,
            last_advanced_at: new Date().toISOString()
        })
        .eq('id', teamId);

    if (teamError) {
        console.error("Failed to advance team:", teamError);
        return showNotificationToast("Failed: " + teamError.message);
    }

    showNotificationToast("Team advanced to the next level! 🎉");
    await loadTeacherTeamProgress();
    if (typeof loadTeacherClassroomOverview === 'function') await loadTeacherClassroomOverview();
}

// ---------------------------------------------------------------------------
// Classroom Overview — the "what needs my attention right now" summary
// shown above all the detailed panels. Reads from the same tables those
// panels already use; nothing here needs new schema.
// ---------------------------------------------------------------------------

async function loadTeacherClassroomOverview() {
    await Promise.all([
        renderTeacherHealthAndTasks(),
        loadTeacherLeaderboard(),
        loadTeacherCaptainOverview()
    ]);
}

function setHealthTile(tileId, value, flagAttention = true) {
    const tile = document.getElementById(tileId);
    if (!tile) return;
    const valueEl = tile.querySelector('.teacher-health-value');
    if (valueEl) valueEl.innerText = value;
    if (flagAttention) tile.classList.toggle('attention', value > 0);
}

async function renderTeacherHealthAndTasks() {
    const [
        { data: pendingSubs },
        { data: teams },
        { data: statusRows },
        { data: allProfiles },
        { count: canDoReviewCount }
    ] = await Promise.all([
        _supabase.from('writing_submissions').select('id, student_id').eq('status', 'pending'),
        _supabase.from('teams').select('id, name, current_level'),
        _supabase.from('team_level_status').select('team_id, level_number, all_members_cleared, live_quiz_passed'),
        _supabase.from('profiles').select('id, is_admin'),
        _supabase.from('can_do_progress').select('student_id', { count: 'exact', head: true }).eq('status', 'self_assessed')
    ]);

    const pendingWritingCount = (pendingSubs || []).length;
    const pendingWritingStudents = new Set((pendingSubs || []).map(s => s.student_id)).size;

    // Same "ready" definition as the Team Level Progress panel below.
    const readyTeams = (teams || []).filter(team => {
        const status = (statusRows || []).find(s => s.team_id === team.id && s.level_number === team.current_level);
        return status?.all_members_cleared && !status?.live_quiz_passed;
    });

    const activeStudentsCount = (allProfiles || []).filter(p => !p.is_admin).length;

    setHealthTile('healthPendingReviews', pendingWritingCount);
    setHealthTile('healthTeamsReady', readyTeams.length);
    setHealthTile('healthActiveStudents', activeStudentsCount, false);
    setHealthTile('healthCanDoReviews', canDoReviewCount || 0);

    const tasksMount = document.getElementById('teacherTodaysTasksMount');
    if (!tasksMount) return;

    tasksMount.innerHTML = `
        <div class="teacher-task-row">
            <div class="teacher-task-icon">✍️</div>
            <div>
                <div class="teacher-task-label">Writing submissions waiting</div>
                <div class="teacher-task-sub">${pendingWritingStudents > 0 ? `From ${pendingWritingStudents} student${pendingWritingStudents > 1 ? 's' : ''}` : 'All caught up'}</div>
            </div>
            ${pendingWritingCount > 0 ? `<span class="teacher-task-count">${pendingWritingCount}</span>` : ''}
            <button class="teacher-task-go" onclick="jumpToTeacherPanel('writingQueuePanelBody')">Review →</button>
        </div>
        <div class="teacher-task-row">
            <div class="teacher-task-icon">🏁</div>
            <div>
                <div class="teacher-task-label">Teams ready for a live quiz</div>
                <div class="teacher-task-sub">${readyTeams.length > 0 ? readyTeams.map(t => t.name).join(', ') : 'None right now'}</div>
            </div>
            ${readyTeams.length > 0 ? `<span class="teacher-task-count">${readyTeams.length}</span>` : ''}
            <button class="teacher-task-go" onclick="jumpToTeacherPanel('teamProgressPanelBody')">View →</button>
        </div>
        <div class="teacher-task-row">
            <div class="teacher-task-icon">📋</div>
            <div>
                <div class="teacher-task-label">Can-Do statements to verify</div>
                <div class="teacher-task-sub">Self-assessed, waiting on you</div>
            </div>
            ${(canDoReviewCount || 0) > 0 ? `<span class="teacher-task-count">${canDoReviewCount}</span>` : ''}
            <button class="teacher-task-go" onclick="jumpToTeacherPanel('canDoVerificationPanelBody')">Review →</button>
        </div>
    `;
}

// Read-only glance view, sorted by level — the actual "Mark Quiz Passed &
// Advance" action stays only in the Team Level Progress panel below, so
// there's one place that does it, not two.
async function loadTeacherLeaderboard() {
    const mount = document.getElementById('teacherLeaderboardMount');
    if (!mount) return;
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading...</p>`;

    const [{ data: teams }, { data: statusRows }, { data: topLevel }] = await Promise.all([
        _supabase.from('teams').select('id, name, current_level').order('current_level', { ascending: false }),
        _supabase.from('team_level_status').select('team_id, level_number, all_members_cleared, live_quiz_passed'),
        _supabase.from('challenge_levels').select('level_number').order('level_number', { ascending: false }).limit(1)
    ]);

    if (!teams || teams.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No teams yet.</p>`;
        return;
    }

    const totalLevels = topLevel?.[0]?.level_number || 12;
    const medals = ['🥇', '🥈', '🥉'];
    const teamColorMap = { Red: '#ef4444', Blue: '#1d4ed8', Green: '#166534', Yellow: '#a16207', Purple: '#7c3aed', Black: '#111827', White: '#64748b' };
    const getColor = (name) => {
        for (const [key, hex] of Object.entries(teamColorMap)) if (name?.includes(key)) return hex;
        return '#64748b';
    };

    mount.innerHTML = teams.map((team, idx) => {
        const status = (statusRows || []).find(s => s.team_id === team.id && s.level_number === team.current_level);
        const isReady = status?.all_members_cleared && !status?.live_quiz_passed;
        const percent = Math.min(100, Math.max(0, Math.round(((team.current_level - 1) / totalLevels) * 100)));
        const medal = idx < 3 ? medals[idx] : (idx + 1);
        const color = getColor(team.name);

        return `
            <div class="teacher-lb-row">
                <div class="teacher-lb-medal">${medal}</div>
                <div class="teacher-lb-dot" style="background:${color};"></div>
                <div class="teacher-lb-name">${team.name}</div>
                <div class="teacher-lb-track"><div class="teacher-lb-fill" style="width:${percent}%; background:${color};"></div></div>
                <div class="teacher-lb-status ${isReady ? 'ready' : 'ok'}">${isReady ? 'Ready for quiz' : `Level ${team.current_level}`}</div>
            </div>`;
    }).join('');
}

async function loadTeacherCaptainOverview() {
    const mount = document.getElementById('teacherCaptainOverviewMount');
    if (!mount) return;
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading...</p>`;

    const { data: captains } = await _supabase
        .from('profiles')
        .select('id, nickname, avatar, team_id, teams!profiles_team_id_fkey(name)')
        .eq('is_captain', true)
        .order('nickname');

    if (!captains || captains.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No captains assigned yet.</p>`;
        return;
    }

    const teamIds = [...new Set(captains.map(c => c.team_id).filter(Boolean))];
    const pendingByTeam = {};

    if (teamIds.length > 0) {
        const { data: teamMembers } = await _supabase
            .from('profiles')
            .select('id, team_id')
            .in('team_id', teamIds);

        const memberIds = (teamMembers || []).map(m => m.id);
        const { data: pendingSubs } = memberIds.length > 0
            ? await _supabase.from('writing_submissions').select('student_id').in('student_id', memberIds).eq('status', 'pending')
            : { data: [] };

        (pendingSubs || []).forEach(sub => {
            const member = (teamMembers || []).find(m => m.id === sub.student_id);
            if (!member) return;
            pendingByTeam[member.team_id] = (pendingByTeam[member.team_id] || 0) + 1;
        });
    }

    mount.innerHTML = captains.map(cap => {
        const pending = pendingByTeam[cap.team_id] || 0;
        const health = pending === 0 ? 'Team health: on track' : `Team health: ${pending} review${pending > 1 ? 's' : ''} backed up`;
        return `
            <div class="teacher-captain-row">
                <div class="teacher-captain-avatar">${cap.avatar || '👑'}</div>
                <div>
                    <div class="teacher-captain-name">${cap.nickname || 'Captain'} — ${cap.teams?.name || 'No team'}</div>
                    <div class="teacher-captain-meta">${health}</div>
                </div>
                <div class="teacher-captain-pending">${pending} pending review${pending === 1 ? '' : 's'}</div>
            </div>`;
    }).join('');
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

// Collapses/expands a teacher dashboard panel — same idea as the student
// sidebar's collapsible dropdowns, applied here so the teacher view isn't
// one long uninterrupted scroll of 5 full panels on a phone.
function toggleTeacherPanel(bodyId, headerEl) {
    document.getElementById(bodyId).classList.toggle('collapsed');
    headerEl.querySelector('.teacher-panel-toggle')?.classList.toggle('collapsed');
}

// Used by the Today's Tasks buttons to force a panel open and scroll to it,
// even if the teacher had previously collapsed it.
function jumpToTeacherPanel(bodyId) {
    const body = document.getElementById(bodyId);
    if (!body) return;
    body.classList.remove('collapsed');
    const header = body.previousElementSibling;
    header?.querySelector('.teacher-panel-toggle')?.classList.remove('collapsed');
    body.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------------------------------------------------------------------
// Expose functions used via inline onclick="" handlers in index.html
// ---------------------------------------------------------------------------

window.removeStudentFromTeam = removeStudentFromTeam;
window.teacherResetStudentLevel = teacherResetStudentLevel;
window.teacherAssignStudentToPod = teacherAssignStudentToPod;
window.toggleTeacherPanel = toggleTeacherPanel;
window.jumpToTeacherPanel = jumpToTeacherPanel;
window.loadTeacherClassroomOverview = loadTeacherClassroomOverview;

// ---------------------------------------------------------------------------
// Export progress CSV (teacher dashboard button)
// ---------------------------------------------------------------------------

async function exportProgressCSV() {
    const { data: students } = await _supabase
        .from('profiles')
        .select('id, nickname, email, is_admin, teams!profiles_team_id_fkey(name)');

    const { data: progress } = await _supabase
        .from('user_progress')
        .select('user_id, mastered_letters');

    const progressMap = {};
    progress?.forEach(r => { progressMap[r.user_id] = r.mastered_letters || []; });

    const rows = [['Nickname', 'Email', 'Team', 'Mastered Rows']];
    students?.filter(s => !s.is_admin).forEach(s => {
        rows.push([s.nickname, s.email || '', s.teams?.name || 'Solo', (progressMap[s.id] || []).length]);
    });

    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fidel_progress_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
}
window.exportProgressCSV = exportProgressCSV;

// ---------------------------------------------------------------------------
// Full reset — wipes every student's progress and team/captain assignments
// for a fresh start (e.g. Day One). Irreversible, so it's gated behind a
// typed confirmation rather than a plain confirm() dialog.
// ---------------------------------------------------------------------------

async function resetEverythingForDayOne() {
    const typed = prompt(
        "This permanently erases EVERY student's streaks, writing submissions, help " +
        "flags, and level-completion requests; resets every team to Level 1 with 0 " +
        "streak; and unassigns everyone from teams and captain roles. This cannot be undone.\n\n" +
        'Type RESET to confirm:'
    );
    if (typed !== 'RESET') {
        showNotificationToast('Reset cancelled — nothing was changed.');
        return;
    }

    showNotificationToast('Resetting everyone... this may take a moment.');

    const deleteResults = await Promise.all([
        _supabase.from('student_family_progress').delete().not('student_id', 'is', null),
        _supabase.from('writing_submissions').delete().not('student_id', 'is', null),
        _supabase.from('help_flags').delete().not('student_id', 'is', null),
        _supabase.from('level_completion_requests').delete().not('student_id', 'is', null),
        _supabase.from('team_level_status').delete().not('team_id', 'is', null),
    ]);
    const deleteError = deleteResults.find(r => r.error)?.error;
    if (deleteError) {
        console.error('Reset failed during progress wipe:', deleteError);
        return showNotificationToast('Reset failed: ' + deleteError.message);
    }

    const [{ error: teamsError }, { error: profilesError }] = await Promise.all([
        _supabase.from('teams').update({
            current_level: 1,
            streak_count: 0,
            captain_id: null
        }).not('id', 'is', null),
        _supabase.from('profiles').update({
            team_id: null,
            is_captain: false
        }).not('id', 'is', null)
    ]);
    if (teamsError || profilesError) {
        console.error('Reset failed during team/profile wipe:', teamsError, profilesError);
        return showNotificationToast('Reset partially failed: ' + (teamsError?.message || profilesError?.message));
    }

    showGobezToast('Everyone has been reset for Day One! 🌱');

    // Refresh every teacher dashboard view so the reset is visible immediately
    await loadTeacherRosterData();
    await teacherRefreshConfigurationDropdowns();
    await loadTeacherWritingQueue();
    await loadTeacherTeamProgress();
    if (typeof loadTeacherLevelCompletionQueue === 'function') {
        await loadTeacherLevelCompletionQueue('levelCompletionQueueMount');
    }
    await populateCaptainTeamDropdown();
    await loadCurrentCaptains();
}
window.resetEverythingForDayOne = resetEverythingForDayOne;

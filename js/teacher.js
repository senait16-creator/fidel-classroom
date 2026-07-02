// =============================================================================
// TEACHER DASHBOARD — teacher.js
// Everything specific to the teacher/admin view: roster, captain assignment,
// writing submission approval, team level progress + advancement.
//
// Loads AFTER app.js. Relies on globals: _supabase, currentUser,
// showNotificationToast, alphabetData
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

        const actionButton = teamName
            ? `<button class="btn-secondary" style="font-size:11px; padding:6px 10px; color:#ef4444; border:1px solid #fecaca;" onclick="removeStudentFromTeam('${s.id}', '${s.nickname.replace(/'/g, "\\'")}')">Remove from Team</button>`
            : '<span style="font-size:11px; color:#cbd5e1;">—</span>';

        tbody.innerHTML += `
            <tr>
                <td data-label="Student" style="font-weight:500;">${s.avatar || '🦁'} ${s.nickname}<br><span style="font-size:11px; color:#94a3b8; font-weight:400;">${s.email || ''}</span></td>
                <td data-label="Team">${teamDisplay}</td>
                <td data-label="Progress"><strong>${masteredCount} / 34 rows</strong> complete</td>
                <td data-label="Action">${actionButton}</td>
            </tr>
        `;
    });
}

async function removeStudentFromTeam(studentId, nickname) {
    if (!confirm(`Remove ${nickname} from their team? They'll switch to "Practicing Solo" and can be reassigned later.`)) return;
    showNotificationToast("Removing from team...");

    const { error } = await _supabase
        .from('profiles')
        .update({ team_id: null })
        .eq('id', studentId);

    if (error) return showNotificationToast("Failed: " + error.message);

    showNotificationToast(`${nickname} is now Practicing Solo.`);
    await loadTeacherRosterData();
    await teacherRefreshConfigurationDropdowns();
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

    if (!studentId || !chosenTeamId) return showNotificationToast("Please pick both a student and a team color.");

    showNotificationToast("Updating team assignment...");
    const { error } = await _supabase.from('profiles').update({ team_id: chosenTeamId }).eq('id', studentId);
    if (error) return showNotificationToast("Failed to move student: " + error.message);

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

async function populateCaptainStudentDropdown(teamId) {
    const studentSelect = document.getElementById('captainStudentSelect');
    if (!teamId) {
        studentSelect.innerHTML = '<option value="">Select Team First...</option>';
        studentSelect.disabled = true;
        return;
    }
    const { data: members } = await _supabase
        .from('profiles').select('id, nickname').eq('team_id', teamId).order('nickname');
    studentSelect.disabled = false;
    studentSelect.innerHTML = '<option value="">Select Student...</option>';
    (members || []).forEach(m => { studentSelect.innerHTML += `<option value="${m.id}">${m.nickname}</option>`; });
}

async function setTeamCaptain() {
    const teamId = document.getElementById('captainTeamSelect').value;
    const studentId = document.getElementById('captainStudentSelect').value;
    const studentLabel = document.getElementById('captainStudentSelect').selectedOptions[0]?.text;

    if (!teamId || !studentId) return showNotificationToast("Please pick both a team and a student.");
    showNotificationToast("Setting captain...");

    const { data: existingTeam } = await _supabase
        .from('teams').select('captain_id').eq('id', teamId).maybeSingle();

    if (existingTeam?.captain_id && existingTeam.captain_id !== studentId) {
        await _supabase.from('profiles').update({ is_captain: false }).eq('id', existingTeam.captain_id);
    }

    const { error } = await _supabase.from('teams').update({ captain_id: studentId }).eq('id', teamId);
    if (error) return showNotificationToast("Failed: " + error.message);

    await _supabase.from('profiles').update({ is_captain: true }).eq('id', studentId);

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
// Writing submission review queue
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
        const rejectBtn  = card.querySelector('.btn-reject');
        const noteInput  = card.querySelector('.teacher-reject-note-input');

        approveBtn.onclick = () => approveWritingSubmission(sub.id, sub.student_id, sub.base_letter);
        rejectBtn.onclick  = () => {
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

    if (subError) return showNotificationToast("Approval failed: " + subError.message);

    const { data: progressRow } = await _supabase
        .from('student_family_progress')
        .select('streak_passed')
        .eq('student_id', studentId)
        .eq('base_letter', baseLetter)
        .maybeSingle();

    const updatePayload = { writing_passed: true };
    if (progressRow?.streak_passed) updatePayload.completed_at = new Date().toISOString();

    await _supabase
        .from('student_family_progress')
        .update(updatePayload)
        .eq('student_id', studentId)
        .eq('base_letter', baseLetter);

    showNotificationToast("Submission approved! ✓");
    await loadTeacherWritingQueue();
    await checkAndUpdateTeamLevelCompletion(studentId);
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

    if (error) return showNotificationToast("Reject failed: " + error.message);
    showNotificationToast("Submission rejected — student can resubmit.");
    await loadTeacherWritingQueue();
}

// ---------------------------------------------------------------------------
// Team level progress (team_level_status flow — live quiz gate)
// ---------------------------------------------------------------------------

async function checkAndUpdateTeamLevelCompletion(studentId) {
    const { data: student } = await _supabase.from('profiles').select('team_id').eq('id', studentId).maybeSingle();
    if (!student?.team_id) return;

    const { data: team } = await _supabase.from('teams').select('id, current_level').eq('id', student.team_id).maybeSingle();
    if (!team) return;

    const { data: level } = await _supabase.from('challenge_levels').select('letter_families').eq('level_number', team.current_level).maybeSingle();
    if (!level) return;

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

        const toggleBtn   = row.querySelector('.team-members-toggle');
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

async function loadTeamMembersForRoster(teamId, currentLevel, mountEl) {
    mountEl.innerHTML = `<p style="color:#94a3b8; font-size:12px; padding:8px 0;">Loading members...</p>`;

    const { data: members } = await _supabase
        .from('profiles').select('id, nickname, avatar, is_captain').eq('team_id', teamId).order('nickname');

    if (!members || members.length === 0) {
        mountEl.innerHTML = `<p style="color:#94a3b8; font-size:12px; padding:8px 0;">No members on this team yet.</p>`;
        return;
    }

    const { data: level } = await _supabase
        .from('challenge_levels').select('letter_families').eq('level_number', currentLevel).maybeSingle();
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

// "Mark Quiz Passed" advance — used from the Team Level Progress panel
async function advanceTeamLevel(teamId, currentLevel) {
    showNotificationToast("Advancing team...");

    const { error: statusError } = await _supabase
        .from('team_level_status')
        .update({ live_quiz_passed: true, live_quiz_passed_at: new Date().toISOString() })
        .eq('team_id', teamId)
        .eq('level_number', currentLevel);

    if (statusError) return showNotificationToast("Failed: " + statusError.message);

    const { data: teamRow } = await _supabase.from('teams').select('streak_count').eq('id', teamId).maybeSingle();
    const newStreak = (teamRow?.streak_count || 0) + 1;

    const { error: teamError } = await _supabase
        .from('teams')
        .update({ current_level: currentLevel + 1, streak_count: newStreak, last_advanced_at: new Date().toISOString() })
        .eq('id', teamId);

    if (teamError) return showNotificationToast("Failed: " + teamError.message);

    showNotificationToast("Team advanced to the next level! 🎉");
    await loadTeacherTeamProgress();
}

// ---------------------------------------------------------------------------
// Level Completion Request queue (level_completion_requests flow)
// Students submit this after clearing all families — teacher sees it here
// and clicks "Advance" which does the full DB chain.
// ---------------------------------------------------------------------------

async function loadTeacherLevelCompletionQueue() {
    const mount = document.getElementById('levelCompletionQueueMount');
    if (!mount) return;

    mount.innerHTML = '<p style="color:#94a3b8; font-size:13px;">Loading...</p>';

    const { data: requests, error } = await _supabase
        .from('level_completion_requests')
        .select(`
            id,
            team_id,
            level_number,
            submitted_at,
            submitted_by,
            teams ( id, name, current_level, streak_count ),
            profiles ( nickname, avatar )
        `)
        .order('submitted_at', { ascending: true });

    if (error) {
        mount.innerHTML = `<p style="color:#ef4444; font-size:13px;">Error loading queue: ${error.message}</p>`;
        return;
    }

    if (!requests || requests.length === 0) {
        mount.innerHTML = `
            <div style="text-align:center; padding:28px 20px; color:#94a3b8;">
                <div style="font-size:28px; margin-bottom:8px;">☕</div>
                <p style="font-size:14px; font-weight:600; margin-bottom:4px; color:#64748b;">No pending level requests</p>
                <p style="font-size:13px; margin:0;">When teams clear all 3 families and submit for advancement, they'll appear here.</p>
            </div>`;
        return;
    }

    // Fetch next level data for preview
    const levelNumbers = [...new Set(requests.map(r => r.level_number + 1))];
    const { data: nextLevels } = await _supabase
        .from('challenge_levels')
        .select('level_number, title, letter_families')
        .in('level_number', levelNumbers);

    const nextLevelMap = {};
    (nextLevels || []).forEach(l => { nextLevelMap[l.level_number] = l; });

    mount.innerHTML = '';

    requests.forEach(req => {
        const team         = req.teams;
        const submitter    = req.profiles;
        const completedLevel = req.level_number;
        const nextLevel    = completedLevel + 1;
        const nextLevelInfo = nextLevelMap[nextLevel];
        const teamHex      = getTeamHex(team?.name || '');
        const submittedDate = req.submitted_at
            ? new Date(req.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : 'Unknown time';

        const noNextLevel = !nextLevelInfo;
        const noFamilies  = nextLevelInfo && (!nextLevelInfo.letter_families || nextLevelInfo.letter_families.length === 0);
        const blocked     = noNextLevel || noFamilies;

        const card = document.createElement('div');
        card.style.cssText = `
            background:white; border:1px solid #e2e8f0; border-radius:14px;
            padding:18px 20px; margin-bottom:14px; box-shadow:0 2px 8px rgba(0,0,0,0.05);
        `;

        const familiesDisplay = nextLevelInfo?.letter_families?.length
            ? `<span style="font-family:'Abyssinica SIL',serif; font-size:18px; color:#166534; margin-left:6px; letter-spacing:4px;">
                   ${nextLevelInfo.letter_families.join('  ')}
               </span>`
            : '';

        card.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:14px;">
                <div style="width:12px; height:12px; border-radius:50%; background:${teamHex}; flex-shrink:0;"></div>
                <div style="flex:1;">
                    <div style="font-size:15px; font-weight:700; color:#1e293b;">${team?.name || 'Unknown Team'}</div>
                    <div style="font-size:12px; color:#94a3b8; margin-top:2px;">
                        Submitted by ${submitter?.nickname || 'Unknown'} ${submitter?.avatar || ''} · ${submittedDate}
                    </div>
                </div>
                <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:4px 10px; font-size:12px; font-weight:700; color:#166534;">
                    Level ${completedLevel} ✓
                </div>
            </div>

            <div style="background:#f8fafc; border-radius:10px; padding:12px 14px; margin-bottom:14px;">
                ${blocked ? `
                    <div style="color:#ef4444; font-size:13px; font-weight:600;">
                        ⚠️ ${noNextLevel
                            ? `Level ${nextLevel} not seeded in challenge_levels. Add a row before approving.`
                            : `Level ${nextLevel} exists but has no letter_families set.`}
                    </div>
                ` : `
                    <div style="font-size:11px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">
                        Next up → Level ${nextLevel}
                    </div>
                    <div style="font-size:14px; font-weight:700; color:#166534; margin-bottom:6px;">
                        ${nextLevelInfo.title || 'Level ' + nextLevel}
                    </div>
                    <div style="font-size:12px; color:#64748b;">
                        Letter families: ${familiesDisplay}
                    </div>
                `}
            </div>

            <div style="display:flex; gap:10px;">
                <button
                    onclick="teacherApproveTeamAdvance('${team?.id}', '${(team?.name || '').replace(/'/g, "\\'")}', ${completedLevel}, '${req.id}')"
                    ${blocked ? 'disabled' : ''}
                    style="flex:2; padding:12px; font-size:14px; font-weight:700;
                           background:${blocked ? '#e2e8f0' : '#166534'};
                           color:${blocked ? '#94a3b8' : 'white'};
                           border:none; border-radius:10px;
                           cursor:${blocked ? 'not-allowed' : 'pointer'}; transition:all 0.2s;">
                    ${blocked ? `⚠️ Seed Level ${nextLevel} First` : `⬆️ Advance to Level ${nextLevel}`}
                </button>
                <button
                    onclick="teacherDismissLevelRequest('${req.id}', '${(team?.name || '').replace(/'/g, "\\'")}')"
                    style="flex:1; padding:12px; font-size:13px; font-weight:600;
                           background:white; color:#ef4444;
                           border:2px solid #fecaca; border-radius:10px; cursor:pointer;">
                    Dismiss
                </button>
            </div>
        `;

        mount.appendChild(card);
    });
}

// Full advance chain — called from the level completion request card
async function teacherApproveTeamAdvance(teamId, teamName, completedLevel, requestId) {
    const nextLevel = completedLevel + 1;

    // 1. Verify next level exists and has families
    const { data: nextLevelData, error: levelErr } = await _supabase
        .from('challenge_levels')
        .select('level_number, title, letter_families')
        .eq('level_number', nextLevel)
        .maybeSingle();

    if (levelErr || !nextLevelData) {
        return showNotificationToast(`⚠️ No challenge_levels row for Level ${nextLevel}. Seed it before advancing.`);
    }
    if (!nextLevelData.letter_families || nextLevelData.letter_families.length === 0) {
        return showNotificationToast(`⚠️ Level ${nextLevel} has no letter_families set.`);
    }

    // 2. Increment current_level + streak_count
    const { data: currentTeam } = await _supabase
        .from('teams').select('current_level, streak_count').eq('id', teamId).maybeSingle();

    const newStreak = (currentTeam?.streak_count || 0) + 1;

    const { error: teamUpdateErr } = await _supabase
        .from('teams')
        .update({ current_level: nextLevel, streak_count: newStreak, last_advanced_at: new Date().toISOString() })
        .eq('id', teamId);

    if (teamUpdateErr) return showNotificationToast(`Failed to advance team: ${teamUpdateErr.message}`);

    // 3. Delete the level_completion_requests row
    if (requestId) {
        await _supabase.from('level_completion_requests').delete().eq('id', requestId);
    } else {
        await _supabase.from('level_completion_requests').delete()
            .eq('team_id', teamId).eq('level_number', completedLevel);
    }

    // 4. Write team notification so students see a banner on next hub load
    const { error: notifErr } = await _supabase.from('team_notifications').insert({
        team_id: teamId,
        type: 'level_advance',
        message: `🎉 Your team advanced to Level ${nextLevel}! Next up: ${nextLevelData.title || 'Level ' + nextLevel}. New families: ${nextLevelData.letter_families.join(', ')}.`,
        level_number: nextLevel,
        created_at: new Date().toISOString()
    });
    if (notifErr) console.warn('Could not write team notification:', notifErr.message);

    // 5. Also update team_level_status so the Team Progress panel stays in sync
    await _supabase.from('team_level_status').upsert({
        team_id: teamId,
        level_number: completedLevel,
        all_members_cleared: true,
        live_quiz_passed: true,
        live_quiz_passed_at: new Date().toISOString()
    }, { onConflict: 'team_id,level_number' });

    // 6. Refresh both queues
    showNotificationToast(`✅ ${teamName} advanced to Level ${nextLevel} — ${nextLevelData.title || ''}!`);
    await loadTeacherLevelCompletionQueue();
    await loadTeacherTeamProgress();
}

async function teacherDismissLevelRequest(requestId, teamName) {
    if (!confirm(`Dismiss this request from ${teamName}? The team will need to re-submit.`)) return;
    await _supabase.from('level_completion_requests').delete().eq('id', requestId);
    showNotificationToast(`Request from ${teamName} dismissed.`);
    await loadTeacherLevelCompletionQueue();
}

// ---------------------------------------------------------------------------
// Student-side: level advance notification banner
// Call in renderTeamHub() after todayCard:
//   if (typeof checkAndShowLevelAdvanceBanner === 'function')
//       await checkAndShowLevelAdvanceBanner('levelAdvanceBannerMount');
// ---------------------------------------------------------------------------

async function checkAndShowLevelAdvanceBanner(mountId) {
    if (!currentProfile?.team_id) return;
    const mount = document.getElementById(mountId);
    if (!mount) return;

    const { data: notif } = await _supabase
        .from('team_notifications')
        .select('id, message, type, level_number')
        .eq('team_id', currentProfile.team_id)
        .eq('type', 'level_advance')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!notif) { mount.style.display = 'none'; return; }

    mount.style.display = 'block';
    mount.innerHTML = `
        <div style="background:linear-gradient(135deg,#166534,#15803d); border-radius:14px;
                    padding:18px 20px; color:white; margin-bottom:4px;">
            <div style="font-size:22px; margin-bottom:8px;">⭐</div>
            <p style="font-size:15px; font-weight:700; margin:0 0 6px;">${notif.message}</p>
            <button onclick="this.closest('div').parentElement.style.display='none'"
                    style="margin-top:10px; background:rgba(255,255,255,0.2); border:none;
                           color:white; border-radius:8px; padding:8px 16px;
                           font-size:13px; font-weight:700; cursor:pointer;">
                Let's go! →
            </button>
        </div>`;

    // Delete so it only shows once
    await _supabase.from('team_notifications').delete().eq('id', notif.id);
}

// Export progress CSV
async function exportProgressCSV() {
    const { data: students } = await _supabase
        .from('profiles')
        .select('id, nickname, email, teams!profiles_team_id_fkey(name)');

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

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function toggleTeacherPanel(bodyId, headerEl) {
    document.getElementById(bodyId).classList.toggle('collapsed');
    headerEl.querySelector('.teacher-panel-toggle')?.classList.toggle('collapsed');
}

// ---------------------------------------------------------------------------
// Expose
// ---------------------------------------------------------------------------

window.removeStudentFromTeam           = removeStudentFromTeam;
window.teacherAssignStudentToPod       = teacherAssignStudentToPod;
window.toggleTeacherPanel              = toggleTeacherPanel;
window.loadTeacherLevelCompletionQueue = loadTeacherLevelCompletionQueue;
window.teacherApproveTeamAdvance       = teacherApproveTeamAdvance;
window.teacherDismissLevelRequest      = teacherDismissLevelRequest;
window.checkAndShowLevelAdvanceBanner  = checkAndShowLevelAdvanceBanner;
window.exportProgressCSV               = exportProgressCSV;

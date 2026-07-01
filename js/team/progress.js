// =============================================================================
// JS/TEAM/PROGRESS.JS
// Team race visualization, level completion requests, and help flags.
//
// Loads after app.js. Relies on globals:
//   _supabase, currentUser, currentProfile, STREAK_THRESHOLD,
//   showNotificationToast, showGobezToast, executeVictoryConfettiCelebration,
//   getTeamHex, checkAndUpdateTeamLevelCompletion
// =============================================================================

// ---------------------------------------------------------------------------
// Team race view — all teams on a visual progress track, sorted by level
// ---------------------------------------------------------------------------

async function renderTeamRaceView(mountId) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    mount.innerHTML = `<p style="color:#94a3b8; font-size:12px;">Loading...</p>`;

    const { data: teams } = await _supabase
        .from('teams')
        .select('id, name, current_level, streak_count')
        .order('current_level', { ascending: false });

    if (!teams || teams.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:12px;">No teams yet.</p>`;
        return;
    }

    const maxLevel = 12;
    mount.innerHTML = `
        <p style="font-size:11px; font-weight:700; color:#94a3b8; text-transform:uppercase;
                  letter-spacing:0.4px; margin-bottom:10px;">Team Race</p>
    `;

    teams.forEach(team => {
        const isOwnTeam = currentProfile?.team_id === team.id;
        const progressPercent = Math.min(100, Math.round(((team.current_level - 1) / maxLevel) * 100));
        const teamHex = getTeamHex(team.name);

        const row = document.createElement('div');
        row.style.cssText = `margin-bottom:12px;`;
        row.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <span style="font-size:13px; font-weight:${isOwnTeam ? '800' : '600'};
                             color:${isOwnTeam ? teamHex : '#475569'};">
                    ${isOwnTeam ? '▶ ' : ''}${team.name}
                </span>
                <span style="font-size:11px; color:#64748b; font-weight:600;">
                    Lvl ${team.current_level} • 🔥${team.streak_count || 0}
                </span>
            </div>
            <div style="height:8px; background:#e2e8f0; border-radius:8px; overflow:hidden;">
                <div style="height:100%; width:${progressPercent}%; background:${teamHex};
                            border-radius:8px; transition:width 0.6s ease;"></div>
            </div>
        `;
        mount.appendChild(row);
    });
}

// ---------------------------------------------------------------------------
// Level completion banner + submission
// Shows when a student has cleared all 3 families in the current level.
// ---------------------------------------------------------------------------

async function checkLevelCompletionStatus() {
    if (!currentProfile?.team_id || currentProfile?.is_captain) return null;

    const { data: team } = await _supabase
        .from('teams')
        .select('current_level')
        .eq('id', currentProfile.team_id)
        .maybeSingle();

    if (!team) return null;

    const { data: level } = await _supabase
        .from('challenge_levels')
        .select('letter_families')
        .eq('level_number', team.current_level)
        .maybeSingle();

    if (!level?.letter_families?.length) return null;

    const { data: progressRows } = await _supabase
        .from('student_family_progress')
        .select('base_letter, streak_passed, writing_passed')
        .eq('student_id', currentUser.id)
        .eq('level_number', team.current_level);

    const allCleared = level.letter_families.every(letter => {
        const row = (progressRows || []).find(r => r.base_letter === letter);
        return row?.streak_passed && row?.writing_passed;
    });

    if (!allCleared) return { allCleared: false, level: team.current_level };

    // Check for existing completion request
    const { data: existing } = await _supabase
        .from('level_completion_requests')
        .select('status, submitted_at')
        .eq('student_id', currentUser.id)
        .eq('level_number', team.current_level)
        .maybeSingle();

    return {
        allCleared: true,
        level: team.current_level,
        existingRequest: existing || null
    };
}

async function renderLevelCompletionBanner(mountId) {
    const mount = document.getElementById(mountId);
    if (!mount) return;

    const status = await checkLevelCompletionStatus();

    if (!status || !status.allCleared) {
        mount.innerHTML = "";
        mount.style.display = "none";
        return;
    }

    mount.style.display = "block";

    if (status.existingRequest?.status === 'approved') {
        mount.innerHTML = `
            <div style="background:#f0fdf4; border:2px solid #166534; border-radius:16px;
                        padding:20px; text-align:center; margin-bottom:16px;">
                <div style="font-size:36px; margin-bottom:8px;">🎉</div>
                <p style="font-size:16px; font-weight:800; color:#166534; margin-bottom:4px;">
                    Level ${status.level} Complete!
                </p>
                <p style="font-size:13px; color:#15803d;">
                    Your teacher approved your level completion. Keep going!
                </p>
            </div>`;
    } else if (status.existingRequest?.status === 'pending') {
        mount.innerHTML = `
            <div style="background:#fffbeb; border:2px solid #ca8a04; border-radius:16px;
                        padding:20px; text-align:center; margin-bottom:16px;">
                <div style="font-size:36px; margin-bottom:8px;">⏳</div>
                <p style="font-size:15px; font-weight:700; color:#92400e; margin-bottom:4px;">
                    Waiting for Teacher Approval
                </p>
                <p style="font-size:13px; color:#b45309;">
                    You've cleared all 3 families in Level ${status.level}!
                    Your teacher will sign off soon.
                </p>
            </div>`;
    } else {
        // All cleared, no request yet — show submit button
        mount.innerHTML = `
            <div style="background:linear-gradient(135deg, #f0fdf4, #fffbeb); border:2px solid #166534;
                        border-radius:16px; padding:20px; text-align:center; margin-bottom:16px;">
                <div style="font-size:36px; margin-bottom:8px;">⭐</div>
                <p style="font-size:16px; font-weight:800; color:#166534; margin-bottom:6px;">
                    You cleared all 3 families!
                </p>
                <p style="font-size:13px; color:#475569; margin-bottom:16px;">
                    Submit for teacher approval to advance your team to
                    Level ${status.level + 1}.
                </p>
                <button onclick="submitLevelCompletion(${status.level})"
                        class="btn-primary"
                        style="max-width:280px; margin:0 auto; display:block;">
                    Submit for Level Approval ➜
                </button>
            </div>`;
    }
}

async function submitLevelCompletion(levelNumber) {
    showNotificationToast("Submitting for teacher approval...");

    const { error } = await _supabase
        .from('level_completion_requests')
        .upsert({
            student_id: currentUser.id,
            team_id: currentProfile.team_id,
            level_number: levelNumber,
            status: 'pending',
            submitted_at: new Date().toISOString()
        }, { onConflict: 'student_id,level_number' });

    if (error) {
        console.error("Failed to submit level completion:", error);
        return showNotificationToast("Couldn't submit: " + error.message);
    }

    showGobezToast("Submitted! Your teacher will review your Level completion. 🌟");
    await renderLevelCompletionBanner('levelCompletionMount');
}

// ---------------------------------------------------------------------------
// Help flags — student signals they need help with a specific letter
// ---------------------------------------------------------------------------

async function flagNeedHelp(baseLetter, levelNumber) {
    if (!currentProfile?.team_id) {
        return showNotificationToast("You need to be on a team to send a help flag.");
    }

    const { error } = await _supabase
        .from('help_flags')
        .insert({
            student_id: currentUser.id,
            team_id: currentProfile.team_id,
            base_letter: baseLetter,
            level_number: levelNumber
        });

    if (error) {
        // Duplicate insert (already flagged) — just confirm
        if (error.code === '23505') {
            return showNotificationToast("Help request already sent for this letter.");
        }
        console.error("Failed to flag help:", error);
        return showNotificationToast("Couldn't send flag: " + error.message);
    }

    showNotificationToast(`Help request sent to your captain for "${baseLetter}" 🙋`);
}

async function loadHelpFlags(mountId) {
    const mount = document.getElementById(mountId);
    if (!mount) return;

    if (!currentProfile?.is_captain || !currentProfile?.team_id) {
        mount.style.display = "none";
        return;
    }

    const { data: members } = await _supabase
        .from('profiles')
        .select('id, nickname, avatar')
        .eq('team_id', currentProfile.team_id);

    const memberIds = (members || []).map(m => m.id);
    if (memberIds.length === 0) {
        mount.style.display = "none";
        return;
    }

    const { data: flags } = await _supabase
        .from('help_flags')
        .select('id, base_letter, level_number, created_at, student_id')
        .in('student_id', memberIds)
        .eq('is_resolved', false)
        .order('created_at', { ascending: true });

    if (!flags || flags.length === 0) {
        mount.style.display = "none";
        return;
    }

    mount.style.display = "block";
    mount.innerHTML = `
        <h3 style="font-size:14px; font-weight:700; color:#166534; margin-bottom:10px;">
            🙋 Help Requests from Your Team (${flags.length})
        </h3>
    `;

    flags.forEach(flag => {
        const member = (members || []).find(m => m.id === flag.student_id);
        const card = document.createElement('div');
        card.style.cssText = `
            display:flex; justify-content:space-between; align-items:center;
            padding:10px 12px; background:#fffbeb; border:1px solid #fde68a;
            border-radius:10px; margin-bottom:8px; font-size:13px;
        `;
        card.innerHTML = `
            <span>
                ${member?.avatar || '🦁'}
                <strong>${member?.nickname || 'Student'}</strong>
                needs help with
                <strong style="font-family:'Abyssinica SIL',serif; font-size:18px; margin:0 4px;">
                    ${flag.base_letter}
                </strong>
            </span>
            <button onclick="resolveHelpFlag('${flag.id}', '${mountId}')"
                    style="background:#166534; color:white; border:none; border-radius:8px;
                           padding:5px 12px; font-size:12px; font-weight:700; cursor:pointer;
                           flex-shrink:0; margin-left:8px;">
                Resolved ✓
            </button>
        `;
        mount.appendChild(card);
    });
}

async function resolveHelpFlag(flagId, mountId) {
    const { error } = await _supabase
        .from('help_flags')
        .update({ is_resolved: true })
        .eq('id', flagId);

    if (error) return showNotificationToast("Couldn't resolve: " + error.message);
    showNotificationToast("Help flag resolved ✓");
    await loadHelpFlags(mountId);
}

// ---------------------------------------------------------------------------
// Teacher: level completion approval queue
// Called from teacher.js / teacher dashboard
// ---------------------------------------------------------------------------

async function loadTeacherLevelCompletionQueue(mountId) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading...</p>`;

    const { data: requests, error } = await _supabase
        .from('level_completion_requests')
        .select(`
            id, level_number, submitted_at, student_id, team_id, status,
            profiles!level_completion_requests_student_id_fkey(nickname, avatar),
            teams!level_completion_requests_team_id_fkey(name)
        `)
        .eq('status', 'pending')
        .order('submitted_at', { ascending: true });

    if (error) {
        mount.innerHTML = `<p style="color:#ef4444; font-size:13px;">Error: ${error.message}</p>`;
        return;
    }

    if (!requests || requests.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No pending level completions!</p>`;
        return;
    }

    mount.innerHTML = "";
    requests.forEach(req => {
        const card = document.createElement('div');
        card.className = "teacher-submission-card";
        card.style.cssText = "flex-direction:column; gap:8px;";
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                    <strong style="font-size:14px;">
                        ${req.profiles?.avatar || '🦁'} ${req.profiles?.nickname || 'Student'}
                    </strong>
                    <span style="font-size:12px; color:#64748b; display:block; margin-top:2px;">
                        ${req.teams?.name || 'Team'} • Level ${req.level_number} completion
                    </span>
                </div>
                <span style="font-size:11px; color:#94a3b8; flex-shrink:0; margin-left:8px;">
                    ${new Date(req.submitted_at).toLocaleDateString()}
                </span>
            </div>
            <div style="display:flex; gap:8px;">
                <button class="btn-approve"
                        onclick="approveTeacherLevelCompletion('${req.id}', '${req.student_id}', ${req.level_number}, '${req.team_id}', '${mountId}')">
                    ✓ Approve Level ${req.level_number}
                </button>
                <button class="btn-reject"
                        onclick="rejectTeacherLevelCompletion('${req.id}', '${mountId}')">
                    ✗ Reject
                </button>
            </div>
        `;
        mount.appendChild(card);
    });
}

async function approveTeacherLevelCompletion(requestId, studentId, levelNumber, teamId, mountId) {
    showNotificationToast("Approving level completion...");

    const { error } = await _supabase
        .from('level_completion_requests')
        .update({
            status: 'approved',
            reviewed_by: currentUser.id,
            reviewed_at: new Date().toISOString()
        })
        .eq('id', requestId);

    if (error) return showNotificationToast("Failed: " + error.message);

    // Trigger the team level advancement check
    if (typeof checkAndUpdateTeamLevelCompletion === "function") {
        await checkAndUpdateTeamLevelCompletion(studentId);
    }

    showGobezToast("Level completion approved! 🌟");
    await loadTeacherLevelCompletionQueue(mountId);
}

async function rejectTeacherLevelCompletion(requestId, mountId) {
    const { error } = await _supabase
        .from('level_completion_requests')
        .update({
            status: 'rejected',
            reviewed_by: currentUser.id,
            reviewed_at: new Date().toISOString()
        })
        .eq('id', requestId);

    if (error) return showNotificationToast("Failed: " + error.message);
    showNotificationToast("Level completion rejected.");
    await loadTeacherLevelCompletionQueue(mountId);
}

// ---------------------------------------------------------------------------
// Expose
// ---------------------------------------------------------------------------

window.renderTeamRaceView = renderTeamRaceView;
window.renderLevelCompletionBanner = renderLevelCompletionBanner;
window.submitLevelCompletion = submitLevelCompletion;
window.flagNeedHelp = flagNeedHelp;
window.loadHelpFlags = loadHelpFlags;
window.resolveHelpFlag = resolveHelpFlag;
window.loadTeacherLevelCompletionQueue = loadTeacherLevelCompletionQueue;
window.approveTeacherLevelCompletion = approveTeacherLevelCompletion;
window.rejectTeacherLevelCompletion = rejectTeacherLevelCompletion;

// =============================================================================
// JS/TEAM/HUB.JS
// The team hub IS the main student interface. Contains:
//   - Team header (color, level, streak, members)
//   - Embedded level map (from team/levels.js)
//   - Level completion banner (from team/progress.js)
//   - Team race view (from team/progress.js)
//   - Practice feed with emoji reactions
//   - Upload/share area (student) or review area (captain)
//   - Help flags display (captain only)
//
// Loads AFTER app.js, auth.js, utils/compress.js,
//   team/progress.js, team/levels.js
// =============================================================================

// ---------------------------------------------------------------------------
// Entry / Exit
// ---------------------------------------------------------------------------

async function enterTeamHub() {
    document.getElementById("studentDashboard").style.display = "none";
    document.getElementById("modeSelectScreen").style.display = "none";
    document.getElementById("challengeLevelsScreen").style.display = "none";
    document.getElementById("challengeFamilyScreen").style.display = "none";
    document.getElementById("challengeFamilyDetailScreen").style.display = "none";
    document.getElementById("readingLevelsScreen").style.display = "none";
    document.getElementById("captainDashboardScreen").style.display = "none";
    document.getElementById("teamHubScreen").style.display = "block";

    await renderTeamHub();
}

function exitTeamHub() {
    document.getElementById("teamHubScreen").style.display = "none";
    document.getElementById("familyPracticeSheet").style.display = "none";
    launchDashboard("student");
}

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

async function renderTeamHub() {
    if (!currentProfile?.team_id) {
        showNotificationToast("You're not on a team yet — your teacher will assign you soon!");
        return;
    }

    const { data: team } = await _supabase
        .from('teams')
        .select('id, name, current_level, streak_count')
        .eq('id', currentProfile.team_id)
        .maybeSingle();

    if (!team) return;

    const isCaptain = !!currentProfile?.is_captain;

    // Team header
    const headerEl = document.getElementById("teamHubHeaderEl");
    const teamHex = getTeamHex(team.name);
    headerEl.style.background = `linear-gradient(135deg, ${teamHex} 0%, ${teamHex}bb 100%)`;
    document.getElementById("teamHubTeamName").innerText = team.name + (isCaptain ? ' 👑' : '');
    document.getElementById("teamHubLevelLabel").innerText = `Level ${team.current_level}`;
    document.getElementById("teamHubStreakLabel").innerText = team.streak_count || 0;

    // Members chips
    const { data: members } = await _supabase
        .from('profiles')
        .select('id, nickname, avatar, is_captain')
        .eq('team_id', currentProfile.team_id)
        .order('nickname');

    const membersRow = document.getElementById("teamHubMembersRow");
    if (membersRow) {
        membersRow.innerHTML = "";
        (members || []).forEach(m => {
            const chip = document.createElement('div');
            chip.className = `team-hub-member-chip ${m.is_captain ? 'is-captain' : ''}`;
            chip.innerHTML = `${m.avatar || '🦁'} ${m.nickname}${m.is_captain ? ' 👑' : ''}`;
            membersRow.appendChild(chip);
        });
    }

    // Populate letter select for team hub upload (filtered to current level)
    await populateTeamHubLetterSelect(team.current_level);

    // Student vs captain action areas
    const studentActions = document.getElementById("teamHubStudentActions");
    const captainActions = document.getElementById("teamHubCaptainActions");
    if (isCaptain) {
        if (studentActions) studentActions.style.display = "none";
        if (captainActions) captainActions.style.display = "block";
    } else {
        if (studentActions) studentActions.style.display = "block";
        if (captainActions) captainActions.style.display = "none";
    }

    // Level completion banner (students only)
    const completionMount = document.getElementById('levelCompletionMount');
    if (completionMount) {
        if (isCaptain) {
            completionMount.style.display = "none";
        } else {
            await renderLevelCompletionBanner('levelCompletionMount');
        }
    }

    // Embedded level map
    await renderEmbeddedLevelMap('embeddedLevelMapMount');

    // Team race view
    await renderTeamRaceView('teamRaceMount');

    // Practice feed
    await loadTeamPracticeFeed();

    // Help flags (captain only)
    if (isCaptain) {
        await loadHelpFlags('helpFlagsMount');
    }

    // Captain inbox badge notification
    await checkCaptainInboxBadge();
}

async function populateTeamHubLetterSelect(currentLevel) {
    const letterSelect = document.getElementById("teamHubLetterSelect");
    if (!letterSelect) return;

    const { data: level } = await _supabase
        .from('challenge_levels')
        .select('letter_families')
        .eq('level_number', currentLevel)
        .maybeSingle();

    letterSelect.innerHTML = "";
    const familiesToShow = (level?.letter_families?.length > 0)
        ? alphabetData.filter(item => level.letter_families.includes(item.base))
        : alphabetData;

    familiesToShow.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.base;
        opt.innerText = item.base;
        letterSelect.appendChild(opt);
    });
}

// ---------------------------------------------------------------------------
// Practice feed with emoji reactions (48hr expiry)
// ---------------------------------------------------------------------------

async function loadTeamPracticeFeed() {
    const mount = document.getElementById("teamHubPracticeFeed");
    if (!mount) return;
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading team feed...</p>`;

    const now = new Date().toISOString();
    const { data: posts, error } = await _supabase
        .from('team_practice_posts')
        .select(`
            id, base_letter, image_url, posted_at, expires_at, student_id,
            profiles!team_practice_posts_student_id_fkey(nickname, avatar)
        `)
        .eq('team_id', currentProfile.team_id)
        .gt('expires_at', now)
        .order('posted_at', { ascending: false });

    if (error) {
        mount.innerHTML = `<p style="color:#ef4444; font-size:13px;">Couldn't load feed: ${error.message}</p>`;
        return;
    }

    if (!posts || posts.length === 0) {
        mount.innerHTML = `
            <div class="team-hub-empty">
                No practice posts yet — be the first to share! 🎉
            </div>`;
        return;
    }

    const postIds = posts.map(p => p.id);
    const { data: reactions } = await _supabase
        .from('post_reactions')
        .select('post_id, reactor_id, reaction')
        .in('post_id', postIds);

    mount.innerHTML = "";
    posts.forEach(post => {
        const postReactions = (reactions || []).filter(r => r.post_id === post.id);
        const myReaction = postReactions.find(r => r.reactor_id === currentUser.id)?.reaction || null;
        const hoursLeft = Math.max(0, Math.round((new Date(post.expires_at) - new Date()) / (1000 * 60 * 60)));
        const isOwn = post.student_id === currentUser.id;

        const reactionTypes = ['👍', '🔥', '👎', '😕'];
        const reactionHTML = reactionTypes.map(emoji => {
            const count = postReactions.filter(r => r.reaction === emoji).length;
            const isActive = myReaction === emoji;
            return `<button class="reaction-btn ${isActive ? 'reacted' : ''}"
                            onclick="toggleReaction('${post.id}', '${emoji}', this)">
                ${emoji}<span class="reaction-count">${count || ''}</span>
            </button>`;
        }).join('');

        const card = document.createElement('div');
        card.className = "practice-post-card";
        card.dataset.postId = post.id;
        card.innerHTML = `
            <img src="${post.image_url}" class="practice-post-img" alt="Practice">
            <div class="practice-post-meta">
                <div class="practice-post-header">
                    <span class="practice-post-author">
                        ${post.profiles?.avatar || '🦁'} ${post.profiles?.nickname || 'Student'}
                    </span>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="practice-post-letter">${post.base_letter}</span>
                        <span class="practice-post-time">${hoursLeft}h left</span>
                    </div>
                </div>
                <div class="reaction-row">${reactionHTML}</div>
                ${isOwn ? `
                    <button class="btn-secondary"
                            style="font-size:11px; color:#ef4444; padding:2px 0; text-align:left;"
                            onclick="deleteTeamPracticePost('${post.id}', '${post.image_url}')">
                        🗑️ Delete
                    </button>` : ''}
            </div>
        `;
        mount.appendChild(card);
    });
}

async function toggleReaction(postId, emoji, buttonEl) {
    const isCurrentlyReacted = buttonEl.classList.contains('reacted');
    const card = buttonEl.closest('.practice-post-card');
    card.querySelectorAll('.reaction-btn').forEach(btn => btn.classList.remove('reacted'));

    if (!isCurrentlyReacted) {
        buttonEl.classList.add('reacted');
        await _supabase.from('post_reactions').upsert(
            { post_id: postId, reactor_id: currentUser.id, reaction: emoji },
            { onConflict: 'post_id,reactor_id' }
        );
    } else {
        await _supabase.from('post_reactions')
            .delete()
            .eq('post_id', postId)
            .eq('reactor_id', currentUser.id);
    }
    await loadTeamPracticeFeed();
}

async function deleteTeamPracticePost(postId, imageUrl) {
    if (!confirm("Delete this post?")) return;

    const pathMatch = imageUrl.match(/team_posts\/(.+)$/);
    const storagePath = pathMatch ? pathMatch[1] : null;

    const { error } = await _supabase.from('team_practice_posts').delete().eq('id', postId);
    if (error) return showNotificationToast("Couldn't delete: " + error.message);

    if (storagePath) {
        await _supabase.storage.from('team_posts').remove([storagePath]);
    }

    showNotificationToast("Post deleted.");
    await loadTeamPracticeFeed();
}

// ---------------------------------------------------------------------------
// Practice post upload (with compression)
// ---------------------------------------------------------------------------

function openTeamHubPracticePost() {
    const input = document.getElementById("teamHubPhotoInput");
    input.value = "";
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const baseLetter = document.getElementById("teamHubLetterSelect").value;
        await uploadTeamPracticePost(file, baseLetter);
    };
    input.click();
}

async function uploadTeamPracticePost(file, baseLetter) {
    if (file.size > 20 * 1024 * 1024) {
        return showNotificationToast("File too large — please use a photo under 20MB.");
    }

    showNotificationToast("Compressing and uploading...");

    const compressed = await compressImage(file);
    const letterIndex = alphabetData.findIndex(item => item.base === baseLetter);
    const storagePath = `practice-${currentUser.id}-fam${letterIndex}-${Date.now()}.jpg`;

    const { error: uploadError } = await _supabase.storage
        .from('team_posts')
        .upload(storagePath, compressed, { contentType: 'image/jpeg' });

    if (uploadError) {
        console.error("Practice post upload failed:", uploadError);
        return showNotificationToast("Upload failed: " + uploadError.message);
    }

    const { data: urlData } = _supabase.storage.from('team_posts').getPublicUrl(storagePath);

    const { error: insertError } = await _supabase.from('team_practice_posts').insert({
        student_id: currentUser.id,
        team_id: currentProfile.team_id,
        base_letter: baseLetter,
        image_url: urlData.publicUrl
    });

    if (insertError) {
        console.error("Failed to save practice post:", insertError);
        return showNotificationToast("Couldn't save post: " + insertError.message);
    }

    showGobezToast("Practice post shared with your team! 🎉");
    await loadTeamPracticeFeed();
}

function openTeamHubFinalSubmit() {
    const baseLetter = document.getElementById("teamHubLetterSelect").value;
    document.getElementById("teamHubScreen").style.display = "none";
    openWritingSubmitScreen(baseLetter, () => {
        document.getElementById("teamHubScreen").style.display = "block";
        loadTeamPracticeFeed();
        renderEmbeddedLevelMap('embeddedLevelMapMount');
        renderLevelCompletionBanner('levelCompletionMount');
    });
}

// ---------------------------------------------------------------------------
// Captain dashboard (enters from team hub, returns to team hub)
// ---------------------------------------------------------------------------

function enterCaptainDashboard() {
    document.getElementById("teamHubScreen").style.display = "none";
    document.getElementById("studentDashboard").style.display = "none";
    document.getElementById("captainDashboardScreen").style.display = "block";
    loadCaptainWritingQueue();
    loadCaptainTeamProgress();
}

function exitCaptainDashboard() {
    document.getElementById("captainDashboardScreen").style.display = "none";
    document.getElementById("teamHubScreen").style.display = "block";
}

async function loadCaptainWritingQueue() {
    const mount = document.getElementById("captainWritingQueueMount");
    if (!mount) return;
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading...</p>`;

    if (!currentProfile?.team_id) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Not assigned to a team.</p>`;
        return;
    }

    const { data: members } = await _supabase
        .from('profiles').select('id').eq('team_id', currentProfile.team_id);

    const memberIds = (members || []).map(m => m.id);
    if (memberIds.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No teammates yet.</p>`;
        return;
    }

    const { data: submissions, error } = await _supabase
        .from('writing_submissions')
        .select(`
            id, base_letter, image_url, status, submitted_at, student_id,
            profiles!writing_submissions_student_id_fkey(nickname, avatar)
        `)
        .in('student_id', memberIds)
        .eq('status', 'pending')
        .order('submitted_at', { ascending: true });

    if (error) {
        mount.innerHTML = `<p style="color:#ef4444; font-size:13px;">Error: ${error.message}</p>`;
        return;
    }

    if (!submissions || submissions.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No pending submissions — all caught up! ✓</p>`;
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
                    <button class="btn-approve">✓ Approve</button>
                    <button class="btn-reject">✗ Reject</button>
                </div>
                <input type="text" class="teacher-reject-note-input"
                       placeholder="Optional note..." style="display:none;">
            </div>
        `;

        card.querySelector('.btn-approve').onclick = () =>
            captainApproveSubmission(sub.id, sub.student_id, sub.base_letter);

        const rejectBtn = card.querySelector('.btn-reject');
        const noteInput = card.querySelector('.teacher-reject-note-input');
        rejectBtn.onclick = () => {
            if (noteInput.style.display === "none") {
                noteInput.style.display = "block";
                rejectBtn.innerText = "Confirm Reject";
            } else {
                captainRejectSubmission(sub.id, noteInput.value.trim());
            }
        };

        mount.appendChild(card);
    });
}

async function captainApproveSubmission(submissionId, studentId, baseLetter) {
    showNotificationToast("Approving...");

    const { error: subError } = await _supabase
        .from('writing_submissions')
        .update({
            status: 'approved',
            reviewed_by: currentUser.id,
            reviewed_at: new Date().toISOString()
        })
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

    showGobezToast("Submission approved! ✓");
    await loadCaptainWritingQueue();
    await loadCaptainTeamProgress();

    if (typeof checkAndUpdateTeamLevelCompletion === "function") {
        await checkAndUpdateTeamLevelCompletion(studentId);
    }
}

async function captainRejectSubmission(submissionId, note) {
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
    showNotificationToast("Rejected — student can resubmit.");
    await loadCaptainWritingQueue();
}

async function loadCaptainTeamProgress() {
    const mount = document.getElementById("captainTeamProgressMount");
    if (!mount) return;
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading...</p>`;

    if (!currentProfile?.team_id) return;

    const { data: team } = await _supabase
        .from('teams').select('current_level').eq('id', currentProfile.team_id).maybeSingle();

    const { data: members } = await _supabase
        .from('profiles').select('id, nickname, avatar, is_captain')
        .eq('team_id', currentProfile.team_id).order('nickname');

    if (!members || members.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No teammates yet.</p>`;
        return;
    }

    const { data: level } = await _supabase
        .from('challenge_levels').select('letter_families')
        .eq('level_number', team?.current_level || 1).maybeSingle();

    const familyCount = (level?.letter_families || []).length;

    const { data: progressRows } = await _supabase
        .from('student_family_progress')
        .select('student_id, base_letter, streak_passed, writing_passed, best_streak')
        .in('student_id', members.map(m => m.id))
        .eq('level_number', team?.current_level || 1);

    const { data: submissions } = await _supabase
        .from('writing_submissions')
        .select('student_id, base_letter, image_url, status, submitted_at')
        .in('student_id', members.map(m => m.id))
        .order('submitted_at', { ascending: false });

    mount.innerHTML = "";
    members.forEach(member => {
        const row = document.createElement('div');
        row.className = 'captain-member-card';

        if (member.is_captain) {
            row.innerHTML = `
                <div class="captain-member-header">
                    <span>${member.avatar || '🦁'} ${member.nickname} (you)</span>
                    <span class="team-member-progress" style="color:#b45309;">👑 Captain</span>
                </div>`;
            mount.appendChild(row);
            return;
        }

        const familyDetails = (level?.letter_families || []).map(letter => {
            const progress = (progressRows || []).find(r =>
                r.student_id === member.id && r.base_letter === letter
            );
            const latestSub = (submissions || []).find(s =>
                s.student_id === member.id && s.base_letter === letter
            );
            const streak = progress?.best_streak || 0;

            return `
                <div class="captain-family-detail">
                    <span class="captain-family-letter">${letter}</span>
                    <div class="captain-family-meta">
                        <span class="${progress?.streak_passed ? 'captain-stat-done' : ''}">
                            🔥 ${streak}/20
                        </span>
                        <span class="${progress?.writing_passed ? 'captain-stat-done' : ''}">
                            ${progress?.writing_passed
                                ? '✓ Approved'
                                : (latestSub ? '⏳ Pending' : '— No submission')}
                        </span>
                    </div>
                    ${latestSub
                        ? `<img src="${latestSub.image_url}" class="captain-family-thumb" alt="writing">`
                        : ''}
                </div>`;
        }).join('');

        const clearedCount = (level?.letter_families || []).filter(letter => {
            const r = (progressRows || []).find(pr =>
                pr.student_id === member.id && pr.base_letter === letter
            );
            return r?.streak_passed && r?.writing_passed;
        }).length;

        row.innerHTML = `
            <div class="captain-member-header"
                 onclick="this.parentElement.querySelector('.captain-member-details').classList.toggle('open');
                          this.querySelector('.captain-member-toggle').classList.toggle('collapsed');">
                <span>${member.avatar || '🦁'} ${member.nickname}</span>
                <span style="display:flex; align-items:center; gap:8px;">
                    <span class="team-member-progress">${clearedCount} / ${familyCount} cleared</span>
                    <span class="captain-member-toggle collapsed">▼</span>
                </span>
            </div>
            <div class="captain-member-details">${familyDetails}</div>
        `;
        mount.appendChild(row);
    });
}

// ---------------------------------------------------------------------------
// Captain inbox badge — shows on entry to team hub
// ---------------------------------------------------------------------------

async function checkCaptainInboxBadge() {
    if (!currentProfile?.is_captain || !currentProfile?.team_id) return;

    const { data: members } = await _supabase
        .from('profiles').select('id').eq('team_id', currentProfile.team_id);

    const memberIds = (members || []).map(m => m.id);
    if (memberIds.length === 0) return;

    const { count } = await _supabase
        .from('writing_submissions')
        .select('id', { count: 'exact', head: true })
        .in('student_id', memberIds)
        .eq('status', 'pending');

    if (count && count > 0) {
        showGobezToast(`👑 ${count} writing submission${count > 1 ? 's' : ''} waiting for your review!`);
        const btn = document.getElementById("captainDashboardEntryBtn");
        if (btn && !btn.innerText.includes('(')) {
            btn.innerText = `👑 Captain Dashboard (${count})`;
        }
    }
}

// ---------------------------------------------------------------------------
// Expose
// ---------------------------------------------------------------------------

window.enterTeamHub = enterTeamHub;
window.exitTeamHub = exitTeamHub;
window.enterChallengeLevelsFromHub = () => {
    document.getElementById('embeddedLevelMapMount')?.scrollIntoView({
        behavior: 'smooth', block: 'start'
    });
};
window.loadTeamPracticeFeed = loadTeamPracticeFeed;
window.toggleReaction = toggleReaction;
window.deleteTeamPracticePost = deleteTeamPracticePost;
window.openTeamHubPracticePost = openTeamHubPracticePost;
window.uploadTeamPracticePost = uploadTeamPracticePost;
window.openTeamHubFinalSubmit = openTeamHubFinalSubmit;
window.enterCaptainDashboard = enterCaptainDashboard;
window.exitCaptainDashboard = exitCaptainDashboard;
window.captainApproveSubmission = captainApproveSubmission;
window.captainRejectSubmission = captainRejectSubmission;
window.loadCaptainWritingQueue = loadCaptainWritingQueue;
window.checkCaptainInboxBadge = checkCaptainInboxBadge;

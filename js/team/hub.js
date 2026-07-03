// =============================================================================
// JS/TEAM/HUB.JS  (v4 — merged)
// Main student interface after login. Contains:
//   - Team header (color, level, streak, members)
//   - Today card (from map.js)
//   - Level advance notification banner (from teacher_merged.js)
//   - Embedded level map (from team/levels.js)
//   - Level completion banner (from team/progress.js)
//   - Team race view (from team/progress.js)
//   - Practice feed with emoji reactions
//   - Upload / share area (student) or review area (captain)
//   - Help flags display (captain only)
//
// Loads AFTER: app.js, auth.js, compress.js, submissions.js,
//   teacher_merged.js, team/progress.js, team/levels.js, team/map.js
// =============================================================================

// ---------------------------------------------------------------------------
// Entry / Exit
// ---------------------------------------------------------------------------

function enterTeamHub() {
    [
        "modeSelectScreen",
        "studentDashboard",
        "challengeDashboardScreen",
        "challengeLevelsScreen",
        "challengeFamilyScreen",
        "challengeFamilyDetailScreen",
        "readingLevelsScreen",
        "captainDashboardScreen",
        "letterBoardScreen",
        "gameWorkspace"
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
    });

    const hub = document.getElementById("teamHubScreen");
    if (hub) hub.style.display = "block";

    const hamburger = document.getElementById("hamburgerBtn");
    if (hamburger) hamburger.style.display = "flex";

    if (typeof renderTeamHub === "function") {
        renderTeamHub();
    }
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

    // ── Header ──────────────────────────────────────────────
    const teamHex = getTeamHex(team.name);
    const headerEl = document.getElementById('teamHubHeaderEl');
    if (headerEl) {
        headerEl.style.background =
            `linear-gradient(135deg, ${teamHex} 0%, ${teamHex}cc 60%, ${teamHex}99 100%)`;
    }
    const nameEl = document.getElementById('teamHubTeamName');
    if (nameEl) nameEl.innerText = team.name + (isCaptain ? ' 👑' : '');
    const levelEl = document.getElementById('teamHubLevelLabel');
    if (levelEl) levelEl.innerText = `Level ${team.current_level}`;
    const streakEl = document.getElementById('teamHubStreakLabel');
    if (streakEl) streakEl.innerText = team.streak_count || 0;

    // ── Member avatar chips ──────────────────────────────────
    const { data: members } = await _supabase
        .from('profiles')
        .select('id, nickname, avatar, is_captain')
        .eq('team_id', currentProfile.team_id)
        .order('nickname');

    const membersRow = document.getElementById('teamHubMembersRow');
    if (membersRow) {
        membersRow.innerHTML = '';
        const visible = (members || []).slice(0, 5);
        const overflow = (members || []).length - visible.length;
        visible.forEach(m => {
            const chip = document.createElement('div');
            chip.className = 'avatar-group-circle';
            chip.title = m.nickname + (m.is_captain ? ' 👑' : '');
            chip.innerText = m.avatar || '🦁';
            membersRow.appendChild(chip);
        });
        if (overflow > 0) {
            const extra = document.createElement('div');
            extra.className = 'avatar-group-count';
            extra.innerText = `+${overflow}`;
            membersRow.appendChild(extra);
        }
    }

    // ── Populate letter select for hub share/submit ──────────
    await populateTeamHubLetterSelect(team.current_level);

    // ── Student vs captain action areas ─────────────────────
    const studentActions = document.getElementById('teamHubStudentActions');
    const captainActions = document.getElementById('teamHubCaptainActions');
    if (isCaptain) {
        if (studentActions) studentActions.style.display = 'none';
        if (captainActions) captainActions.style.display = 'block';
    } else {
        if (studentActions) studentActions.style.display = 'block';
        if (captainActions) captainActions.style.display = 'none';
    }

    // ── Today card (students only) ───────────────────────────
    if (!isCaptain && typeof renderTodayCard === 'function') {
        await renderTodayCard('todayCardMount');
    }

    // ── Level completion banner (students only) ──────────────
    const completionMount = document.getElementById('levelCompletionMount');
    if (completionMount) {
        if (isCaptain) {
            completionMount.style.display = 'none';
        } else if (typeof renderLevelCompletionBanner === 'function') {
            await renderLevelCompletionBanner('levelCompletionMount');
        }
    }

    // ── Embedded level / family cards ───────────────────────
    if (typeof renderEmbeddedLevelMap === 'function') {
        await renderEmbeddedLevelMap('embeddedLevelMapMount');
    }

    // ── Team race ────────────────────────────────────────────
    if (typeof renderTeamRaceView === 'function') {
        await renderTeamRaceView('teamRaceMount');
    }

    // ── Practice feed ────────────────────────────────────────
    await loadTeamPracticeFeed();

    // ── Help flags (captain only) ────────────────────────────
    if (isCaptain && typeof loadHelpFlags === 'function') {
        await loadHelpFlags('helpFlagsMount');
    }

    // ── Captain inbox badge ──────────────────────────────────
    await checkCaptainInboxBadge();
}

// ---------------------------------------------------------------------------
// Letter select — filtered to current level families
// ---------------------------------------------------------------------------

async function populateTeamHubLetterSelect(currentLevel) {
    const letterSelect = document.getElementById('teamHubLetterSelect');
    if (!letterSelect) return;

    const { data: level } = await _supabase
        .from('challenge_levels')
        .select('letter_families')
        .eq('level_number', currentLevel)
        .maybeSingle();

    letterSelect.innerHTML = '';
    const families = (level?.letter_families?.length > 0)
        ? alphabetData.filter(item => level.letter_families.includes(item.base))
        : alphabetData;

    families.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.base;
        opt.innerText = item.base;
        letterSelect.appendChild(opt);
    });
}

// ---------------------------------------------------------------------------
// Letter picker reveal — used by Share / Submit buttons in hub
// Shows the letter picker then calls the target function
// ---------------------------------------------------------------------------

function revealLetterPickerThen(targetFn) {
    const wrap = document.getElementById('teamHubLetterPickerWrap');
    if (wrap) {
        wrap.style.display = 'block';
        // Auto-advance after selection, or call immediately
        const select = document.getElementById('teamHubLetterSelect');
        if (select && select.options.length > 0) {
            window[targetFn]();
        }
    } else {
        window[targetFn]();
    }
}

// ---------------------------------------------------------------------------
// Toggle section visibility (team race / practice feed)
// ---------------------------------------------------------------------------

function toggleTeamRace() {
    const mount = document.getElementById('teamRaceMount');
    const arrow = document.getElementById('teamRaceToggleArrow');
    if (!mount) return;
    const isOpen = mount.style.display !== 'none';
    mount.style.display = isOpen ? 'none' : 'block';
    if (arrow) arrow.innerText = isOpen ? '▼' : '▲';
}

function toggleTeamFeed() {
    const mount = document.getElementById('teamHubPracticeFeed');
    const arrow = document.getElementById('teamFeedToggleArrow');
    if (!mount) return;
    const isOpen = mount.style.display !== 'none';
    mount.style.display = isOpen ? 'none' : 'block';
    if (arrow) arrow.innerText = isOpen ? '▼' : '▲';
    // Load feed on first open
    if (!isOpen && !mount.dataset.loaded) {
        mount.dataset.loaded = 'true';
        loadTeamPracticeFeed();
    }
}

// ---------------------------------------------------------------------------
// Practice feed — reads from team_posts (unified table)
// ---------------------------------------------------------------------------

async function loadTeamPracticeFeed() {
    const mount = document.getElementById('teamHubPracticeFeed');
    if (!mount || mount.style.display === 'none') return;
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px; padding:4px 0;">Loading team feed...</p>`;

    const { data: posts, error } = await _supabase
        .from('team_practice_posts')
        .select(`
            id, base_letter, image_url, created_at, post_type, uploader_id,
            profiles!team_posts_uploader_id_fkey(nickname, avatar)
        `)
        .eq('team_id', currentProfile.team_id)
        .order('created_at', { ascending: false })
        .limit(20);

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

    mount.innerHTML = '';
    posts.forEach(post => {
        const postReactions = (reactions || []).filter(r => r.post_id === post.id);
        const myReaction = postReactions.find(r => r.reactor_id === currentUser.id)?.reaction || null;
        const timeAgo = formatTimeAgo(post.created_at);
        const isOwn = post.uploader_id === currentUser.id;

        const reactionTypes = ['👍', '🔥', '💪', '❤️'];
        const reactionHTML = reactionTypes.map(emoji => {
            const count = postReactions.filter(r => r.reaction === emoji).length;
            const isActive = myReaction === emoji;
            return `<button class="reaction-btn ${isActive ? 'reacted' : ''}"
                            onclick="toggleReaction('${post.id}', '${emoji}', this)">
                ${emoji}<span class="reaction-count">${count || ''}</span>
            </button>`;
        }).join('');

        const card = document.createElement('div');
        card.className = 'practice-post-card';
        card.dataset.postId = post.id;
        card.innerHTML = `
            <img src="${post.image_url}" class="practice-post-img" alt="Practice">
            <div class="practice-post-meta">
                <div class="practice-post-header">
                    <span class="practice-post-author">
                        ${post.profiles?.avatar || '🦁'} ${post.profiles?.nickname || 'Student'}
                    </span>
                    <div style="display:flex; align-items:center; gap:8px;">
                        ${post.base_letter
                            ? `<span class="practice-post-letter">${post.base_letter}</span>`
                            : ''}
                        <span class="practice-post-time">${timeAgo}</span>
                    </div>
                </div>
                <div class="reaction-row">${reactionHTML}</div>
                ${isOwn ? `
                    <button class="btn-secondary"
                            style="font-size:11px; color:#ef4444; padding:2px 0; text-align:left;"
                            onclick="deleteTeamPost('${post.id}', '${post.image_url}')">
                        🗑️ Delete
                    </button>` : ''}
            </div>
        `;
        mount.appendChild(card);
    });
}

function formatTimeAgo(isoStr) {
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins < 2)   return 'just now';
    if (mins < 60)  return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
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

async function deleteTeamPost(postId, imageUrl) {
    if (!confirm('Delete this post?')) return;

    const pathMatch = imageUrl.match(/team_posts\/(.+)$/);
    const storagePath = pathMatch ? pathMatch[1] : null;

    const { error } = await _supabase.from('team_practice_posts').delete().eq('id', postId);
    if (error) return showNotificationToast("Couldn't delete: " + error.message);

    if (storagePath) {
        await _supabase.storage.from('team_practice_posts').remove([storagePath]);
    }
    showNotificationToast('Post deleted.');
    await loadTeamPracticeFeed();
}

// ---------------------------------------------------------------------------
// Share / submit openers
// ---------------------------------------------------------------------------

function openTeamHubPracticePost() {
    const input = document.getElementById('teamHubPhotoInput');
    input.value = '';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const baseLetter = document.getElementById('teamHubLetterSelect')?.value || null;
        await uploadTeamPracticePhoto(file, baseLetter);
    };
    input.click();
}

async function uploadTeamPracticePhoto(file, baseLetter) {
    if (file.size > 20 * 1024 * 1024) {
        return showNotificationToast('File too large — please use a photo under 20MB.');
    }
    showNotificationToast('Compressing and uploading...');

    const compressed = await compressImage(file);
    const filename = `practice_${currentUser.id}_${Date.now()}.jpg`;

    const { error: uploadError } = await _supabase.storage
        .from('team_practice_posts')
        .upload(filename, compressed, { contentType: 'image/jpeg' });

    if (uploadError) return showNotificationToast('Upload failed: ' + uploadError.message);

    const { data: urlData } = _supabase.storage.from('team_practice_posts').getPublicUrl(filename);

    const { error: insertError } = await _supabase.from('team_practice_posts').insert({
        uploader_id: currentUser.id,
        team_id:     currentProfile.team_id,
        base_letter: baseLetter || null,
        post_type:   'share',
        image_url:   urlData.publicUrl,
        created_at:  new Date().toISOString()
    });

    if (insertError) return showNotificationToast("Couldn't save post: " + insertError.message);

    showGobezToast('Practice post shared with your team! 🎉');
    // Open the feed section if it's closed
    const feedMount = document.getElementById('teamHubPracticeFeed');
    if (feedMount && feedMount.style.display === 'none') toggleTeamFeed();
    else await loadTeamPracticeFeed();
}

function openTeamHubFinalSubmit() {
    const baseLetter = document.getElementById('teamHubLetterSelect')?.value;
    document.getElementById('teamHubScreen').style.display = 'none';
    // Use new returnTo signature
    openWritingSubmitScreen(baseLetter, 'teamHub');
}

// ---------------------------------------------------------------------------
// Captain dashboard
// ---------------------------------------------------------------------------

function enterCaptainDashboard() {
    document.getElementById('teamHubScreen').style.display = 'none';
    document.getElementById('studentDashboard').style.display = 'none';
    document.getElementById('captainDashboardScreen').style.display = 'block';
    loadCaptainWritingQueue();
    loadCaptainTeamProgress();
}

function exitCaptainDashboard() {
    document.getElementById('captainDashboardScreen').style.display = 'none';
    enterTeamHub();
}

async function loadCaptainWritingQueue() {
    const mount = document.getElementById('captainWritingQueueMount');
    if (!mount) return;
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading...</p>`;

    if (!currentProfile?.team_id) return;

    const { data: members } = await _supabase
        .from('profiles').select('id').eq('team_id', currentProfile.team_id);

    const memberIds = (members || []).map(m => m.id).filter(id => id !== currentUser.id);
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
        mount.innerHTML = `
            <div style="text-align:center; padding:24px 16px; color:#94a3b8;">
                <div style="font-size:26px; margin-bottom:8px;">☕</div>
                <p style="font-size:13px; font-weight:600; color:#64748b; margin-bottom:4px;">
                    No pending submissions
                </p>
                <p style="font-size:12px; margin:0;">
                    Your team is on it — nothing to review right now!
                </p>
            </div>`;
        return;
    }

    mount.innerHTML = '';
    submissions.forEach(sub => {
        const card = document.createElement('div');
        card.className = 'teacher-submission-card';
        card.innerHTML = `
            <img src="${sub.image_url}" alt="Writing sample" style="cursor:pointer;"
                 onclick="window.open('${sub.image_url}', '_blank')">
            <div class="teacher-submission-meta">
                <strong>${sub.profiles?.avatar || '🦁'} ${sub.profiles?.nickname || 'Student'}</strong>
                <span class="letter">${sub.base_letter}</span>
                <span style="font-size:11px; color:#94a3b8; display:block; margin-bottom:8px;">
                    ${formatTimeAgo(sub.submitted_at)}
                </span>
                <div class="teacher-submission-actions">
                    <button class="btn-approve">✓ Approve</button>
                    <button class="btn-reject">✗ Reject</button>
                </div>
                <input type="text" class="teacher-reject-note-input"
                       placeholder="Note for student (optional)..." style="display:none;">
            </div>
        `;

        card.querySelector('.btn-approve').onclick = () =>
            captainApproveSubmission(sub.id, sub.student_id, sub.base_letter);

        const rejectBtn  = card.querySelector('.btn-reject');
        const noteInput  = card.querySelector('.teacher-reject-note-input');
        rejectBtn.onclick = () => {
            if (noteInput.style.display === 'none') {
                noteInput.style.display = 'block';
                rejectBtn.innerText = 'Confirm Reject';
            } else {
                captainRejectSubmission(sub.id, noteInput.value.trim());
            }
        };

        mount.appendChild(card);
    });
}

async function captainApproveSubmission(submissionId, studentId, baseLetter) {
    showNotificationToast('Approving...');

    const { error: subError } = await _supabase
        .from('writing_submissions')
        .update({
            status: 'approved',
            reviewed_by: currentUser.id,
            reviewed_at: new Date().toISOString()
        })
        .eq('id', submissionId);

    if (subError) return showNotificationToast('Approval failed: ' + subError.message);

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

    // Write a notification so the student sees it on next hub load
    await _supabase.from('team_notifications').insert({
        team_id:   currentProfile.team_id,
        type:      'submission_approved',
        message:   `✓ Your ${baseLetter} writing was approved by your captain!`,
        created_at: new Date().toISOString()
    });

    showGobezToast('Submission approved! ✓');
    await loadCaptainWritingQueue();
    await loadCaptainTeamProgress();

    if (typeof checkAndUpdateTeamLevelCompletion === 'function') {
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

    if (error) return showNotificationToast('Reject failed: ' + error.message);
    showNotificationToast('Rejected — student can resubmit.');
    await loadCaptainWritingQueue();
}

async function loadCaptainTeamProgress() {
    const mount = document.getElementById('captainTeamProgressMount');
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

    const currentLevel = team?.current_level || 1;
    const { data: level } = await _supabase
        .from('challenge_levels').select('letter_families')
        .eq('level_number', currentLevel).maybeSingle();

    const families    = level?.letter_families || [];
    const memberIds   = members.map(m => m.id);

    const { data: progressRows } = await _supabase
        .from('student_family_progress')
        .select('student_id, base_letter, streak_passed, writing_passed, best_streak')
        .in('student_id', memberIds)
        .eq('level_number', currentLevel);

    const { data: submissions } = await _supabase
        .from('writing_submissions')
        .select('student_id, base_letter, image_url, status, submitted_at')
        .in('student_id', memberIds)
        .order('submitted_at', { ascending: false });

    mount.innerHTML = '';
    members.forEach(member => {
        const row = document.createElement('div');
        row.className = 'captain-member-card';

        if (member.is_captain) {
            row.innerHTML = `
                <div class="captain-member-header" style="cursor:default;">
                    <span>${member.avatar || '🦁'} ${member.nickname}</span>
                    <span class="team-member-progress" style="color:#b45309;">👑 Captain — exempt</span>
                </div>`;
            mount.appendChild(row);
            return;
        }

        const clearedCount = families.filter(letter => {
            const r = (progressRows || []).find(pr => pr.student_id === member.id && pr.base_letter === letter);
            return r?.streak_passed && r?.writing_passed;
        }).length;

        const familyDetails = families.map(letter => {
            const progress  = (progressRows || []).find(r => r.student_id === member.id && r.base_letter === letter);
            const latestSub = (submissions || []).find(s => s.student_id === member.id && s.base_letter === letter);
            const streak    = progress?.best_streak || 0;

            let subStatus = '— No submission';
            if (progress?.writing_passed) subStatus = '<span class="captain-stat-done">✓ Approved</span>';
            else if (latestSub?.status === 'pending')  subStatus = '⏳ Pending review';
            else if (latestSub?.status === 'rejected') subStatus = '✗ Rejected — needs redo';

            return `
                <div class="captain-family-detail">
                    <span class="captain-family-letter">${letter}</span>
                    <div class="captain-family-meta">
                        <span class="${progress?.streak_passed ? 'captain-stat-done' : ''}">
                            🔥 Streak: ${streak}/20${progress?.streak_passed ? ' ✓' : ''}
                        </span>
                        <span>${subStatus}</span>
                    </div>
                    ${latestSub?.image_url
                        ? `<img src="${latestSub.image_url}" class="captain-family-thumb" alt="writing"
                               onclick="window.open('${latestSub.image_url}', '_blank')"
                               style="cursor:pointer;">`
                        : ''}
                </div>`;
        }).join('');

        row.innerHTML = `
            <div class="captain-member-header"
                 onclick="this.parentElement.querySelector('.captain-member-details').classList.toggle('open');
                          this.querySelector('.captain-member-toggle').classList.toggle('collapsed');">
                <span>${member.avatar || '🦁'} ${member.nickname}</span>
                <span style="display:flex; align-items:center; gap:8px;">
                    <span class="team-member-progress">${clearedCount} / ${families.length} cleared</span>
                    <span class="captain-member-toggle collapsed">▼</span>
                </span>
            </div>
            <div class="captain-member-details">${familyDetails}</div>
        `;
        mount.appendChild(row);
    });
}

// ---------------------------------------------------------------------------
// Captain inbox badge on hub load
// ---------------------------------------------------------------------------

async function checkCaptainInboxBadge() {
    if (!currentProfile?.is_captain || !currentProfile?.team_id) return;

    const { data: members } = await _supabase
        .from('profiles').select('id').eq('team_id', currentProfile.team_id);

    const memberIds = (members || []).map(m => m.id).filter(id => id !== currentUser.id);
    if (memberIds.length === 0) return;

    const { count } = await _supabase
        .from('writing_submissions')
        .select('id', { count: 'exact', head: true })
        .in('student_id', memberIds)
        .eq('status', 'pending');

    if (count && count > 0) {
        showGobezToast(`👑 ${count} writing submission${count > 1 ? 's' : ''} waiting for your review!`);
    }
}

// ---------------------------------------------------------------------------
// Expose
// ---------------------------------------------------------------------------

window.enterTeamHub              = enterTeamHub;
window.exitTeamHub               = exitTeamHub;
window.renderTeamHub             = renderTeamHub;
window.toggleTeamRace            = toggleTeamRace;
window.toggleTeamFeed            = toggleTeamFeed;
window.revealLetterPickerThen    = revealLetterPickerThen;
window.loadTeamPracticeFeed      = loadTeamPracticeFeed;
window.toggleReaction            = toggleReaction;
window.deleteTeamPost            = deleteTeamPost;
window.openTeamHubPracticePost   = openTeamHubPracticePost;
window.uploadTeamPracticePhoto   = uploadTeamPracticePhoto;
window.openTeamHubFinalSubmit    = openTeamHubFinalSubmit;
window.enterCaptainDashboard     = enterCaptainDashboard;
window.exitCaptainDashboard      = exitCaptainDashboard;
window.loadCaptainWritingQueue   = loadCaptainWritingQueue;
window.loadCaptainTeamProgress   = loadCaptainTeamProgress;
window.captainApproveSubmission  = captainApproveSubmission;
window.captainRejectSubmission   = captainRejectSubmission;
window.checkCaptainInboxBadge    = checkCaptainInboxBadge;

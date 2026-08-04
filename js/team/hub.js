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
// Main render
//
// NOTE: unreachable now that enterTeamHub() (its only caller) is gone —
// the Team Hub screen itself was retired earlier in favor of the
// Competition dashboard. Left in place rather than deleted in this pass;
// worth a closer look before removing outright since it's a large
// function and this file also holds formatTimeAgo, which community.js
// still depends on.
// ---------------------------------------------------------------------------

async function renderTeamHub() {
    if (!currentProfile?.team_id) {
        showNotificationToast("You're not on a team yet. Your teacher will assign you soon!");
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
        await renderTeamRaceView('teamRaceMount', { mode: 'challenge' });
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
// Practice feed — reads from team_practice_posts (unified table)
// ---------------------------------------------------------------------------

async function loadTeamPracticeFeed() {
    const mount = document.getElementById('teamHubPracticeFeed');
    if (!mount || mount.style.display === 'none') return;
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px; padding:4px 0;">Loading team feed...</p>`;

    const { data: posts, error } = await _supabase
        .from('team_practice_posts')
        .select(`
            id, base_letter, image_url, created_at, post_type, uploader_id,
            profiles!uploader_id(nickname, avatar)
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
                No practice posts yet. Be the first to share! ${icon('confetti')}
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

    const pathMatch = imageUrl.match(/team_practice_posts\/(.+)$/);
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
        return showNotificationToast('File too large. Please use a photo under 20MB.');
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

    showGobezToast(`Practice post shared with your team! ${icon('confetti')}`);
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

async function enterCaptainDashboard() {
    if (!currentProfile?.is_captain) {
        showNotificationToast("Reserved for captains.");
        return;
    }

    // The old standalone captain screen is retired — leadership tools now
    // live in the Captain Dashboard zone at the top of the Fidel Competition
    // page, alongside all the normal challenge content.
    if (typeof chooseModeChallenge === 'function') await chooseModeChallenge();
}
function updateCaptainPendingBadge(count) {
    const pill = document.getElementById('captainPendingCount');
    const btn  = document.getElementById('captainReviewToggleBtn');
    if (pill) {
        if (count > 0) {
            pill.style.display = 'inline-block';
            pill.innerText = `${count} waiting`;
        } else {
            pill.style.display = 'none';
        }
    }
    if (btn) {
        btn.innerText = count > 0 ? `📝 Review Writing` : `🎉 All caught up!`;
    }
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
        updateCaptainPendingBadge(0);
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
        updateCaptainPendingBadge(0);
        return;
    }

    updateCaptainPendingBadge(submissions?.length || 0);

    if (!submissions || submissions.length === 0) {
        mount.innerHTML = `
            <div style="text-align:center; padding:24px 16px; color:#94a3b8;">
                <div style="font-size:26px; margin-bottom:8px;">${icon('coffee')}</div>
                <p style="font-size:13px; font-weight:600; color:#64748b; margin-bottom:4px;">
                    No pending submissions
                </p>
                <p style="font-size:12px; margin:0;">
                    Your team is on it, nothing to review right now!
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
                captainRejectSubmission(sub.id, noteInput.value.trim(), sub.student_id, sub.base_letter);
            }
        };

        mount.appendChild(card);
    });
}

// Shows recently approved submissions for the team, including ones a
// teacher approved directly (bypassing the captain) — otherwise those
// just silently vanish from the pending queue with no record the captain
// ever sees, and they wouldn't know the teacher stepped in.
async function loadCaptainRecentlyApproved() {
    const mount = document.getElementById('captainRecentlyApprovedMount');
    if (!mount) return;
    if (!currentProfile?.team_id) return;

    const { data: members } = await _supabase
        .from('profiles').select('id').eq('team_id', currentProfile.team_id);
    const memberIds = (members || []).map(m => m.id).filter(id => id !== currentUser.id);
    if (memberIds.length === 0) { mount.innerHTML = ''; return; }

    const { data: approved } = await _supabase
        .from('writing_submissions')
        .select(`
            id, base_letter, reviewed_at, reviewed_by, student_id,
            profiles!writing_submissions_student_id_fkey(nickname, avatar)
        `)
        .in('student_id', memberIds)
        .eq('status', 'approved')
        .order('reviewed_at', { ascending: false })
        .limit(5);

    if (!approved || approved.length === 0) { mount.innerHTML = ''; return; }

    const reviewerIds = [...new Set(approved.map(a => a.reviewed_by).filter(Boolean))];
    const { data: reviewers } = reviewerIds.length > 0
        ? await _supabase.from('profiles').select('id, nickname, is_admin').in('id', reviewerIds)
        : { data: [] };

    const rows = approved.map(sub => {
        const reviewer = (reviewers || []).find(r => r.id === sub.reviewed_by);
        let reviewerLabel = 'a captain';
        if (sub.reviewed_by === currentUser.id) reviewerLabel = 'you';
        else if (reviewer?.is_admin) reviewerLabel = `${reviewer?.nickname || 'your teacher'} (teacher)`;
        else if (reviewer?.nickname) reviewerLabel = reviewer.nickname;

        return `
            <div class="captain-approved-row">
                <span>${sub.profiles?.avatar || '🦁'} <strong>${sub.profiles?.nickname || 'Student'}</strong>:
                    <span class="captain-approved-letter">${sub.base_letter}</span>
                </span>
                <span class="captain-approved-by">✓ by ${reviewerLabel}</span>
            </div>`;
    }).join('');

    mount.innerHTML = `
        <div class="captain-approved-title">Recently Approved</div>
        ${rows}
    `;
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

    const creditError = await creditApprovedWritingToProgress(studentId, baseLetter);
    if (creditError) {
        showNotificationToast(`${icon("warning")} Writing approved, but progress wasn't credited: ` + creditError.message);
    }

    // Write a notification so the student sees it on next hub load
    await _supabase.from('team_notifications').insert({
        team_id:   currentProfile.team_id,
        type:      'submission_approved',
        message:   `✓ Your ${baseLetter} writing was approved by your captain!`,
        created_at: new Date().toISOString()
    });

    if (typeof sendPushNotification === 'function') {
        sendPushNotification({ type: 'writing_approved', student_id: studentId, base_letter: baseLetter });
    }

    // Re-check right here — this used to only get checked when a student
    // separately remembered to submit a level-completion request afterward,
    // so a team could have every family approved and still never show as
    // "ready" for the teacher if that extra step got missed.
    if (typeof checkAndUpdateTeamLevelCompletion === "function") {
        await checkAndUpdateTeamLevelCompletion(studentId);
    }

    showGobezToast('Submission approved! ✓');
    await loadCaptainWritingQueue();
    await loadCaptainTeamProgress();
    if (typeof loadCaptainRecentlyApproved === 'function') await loadCaptainRecentlyApproved();

    // Refresh the Competition page team status if it's the visible screen
    const dash = document.getElementById('challengeDashboardScreen');
    if (dash && dash.style.display !== 'none' && typeof renderChallengeDashboard === 'function') {
        await renderChallengeDashboard();
    }

    if (typeof checkAndUpdateTeamLevelCompletion === 'function') {
        await checkAndUpdateTeamLevelCompletion(studentId);
    }
}

async function captainRejectSubmission(submissionId, note, studentId, baseLetter) {
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
    showNotificationToast('Rejected. Student can resubmit.');
    await loadCaptainWritingQueue();

    if (typeof sendPushNotification === 'function' && studentId && baseLetter) {
        sendPushNotification({ type: 'writing_rejected', student_id: studentId, base_letter: baseLetter });
    }
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
                    <span class="team-member-progress" style="color:#b45309;">${icon('crown')} Captain, exempt</span>
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

            let subStatus = 'No submission';
            if (progress?.writing_passed) subStatus = '<span class="captain-stat-done">✓ Approved</span>';
            else if (latestSub?.status === 'pending')  subStatus = '⏳ Pending review';
            else if (latestSub?.status === 'rejected') subStatus = '✗ Rejected, needs redo';

            return `
                <div class="captain-family-detail">
                    <span class="captain-family-letter">${letter}</span>
                    <div class="captain-family-meta">
                        <span class="${progress?.streak_passed ? 'captain-stat-done' : ''}">
                            ${icon('fire')} Streak: ${streak}/20${progress?.streak_passed ? ' ✓' : ''}
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
// Captain stats — small fun counters for the Captain Dashboard
// ---------------------------------------------------------------------------

async function loadCaptainStats() {
    const mount = document.getElementById('captainStatsMount');
    if (!mount) return;
    if (!currentProfile?.team_id) return;

    const [{ data: team }, { count: approvedCount }, { data: members }] = await Promise.all([
        _supabase.from('teams').select('current_level').eq('id', currentProfile.team_id).maybeSingle(),
        _supabase.from('writing_submissions')
            .select('id', { count: 'exact', head: true })
            .eq('reviewed_by', currentUser.id)
            .eq('status', 'approved'),
        _supabase.from('profiles').select('id').eq('team_id', currentProfile.team_id)
    ]);

    const memberIds = (members || []).map(m => m.id);
    let studentsHelped = 0;
    if (memberIds.length > 0) {
        const { data: resolvedFlags } = await _supabase
            .from('help_flags')
            .select('student_id')
            .in('student_id', memberIds)
            .eq('is_resolved', true);
        studentsHelped = new Set((resolvedFlags || []).map(f => f.student_id)).size;
    }

    const levelsDone = Math.max(0, (team?.current_level || 1) - 1);

    mount.innerHTML = `
        <div class="stat-tile">
            <div class="stat-value">${approvedCount || 0}</div>
            <div class="stat-label">SUBMISSIONS APPROVED</div>
        </div>
        <div class="stat-tile">
            <div class="stat-value">${levelsDone}</div>
            <div class="stat-label">TEAM LEVELS DONE</div>
        </div>
        <div class="stat-tile" style="grid-column: 1 / -1;">
            <div class="stat-value">${studentsHelped}</div>
            <div class="stat-label">STUDENTS HELPED</div>
        </div>
    `;
}

// ---------------------------------------------------------------------------
// Daily Team Challenge — alternates Lesson day / Pronunciation day, pulled
// straight from the Guided Course / current Fidel Challenge level so it
// always reinforces what the team is actually learning right now.
// ---------------------------------------------------------------------------

async function loadDailyTeamChallenge() {
    const mount = document.getElementById('dailyChallengeMount');
    if (!mount) return;
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading...</p>`;
    if (!currentProfile?.team_id) return;

    // Alternates every calendar day — even day-index = Lesson, odd = Pronunciation.
    const dayIndex = Math.floor(Date.now() / 86400000);
    const isPronunciationDay = dayIndex % 2 === 1;

    let title, bodyHtml, shareText;

    if (isPronunciationDay) {
        const { data: team } = await _supabase
            .from('teams').select('current_level').eq('id', currentProfile.team_id).maybeSingle();
        const currentLevel = team?.current_level || 1;
        const { data: level } = await _supabase
            .from('challenge_levels').select('letter_families')
            .eq('level_number', currentLevel).maybeSingle();
        const families = (level?.letter_families || []).join('  ');

        title = "🗣️ Pronunciation Challenge";
        bodyHtml = families
            ? `Read the <span class="daily-challenge-fidel">${families}</span> family aloud together, then record a short voice memo for the team chat.`
            : `Read today's Fidel family aloud together, then record a short voice memo for the team chat.`;
        shareText = families
            ? `🗣️ Pronunciation Challenge: Read the ${families} family aloud, then record a short voice memo for the team chat!`
            : `🗣️ Pronunciation Challenge: Read today's Fidel family aloud, then record a short voice memo for the team chat!`;
    } else {
        const lessons  = typeof fetchAllLessons === 'function' ? await fetchAllLessons() : [];
        const progress = typeof fetchMyLessonProgressAll === 'function' ? await fetchMyLessonProgressAll() : [];
        const completedIds = new Set((progress || []).filter(r => r.completed_at).map(r => r.lesson_id));
        let current = lessons.find(l => !completedIds.has(l.id));
        if (!current && lessons.length > 0) current = lessons[lessons.length - 1];

        title = `${icon('book-open')} Lesson Challenge`;
        bodyHtml = current
            ? `Practice today's lesson together: <strong>${current.title}</strong>. Read it aloud, review the vocabulary, and try today's conversation prompt.`
            : `Review your most recent lesson together: read it aloud and practice the vocabulary as a team.`;
        shareText = current
            ? `${icon('book-open')} Lesson Challenge: Practice "${current.title}" together. Read it aloud, review the vocabulary, and try today's conversation prompt!`
            : `${icon('book-open')} Lesson Challenge: Review your most recent lesson together. Read it aloud and practice the vocabulary as a team!`;
    }

    mount.innerHTML = `
        <div class="daily-challenge-card">
            <div class="daily-challenge-title">${title}</div>
            <p class="daily-challenge-body">${bodyHtml}</p>
        </div>
        <button class="daily-challenge-share-btn" id="dailyChallengeShareBtn">${icon('send')} Share with Team</button>
    `;

    const shareBtn = document.getElementById('dailyChallengeShareBtn');
    if (shareBtn) shareBtn.onclick = () => shareTeamChallenge(shareText);
}

async function shareTeamChallenge(text) {
    if (navigator.share) {
        try {
            await navigator.share({ text });
            return;
        } catch (e) {
            // User cancelled the native share sheet — fall through to clipboard.
        }
    }
    try {
        await navigator.clipboard.writeText(text);
        showNotificationToast(`Copied! Paste it into your team chat ${icon("clipboard")}`);
    } catch (e) {
        showNotificationToast("Couldn't copy automatically. Select and copy the challenge text.");
    }
}

// ---------------------------------------------------------------------------
// Team Lesson Schedule — the day/time the team gets together to go over
// that week's lesson. Teacher-owned (see lesson_schedule_setup.sql — RLS
// only allows admin writes now); captains and students see it read-only.
// table: team_meetings (team_id primary key).
// ---------------------------------------------------------------------------

// Older rows saved before the CT-labeling change may not have "CT" in the
// stored text yet — append it defensively so students always see the
// timezone regardless of when the row was last saved.
function formatMeetingTimeForDisplay(rawTime) {
    if (!rawTime) return '';
    return /\bCT\b/.test(rawTime) ? rawTime : `${rawTime} CT`;
}

// Shared by the captain and student Lesson Schedule cards — resolves the
// team's meeting, current level, and how close it is to auto-advancing,
// then builds the same display markup (including the soft pacing
// countdown) for either mount. Returns null if there's nothing to show.
async function buildLessonScheduleMarkup(teamId) {
    const [{ data: meeting }, { data: team }] = await Promise.all([
        _supabase.from('team_meetings').select('day_of_week, meeting_time, lesson_time').eq('team_id', teamId).maybeSingle(),
        _supabase.from('teams').select('current_level').eq('id', teamId).maybeSingle()
    ]);

    if (!meeting) return null;

    let pacing = null;
    if (team?.current_level && typeof fetchTeamAdvanceProgress === 'function' && typeof computeLevelPacing === 'function') {
        const progressMap = await fetchTeamAdvanceProgress([teamId], { [teamId]: team.current_level });
        const progress = progressMap[teamId] || { approved: 0, required: 0 };
        pacing = computeLevelPacing(meeting.day_of_week, meeting.lesson_time, progress.approved, progress.required);
    }

    return `
        <div class="team-meeting-display">
            <div class="team-meeting-label">Team Lesson Schedule</div>
            <div class="team-meeting-sub">The day your team gets together to go over the week's lesson</div>
            <div class="team-meeting-value">${meeting.day_of_week} • ${formatMeetingTimeForDisplay(meeting.meeting_time)}</div>
            ${pacing ? `<div class="team-meeting-pacing pacing-${pacing.status}">${pacing.label}</div>` : ''}
        </div>
    `;
}

// Read-only — shown on the Captain Dashboard. Captains can no longer edit
// this; only the teacher can, from the teacher dashboard.
async function loadWeeklyMeeting() {
    const mount = document.getElementById('teamMeetingMount');
    if (!mount) return;
    if (!currentProfile?.team_id) return;

    const markup = await buildLessonScheduleMarkup(currentProfile.team_id);
    mount.innerHTML = markup || `<p style="color:#94a3b8; font-size:13px;">Your teacher hasn't set a lesson schedule yet.</p>`;
}

// Read-only version for the student-facing dashboard — same data, just a
// different mount. Card stays hidden if the team hasn't had a lesson
// schedule set yet.
async function loadStudentMeetingDisplay() {
    const card = document.getElementById('studentMeetingCard');
    const mount = document.getElementById('studentMeetingMount');
    if (!card || !mount) return;
    if (!currentProfile?.team_id) { card.style.display = 'none'; return; }

    const markup = await buildLessonScheduleMarkup(currentProfile.team_id);
    if (!markup) { card.style.display = 'none'; return; }

    card.style.display = 'block';
    mount.innerHTML = markup;
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
        showGobezToast(`${icon('crown')} ${count} writing submission${count > 1 ? 's' : ''} waiting for your review!`);
    }
}
function exitCaptainDashboard() {
  if (typeof chooseModeChallenge === 'function') {
    chooseModeChallenge();
  } else if (typeof enterModeSelect === 'function') {
    enterModeSelect();
  }
}
// ---------------------------------------------------------------------------
// Expose
// ---------------------------------------------------------------------------

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
window.loadDailyTeamChallenge    = loadDailyTeamChallenge;
window.shareTeamChallenge        = shareTeamChallenge;
window.loadWeeklyMeeting         = loadWeeklyMeeting;
window.loadStudentMeetingDisplay = loadStudentMeetingDisplay;
window.loadCaptainWritingQueue   = loadCaptainWritingQueue;
window.loadCaptainRecentlyApproved = loadCaptainRecentlyApproved;
window.loadCaptainTeamProgress   = loadCaptainTeamProgress;
window.loadCaptainStats          = loadCaptainStats;
window.captainApproveSubmission  = captainApproveSubmission;
window.captainRejectSubmission   = captainRejectSubmission;
window.checkCaptainInboxBadge    = checkCaptainInboxBadge;

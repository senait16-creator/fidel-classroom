// =============================================================================
// FIDEL CHALLENGE — challenge.js
// Loads AFTER app.js. Relies on globals already defined there:
//   _supabase, currentUser, currentProfile, showNotificationToast,
//   showGobezToast, alphabetData, executeVictoryConfettiCelebration
// =============================================================================

let challengeLevelsCache = null;
let activeChallengeLevel = null;
let activeChallengeFamilyObj = null;
let activeChallengeFamilyLevel = null;

// Color map used by team hub header background
const TEAM_COLORS = {
    Red: '#b91c1c',
    Blue: '#1d4ed8',
    Green: '#166534',
    Yellow: '#a16207',
    Purple: '#7e22ce'
};

function getTeamHex(teamName) {
    for (const [key, hex] of Object.entries(TEAM_COLORS)) {
        if (teamName && teamName.includes(key)) return hex;
    }
    return '#166534';
}

// -----------------------------------------------------------------------------
// Mode select
// -----------------------------------------------------------------------------

function enterModeSelect() {
    document.getElementById("studentDashboard").style.display = "none";
    document.getElementById("readingLevelsScreen").style.display = "none";
    document.getElementById("challengeLevelsScreen").style.display = "none";
    document.getElementById("challengeFamilyScreen").style.display = "none";
    document.getElementById("challengeFamilyDetailScreen").style.display = "none";
    document.getElementById("teamHubScreen").style.display = "none";
    document.getElementById("modeSelectScreen").style.display = "block";

    const isCaptain = !!currentProfile?.is_captain;
    const banner = document.getElementById("captainModeSelectBanner");
    const captainOption = document.getElementById("modeSelectCaptainOption");
    if (banner) banner.style.display = isCaptain ? "block" : "none";
    if (captainOption) captainOption.style.display = isCaptain ? "block" : "none";

    const nickname = currentProfile?.nickname ? `, ${currentProfile.nickname}` : '';
    const nicknameEl = document.getElementById("modeSelectNickname");
    if (nicknameEl) nicknameEl.innerText = nickname;
}

function chooseModePractice() {
    document.getElementById("modeSelectScreen").style.display = "none";
    launchDashboard("student");
}

function chooseModeChallenge() {
    if (!currentProfile?.team_id) {
        showNotificationToast("Fidel Challenge is a team competition — join a team in your profile to play!");
        return;
    }
    document.getElementById("modeSelectScreen").style.display = "none";
    enterTeamHub();
}

function chooseModeReading() {
    document.getElementById("modeSelectScreen").style.display = "none";
    document.getElementById("readingLevelsScreen").style.display = "block";
    if (typeof renderReadingLevelsList === "function") renderReadingLevelsList();
}

// -----------------------------------------------------------------------------
// Team Hub
// -----------------------------------------------------------------------------

async function enterTeamHub() {
    document.getElementById("teamHubScreen").style.display = "block";
    await renderTeamHub();
}

function exitTeamHub() {
    document.getElementById("teamHubScreen").style.display = "none";
    enterModeSelect();
}

function enterChallengeLevelsFromHub() {
    document.getElementById("teamHubScreen").style.display = "none";
    document.getElementById("challengeLevelsScreen").style.display = "block";
    renderChallengeLevelsView();
}

async function renderTeamHub() {
    // Load team info
    const { data: team } = await _supabase
        .from('teams')
        .select('id, name, current_level, streak_count')
        .eq('id', currentProfile.team_id)
        .maybeSingle();

    if (!team) return;

    // Header
    const headerEl = document.getElementById("teamHubHeaderEl");
    headerEl.style.background = `linear-gradient(135deg, ${getTeamHex(team.name)}, ${getTeamHex(team.name)}cc)`;
    document.getElementById("teamHubTeamName").innerText = team.name;
    document.getElementById("teamHubLevelLabel").innerText = `Level ${team.current_level}`;
    document.getElementById("teamHubStreakLabel").innerText = team.streak_count || 0;

    // Members row
    const { data: members } = await _supabase
        .from('profiles')
        .select('id, nickname, avatar, is_captain')
        .eq('team_id', currentProfile.team_id)
        .order('nickname');

    const membersRow = document.getElementById("teamHubMembersRow");
    membersRow.innerHTML = "";
    (members || []).forEach(m => {
        const chip = document.createElement('div');
        chip.className = `team-hub-member-chip ${m.is_captain ? 'is-captain' : ''}`;
        chip.innerHTML = `${m.avatar || '🦁'} ${m.nickname}${m.is_captain ? ' 👑' : ''}`;
        membersRow.appendChild(chip);
    });

    // Letter select for posting
    const letterSelect = document.getElementById("teamHubLetterSelect");
    letterSelect.innerHTML = "";
    alphabetData.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.base;
        opt.innerText = item.base;
        letterSelect.appendChild(opt);
    });

    // Load practice feed
    await loadTeamPracticeFeed();
}

async function loadTeamPracticeFeed() {
    const mount = document.getElementById("teamHubPracticeFeed");
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading...</p>`;

    const now = new Date().toISOString();
    const { data: posts, error } = await _supabase
        .from('team_practice_posts')
        .select('id, base_letter, image_url, posted_at, expires_at, student_id, profiles!team_practice_posts_student_id_fkey(nickname, avatar)')
        .eq('team_id', currentProfile.team_id)
        .gt('expires_at', now)
        .order('posted_at', { ascending: false });

    if (error) {
        console.error("Failed to load team practice feed:", error);
        mount.innerHTML = `<p style="color:#ef4444; font-size:13px;">Couldn't load feed: ${error.message}</p>`;
        return;
    }

    if (!posts || posts.length === 0) {
        mount.innerHTML = `<div class="team-hub-empty">No practice posts yet — be the first to share! 🎉</div>`;
        return;
    }

    // Load reactions for all posts in one query
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
            return `<button class="reaction-btn ${isActive ? 'reacted' : ''}" onclick="toggleReaction('${post.id}', '${emoji}', this)">
                ${emoji} <span class="reaction-count">${count || ''}</span>
            </button>`;
        }).join('');

        const card = document.createElement('div');
        card.className = "practice-post-card";
        card.dataset.postId = post.id;
        card.innerHTML = `
            <img src="${post.image_url}" class="practice-post-img" alt="Practice drawing">
            <div class="practice-post-meta">
                <div class="practice-post-header">
                    <span class="practice-post-author">${post.profiles?.avatar || '🦁'} ${post.profiles?.nickname || 'Student'}</span>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="practice-post-letter">${post.base_letter}</span>
                        <span class="practice-post-time">${hoursLeft}h left</span>
                    </div>
                </div>
                <div class="reaction-row">${reactionHTML}</div>
                ${isOwn ? `<button class="btn-secondary" style="font-size:11px; color:#ef4444; padding:2px 0; text-align:left;" onclick="deleteTeamPracticePost('${post.id}', '${post.image_url}')">🗑️ Delete</button>` : ''}
            </div>
        `;
        mount.appendChild(card);
    });
}

async function toggleReaction(postId, emoji, buttonEl) {
    const isCurrentlyReacted = buttonEl.classList.contains('reacted');

    // Optimistic UI update
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

    // Reload just the feed to get accurate counts
    await loadTeamPracticeFeed();
}

async function deleteTeamPracticePost(postId, imageUrl) {
    if (!confirm("Delete this post?")) return;

    const pathMatch = imageUrl.match(/art_shares\/(.+)$/);
    const storagePath = pathMatch ? pathMatch[1] : null;

    const { error } = await _supabase.from('team_practice_posts').delete().eq('id', postId);
    if (error) return showNotificationToast("Couldn't delete: " + error.message);

    if (storagePath) {
        await _supabase.storage.from('art_shares').remove([storagePath]);
    }

    showNotificationToast("Post deleted.");
    await loadTeamPracticeFeed();
}

// Opens the file picker for a PRACTICE post (goes to team feed, not captain queue)
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
    showNotificationToast("Uploading your practice post...");
const letterIndex = alphabetData.findIndex(item => item.base === baseLetter);
const storagePath = `practice-${currentUser.id}-fam${letterIndex}-${Date.now()}.png`;
    
    const { error: uploadError } = await _supabase.storage
        .from('art_shares')
        .upload(storagePath, file, { contentType: file.type });

    if (uploadError) {
        console.error("Practice post upload failed:", uploadError);
        return showNotificationToast("Upload failed: " + uploadError.message);
    }

    const { data: urlData } = _supabase.storage.from('art_shares').getPublicUrl(storagePath);

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

    showGobezToast("Practice post shared with your team!");
    await loadTeamPracticeFeed();
}

// Opens the writing submit screen for FINAL APPROVAL (goes to captain queue)
function openTeamHubFinalSubmit() {
    const baseLetter = document.getElementById("teamHubLetterSelect").value;
    openWritingSubmitScreen(baseLetter, () => {
        document.getElementById("teamHubScreen").style.display = "block";
        loadTeamPracticeFeed();
    });
    document.getElementById("teamHubScreen").style.display = "none";
}

// -----------------------------------------------------------------------------
// Captain Dashboard
// -----------------------------------------------------------------------------

function enterCaptainDashboard() {
    document.getElementById("studentDashboard").style.display = "none";
    document.getElementById("captainDashboardScreen").style.display = "block";
    loadCaptainWritingQueue();
    loadCaptainTeamProgress();
}

function exitCaptainDashboard() {
    document.getElementById("captainDashboardScreen").style.display = "none";
    document.getElementById("studentDashboard").style.display = "block";
}

async function loadCaptainWritingQueue() {
    const mount = document.getElementById("captainWritingQueueMount");
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading...</p>`;

    if (!currentProfile?.team_id) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">You're not assigned to a team.</p>`;
        return;
    }

    const { data: members } = await _supabase
        .from('profiles')
        .select('id')
        .eq('team_id', currentProfile.team_id);

    const memberIds = (members || []).map(m => m.id);
    if (memberIds.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No teammates yet.</p>`;
        return;
    }

    const { data: submissions, error } = await _supabase
        .from('writing_submissions')
        .select('id, base_letter, image_url, status, submitted_at, student_id, profiles!writing_submissions_student_id_fkey(nickname, avatar)')
        .in('student_id', memberIds)
        .eq('status', 'pending')
        .order('submitted_at', { ascending: true });

    if (error) {
        console.error("Failed to load captain's writing queue:", error);
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
                    <button class="btn-approve">✓ Approve</button>
                    <button class="btn-reject">✗ Reject</button>
                </div>
                <input type="text" class="teacher-reject-note-input" placeholder="Optional note..." style="display:none;">
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

    showGobezToast("Submission approved! ✓");
    await loadCaptainWritingQueue();
    await loadCaptainTeamProgress();

    if (typeof checkAndUpdateTeamLevelCompletion === "function") {
        await checkAndUpdateTeamLevelCompletion(studentId);
    }
}

async function captainRejectSubmission(submissionId, note) {
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
    await loadCaptainWritingQueue();
}

async function loadCaptainTeamProgress() {
    const mount = document.getElementById("captainTeamProgressMount");
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading...</p>`;

    if (!currentProfile?.team_id) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">You're not assigned to a team.</p>`;
        return;
    }

    const { data: team } = await _supabase
        .from('teams')
        .select('current_level')
        .eq('id', currentProfile.team_id)
        .maybeSingle();

    const { data: members } = await _supabase
        .from('profiles')
        .select('id, nickname, avatar, is_captain')
        .eq('team_id', currentProfile.team_id)
        .order('nickname');

    if (!members || members.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No teammates yet.</p>`;
        return;
    }

    const { data: level } = await _supabase
        .from('challenge_levels')
        .select('letter_families')
        .eq('level_number', team?.current_level || 1)
        .maybeSingle();

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
                </div>
            `;
            mount.appendChild(row);
            return;
        }

        const familyDetails = (level?.letter_families || []).map(letter => {
            const progress = (progressRows || []).find(r => r.student_id === member.id && r.base_letter === letter);
            const latestSubmission = (submissions || []).find(s => s.student_id === member.id && s.base_letter === letter);
            const streak = progress?.best_streak || 0;
            const streakDone = !!progress?.streak_passed;
            const writingDone = !!progress?.writing_passed;

            return `
                <div class="captain-family-detail">
                    <span class="captain-family-letter">${letter}</span>
                    <div class="captain-family-meta">
                        <span class="${streakDone ? 'captain-stat-done' : ''}">🔥 ${streak}/20</span>
                        <span class="${writingDone ? 'captain-stat-done' : ''}">
                            ${writingDone ? '✓ Approved' : (latestSubmission ? '⏳ Pending' : '— No submission')}
                        </span>
                    </div>
                    ${latestSubmission ? `<img src="${latestSubmission.image_url}" class="captain-family-thumb" alt="writing">` : ''}
                </div>
            `;
        }).join('');

        const clearedCount = (level?.letter_families || []).filter(letter => {
            const r = (progressRows || []).find(pr => pr.student_id === member.id && pr.base_letter === letter);
            return r?.streak_passed && r?.writing_passed;
        }).length;

        row.innerHTML = `
            <div class="captain-member-header" onclick="this.parentElement.querySelector('.captain-member-details').classList.toggle('open'); this.querySelector('.captain-member-toggle').classList.toggle('collapsed');">
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

// -----------------------------------------------------------------------------
// Challenge levels
// -----------------------------------------------------------------------------

function exitChallengeBackToDashboard() {
    document.getElementById("challengeLevelsScreen").style.display = "none";
    document.getElementById("teamHubScreen").style.display = "block";
}

async function fetchChallengeLevels() {
    if (challengeLevelsCache) return challengeLevelsCache;

    const { data, error } = await _supabase
        .from('challenge_levels')
        .select('level_number, letter_families, title')
        .order('level_number', { ascending: true });

    if (error) {
        console.error("Failed to load challenge levels:", error);
        showNotificationToast("Couldn't load Fidel Challenge levels.");
        return [];
    }

    challengeLevelsCache = data || [];
    return challengeLevelsCache;
}

async function getTeamBoardInfo() {
    if (!currentProfile?.team_id) {
        return { name: "No Team Yet", current_level: 1, streak_count: 0 };
    }

    const { data: team, error } = await _supabase
        .from('teams')
        .select('name, current_level, streak_count')
        .eq('id', currentProfile.team_id)
        .maybeSingle();

    if (error || !team) return { name: "No Team Yet", current_level: 1, streak_count: 0 };

    return {
        name: team.name || "Your Team",
        current_level: team.current_level || 1,
        streak_count: team.streak_count || 0
    };
}

function renderChallengeBoardHeader(team, totalLevels) {
    document.getElementById("challengeBoardTeamName").innerText = team.name;
    document.getElementById("challengeBoardTeamSub").innerText = `Level ${team.current_level} of ${totalLevels}`;
    document.getElementById("challengeBoardStreakValue").innerText = team.streak_count;

    const percent = Math.min(100, Math.round(((team.current_level - 1) / totalLevels) * 100));
    document.getElementById("challengeBoardProgressFill").style.width = `${percent}%`;

    const swatch = document.getElementById("challengeBoardTeamSwatch");
    swatch.style.background = getTeamHex(team.name);
}

async function renderChallengeLevelsView() {
    const container = document.getElementById("challengeLevelsGrid");
    container.innerHTML = `<p style="color:#94a3b8;">Loading levels...</p>`;

    const [levels, team] = await Promise.all([fetchChallengeLevels(), getTeamBoardInfo()]);
    renderChallengeBoardHeader(team, levels.length || 12);
    container.innerHTML = "";

    levels.forEach(level => {
        const isCompleted = level.level_number < team.current_level;
        const isCurrent = level.level_number === team.current_level;
        const isUnlocked = level.level_number <= team.current_level;
        const isCapstone = level.level_number === 12;

        const stateClass = isCompleted ? 'completed' : (isUnlocked ? 'unlocked' : 'locked');
        const card = document.createElement('div');
        card.className = `challenge-level-card ${stateClass} ${isCurrent ? 'current' : ''}`;

        card.innerHTML = `
            <div class="challenge-level-number-badge">${isUnlocked ? level.level_number : '🔒'}</div>
            <div class="challenge-level-title">${level.title || `Level ${level.level_number}`}</div>
            <div class="challenge-level-families">${(level.letter_families || []).join(' ')}</div>
            ${isCapstone ? '<div class="challenge-capstone-badge">⭐ Capstone</div>' : ''}
        `;

        if (isUnlocked) card.onclick = () => openChallengeFamilyPicker(level);
        container.appendChild(card);
    });
}

// -----------------------------------------------------------------------------
// Family picker
// -----------------------------------------------------------------------------

async function openChallengeFamilyPicker(level) {
    activeChallengeLevel = level;
    document.getElementById("challengeLevelsScreen").style.display = "none";
    document.getElementById("challengeFamilyScreen").style.display = "block";
    await renderChallengeFamilyPicker();
}

async function returnToChallengeFamilyPicker() {
    document.getElementById("gameWorkspace").style.display = "none";

    if (activeChallengeFamilyObj) {
        document.getElementById("challengeFamilyDetailScreen").style.display = "block";
        renderChallengeFamilyDetailGiantRow(activeChallengeFamilyObj);
    } else {
        document.getElementById("challengeFamilyScreen").style.display = "block";
        await renderChallengeFamilyPicker();
    }
}

function exitChallengeFamilyPicker() {
    document.getElementById("challengeFamilyScreen").style.display = "none";
    document.getElementById("challengeLevelsScreen").style.display = "block";
    renderChallengeLevelsView();
}

async function fetchStudentFamilyProgressForLevel(levelNumber) {
    const { data, error } = await _supabase
        .from('student_family_progress')
        .select('base_letter, best_streak, streak_passed, writing_passed, completed_at')
        .eq('student_id', currentUser.id)
        .eq('level_number', levelNumber);

    if (error) { console.error("Failed to load family progress:", error); return []; }
    return data || [];
}

async function renderChallengeFamilyPicker() {
    const level = activeChallengeLevel;
    document.getElementById("challengeFamilyTitle").innerText = level.title || `Level ${level.level_number}`;

    const container = document.getElementById("challengeFamilyGrid");
    container.innerHTML = `<p style="color:#94a3b8;">Loading...</p>`;

    const progressRows = await fetchStudentFamilyProgressForLevel(level.level_number);
    const progressByLetter = {};
    progressRows.forEach(row => { progressByLetter[row.base_letter] = row; });

    container.innerHTML = "";
    const positionLabels = ["1st", "2nd", "3rd"];

    (level.letter_families || []).forEach((baseLetter, idx) => {
        const progress = progressByLetter[baseLetter] || { best_streak: 0, streak_passed: false, writing_passed: false };
        const fidelObj = alphabetData.find(item => item.base === baseLetter);

        const card = document.createElement('div');
        card.className = `challenge-family-card pos-${idx + 1} ${progress.streak_passed && progress.writing_passed ? 'mastered' : ''}`;
        card.innerHTML = `
            <span class="challenge-family-position-tag">${positionLabels[idx] || `#${idx + 1}`}</span>
            <div class="challenge-family-letter">${baseLetter}</div>
            <div class="challenge-family-progress-row">
                <span class="challenge-family-pill ${progress.streak_passed ? 'done' : ''}">
                    ${progress.streak_passed ? '✓' : ''} Streak ${progress.best_streak}/${STREAK_THRESHOLD}
                </span>
                <span class="challenge-family-pill ${progress.writing_passed ? 'done' : ''}">
                    ${progress.writing_passed ? '✓ Writing approved' : 'Writing pending'}
                </span>
            </div>
        `;
        card.onclick = () => openChallengeFamilyDetail(fidelObj, level.level_number);
        container.appendChild(card);
    });
}

// -----------------------------------------------------------------------------
// Streak game
// -----------------------------------------------------------------------------

async function recordStreakProgress(baseLetter, levelNumber, bestStreak, passed) {
    const { error } = await _supabase
        .from('student_family_progress')
        .upsert({
            student_id: currentUser.id,
            base_letter: baseLetter,
            level_number: levelNumber,
            best_streak: bestStreak,
            streak_passed: passed
        }, { onConflict: 'student_id,base_letter' });

    if (error) console.error("Failed to save streak progress:", error);
}

async function recordStreakProgress(baseLetter, levelNumber, bestStreak, passed) {
    const { error } = await _supabase
        .from('student_family_progress')
        .upsert({
            student_id: currentUser.id,
            base_letter: baseLetter,
            level_number: levelNumber,
            best_streak: bestStreak,
            streak_passed: passed
        }, { onConflict: 'student_id,base_letter' });

    if (error) console.error("Failed to save streak progress:", error);
}

function launchChallengeStreakGame(fidelObj, levelNumber) {
    let bestStreakThisSession = 0;
    let matchesSinceLastSave = 0; // save every 5 matches not just on improvement

    activeChallengeContext = {
        baseLetter: fidelObj.base,
        levelNumber: levelNumber,
        onStreakUpdate: (currentStreak) => {
            matchesSinceLastSave++;
            if (currentStreak > bestStreakThisSession) {
                bestStreakThisSession = currentStreak;
            }
            // Save every 5 matches regardless of whether it's a new best
            if (matchesSinceLastSave >= 5) {
                matchesSinceLastSave = 0;
                recordStreakProgress(fidelObj.base, levelNumber, bestStreakThisSession, false);
            }
        },
        onStreakPassed: async (finalStreak) => {
            await recordStreakProgress(fidelObj.base, levelNumber, finalStreak, true);
            showGobezToast(`ጎበዝ! Streak of ${STREAK_THRESHOLD} complete! Keep going!`);
            executeVictoryConfettiCelebration();
        }
    };

   maybeShowStreakExplainer(() => {
        document.getElementById("challengeFamilyDetailScreen").style.display = "none";
        document.getElementById("challengeFamilyScreen").style.display = "none";
        openMatchingGameWorkspaceMode(fidelObj);
    });
}

// -----------------------------------------------------------------------------
// Family detail
// -----------------------------------------------------------------------------

const vowelSoundLabels = ["-ä", "-u", "-ee", "-a", "-ay", "-ih", "-o"];

function openChallengeFamilyDetail(fidelObj, levelNumber) {
    activeChallengeFamilyObj = fidelObj;
    activeChallengeFamilyLevel = levelNumber;

    document.getElementById("challengeFamilyScreen").style.display = "none";
    document.getElementById("challengeFamilyDetailScreen").style.display = "block";
    document.getElementById("challengeFamilyDetailTitle").innerText = `Family: "${fidelObj.base}"`;

    renderChallengeFamilyDetailGiantRow(fidelObj);

    if (currentProfile?.is_captain) {
        document.getElementById("challengeDetailPlayBtn").style.display = "none";
        document.getElementById("challengeDetailFlashcardBtn").style.display = "none";
        document.getElementById("challengeDetailWritingBtn").style.display = "none";
        const box = document.getElementById("challengeWritingStatusBox");
        box.style.display = "block";
        box.innerHTML = `<div class="challenge-writing-status approved">👑 As team captain, you're exempt — focus on reviewing your team's submissions!</div>`;
        return;
    }

    document.getElementById("challengeDetailPlayBtn").style.display = "flex";
    document.getElementById("challengeDetailFlashcardBtn").style.display = "flex";
    document.getElementById("challengeDetailWritingBtn").style.display = "block";
    renderWritingStatusForFamily(fidelObj.base);

    document.getElementById("challengeDetailPlayBtn").onclick = () =>
        launchChallengeStreakGame(fidelObj, levelNumber);

    document.getElementById("challengeDetailFlashcardBtn").onclick = () => {
        openFlashcardStudy(buildFlashcardDeckForFamily(fidelObj), `"${fidelObj.base}" Family`, () => {
            document.getElementById("challengeFamilyDetailScreen").style.display = "block";
        });
        document.getElementById("challengeFamilyDetailScreen").style.display = "none";
    };

    document.getElementById("challengeDetailWritingBtn").onclick = () => {
        openWritingSubmitScreen(fidelObj.base, () => {
            document.getElementById("challengeFamilyDetailScreen").style.display = "block";
            renderWritingStatusForFamily(fidelObj.base);
        });
        document.getElementById("challengeFamilyDetailScreen").style.display = "none";
    };
}

function exitChallengeFamilyDetail() {
    document.getElementById("challengeFamilyDetailScreen").style.display = "none";
    document.getElementById("challengeFamilyScreen").style.display = "block";
}

function renderChallengeFamilyDetailGiantRow(fidelObj) {
    const mount = document.getElementById("challengeFamilyDetailGiantRow");
    mount.innerHTML = "";

    const subs = (fidelObj.prefix === "h" || fidelObj.prefix === "ḥ")
        ? ["ha", "hu", "hee", "ha", "hay", "hih", "ho"]
        : vowelSoundLabels.map(sub => `${fidelObj.prefix}${sub}`);

    fidelObj.family.forEach((char, idx) => {
        const card = document.createElement('div');
        card.className = "giant-char-card";
        card.innerHTML = `<div class="letter">${char}</div><div class="sub">${subs[idx]}</div>`;
        mount.appendChild(card);
    });
}

// -----------------------------------------------------------------------------
// Expose to inline handlers
// -----------------------------------------------------------------------------

window.enterModeSelect = enterModeSelect;
window.chooseModePractice = chooseModePractice;
window.chooseModeChallenge = chooseModeChallenge;
window.chooseModeReading = chooseModeReading;
window.exitTeamHub = exitTeamHub;
window.enterChallengeLevelsFromHub = enterChallengeLevelsFromHub;
window.openTeamHubPracticePost = openTeamHubPracticePost;
window.openTeamHubFinalSubmit = openTeamHubFinalSubmit;
window.toggleReaction = toggleReaction;
window.deleteTeamPracticePost = deleteTeamPracticePost;
window.exitChallengeBackToDashboard = exitChallengeBackToDashboard;
window.openChallengeFamilyPicker = openChallengeFamilyPicker;
window.exitChallengeFamilyPicker = exitChallengeFamilyPicker;
window.returnToChallengeFamilyPicker = returnToChallengeFamilyPicker;
window.launchChallengeStreakGame = launchChallengeStreakGame;
window.exitChallengeFamilyDetail = exitChallengeFamilyDetail;
window.enterCaptainDashboard = enterCaptainDashboard;
window.exitCaptainDashboard = exitCaptainDashboard;

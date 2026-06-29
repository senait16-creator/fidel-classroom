// =============================================================================
// FIDEL CHALLENGE — challenge.js
// Loads AFTER app.js. Relies on globals already defined there:
//   _supabase, currentUser, currentProfile, showNotificationToast, alphabetData
// =============================================================================

// STREAK_THRESHOLD is defined in app.js (loads first) and shared here.

let challengeLevelsCache = null; // loaded once from challenge_levels, reused across views
let activeChallengeLevel = null; // the level object currently being viewed in the family picker
let activeChallengeFamilyObj = null; // the family object currently being viewed in the detail screen
let activeChallengeFamilyLevel = null; // the level number that family belongs to

// -----------------------------------------------------------------------------
// Mode select
// -----------------------------------------------------------------------------

// Called from the student dashboard — e.g. a new "Fidel Challenge" button
// placed next to (or instead of) the existing "Matching Game Arena" button.
function enterModeSelect() {
    document.getElementById("studentDashboard").style.display = "none";
    document.getElementById("readingLevelsScreen").style.display = "none";
    document.getElementById("challengeLevelsScreen").style.display = "none";
    document.getElementById("challengeFamilyScreen").style.display = "none";
    document.getElementById("challengeFamilyDetailScreen").style.display = "none";
    document.getElementById("modeSelectScreen").style.display = "block";
}

function chooseModePractice() {
    // "Practice the Fidel" = exactly what already exists today. No gating,
    // no team dependency, doesn't touch challenge tables at all.
    //
    // Reuses launchDashboard("student") (defined in app.js) rather than
    // duplicating its population logic here — chooseModePractice is now a
    // real entry point into the dashboard (reached from mode-select), not
    // just a visibility toggle, so it needs the same setup launchDashboard
    // already does. Keeping one source of truth avoids the two drifting
    // out of sync the way they briefly did (grid/leaderboard/team-progress
    // staying empty when this function only toggled display).
    document.getElementById("modeSelectScreen").style.display = "none";
    launchDashboard("student");
}

// -----------------------------------------------------------------------------
// Captain Dashboard — scoped review screen for a team's captain. Shows ONLY
// their own team's pending submissions and member progress, enforced both
// by these queries (filtered to their team_id) AND by RLS at the database
// level (is_captain_of_student()), so this isn't just a UI-level scoping.
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

    // Get this captain's team members first, then filter submissions to
    // just those students — the RLS policy also enforces this server-side,
    // but filtering here too keeps the query itself scoped and efficient.
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
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No pending submissions from your team — all caught up!</p>`;
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
                <input type="text" class="teacher-reject-note-input" placeholder="Optional note for rejection..." style="display:none;">
            </div>
        `;

        const approveBtn = card.querySelector('.btn-approve');
        const rejectBtn = card.querySelector('.btn-reject');
        const noteInput = card.querySelector('.teacher-reject-note-input');

        approveBtn.onclick = () => captainApproveSubmission(sub.id, sub.student_id, sub.base_letter);

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

    if (subError) {
        console.error("Captain approval failed:", subError);
        return showNotificationToast("Approval failed: " + subError.message);
    }

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
    await loadCaptainWritingQueue();
    await loadCaptainTeamProgress();

    // Same team-completion check the teacher's approval triggers — a
    // captain's approval should be equally capable of unlocking the next
    // level for their team, not just the admin's.
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

    if (error) {
        console.error("Captain rejection failed:", error);
        return showNotificationToast("Reject failed: " + error.message);
    }

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
        .select('student_id, base_letter, streak_passed, writing_passed')
        .in('student_id', members.map(m => m.id))
        .eq('level_number', team?.current_level || 1);

    mount.innerHTML = "";
    members.forEach(member => {
        const row = document.createElement('div');
        row.className = 'team-member-row';

        if (member.is_captain) {
            row.innerHTML = `<span>${member.avatar || '🦁'} ${member.nickname} (you)</span><span class="team-member-progress" style="color:#b45309;">👑 Captain</span>`;
        } else {
            const clearedCount = (level?.letter_families || []).filter(letter => {
                const r = (progressRows || []).find(pr => pr.student_id === member.id && pr.base_letter === letter);
                return r?.streak_passed && r?.writing_passed;
            }).length;
            row.innerHTML = `<span>${member.avatar || '🦁'} ${member.nickname}</span><span class="team-member-progress">${clearedCount} / ${familyCount} families cleared</span>`;
        }

        mount.appendChild(row);
    });
}

async function chooseModeChallenge() {
    if (!currentProfile?.team_id) {
        showNotificationToast("Fidel Challenge is a team competition — join a team in your profile to play!");
        return;
    }
    document.getElementById("modeSelectScreen").style.display = "none";
    document.getElementById("challengeLevelsScreen").style.display = "block";
    await renderChallengeLevelsView();
}

function chooseModeReading() {
    document.getElementById("modeSelectScreen").style.display = "none";
    document.getElementById("readingLevelsScreen").style.display = "block";
    if (typeof renderReadingLevelsList === "function") renderReadingLevelsList();
}

function exitChallengeBackToDashboard() {
    document.getElementById("challengeLevelsScreen").style.display = "none";
    enterModeSelect();
}

// -----------------------------------------------------------------------------
// Locked levels view (static for now — no gameplay wired up yet)
// -----------------------------------------------------------------------------

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

// Fetches the student's team row (name, current_level, streak_count).
// Falls back to sensible defaults if no team is assigned yet, so the board
// still renders something reasonable rather than breaking.
async function getTeamBoardInfo() {
    if (!currentProfile?.team_id) {
        return { name: "No Team Yet", current_level: 1, streak_count: 0 };
    }

    const { data: team, error } = await _supabase
        .from('teams')
        .select('name, current_level, streak_count')
        .eq('id', currentProfile.team_id)
        .maybeSingle();

    if (error || !team) {
        return { name: "No Team Yet", current_level: 1, streak_count: 0 };
    }

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
    if (team.name && team.name.includes("Red")) swatch.style.background = "#ef4444";
    else if (team.name && team.name.includes("Blue")) swatch.style.background = "#3b82f6";
    else if (team.name && team.name.includes("Green")) swatch.style.background = "#10b981";
    else if (team.name && team.name.includes("Yellow")) swatch.style.background = "#f59e0b";
    else if (team.name && team.name.includes("Purple")) swatch.style.background = "#a855f7";
    else swatch.style.background = "var(--brand-primary)";
}

async function renderChallengeLevelsView() {
    const container = document.getElementById("challengeLevelsGrid");
    container.innerHTML = `<p style="color:#94a3b8;">Loading levels...</p>`;

    const [levels, team] = await Promise.all([
        fetchChallengeLevels(),
        getTeamBoardInfo()
    ]);

    renderChallengeBoardHeader(team, levels.length || 12);

    container.innerHTML = "";

    levels.forEach(level => {
        const card = document.createElement('div');
        const isCompleted = level.level_number < team.current_level;
        const isCurrent = level.level_number === team.current_level;
        const isUnlocked = level.level_number <= team.current_level;
        const isCapstone = level.level_number === 12;

        const stateClass = isCompleted ? 'completed' : (isUnlocked ? 'unlocked' : 'locked');
        card.className = `challenge-level-card ${stateClass} ${isCurrent ? 'current' : ''}`;

        const familiesPreview = (level.letter_families || []).join(' ');
        const badgeContent = isUnlocked ? level.level_number : '🔒';

        card.innerHTML = `
            <div class="challenge-level-number-badge">${badgeContent}</div>
            <div class="challenge-level-title">${level.title || `Level ${level.level_number}`}</div>
            <div class="challenge-level-families">${familiesPreview}</div>
            ${isCapstone ? '<div class="challenge-capstone-badge">⭐ Capstone</div>' : ''}
        `;

        if (isUnlocked) {
            card.onclick = () => openChallengeFamilyPicker(level);
        }

        container.appendChild(card);
    });
}

// -----------------------------------------------------------------------------
// Family picker — shown after clicking an unlocked level. Lets the student
// choose which of the level's families to drill next, and shows per-family
// progress (streak passed / writing passed) once that data exists.
// -----------------------------------------------------------------------------

async function openChallengeFamilyPicker(level) {
    activeChallengeLevel = level;

    document.getElementById("challengeLevelsScreen").style.display = "none";
    document.getElementById("challengeFamilyScreen").style.display = "block";

    await renderChallengeFamilyPicker();
}

// Re-shown when exiting the matching game while in Challenge mode (hooked
// from app.js's openMatchingGameWorkspaceMode exit handler).
async function returnToChallengeFamilyPicker() {
    document.getElementById("gameWorkspace").style.display = "none";

    // Return to the detail screen the game was launched from (giant letters +
    // play/flashcard buttons), not all the way back out to the picker grid —
    // matches how the student got here in the first place.
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

    if (error) {
        console.error("Failed to load family progress:", error);
        return [];
    }
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
        const posClass = `pos-${idx + 1}`; // 1st family = green, 2nd = yellow, 3rd = red, consistent every level

        const card = document.createElement('div');
        card.className = `challenge-family-card ${posClass} ${progress.streak_passed && progress.writing_passed ? 'mastered' : ''}`;

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
// Streak game launcher — sets activeChallengeContext, then reuses the
// existing shared matching game from app.js unchanged.
// -----------------------------------------------------------------------------

async function recordStreakProgress(baseLetter, levelNumber, bestStreak, passed) {
    const payload = {
        student_id: currentUser.id,
        base_letter: baseLetter,
        level_number: levelNumber,
        best_streak: bestStreak,
        streak_passed: passed
    };

    const { error } = await _supabase
        .from('student_family_progress')
        .upsert(payload, { onConflict: 'student_id,base_letter' });

    if (error) console.error("Failed to save streak progress:", error);
}

function launchChallengeStreakGame(fidelObj, levelNumber) {
    let bestStreakThisSession = 0;

    activeChallengeContext = {
        baseLetter: fidelObj.base,
        levelNumber: levelNumber,
        onStreakUpdate: (currentStreak) => {
            if (currentStreak > bestStreakThisSession) {
                bestStreakThisSession = currentStreak;
                recordStreakProgress(fidelObj.base, levelNumber, bestStreakThisSession, false);
            }
        },
        onStreakPassed: async (finalStreak) => {
            await recordStreakProgress(fidelObj.base, levelNumber, finalStreak, true);
            showNotificationToast(`🎉 Streak of ${STREAK_THRESHOLD}! "${fidelObj.base}" matching mastered!`);
            executeVictoryConfettiCelebration();
        }
    };

    document.getElementById("challengeFamilyDetailScreen").style.display = "none";
    document.getElementById("challengeFamilyScreen").style.display = "none";
    openMatchingGameWorkspaceMode(fidelObj);
}

// -----------------------------------------------------------------------------
// Family detail screen — giant letter display, launch point for the
// matching game (with streak rules explained) and the flashcard self-study
// mode. Shown after clicking a family card in the picker.
// -----------------------------------------------------------------------------

const vowelSoundLabels = ["-ä", "-u", "-ee", "-a", "-ay", "-ih", "-o"]; // matches standardVowelSubscripts in app.js

function openChallengeFamilyDetail(fidelObj, levelNumber) {
    activeChallengeFamilyObj = fidelObj;
    activeChallengeFamilyLevel = levelNumber;

    document.getElementById("challengeFamilyScreen").style.display = "none";
    document.getElementById("challengeFamilyDetailScreen").style.display = "block";
    document.getElementById("challengeFamilyDetailTitle").innerText = `Family: "${fidelObj.base}"`;

    renderChallengeFamilyDetailGiantRow(fidelObj);

    // Captains already know Amharic and aren't required to play through
    // the gates themselves — they're here to lead their team, not compete.
    // Show the letters for reference, but skip the streak/writing
    // requirements entirely rather than making them complete busywork
    // that proves nothing about a skill they already have.
    if (currentProfile?.is_captain) {
        document.getElementById("challengeDetailPlayBtn").style.display = "none";
        document.getElementById("challengeDetailFlashcardBtn").style.display = "none";
        document.getElementById("challengeDetailWritingBtn").style.display = "none";
        const box = document.getElementById("challengeWritingStatusBox");
        box.style.display = "block";
        box.innerHTML = `<div class="challenge-writing-status approved">👑 As team captain, you're exempt from this challenge — focus on reviewing your team's submissions instead!</div>`;
        return;
    }

    document.getElementById("challengeDetailPlayBtn").style.display = "flex";
    document.getElementById("challengeDetailFlashcardBtn").style.display = "flex";
    document.getElementById("challengeDetailWritingBtn").style.display = "block";
    renderWritingStatusForFamily(fidelObj.base);

    document.getElementById("challengeDetailPlayBtn").onclick = () => launchChallengeStreakGame(fidelObj, levelNumber);
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
// Expose functions used via inline onclick="" handlers in index.html
// -----------------------------------------------------------------------------

window.enterModeSelect = enterModeSelect;
window.chooseModePractice = chooseModePractice;
window.chooseModeChallenge = chooseModeChallenge;
window.exitChallengeBackToDashboard = exitChallengeBackToDashboard;
window.openChallengeFamilyPicker = openChallengeFamilyPicker;
window.exitChallengeFamilyPicker = exitChallengeFamilyPicker;
window.returnToChallengeFamilyPicker = returnToChallengeFamilyPicker;
window.launchChallengeStreakGame = launchChallengeStreakGame;
window.exitChallengeFamilyDetail = exitChallengeFamilyDetail;
window.enterCaptainDashboard = enterCaptainDashboard;
window.exitCaptainDashboard = exitCaptainDashboard;

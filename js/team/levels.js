// =============================================================================
// JS/TEAM/LEVELS.JS
// Embedded level map shown inside the team hub. Shows current level's
// families with per-family status, locked future levels, and a practice
// sheet modal that opens when a family is tapped.
//
// Also handles: flashcard-first practice flow, post-streak writing prompt.
//
// Loads after app.js, utils/compress.js, team/progress.js.
// Relies on globals: _supabase, currentUser, currentProfile, alphabetData,
//   STREAK_THRESHOLD, activeChallengeContext, showNotificationToast,
//   showGobezToast, executeVictoryConfettiCelebration, maybeShowStreakExplainer,
//   openMatchingGameWorkspaceMode, openFlashcardStudy, buildFlashcardDeckForFamily,
//   openWritingSubmitScreen, renderWritingStatusForFamily, flagNeedHelp,
//   renderLevelCompletionBanner, renderEmbeddedLevelMap
// =============================================================================

let embeddedActiveFamily = null;     // fidelObj currently open in practice sheet
let embeddedActiveLevelNumber = null;

// ---------------------------------------------------------------------------
// Main render — called from hub.js
// ---------------------------------------------------------------------------

async function renderEmbeddedLevelMap(mountId) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    mount.innerHTML = `<p style="color:#94a3b8; font-size:12px;">Loading...</p>`;

    if (!currentProfile?.team_id) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:12px;">Join a team to see the level map.</p>`;
        return;
    }

    const { data: team } = await _supabase
        .from('teams')
        .select('current_level')
        .eq('id', currentProfile.team_id)
        .maybeSingle();

    const currentLevel = team?.current_level || 1;

    const { data: allLevels } = await _supabase
        .from('challenge_levels')
        .select('level_number, title, letter_families')
        .order('level_number', { ascending: true });

    const { data: progressRows } = await _supabase
        .from('student_family_progress')
        .select('base_letter, best_streak, streak_passed, writing_passed')
        .eq('student_id', currentUser.id)
        .eq('level_number', currentLevel);

    const progressByLetter = {};
    (progressRows || []).forEach(row => { progressByLetter[row.base_letter] = row; });

    mount.innerHTML = "";
const hint = document.createElement('p');
hint.style.cssText = 'font-size:13px; color:#94a3b8; margin-bottom:14px; font-family:Inter,sans-serif;';
hint.innerText = 'Tap any family card to practice. Clear all 3 to advance your team.';
mount.appendChild(hint);
    // Current level — shown expanded with family cards
    const currentLevelData = (allLevels || []).find(l => l.level_number === currentLevel);
    if (currentLevelData) {
        renderCurrentLevelSection(mount, currentLevelData, progressByLetter, currentLevel);
    }

    // Future levels — shown locked below
    const futureLevels = (allLevels || []).filter(l => l.level_number > currentLevel);
    if (futureLevels.length > 0) {
        const futureSection = document.createElement('div');
        futureSection.style.cssText = "margin-top:20px;";
        futureSection.innerHTML = `
            <p style="font-size:11px; font-weight:700; color:#94a3b8; text-transform:uppercase;
                      letter-spacing:0.4px; margin-bottom:10px;">Coming Up</p>
        `;

        futureLevels.slice(0, 4).forEach(level => {
            const lockedCard = document.createElement('div');
            lockedCard.style.cssText = `
                display:flex; justify-content:space-between; align-items:center;
                padding:10px 14px; background:#f8fafc; border:1px dashed #cbd5e1;
                border-radius:12px; margin-bottom:8px; opacity:0.7;
            `;
            lockedCard.innerHTML = `
                <span style="font-size:13px; color:#94a3b8; font-weight:600;">
                    🔒 Level ${level.level_number}: ${level.title || `Level ${level.level_number}`}
                </span>
                <span style="font-family:'Abyssinica SIL',serif; font-size:16px; color:#cbd5e1; letter-spacing:2px;">
                    ${(level.letter_families || []).join(' ')}
                </span>
            `;
            futureSection.appendChild(lockedCard);
        });

        mount.appendChild(futureSection);
    }
}

function renderCurrentLevelSection(mount, level, progressByLetter, currentLevel) {
    const section = document.createElement('div');

    // Level header
    const clearedCount = (level.letter_families || []).filter(l => {
        const p = progressByLetter[l];
        return p?.streak_passed && p?.writing_passed;
    }).length;

    const header = document.createElement('div');
    header.style.cssText = `
        display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;
    `;
    header.innerHTML = `
        <div>
            <span style="font-size:20px; font-weight:800; color:#166534;">
                Level ${level.level_number}
            </span>
            <span style="font-size:13px; color:#64748b; margin-left:8px;">
                ${level.title || `Level ${level.level_number}`}
            </span>
        </div>
        <span style="font-size:12px; color:#64748b; font-weight:600; background:#f1f5f9;
                     padding:4px 10px; border-radius:20px;">
            ${clearedCount} / ${(level.letter_families || []).length} cleared
        </span>
    `;
    section.appendChild(header);

    // Family cards
    const grid = document.createElement('div');
    grid.style.cssText = "display:flex; flex-direction:column; gap:10px;";

    const posColors = ['#22c55e', '#eab308', '#ef4444'];

    (level.letter_families || []).forEach((baseLetter, idx) => {
        const progress = progressByLetter[baseLetter] || {
            best_streak: 0, streak_passed: false, writing_passed: false
        };
        const fidelObj = alphabetData.find(item => item.base === baseLetter);
        const isCleared = progress.streak_passed && progress.writing_passed;
        const streakPercent = Math.min(100, Math.round((progress.best_streak / STREAK_THRESHOLD) * 100));
        const posColor = posColors[idx] || '#166534';

        const card = document.createElement('div');
        card.style.cssText = `
            background:white; border:1px solid #e2e8f0; border-left:5px solid ${posColor};
            border-radius:12px; padding:14px 16px; cursor:pointer; transition:all 0.2s;
            ${isCleared ? 'background:#f0fdf4; border-color:#bbf7d0; border-left-color:#10b981;' : ''}
        `;
        card.onmouseenter = () => {
            if (!isCleared) card.style.transform = "translateY(-1px)";
        };
        card.onmouseleave = () => { card.style.transform = ""; };

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:${!progress.streak_passed && !isCleared ? '10px' : '0'};">
                <div style="display:flex; align-items:center; gap:12px;">
                    <span style="font-size:36px; font-family:'Abyssinica SIL',serif;
                                 color:${isCleared ? '#166534' : '#1e293b'}; line-height:1;">
                        ${baseLetter}
                    </span>
                    <div>
                        <div style="font-size:13px; font-weight:700;
                                    color:${isCleared ? '#166534' : '#475569'}; margin-bottom:5px;">
                            ${isCleared ? '✓ Cleared' : `Family ${idx + 1} of ${(level.letter_families || []).length}`}
                        </div>
                        <div style="display:flex; gap:6px; flex-wrap:wrap;">
                            <span style="font-size:10px; font-weight:700; padding:2px 8px; border-radius:6px;
                                background:${progress.streak_passed ? '#d1fae5' : '#f1f5f9'};
                                color:${progress.streak_passed ? '#047857' : '#64748b'};">
                                ${progress.streak_passed ? '✓ Streak' : `🔥 ${progress.best_streak || 0}/20`}
                            </span>
                            <span style="font-size:10px; font-weight:700; padding:2px 8px; border-radius:6px;
                                background:${progress.writing_passed ? '#d1fae5' : '#fff7ed'};
                                color:${progress.writing_passed ? '#047857' : '#92400e'};">
                                ${progress.writing_passed ? '✓ Writing' : '✏️ Writing'}
                            </span>
                        </div>
                    </div>
                </div>
                ${!isCleared && !currentProfile?.is_captain ? `
                    <button onclick="event.stopPropagation(); flagNeedHelp('${baseLetter}', ${currentLevel})"
                            style="background:white; border:1px solid #e2e8f0; border-radius:8px;
                                   padding:5px 10px; font-size:11px; font-weight:700; color:#64748b;
                                   cursor:pointer; flex-shrink:0;" title="Ask captain for help">
                        🙋 Help
                    </button>
                ` : ''}
            </div>
            ${!progress.streak_passed && !isCleared ? `
                <div style="height:5px; background:#e2e8f0; border-radius:4px; overflow:hidden;">
                    <div style="height:100%; width:${streakPercent}%; background:#ca8a04;
                                border-radius:4px; transition:width 0.4s;"></div>
                </div>
            ` : ''}
        `;

        card.onclick = () => {
            if (fidelObj) openEmbeddedFamilyPractice(fidelObj, currentLevel, progress);
        };

        grid.appendChild(card);
    });

    section.appendChild(grid);
    mount.appendChild(section);
}

// ---------------------------------------------------------------------------
// Practice sheet — opens as overlay when a family card is tapped
// Flashcard-first: flashcards open automatically, game is one tap away
// ---------------------------------------------------------------------------

function openEmbeddedFamilyPractice(fidelObj, levelNumber, progress) {
    embeddedActiveFamily = fidelObj;
    embeddedActiveLevelNumber = levelNumber;

    const sheet = document.getElementById('familyPracticeSheet');
    if (!sheet) return;

    document.getElementById('practiceSheetTitle').innerText = `"${fidelObj.base}" Family`;

    // Render the 7 giant letters
    const lettersMount = document.getElementById('practiceSheetLetters');
    lettersMount.innerHTML = "";
    const subs = (fidelObj.prefix === "h" || fidelObj.prefix === "ḥ")
        ? ["ha", "hu", "hee", "ha", "hay", "hih", "ho"]
        : ["-ä", "-u", "-ee", "-a", "-ay", "-ih", "-o"].map(s => `${fidelObj.prefix}${s}`);

    fidelObj.family.forEach((char, idx) => {
        const card = document.createElement('div');
        card.className = "giant-char-card";
        card.innerHTML = `<div class="letter">${char}</div><div class="sub">${subs[idx]}</div>`;
        lettersMount.appendChild(card);
    });

    // Show writing status
    const statusBox = document.getElementById('practiceSheetWritingStatus');
    if (statusBox) renderWritingStatusForFamily(fidelObj.base);

    // Streak status
    const streakDone = progress?.streak_passed;
    const writingDone = progress?.writing_passed;
    const writeBtn = document.getElementById('practiceSheetWriteBtn');
    if (writeBtn) {
        writeBtn.style.display = streakDone ? "block" : "none";
    }

    // Wire buttons
    document.getElementById('practiceSheetPlayBtn').onclick = () => {
        launchEmbeddedStreakGame(fidelObj, levelNumber);
    };

    document.getElementById('practiceSheetWriteBtn').onclick = () => {
        sheet.style.display = "none";
        openWritingSubmitScreen(fidelObj.base, () => {
            sheet.style.display = "flex";
            renderWritingStatusForFamily(fidelObj.base);
        });
    };

    document.getElementById('practiceSheetFlashcardBtn').onclick = () => {
        sheet.style.display = "none";
        openFlashcardStudy(
            buildFlashcardDeckForFamily(fidelObj),
            `"${fidelObj.base}" Family`,
            () => { sheet.style.display = "flex"; }
        );
    };

    sheet.style.display = "flex";
}

function closeEmbeddedFamilyPractice() {
    document.getElementById('familyPracticeSheet').style.display = "none";
    embeddedActiveFamily = null;
    embeddedActiveLevelNumber = null;
    // Refresh level map to show updated progress
    renderEmbeddedLevelMap('embeddedLevelMapMount');
    renderLevelCompletionBanner('levelCompletionMount');
}

// ---------------------------------------------------------------------------
// Streak game launch from embedded level map
// ---------------------------------------------------------------------------

function launchEmbeddedStreakGame(fidelObj, levelNumber) {
    document.getElementById('familyPracticeSheet').style.display = "none";

    let bestStreakThisSession = 0;
    let matchesSinceLastSave = 0;

    activeChallengeContext = {
        baseLetter: fidelObj.base,
        levelNumber: levelNumber,
        onStreakUpdate: (currentStreak) => {
            if (currentStreak > bestStreakThisSession) {
                bestStreakThisSession = currentStreak;
            }
            matchesSinceLastSave++;
            if (matchesSinceLastSave >= 5) {
                matchesSinceLastSave = 0;
                recordEmbeddedStreakProgress(fidelObj.base, levelNumber, bestStreakThisSession, false);
            }
        },
        onStreakPassed: async (finalStreak) => {
            await recordEmbeddedStreakProgress(fidelObj.base, levelNumber, finalStreak, true);
            showGobezToast(`🔥 Streak of 20! "${fidelObj.base}" game passed!`);
            executeVictoryConfettiCelebration();

            // After brief celebration, close game and prompt writing submission
            setTimeout(() => {
                document.getElementById('gameWorkspace').style.display = "none";
                activeChallengeContext = null;
                showPostStreakWritingPrompt(fidelObj, levelNumber);
            }, 1800);
        }
    };

    maybeShowStreakExplainer(() => {
        openMatchingGameWorkspaceMode(fidelObj);
    });
}

async function recordEmbeddedStreakProgress(baseLetter, levelNumber, bestStreak, passed) {
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

// ---------------------------------------------------------------------------
// Post-streak writing prompt — appears immediately after hitting 20 streak
// Captures the momentum of success and channels it into submission
// ---------------------------------------------------------------------------

function showPostStreakWritingPrompt(fidelObj, levelNumber) {
    // Remove any existing prompt
    document.getElementById('postStreakPrompt')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'postStreakPrompt';
    overlay.style.cssText = `
        position:fixed; inset:0; background:rgba(0,0,0,0.65);
        display:flex; align-items:center; justify-content:center;
        z-index:99997; padding:24px;
    `;
    overlay.innerHTML = `
        <div style="background:white; border-radius:20px; padding:28px 24px;
                    max-width:380px; width:100%; text-align:center;
                    box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <div style="font-size:44px; margin-bottom:10px;">✍️</div>
            <h2 style="font-size:20px; font-weight:800; color:#166534; margin-bottom:8px;">
                Streak passed! Now show your writing.
            </h2>
            <p style="font-size:14px; color:#475569; line-height:1.6; margin-bottom:20px;">
                You proved you know
                <strong style="font-family:'Abyssinica SIL',serif; font-size:20px; color:#166534;">
                    ${fidelObj.base}
                </strong>
                in the matching game.<br>
                Now submit a handwriting sample for your captain to approve.
            </p>
            <button onclick="submitFromPostStreak('${fidelObj.base}', ${levelNumber})"
                    class="btn-primary" style="margin-bottom:10px;">
                ✍️ Submit My Writing Now
            </button>
            <button onclick="dismissPostStreakPrompt()"
                    class="btn-secondary"
                    style="display:block; width:100%; text-align:center; margin-top:4px;">
                I'll do it later
            </button>
        </div>
    `;
    document.body.appendChild(overlay);
}

function dismissPostStreakPrompt() {
    document.getElementById('postStreakPrompt')?.remove();
    // Reopen the practice sheet if a family is still active
    if (embeddedActiveFamily) {
        document.getElementById('familyPracticeSheet').style.display = "flex";
        renderWritingStatusForFamily(embeddedActiveFamily.base);
    }
}

function submitFromPostStreak(baseLetter, levelNumber) {
    document.getElementById('postStreakPrompt')?.remove();
    const sheet = document.getElementById('familyPracticeSheet');

    openWritingSubmitScreen(baseLetter, () => {
        if (sheet) sheet.style.display = "flex";
        renderWritingStatusForFamily(baseLetter);
        renderEmbeddedLevelMap('embeddedLevelMapMount');
        renderLevelCompletionBanner('levelCompletionMount');
    });
    if (sheet) sheet.style.display = "none";
}

// ---------------------------------------------------------------------------
// Expose
// ---------------------------------------------------------------------------

window.renderEmbeddedLevelMap = renderEmbeddedLevelMap;
window.openEmbeddedFamilyPractice = openEmbeddedFamilyPractice;
window.closeEmbeddedFamilyPractice = closeEmbeddedFamilyPractice;
window.launchEmbeddedStreakGame = launchEmbeddedStreakGame;
window.showPostStreakWritingPrompt = showPostStreakWritingPrompt;
window.dismissPostStreakPrompt = dismissPostStreakPrompt;
window.submitFromPostStreak = submitFromPostStreak;

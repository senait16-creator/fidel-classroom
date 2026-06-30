// =============================================================================
// GAME.JS
// Matching game engine and flashcard self-study system.
// Loads AFTER app.js. Relies on globals defined there:
//   _supabase, currentUser, currentProfile, alphabetData,
//   vowelFrameworkLabels, standardVowelSubscripts, STREAK_THRESHOLD,
//   activeChallengeContext, currentStreakScore, activeGamePairs,
//   selectedGameTokenId, gameModeScope,
//   showNotificationToast, showGobezToast, executeVictoryConfettiCelebration
// =============================================================================

// ---------------------------------------------------------------------------
// Matching game — entry point
// Called from Practice mode (scope = fidelObj or "all") and Challenge mode
// (scope = fidelObj, activeChallengeContext already set by challenge.js).
// ---------------------------------------------------------------------------

function openMatchingGameWorkspaceMode(scope) {
    gameModeScope = scope;
    document.getElementById("viewFidelGrid").style.display = "none";
    document.getElementById("isolatedFamilyClassroom").style.display = "none";
    document.getElementById("gameWorkspace").style.display = "block";

    const exitBtn = document.getElementById("gameExitActionBtn");

    if (activeChallengeContext) {
        // Challenge mode — exit returns to the family picker
        document.getElementById("gameWorkspaceTitle").innerText = `Challenge: "${scope.base}"`;
        exitBtn.onclick = () => {
            document.getElementById("gameWorkspace").style.display = "none";
            activeChallengeContext = null;
            if (typeof returnToChallengeFamilyPicker === "function") {
                returnToChallengeFamilyPicker();
            }
        };
    } else if (scope === "all") {
        // Full-alphabet practice from main dashboard
        document.getElementById("studentDashboard").style.display = "none";
        document.getElementById("gameWorkspaceTitle").innerText = "Game Arena: All Letters";
        exitBtn.onclick = () => {
            document.getElementById("gameWorkspace").style.display = "none";
            document.getElementById("studentDashboard").style.display = "block";
            document.getElementById("viewFidelGrid").style.display = "grid";
        };
    } else {
        // Single-row practice from classroom view
        document.getElementById("gameWorkspaceTitle").innerText = `Game Arena: Row "${scope.base}"`;
        exitBtn.onclick = () => {
            document.getElementById("gameWorkspace").style.display = "none";
            document.getElementById("isolatedFamilyClassroom").style.display = "block";
        };
    }

    currentStreakScore = 0;
    document.getElementById("gameStreakValue").innerText = currentStreakScore;
    generateNewGameRoundData();
}

// ---------------------------------------------------------------------------
// Round generation — picks 4 random pairs from the current scope
// ---------------------------------------------------------------------------

function generateNewGameRoundData() {
    activeGamePairs = [];
    selectedGameTokenId = null;

    let structuralSelectionList = [];

    if (gameModeScope === "all") {
        const pool = [...alphabetData].sort(() => Math.random() - 0.5).slice(0, 4);
        pool.forEach(item => {
            const rIdx = Math.floor(Math.random() * 7);
            const sub = standardVowelSubscripts[rIdx];
            const phonetic = (item.prefix === "h" || item.prefix === "ḥ")
                ? vowelFrameworkLabels[rIdx]
                : `${item.prefix}${sub}`;
            structuralSelectionList.push({
                char: item.family[rIdx],
                matchKey: item.family[rIdx],
                displayTxt: item.family[rIdx],
                kind: "fidel"
            });
            structuralSelectionList.push({
                char: item.family[rIdx],
                matchKey: item.family[rIdx],
                displayTxt: phonetic,
                kind: "phonetic"
            });
        });
    } else {
        const indices = [0, 1, 2, 3, 4, 5, 6]
            .sort(() => Math.random() - 0.5)
            .slice(0, 4);
        indices.forEach(idx => {
            const sub = standardVowelSubscripts[idx];
            const phonetic = (gameModeScope.prefix === "h" || gameModeScope.prefix === "ḥ")
                ? vowelFrameworkLabels[idx]
                : `${gameModeScope.prefix}${sub}`;
            structuralSelectionList.push({
                char: gameModeScope.family[idx],
                matchKey: gameModeScope.family[idx],
                displayTxt: gameModeScope.family[idx],
                kind: "fidel"
            });
            structuralSelectionList.push({
                char: gameModeScope.family[idx],
                matchKey: gameModeScope.family[idx],
                displayTxt: phonetic,
                kind: "phonetic"
            });
        });
    }

    activeGamePairs = structuralSelectionList.sort(() => Math.random() - 0.5);
    renderErgonomicBlockGameElements();
}

// ---------------------------------------------------------------------------
// Render token grid
// ---------------------------------------------------------------------------

function renderErgonomicBlockGameElements() {
    const mount = document.getElementById("ergonomicBlockGameMount");
    mount.innerHTML = "";

    activeGamePairs.forEach((tokenData, index) => {
        const tokenElement = document.createElement("div");
        tokenElement.className = "game-interactive-token";
        tokenElement.innerText = tokenData.displayTxt;
        tokenElement.setAttribute("data-index", index);
        tokenElement.onclick = () => selectBlockTokenTrackElement(tokenElement, index);
        mount.appendChild(tokenElement);
    });
}

// ---------------------------------------------------------------------------
// Token selection + match logic
// Gold flash animation on correct match, streak milestones via Gobez toasts.
// ---------------------------------------------------------------------------

function selectBlockTokenTrackElement(element, index) {
    if (
        element.classList.contains("resolved-pair") ||
        element.classList.contains("match-flash")
    ) return;

    const targetToken = activeGamePairs[index];

    if (selectedGameTokenId === null) {
        element.classList.add("active-selected");
        selectedGameTokenId = index;
        return;
    }

    if (selectedGameTokenId === index) {
        element.classList.remove("active-selected");
        selectedGameTokenId = null;
        return;
    }

    const priorElement = document.querySelector(`[data-index="${selectedGameTokenId}"]`);
    const priorToken = activeGamePairs[selectedGameTokenId];

    if (
        targetToken.matchKey === priorToken.matchKey &&
        targetToken.kind !== priorToken.kind
    ) {
        // Correct match — gold flash then resolve
        element.classList.remove("active-selected");
        priorElement.classList.remove("active-selected");
        element.classList.add("match-flash");
        priorElement.classList.add("match-flash");

        setTimeout(() => {
            element.className = "game-interactive-token resolved-pair";
            priorElement.className = "game-interactive-token resolved-pair";
            checkBlockGameCompletionState();
        }, 350);

        currentStreakScore++;
        document.getElementById("gameStreakValue").innerText = currentStreakScore;
        selectedGameTokenId = null;

        // Milestone feedback
        if (currentStreakScore === 5) {
            showNotificationToast("🔥 5 in a row!");
        } else if (currentStreakScore === 10) {
            showGobezToast("10 streak — halfway there!");
        } else if (currentStreakScore === 15) {
            showGobezToast("15 streak — almost there!");
        } else {
            showNotificationToast("Match!");
        }

        // Challenge mode streak tracking
        if (activeChallengeContext) {
            activeChallengeContext.onStreakUpdate?.(currentStreakScore);
            if (currentStreakScore >= STREAK_THRESHOLD) {
                activeChallengeContext.onStreakPassed?.(currentStreakScore);
            }
        }

    } else {
        // Wrong match — reset streak
        currentStreakScore = 0;
        document.getElementById("gameStreakValue").innerText = currentStreakScore;
        showNotificationToast("Not quite! Streak reset.");
        element.classList.remove("active-selected");
        priorElement.classList.remove("active-selected");
        selectedGameTokenId = null;
    }
}

// ---------------------------------------------------------------------------
// Board completion check — starts new round after a short delay
// ---------------------------------------------------------------------------

function checkBlockGameCompletionState() {
    const unresolved = document.querySelectorAll(
        "#ergonomicBlockGameMount .game-interactive-token:not(.resolved-pair)"
    );
    if (unresolved.length === 0) {
        executeVictoryConfettiCelebration();
        showNotificationToast("You cleared the board! Starting next round...");
        setTimeout(generateNewGameRoundData, 1000);
    }
}

// =============================================================================
// FLASHCARD SELF-STUDY ENGINE
// Used by: Practice mode single-row screen, Challenge family detail screen,
// and the full-alphabet "Study All Letters" button. Pure self-study —
// no streak tracking, no database writes. Top-level screen (#flashcardScreen)
// so it's never trapped inside a hidden parent.
// =============================================================================

let flashcardDeck = [];
let flashcardIndex = 0;
let flashcardCloseCallback = null;

// Touch/swipe state for mobile swipe navigation
let flashcardTouchStartX = 0;
let flashcardTouchStartY = 0;

// ---------------------------------------------------------------------------
// Deck builders
// ---------------------------------------------------------------------------

function buildFlashcardDeckForFamily(fidelObj) {
    const subs = (fidelObj.prefix === "h" || fidelObj.prefix === "ḥ")
        ? vowelFrameworkLabels
        : standardVowelSubscripts.map(sub => `${fidelObj.prefix}${sub}`);

    return fidelObj.family.map((char, idx) => ({
        char,
        sound: subs[idx]
    }));
}

function buildFlashcardDeckForFullAlphabet() {
    let deck = [];
    alphabetData.forEach(fidelObj => {
        deck = deck.concat(buildFlashcardDeckForFamily(fidelObj));
    });
    return deck;
}

// ---------------------------------------------------------------------------
// Open / close
// ---------------------------------------------------------------------------

function openFlashcardStudy(deck, title, onClose) {
    flashcardDeck = deck;
    flashcardIndex = 0;
    flashcardCloseCallback = onClose || null;

    document.getElementById("flashcardScreenTitle").innerText = `🗂️ ${title}`;
    document.getElementById("flashcardScreen").style.display = "block";
    renderFlashcard();

    // Flip on tap
    const card = document.getElementById("flashcardEl");
    card.onclick = () => card.classList.toggle("flipped");

    // Button navigation
    document.getElementById("flashcardNextBtn").onclick = () => {
        flashcardIndex = (flashcardIndex + 1) % flashcardDeck.length;
        renderFlashcard();
    };
    document.getElementById("flashcardPrevBtn").onclick = () => {
        flashcardIndex = (flashcardIndex - 1 + flashcardDeck.length) % flashcardDeck.length;
        renderFlashcard();
    };

    // Close button
    document.getElementById("flashcardCloseBtn").onclick = closeFlashcardStudy;

    // Touch swipe: left = next, right = previous
    // Registered on the screen container so the whole area is swipeable
    const screen = document.getElementById("flashcardScreen");
    screen.addEventListener("touchstart", handleFlashcardTouchStart, { passive: true });
    screen.addEventListener("touchend", handleFlashcardTouchEnd, { passive: true });
}

function closeFlashcardStudy() {
    // Clean up swipe listeners before hiding
    const screen = document.getElementById("flashcardScreen");
    screen.removeEventListener("touchstart", handleFlashcardTouchStart);
    screen.removeEventListener("touchend", handleFlashcardTouchEnd);

    document.getElementById("flashcardScreen").style.display = "none";
    if (flashcardCloseCallback) flashcardCloseCallback();
}

// ---------------------------------------------------------------------------
// Render current card
// ---------------------------------------------------------------------------

function renderFlashcard() {
    const card = document.getElementById("flashcardEl");
    card.classList.remove("flipped");

    const entry = flashcardDeck[flashcardIndex];
    document.getElementById("flashcardFront").innerText = entry.char;
    document.getElementById("flashcardBack").innerText = entry.sound;

    const label = document.getElementById("flashcardProgressLabel");
    if (label) label.innerText = `Card ${flashcardIndex + 1} of ${flashcardDeck.length}`;
}

// ---------------------------------------------------------------------------
// Swipe handlers
// Swipe left → next card, swipe right → previous card.
// Ignore vertical swipes (scrolling) — only fire on clearly horizontal ones.
// ---------------------------------------------------------------------------

function handleFlashcardTouchStart(e) {
    flashcardTouchStartX = e.changedTouches[0].screenX;
    flashcardTouchStartY = e.changedTouches[0].screenY;
}

function handleFlashcardTouchEnd(e) {
    const dx = e.changedTouches[0].screenX - flashcardTouchStartX;
    const dy = e.changedTouches[0].screenY - flashcardTouchStartY;

    // Only treat as a horizontal swipe if horizontal movement is dominant
    // and exceeds the minimum threshold (40px) — avoids accidental triggers
    if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;

    if (dx < 0) {
        // Swipe left → next
        flashcardIndex = (flashcardIndex + 1) % flashcardDeck.length;
    } else {
        // Swipe right → previous
        flashcardIndex = (flashcardIndex - 1 + flashcardDeck.length) % flashcardDeck.length;
    }
    renderFlashcard();
}

// ---------------------------------------------------------------------------
// Expose to inline handlers and other JS files
// ---------------------------------------------------------------------------

window.openMatchingGameWorkspaceMode = openMatchingGameWorkspaceMode;
window.openFlashcardStudy = openFlashcardStudy;
window.closeFlashcardStudy = closeFlashcardStudy;
window.buildFlashcardDeckForFamily = buildFlashcardDeckForFamily;
window.buildFlashcardDeckForFullAlphabet = buildFlashcardDeckForFullAlphabet;

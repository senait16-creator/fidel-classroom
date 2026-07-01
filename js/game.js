// =============================================================================
// GAME.JS
// Matching game engine and flashcard self-study system.
// Updates: streak progress bar, flashcard swipe support.
//
// Loads AFTER app.js. Relies on globals:
//   alphabetData, vowelFrameworkLabels, standardVowelSubscripts, STREAK_THRESHOLD,
//   activeChallengeContext, currentStreakScore, activeGamePairs,
//   selectedGameTokenId, gameModeScope,
//   showNotificationToast, showGobezToast, executeVictoryConfettiCelebration
// =============================================================================

function openMatchingGameWorkspaceMode(scope) {
    gameModeScope = scope;
    document.getElementById("viewFidelGrid").style.display = "none";
    document.getElementById("isolatedFamilyClassroom").style.display = "none";
    document.getElementById("gameWorkspace").style.display = "block";

    const exitBtn = document.getElementById("gameExitActionBtn");

    if (activeChallengeContext) {
        document.getElementById("gameWorkspaceTitle").innerText = `Challenge: "${scope.base}"`;
        exitBtn.onclick = () => {
            document.getElementById("gameWorkspace").style.display = "none";
            activeChallengeContext = null;
            if (typeof returnToChallengeFamilyPicker === "function") returnToChallengeFamilyPicker();
        };
    } else if (scope === "all") {
        document.getElementById("studentDashboard").style.display = "none";
        document.getElementById("gameWorkspaceTitle").innerText = "Game Arena: All Letters";
        exitBtn.onclick = () => {
            document.getElementById("gameWorkspace").style.display = "none";
            document.getElementById("studentDashboard").style.display = "block";
            document.getElementById("viewFidelGrid").style.display = "grid";
        };
    } else {
        document.getElementById("gameWorkspaceTitle").innerText = `Game Arena: Row "${scope.base}"`;
        exitBtn.onclick = () => {
            document.getElementById("gameWorkspace").style.display = "none";
            document.getElementById("isolatedFamilyClassroom").style.display = "block";
        };
    }

    currentStreakScore = 0;
    document.getElementById("gameStreakValue").innerText = currentStreakScore;
    updateStreakProgressBar(0);
    generateNewGameRoundData();
}

function updateStreakProgressBar(streak) {
    const bar = document.getElementById("gameStreakProgressBar");
    if (!bar) return;
    const percent = Math.min(100, Math.round((streak / STREAK_THRESHOLD) * 100));
    bar.style.width = `${percent}%`;
    if (streak >= STREAK_THRESHOLD)    bar.style.background = "#166534";
    else if (streak >= 15)             bar.style.background = "#22c55e";
    else if (streak >= 10)             bar.style.background = "#ca8a04";
    else                               bar.style.background = "#cbd5e1";
}

function generateNewGameRoundData() {
    activeGamePairs = [];
    selectedGameTokenId = null;
    let list = [];

    if (gameModeScope === "all") {
        const pool = [...alphabetData].sort(() => Math.random() - 0.5).slice(0, 4);
        pool.forEach(item => {
            const rIdx = Math.floor(Math.random() * 7);
            const sub = standardVowelSubscripts[rIdx];
            const phonetic = (item.prefix === "h" || item.prefix === "ḥ") ? vowelFrameworkLabels[rIdx] : `${item.prefix}${sub}`;
            list.push({ char: item.family[rIdx], matchKey: item.family[rIdx], displayTxt: item.family[rIdx], kind: "fidel" });
            list.push({ char: item.family[rIdx], matchKey: item.family[rIdx], displayTxt: phonetic, kind: "phonetic" });
        });
    } else {
        const indices = [0,1,2,3,4,5,6].sort(() => Math.random() - 0.5).slice(0, 4);
        indices.forEach(idx => {
            const sub = standardVowelSubscripts[idx];
            const phonetic = (gameModeScope.prefix === "h" || gameModeScope.prefix === "ḥ") ? vowelFrameworkLabels[idx] : `${gameModeScope.prefix}${sub}`;
            list.push({ char: gameModeScope.family[idx], matchKey: gameModeScope.family[idx], displayTxt: gameModeScope.family[idx], kind: "fidel" });
            list.push({ char: gameModeScope.family[idx], matchKey: gameModeScope.family[idx], displayTxt: phonetic, kind: "phonetic" });
        });
    }

    activeGamePairs = list.sort(() => Math.random() - 0.5);
    renderErgonomicBlockGameElements();
}

function renderErgonomicBlockGameElements() {
    const mount = document.getElementById("ergonomicBlockGameMount");
    mount.innerHTML = "";
    activeGamePairs.forEach((tokenData, index) => {
        const el = document.createElement("div");
        el.className = "game-interactive-token";
        el.innerText = tokenData.displayTxt;
        el.setAttribute("data-index", index);
        el.onclick = () => selectBlockTokenTrackElement(el, index);
        mount.appendChild(el);
    });
}

function selectBlockTokenTrackElement(element, index) {
    if (element.classList.contains("resolved-pair") || element.classList.contains("match-flash")) return;
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

    const priorEl = document.querySelector(`[data-index="${selectedGameTokenId}"]`);
    const priorToken = activeGamePairs[selectedGameTokenId];

    if (targetToken.matchKey === priorToken.matchKey && targetToken.kind !== priorToken.kind) {
        element.classList.remove("active-selected");
        priorEl.classList.remove("active-selected");
        element.classList.add("match-flash");
        priorEl.classList.add("match-flash");

        setTimeout(() => {
            element.className = "game-interactive-token resolved-pair";
            priorEl.className = "game-interactive-token resolved-pair";
            checkBlockGameCompletionState();
        }, 350);

        currentStreakScore++;
        document.getElementById("gameStreakValue").innerText = currentStreakScore;
        updateStreakProgressBar(currentStreakScore);
        // Streak bump animation
        const streakEl = document.getElementById("gameStreakValue");
        streakEl.classList.remove("streak-bump");
        void streakEl.offsetWidth;
        streakEl.classList.add("streak-bump");
        setTimeout(() => streakEl.classList.remove("streak-bump"), 300);
        selectedGameTokenId = null;

        if (currentStreakScore === 5)        showNotificationToast("🔥 5 in a row!");
        else if (currentStreakScore === 10)  showGobezToast("10 streak — halfway there!");
        else if (currentStreakScore === 15)  showGobezToast("15 streak — almost there!");
        else                                 showNotificationToast("Match!");

        if (activeChallengeContext) {
            activeChallengeContext.onStreakUpdate?.(currentStreakScore);
            if (currentStreakScore >= STREAK_THRESHOLD) {
                activeChallengeContext.onStreakPassed?.(currentStreakScore);
            }
        }
    } else {
        currentStreakScore = 0;
        document.getElementById("gameStreakValue").innerText = currentStreakScore;
        updateStreakProgressBar(0);
        showNotificationToast("Not quite! Streak reset.");
        element.classList.remove("active-selected");
        priorEl.classList.remove("active-selected");
        selectedGameTokenId = null;
    }
}

function checkBlockGameCompletionState() {
    const unresolved = document.querySelectorAll("#ergonomicBlockGameMount .game-interactive-token:not(.resolved-pair)");
    if (unresolved.length === 0) {
        executeVictoryConfettiCelebration();
        showNotificationToast("You cleared the board! Starting next round...");
        setTimeout(generateNewGameRoundData, 1000);
    }
}

// =============================================================================
// FLASHCARD ENGINE
// =============================================================================

let flashcardDeck = [];
let flashcardIndex = 0;
let flashcardCloseCallback = null;
let flashcardTouchStartX = 0;
let flashcardTouchStartY = 0;

function buildFlashcardDeckForFamily(fidelObj) {
    const subs = (fidelObj.prefix === "h" || fidelObj.prefix === "ḥ")
        ? vowelFrameworkLabels
        : standardVowelSubscripts.map(sub => `${fidelObj.prefix}${sub}`);
    return fidelObj.family.map((char, idx) => ({ char, sound: subs[idx] }));
}

function buildFlashcardDeckForFullAlphabet() {
    let deck = [];
    alphabetData.forEach(fidelObj => { deck = deck.concat(buildFlashcardDeckForFamily(fidelObj)); });
    return deck;
}

function openFlashcardStudy(deck, title, onClose) {
    flashcardDeck = deck;
    flashcardIndex = 0;
    flashcardCloseCallback = onClose || null;
    document.getElementById("flashcardScreenTitle").innerText = `🗂️ ${title}`;
    document.getElementById("flashcardScreen").style.display = "block";
    renderFlashcard();

    const card = document.getElementById("flashcardEl");
    card.onclick = () => card.classList.toggle("flipped");
    document.getElementById("flashcardNextBtn").onclick = () => { flashcardIndex = (flashcardIndex + 1) % flashcardDeck.length; renderFlashcard(); };
    document.getElementById("flashcardPrevBtn").onclick = () => { flashcardIndex = (flashcardIndex - 1 + flashcardDeck.length) % flashcardDeck.length; renderFlashcard(); };
    document.getElementById("flashcardCloseBtn").onclick = closeFlashcardStudy;

    const screen = document.getElementById("flashcardScreen");
    screen.addEventListener("touchstart", handleFlashcardTouchStart, { passive: true });
    screen.addEventListener("touchend", handleFlashcardTouchEnd, { passive: true });
}

function closeFlashcardStudy() {
    const screen = document.getElementById("flashcardScreen");
    screen.removeEventListener("touchstart", handleFlashcardTouchStart);
    screen.removeEventListener("touchend", handleFlashcardTouchEnd);
    screen.style.display = "none";
    if (flashcardCloseCallback) flashcardCloseCallback();
}

function renderFlashcard() {
    const card = document.getElementById("flashcardEl");
    card.classList.remove("flipped");
    const entry = flashcardDeck[flashcardIndex];
    document.getElementById("flashcardFront").innerText = entry.char;
    document.getElementById("flashcardBack").innerText = entry.sound;
    const label = document.getElementById("flashcardProgressLabel");
    if (label) label.innerText = `Card ${flashcardIndex + 1} of ${flashcardDeck.length}`;
}

function handleFlashcardTouchStart(e) {
    flashcardTouchStartX = e.changedTouches[0].screenX;
    flashcardTouchStartY = e.changedTouches[0].screenY;
}

function handleFlashcardTouchEnd(e) {
    const dx = e.changedTouches[0].screenX - flashcardTouchStartX;
    const dy = e.changedTouches[0].screenY - flashcardTouchStartY;
    if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0) { flashcardIndex = (flashcardIndex + 1) % flashcardDeck.length; }
    else        { flashcardIndex = (flashcardIndex - 1 + flashcardDeck.length) % flashcardDeck.length; }
    renderFlashcard();
}

window.openMatchingGameWorkspaceMode = openMatchingGameWorkspaceMode;
window.openFlashcardStudy = openFlashcardStudy;
window.closeFlashcardStudy = closeFlashcardStudy;
window.buildFlashcardDeckForFamily = buildFlashcardDeckForFamily;
window.buildFlashcardDeckForFullAlphabet = buildFlashcardDeckForFullAlphabet;

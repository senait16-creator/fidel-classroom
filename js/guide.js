// =============================================================================
// GUIDE.JS — Character intro overlay
// 4-step full-screen card flow shown every login.
// Skip jumps straight to mode select with character anchored in corner.
//
// Load AFTER: app.js, auth.js (add <script src="js/guide.js?v=4" defer>
// to index.html AFTER auth.js)
// =============================================================================

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _guideStep = 0;
let _guideSelectedMode = null;

const GUIDE_LINES = {
    greeting: {
        main: (name) => `Selam, ${name}! Welcome back to Fidel Classroom ☕`,
        bubble: "I'm so glad you're here. Let me show you what we've got today…"
    },
    modes: {
        main: "Here's what you can work on today — pick what calls to you!",
        bubble: "4 paths. Your pace. Your choice ✨"
    },
    modeDetail: {
        challenge: {
            main: "Challenge! I love it 🔥",
            bubble: "Match letters, hit a streak of 20, submit your writing. Your whole team moves up together!"
        },
        practice: {
            main: "Learning the alphabet at your own pace — I love it!",
            bubble: "Work through each letter family, tap any one to practice. No pressure, just progress."
        },
        reading: {
            main: "Ready to read real Amharic? Let's go!",
            bubble: "Sentences unlock as you master more letters. Tap a word to see what it means."
        },
        vocab: {
            main: "Words and phrases — the good stuff!",
            bubble: "Build your vocabulary level by level. Don't forget to check today's daily decode at the top!"
        }
    }
};

// ---------------------------------------------------------------------------
// Entry point — called from auth.js after login + profile load
// ---------------------------------------------------------------------------

function showCharacterGuide() {
    // Remove any existing overlay
    const existing = document.getElementById('guideOverlay');
    if (existing) existing.remove();

    _guideStep = 0;
    _guideSelectedMode = null;

    const overlay = document.createElement('div');
    overlay.id = 'guideOverlay';
    overlay.innerHTML = `
        <div id="guideBackdrop"></div>
        <div id="guideCard">

            <!-- Character SVG (slides in from left) -->
            <div id="guideCharacterWrap">
                <div id="guideCharacter">
                    <!-- Inline SVG placeholder — replace src with actual character SVG -->
                    <svg viewBox="0 0 200 340" xmlns="http://www.w3.org/2000/svg" id="guideCharSVG">
                        <!-- Head -->
                        <ellipse cx="100" cy="60" rx="40" ry="44" fill="#8B6F5E"/>
                        <!-- Hair -->
                        <ellipse cx="100" cy="30" rx="42" ry="28" fill="#2C1810"/>
                        <!-- Face -->
                        <ellipse cx="100" cy="68" rx="34" ry="38" fill="#C4956A"/>
                        <!-- Eyes -->
                        <ellipse cx="87" cy="62" rx="5" ry="6" fill="#1a1a1a"/>
                        <ellipse cx="113" cy="62" rx="5" ry="6" fill="#1a1a1a"/>
                        <!-- Eye shine -->
                        <circle cx="89" cy="60" r="1.5" fill="white"/>
                        <circle cx="115" cy="60" r="1.5" fill="white"/>
                        <!-- Smile -->
                        <path d="M 88 76 Q 100 86 112 76" stroke="#8B4513" stroke-width="2" fill="none" stroke-linecap="round"/>
                        <!-- Neck -->
                        <rect x="88" y="100" width="24" height="18" rx="4" fill="#C4956A"/>
                        <!-- Body / dress -->
                        <path d="M 60 118 Q 100 108 140 118 L 150 260 Q 100 270 50 260 Z" fill="#166534"/>
                        <!-- Collar detail -->
                        <path d="M 88 118 L 100 132 L 112 118" stroke="#ca8a04" stroke-width="2" fill="none"/>
                        <!-- Arms -->
                        <path d="M 60 130 Q 30 155 38 185" stroke="#C4956A" stroke-width="14" stroke-linecap="round" fill="none"/>
                        <path d="M 140 130 Q 170 155 162 185" stroke="#C4956A" stroke-width="14" stroke-linecap="round" fill="none"/>
                        <!-- Hands -->
                        <circle cx="38" cy="189" r="10" fill="#C4956A"/>
                        <circle cx="162" cy="189" r="10" fill="#C4956A"/>
                        <!-- Skirt flare -->
                        <path d="M 50 260 Q 100 280 150 260 L 155 310 Q 100 326 45 310 Z" fill="#14532d"/>
                        <!-- Gold hem -->
                        <path d="M 45 310 Q 100 326 155 310" stroke="#ca8a04" stroke-width="3" fill="none"/>
                        <!-- Feet -->
                        <ellipse cx="76" cy="320" rx="16" ry="8" fill="#1a1a1a"/>
                        <ellipse cx="124" cy="320" rx="16" ry="8" fill="#1a1a1a"/>
                    </svg>
                </div>
            </div>

            <!-- Speech bubble -->
            <div id="guideBubble">
                <div id="guideBubbleTail"></div>
                <p id="guideBubbleText"></p>
            </div>

            <!-- Main text -->
            <div id="guideMainText">
                <p id="guideMainLine"></p>
            </div>

            <!-- Mode cards (step 2+) -->
            <div id="guideModeCards" style="display:none;">
                <div class="guide-mode-card" data-mode="challenge" onclick="guideSelectMode('challenge')">
                    <span class="guide-mode-icon">☕</span>
                    <span class="guide-mode-label">Fidel Challenge</span>
                </div>
                <div class="guide-mode-card" data-mode="practice" onclick="guideSelectMode('practice')">
                    <span class="guide-mode-icon">📖</span>
                    <span class="guide-mode-label">Practice Fidel</span>
                </div>
                <div class="guide-mode-card" data-mode="reading" onclick="guideSelectMode('reading')">
                    <span class="guide-mode-icon">📘</span>
                    <span class="guide-mode-label">Reading Path</span>
                </div>
                <div class="guide-mode-card" data-mode="vocab" onclick="guideSelectMode('vocab')">
                    <span class="guide-mode-icon">🟩</span>
                    <span class="guide-mode-label">Vocab + Wordle</span>
                </div>
            </div>

            <!-- Enter button (step 3) -->
            <button id="guideEnterBtn" style="display:none;" onclick="guideEnter()">
                Let's go →
            </button>

            <!-- Controls -->
            <div id="guideControls">
                <button id="guideSkipBtn" onclick="guideSkip()">Skip intro</button>
                <button id="guideTapHint" onclick="guideAdvance()">Tap to continue</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Inject CSS if not already present
    if (!document.getElementById('guideStyles')) {
        const style = document.createElement('style');
        style.id = 'guideStyles';
        style.textContent = GUIDE_CSS;
        document.head.appendChild(style);
    }

    // Start step 0
    guideStep0();
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function guideStep0() {
    _guideStep = 0;
    const name = currentProfile?.nickname || 'there';

    // Full-screen character slides in
    const charWrap = document.getElementById('guideCharacterWrap');
    charWrap.className = 'guide-char-full';

    // Typewriter on main line
    typewriterText('guideMainLine', GUIDE_LINES.greeting.main(name), () => {
        // Show bubble after main text finishes
        showGuideBubble(GUIDE_LINES.greeting.bubble);
    });

    setGuideTapHint('Tap to continue');
    document.getElementById('guideModeCards').style.display = 'none';
    document.getElementById('guideEnterBtn').style.display  = 'none';

    // Tap anywhere on card or backdrop to advance
    document.getElementById('guideCard').onclick = () => {
        if (_guideStep === 0) guideStep1();
    };
    document.getElementById('guideBackdrop').onclick = () => {
        if (_guideStep === 0) guideStep1();
    };
}

function guideStep1() {
    _guideStep = 1;

    // Character shrinks to bottom-left corner
    const charWrap = document.getElementById('guideCharacterWrap');
    charWrap.className = 'guide-char-corner';

    // Update text
    animateGuideText('guideMainLine', GUIDE_LINES.modes.main);
    showGuideBubble(GUIDE_LINES.modes.bubble);

    // Show mode cards
    document.getElementById('guideModeCards').style.display = 'grid';

    setGuideTapHint('Pick a mode below');

    // Remove whole-card click
    document.getElementById('guideCard').onclick = null;
    document.getElementById('guideBackdrop').onclick = null;
}

function guideSelectMode(mode) {
    _guideStep = 2;
    _guideSelectedMode = mode;

    // Highlight selected card, fade others
    document.querySelectorAll('.guide-mode-card').forEach(card => {
        if (card.dataset.mode === mode) {
            card.classList.add('selected');
        } else {
            card.classList.add('faded');
        }
    });

    // Character slightly grows from corner
    const charWrap = document.getElementById('guideCharacterWrap');
    charWrap.className = 'guide-char-corner-active';

    // Mode-specific lines
    const lines = GUIDE_LINES.modeDetail[mode];
    animateGuideText('guideMainLine', lines.main);
    showGuideBubble(lines.bubble);

    // Show enter button
    document.getElementById('guideEnterBtn').style.display = 'block';
    setGuideTapHint(null);
}

function guideEnter() {
    dismissGuide();
    const mode = _guideSelectedMode || 'challenge';

    switch (mode) {
        case 'challenge': if (typeof chooseModeChallenge === 'function') chooseModeChallenge(); break;
        case 'practice':  if (typeof chooseModePractice  === 'function') chooseModePractice();  break;
        case 'reading':   if (typeof chooseModeReading   === 'function') chooseModeReading();   break;
        case 'vocab':     if (typeof chooseModeVocab     === 'function') chooseModeVocab();     break;
        default:          if (typeof enterModeSelect     === 'function') enterModeSelect();     break;
    }
}

function guideSkip() {
    dismissGuide();
    if (typeof enterModeSelect === 'function') enterModeSelect();
}

function guideAdvance() {
    if      (_guideStep === 0) guideStep1();
    else if (_guideStep === 1) { /* wait for mode selection */ }
}

function dismissGuide() {
    const overlay = document.getElementById('guideOverlay');
    if (overlay) {
        overlay.classList.add('guide-exit');
        setTimeout(() => overlay.remove(), 300);
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function showGuideBubble(text) {
    const bubble = document.getElementById('guideBubble');
    const textEl = document.getElementById('guideBubbleText');
    bubble.style.display = 'block';
    bubble.classList.remove('bubble-in');
    void bubble.offsetWidth; // reflow
    bubble.classList.add('bubble-in');
    textEl.innerText = text;
}

function setGuideTapHint(text) {
    const hint = document.getElementById('guideTapHint');
    if (!hint) return;
    hint.style.display = text ? 'block' : 'none';
    if (text) hint.innerText = text;
}

function animateGuideText(elId, text) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.classList.add('text-out');
    setTimeout(() => {
        el.innerText = text;
        el.classList.remove('text-out');
        el.classList.add('text-in');
        setTimeout(() => el.classList.remove('text-in'), 400);
    }, 200);
}

function typewriterText(elId, text, onDone) {
    const el = document.getElementById(elId);
    if (!el) { if (onDone) onDone(); return; }
    el.innerText = '';
    let i = 0;
    const interval = setInterval(() => {
        el.innerText += text[i];
        i++;
        if (i >= text.length) {
            clearInterval(interval);
            if (onDone) setTimeout(onDone, 400);
        }
    }, 28);
}

// ---------------------------------------------------------------------------
// CSS (injected once)
// ---------------------------------------------------------------------------

const GUIDE_CSS = `
#guideOverlay {
    position: fixed; inset: 0; z-index: 99990;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 0;
}
#guideOverlay.guide-exit {
    animation: guideFadeOut 0.3s ease forwards;
}
@keyframes guideFadeOut { to { opacity: 0; } }

#guideBackdrop {
    position: absolute; inset: 0;
    background: linear-gradient(155deg, #14532d 0%, #166534 40%, #15803d 68%, #ca8a04 100%);
    z-index: 0;
}

#guideCard {
    position: relative; z-index: 1;
    width: 100%; max-width: 420px;
    min-height: 100vh;
    display: flex; flex-direction: column;
    align-items: center; justify-content: flex-end;
    padding: 0 0 36px;
    overflow: hidden;
}

/* ── Character ──────────────────────────────────────────── */
#guideCharacterWrap {
    position: absolute;
    transition: all 0.6s cubic-bezier(0.32, 0.72, 0, 1);
}

/* Step 0: full height, centered, slides in from left */
.guide-char-full {
    bottom: 0; left: 50%;
    transform: translateX(-50%);
    width: min(55vw, 220px);
    animation: charSlideIn 0.7s cubic-bezier(0.32, 0.72, 0, 1) forwards;
}
@keyframes charSlideIn {
    from { transform: translateX(calc(-50% - 100vw)); opacity: 0; }
    to   { transform: translateX(-50%); opacity: 1; }
}

/* Step 1+: shrinks to bottom-left corner */
.guide-char-corner {
    bottom: 100px; left: 16px;
    width: 68px;
    transform: translateX(0);
}

/* Step 2: slightly larger with pulse */
.guide-char-corner-active {
    bottom: 100px; left: 16px;
    width: 84px;
    transform: translateX(0);
    animation: charPulse 0.3s ease;
}
@keyframes charPulse {
    0%, 100% { transform: scale(1); }
    50%       { transform: scale(1.08); }
}

#guideCharacter { width: 100%; }
#guideCharSVG   { width: 100%; height: auto; filter: drop-shadow(0 8px 24px rgba(0,0,0,0.3)); }

/* ── Speech bubble ──────────────────────────────────────── */
#guideBubble {
    display: none;
    position: absolute;
    bottom: 160px; left: 90px;
    background: white;
    border-radius: 14px;
    padding: 12px 16px;
    max-width: 220px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    font-size: 13px; font-weight: 500; color: #1e293b;
    line-height: 1.5;
    font-family: 'Inter', sans-serif;
}
#guideBubble.bubble-in {
    animation: bubbleIn 0.3s cubic-bezier(0.32, 0.72, 0, 1) forwards;
}
@keyframes bubbleIn {
    from { opacity: 0; transform: scale(0.85) translateY(8px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
}
#guideBubbleTail {
    position: absolute;
    bottom: -8px; left: 20px;
    width: 16px; height: 16px;
    background: white;
    clip-path: polygon(0 0, 100% 0, 50% 100%);
}

/* Full-screen: bubble centered above character */
.guide-char-full ~ #guideBubble {
    bottom: auto;
    top: calc(100vh - 420px);
    left: 50%;
    transform: translateX(-50%);
    max-width: 280px;
    text-align: center;
}

/* ── Main text ──────────────────────────────────────────── */
#guideMainText {
    width: 100%; padding: 0 24px;
    margin-bottom: 20px; margin-top: auto;
}
#guideMainLine {
    font-family: 'Lora', Georgia, serif;
    font-size: 22px; font-weight: 700;
    color: white; text-align: center;
    line-height: 1.35;
}
.text-out { opacity: 0; transform: translateY(8px); transition: all 0.2s; }
.text-in  { opacity: 1; transform: translateY(0);   transition: all 0.3s; }

/* ── Mode cards ─────────────────────────────────────────── */
#guideModeCards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    width: 100%; padding: 0 20px;
    margin-bottom: 16px;
    animation: screenFadeIn 0.3s ease;
}
.guide-mode-card {
    background: white; border-radius: 14px;
    padding: 16px 10px; text-align: center;
    cursor: pointer;
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    transition: transform 0.15s, box-shadow 0.15s, opacity 0.3s;
    box-shadow: 0 2px 12px rgba(0,0,0,0.15);
}
.guide-mode-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.2); }
.guide-mode-card.selected { border: 2px solid #fde68a; background: #fffbeb; transform: translateY(-3px); box-shadow: 0 8px 24px rgba(202,138,4,0.3); }
.guide-mode-card.faded    { opacity: 0.4; transform: scale(0.96); }
.guide-mode-icon  { font-size: 28px; }
.guide-mode-label { font-size: 12px; font-weight: 700; color: #1e293b; font-family: 'Inter', sans-serif; line-height: 1.2; }

/* ── Enter button ───────────────────────────────────────── */
#guideEnterBtn {
    width: calc(100% - 40px);
    background: #ca8a04; color: white;
    border: none; border-radius: 14px;
    padding: 16px; font-size: 16px; font-weight: 700;
    cursor: pointer; font-family: 'Inter', sans-serif;
    margin-bottom: 12px;
    animation: screenFadeIn 0.3s ease;
    box-shadow: 0 4px 16px rgba(202,138,4,0.4);
}
#guideEnterBtn:hover { background: #b45309; }

/* ── Controls ───────────────────────────────────────────── */
#guideControls {
    display: flex; justify-content: space-between; align-items: center;
    width: 100%; padding: 0 20px;
}
#guideSkipBtn {
    background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.35);
    color: white; border-radius: 8px; padding: 8px 14px;
    font-size: 12px; font-weight: 600; cursor: pointer;
    font-family: 'Inter', sans-serif;
}
#guideTapHint {
    background: none; border: none; color: rgba(255,255,255,0.7);
    font-size: 12px; cursor: pointer; font-family: 'Inter', sans-serif;
    font-weight: 500;
}
`;

// ---------------------------------------------------------------------------
// Expose
// ---------------------------------------------------------------------------

window.showCharacterGuide = showCharacterGuide;
window.guideAdvance       = guideAdvance;
window.guideSelectMode    = guideSelectMode;
window.guideEnter         = guideEnter;
window.guideSkip          = guideSkip;

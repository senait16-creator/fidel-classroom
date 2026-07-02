// GUIDE.JS — Welcome + Mode Select

function showCharacterGuide() {
  const existing = document.getElementById("guideOverlay");
  if (existing) existing.remove();

  const name = currentProfile?.nickname || "there";

  const overlay = document.createElement("div");
  overlay.id = "guideOverlay";

  overlay.innerHTML = `
    <div class="guide-bg">
      <span class="guide-letter l1">ሀ</span>
      <span class="guide-letter l2">ለ</span>
      <span class="guide-letter l3">መ</span>
      <span class="guide-letter l4">ሰ</span>
      <span class="guide-letter l5">ተ</span>

      <div class="guide-content">
        <img src="IMG_2406.svg" class="guide-girl" alt="Fidel guide character">

        <div class="guide-header">
          <img src="Buna_Cini_Website.svg" class="guide-cup-small" alt="">
          <h1>Selam, ${name}!</h1>
          <p>Welcome to Fidel Classroom</p>
        </div>

        <div class="guide-speech">
          I’m Fidel! I’ll help you learn Amharic step by step. 💛
        </div>

        <div class="guide-divider"></div>

        <h2>Choose your learning path</h2>
        <p class="guide-sub">Every path helps you grow. Every step brings you closer!</p>

        <div class="guide-cards">
          <button class="guide-card green" onclick="guideChoose('challenge')">
            <span class="cup-icon">☕</span>
            <strong>Fidel Challenge</strong>
            <small>Practice letters, earn points, and level up!</small>
          </button>

          <button class="guide-card blue" onclick="guideChoose('reading')">
            <span class="cup-icon">📖</span>
            <strong>Reading Path</strong>
            <small>Read words, sentences, and stories.</small>
          </button>

          <button class="guide-card purple" onclick="guideChoose('vocab')">
            <span class="cup-icon">💬</span>
            <strong>Vocab Path</strong>
            <small>Learn words, meanings, and how to use them.</small>
          </button>

          <button class="guide-card gold" onclick="guideChoose('practice')">
            <span class="cup-icon">🗺️</span>
            <strong>Fidel Map</strong>
            <small>See your progress and track your journey.</small>
          </button>
        </div>

        <button class="guide-skip" onclick="guideSkip()">Skip intro</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  if (!document.getElementById("guideStyles")) {
    const style = document.createElement("style");
    style.id = "guideStyles";
    style.textContent = GUIDE_CSS;
    document.head.appendChild(style);
  }
}

function guideChoose(mode) {
  guideDismiss();

  if (mode === "challenge" && typeof chooseModeChallenge === "function") chooseModeChallenge();
  else if (mode === "practice" && typeof chooseModePractice === "function") chooseModePractice();
  else if (mode === "reading" && typeof chooseModeReading === "function") chooseModeReading();
  else if (mode === "vocab" && typeof chooseModeVocab === "function") chooseModeVocab();
  else if (typeof enterModeSelect === "function") enterModeSelect();
}

function guideSkip() {
  guideDismiss();
  if (typeof enterModeSelect === "function") enterModeSelect();
}

function guideDismiss() {
  const overlay = document.getElementById("guideOverlay");
  if (overlay) overlay.remove();
}

const GUIDE_CSS = `
#guideOverlay {
  position: fixed;
  inset: 0;
  z-index: 99990;
  overflow-y: auto;
  font-family: Inter, system-ui, sans-serif;
}

.guide-bg {
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  background: linear-gradient(155deg,#14532d 0%,#166534 38%,#15803d 65%,#ca8a04 100%);
  padding: 28px 18px 36px;
}

.guide-letter {
  position: absolute;
  font-family: Georgia, serif;
  color: white;
  opacity: 0.11;
  pointer-events: none;
  user-select: none;
  line-height: 1;
}

.l1 { font-size: 150px; top: -25px; left: -20px; }
.l2 { font-size: 120px; top: 5%; right: 8%; }
.l3 { font-size: 140px; bottom: 20%; left: -20px; }
.l4 { font-size: 120px; bottom: 8%; right: 10%; }
.l5 { font-size: 90px; top: 42%; right: -10px; }

.guide-content {
  position: relative;
  z-index: 1;
  max-width: 420px;
  margin: 0 auto;
  text-align: center;
  color: white;
}

.guide-girl {
  width: 190px;
  max-width: 52vw;
  display: block;
  margin: 0 auto 8px;
  filter: drop-shadow(0 10px 22px rgba(0,0,0,.25));
}

.guide-cup-small {
  width: 54px;
  height: auto;
  margin-bottom: 6px;
}

.guide-header h1 {
  font-family: Georgia, serif;
  font-size: 44px;
  line-height: 1;
  margin: 0;
  color: #fffbea;
  text-shadow: 0 3px 12px rgba(0,0,0,.22);
}

.guide-header p {
  font-family: Georgia, serif;
  font-size: 19px;
  color: #fde68a;
  margin: 8px 0 14px;
}

.guide-speech {
  background: rgba(255,255,255,.94);
  color: #3b2414;
  border-radius: 24px;
  padding: 14px 18px;
  font-size: 15px;
  line-height: 1.45;
  max-width: 310px;
  margin: 0 auto 22px;
  box-shadow: 0 8px 24px rgba(0,0,0,.18);
}

.guide-divider {
  width: 70%;
  height: 1px;
  background: rgba(253,230,138,.55);
  margin: 8px auto 22px;
}

.guide-content h2 {
  font-family: Georgia, serif;
  font-size: 25px;
  margin: 0 0 5px;
  color: #fefce8;
}

.guide-sub {
  font-size: 13px;
  color: rgba(255,255,255,.78);
  margin: 0 0 18px;
}

.guide-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 12px;
}

.guide-card {
  min-height: 170px;
  border: 1px solid rgba(255,255,255,.55);
  border-radius: 22px;
  padding: 18px 12px 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
  box-shadow: 0 8px 22px rgba(0,0,0,.18);
  transition: transform .15s ease, box-shadow .15s ease;
}

.guide-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 12px 28px rgba(0,0,0,.24);
}

.cup-icon {
  font-size: 34px;
  background: rgba(255,255,255,.75);
  width: 62px;
  height: 62px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.guide-card strong {
  font-family: Georgia, serif;
  font-size: 21px;
  line-height: 1.05;
}

.guide-card small {
  font-size: 12px;
  line-height: 1.4;
}

.guide-card.green {
  background: linear-gradient(180deg,#f0fdf4 0%,#dcfce7 62%,#166534 63%,#15803d 100%);
  color: #14532d;
}

.guide-card.blue {
  background: linear-gradient(180deg,#eff6ff 0%,#dbeafe 62%,#1d4ed8 63%,#1e40af 100%);
  color: #1e3a8a;
}

.guide-card.purple {
  background: linear-gradient(180deg,#faf5ff 0%,#ede9fe 62%,#7c3aed 63%,#6d28d9 100%);
  color: #4c1d95;
}

.guide-card.gold {
  background: linear-gradient(180deg,#fffbeb 0%,#fef3c7 62%,#ca8a04 63%,#b45309 100%);
  color: #78350f;
}

.guide-card.green small,
.guide-card.blue small,
.guide-card.purple small,
.guide-card.gold small {
  color: inherit;
}

.guide-skip {
  margin-top: 18px;
  background: rgba(255,255,255,.16);
  border: 1px solid rgba(255,255,255,.35);
  color: white;
  border-radius: 999px;
  padding: 10px 18px;
  font-weight: 700;
  cursor: pointer;
}

@media (max-width: 380px) {
  .guide-header h1 { font-size: 38px; }
  .guide-card { min-height: 155px; }
  .guide-card strong { font-size: 18px; }
}

window.showCharacterGuide = showCharacterGuide;
window.guideChoose = guideChoose;
window.guideSkip = guideSkip;

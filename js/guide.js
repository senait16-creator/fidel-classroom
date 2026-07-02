// =============================================================================
// GUIDE.JS — Fidel Classroom Welcome Guide
// Shows after login/profile setup. Routes users into the app modes.
// =============================================================================

// GUIDE.JS — no intro screen, go straight to cup-card dashboard

function showCharacterGuide() {
  if (typeof enterModeSelect === "function") {
    enterModeSelect();
  }
}

window.showCharacterGuide = showCharacterGuide;

function guideChoose(mode) {
  guideDismiss();

  if (mode === "challenge" && typeof chooseModeChallenge === "function") {
    chooseModeChallenge();
  } else if (mode === "practice" && typeof chooseModePractice === "function") {
    chooseModePractice();
  } else if (mode === "reading" && typeof chooseModeReading === "function") {
    chooseModeReading();
  } else if (mode === "vocab" && typeof chooseModeVocab === "function") {
    chooseModeVocab();
  } else if (typeof enterModeSelect === "function") {
    enterModeSelect();
  }
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
  padding: 26px 18px 36px;
}

.guide-letter {
  position: absolute;
  font-family: 'Abyssinica SIL', Georgia, serif;
  color: white;
  opacity: 0.1;
  pointer-events: none;
  user-select: none;
  line-height: 1;
}

.l1 { font-size: 170px; top: -35px; left: -25px; }
.l2 { font-size: 130px; top: 6%; right: -12px; }
.l3 { font-size: 155px; bottom: -28px; left: 4%; }
.l4 { font-size: 110px; bottom: 13%; right: 7%; }
.l5 { font-size: 95px; top: 43%; left: -8px; }
.l6 { font-size: 105px; top: 2%; left: 42%; }

.guide-content {
  position: relative;
  z-index: 1;
  max-width: 420px;
  margin: 0 auto;
  text-align: center;
  color: white;
}

.guide-girl {
  width: 175px;
  max-width: 52vw;
  display: block;
  margin: 0 auto 6px;
  filter: drop-shadow(0 12px 24px rgba(0,0,0,.28));
}

.guide-cup-small {
  width: 48px;
  height: auto;
  margin-bottom: 6px;
}

.guide-kicker {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .7px;
  text-transform: uppercase;
  color: rgba(255,255,255,.65);
  margin-bottom: 6px;
}

.guide-header h1 {
  font-family: Lora, Georgia, serif;
  font-size: 39px;
  line-height: 1.05;
  margin: 0;
  color: #fffbea;
  text-shadow: 0 3px 12px rgba(0,0,0,.22);
}

.guide-header p {
  font-family: Lora, Georgia, serif;
  font-style: italic;
  font-size: 20px;
  color: #fde68a;
  margin: 8px 0 14px;
}

.guide-speech {
  background: rgba(255,255,255,.94);
  color: #3b2414;
  border-radius: 22px;
  padding: 13px 17px;
  font-size: 14px;
  line-height: 1.45;
  max-width: 320px;
  margin: 0 auto 18px;
  box-shadow: 0 8px 24px rgba(0,0,0,.18);
}

.guide-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 12px;
}

.guide-card {
  position: relative;
  min-height: 156px;
  border: 1px solid rgba(255,255,255,.58);
  border-radius: 22px;
  padding: 24px 12px 15px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 8px 22px rgba(0,0,0,.18);
  transition: transform .15s ease, box-shadow .15s ease;
  overflow: hidden;
}

.guide-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 12px 28px rgba(0,0,0,.24);
}

.guide-card-badge {
  position: absolute;
  top: 9px;
  right: 9px;
  font-size: 9px;
  font-weight: 800;
  border-radius: 999px;
  padding: 3px 7px;
  background: rgba(255,255,255,.72);
}

.guide-icon {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: rgba(255,255,255,.7);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Abyssinica SIL', Georgia, serif;
  font-size: 30px;
  font-weight: 800;
}

.guide-card strong {
  font-family: Lora, Georgia, serif;
  font-size: 19px;
  line-height: 1.05;
}

.guide-card small {
  font-size: 11px;
  line-height: 1.4;
  max-width: 130px;
}

.guide-card.green {
  background: linear-gradient(180deg,#f0fdf4 0%,#dcfce7 62%,#166534 63%,#15803d 100%);
  color: #14532d;
}

.guide-card.gold {
  background: linear-gradient(180deg,#fffbeb 0%,#fef3c7 62%,#ca8a04 63%,#b45309 100%);
  color: #78350f;
}

.guide-card.blue {
  background: linear-gradient(180deg,#eff6ff 0%,#dbeafe 62%,#1d4ed8 63%,#1e40af 100%);
  color: #1e3a8a;
}

.guide-card.purple {
  background: linear-gradient(180deg,#faf5ff 0%,#ede9fe 62%,#7c3aed 63%,#6d28d9 100%);
  color: #4c1d95;
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
  .guide-header h1 { font-size: 34px; }
  .guide-girl { width: 150px; }
  .guide-card { min-height: 145px; padding: 22px 10px 13px; }
  .guide-card strong { font-size: 17px; }
  .guide-card small { font-size: 10px; }
}
`;

window.showCharacterGuide = showCharacterGuide;
window.guideChoose = guideChoose;
window.guideSkip = guideSkip;

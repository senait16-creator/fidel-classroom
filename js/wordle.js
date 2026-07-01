// =============================================================================
// wordle.js — Daily Fidel Decode (Amharic Wordle)
// Load order: after auth.js, before menu.js
// =============================================================================

const WORDLE_PHRASES = [
  { amharic: "እንደምን አደርክ", answer: "How did you sleep?", category: "greeting", hint_word: "አደርክ = you slept", options: ["Good morning", "How did you sleep?", "Welcome, come in", "See you tomorrow"] },
  { amharic: "ስምህ ማን ነው", answer: "What is your name?", category: "question", hint_word: "ስም = name", options: ["Where are you from?", "How old are you?", "What is your name?", "Do you speak Amharic?"] },
  { amharic: "አመሰግናለሁ", answer: "Thank you", category: "gratitude", hint_word: "ames·eg·na·le·hu", options: ["You're welcome", "Thank you", "I'm sorry", "Please"] },
  { amharic: "ደህና ሁን", answer: "Goodbye / Stay well", category: "farewell", hint_word: "ደህና = well / safe", options: ["Good morning", "See you later", "Goodbye / Stay well", "Come back soon"] },
  { amharic: "ምግቡ ጣፋጭ ነው", answer: "The food is delicious", category: "food", hint_word: "ጣፋጭ = delicious", options: ["I am hungry", "The food is delicious", "Let's eat together", "Do you want water?"] },
  { amharic: "ፍቅር አለኝ", answer: "I have love / I am in love", category: "emotion", hint_word: "ፍቅር = love", options: ["I am happy", "I am tired", "I have love / I am in love", "I am grateful"] },
  { amharic: "ወደ ቤት እሄዳለሁ", answer: "I am going home", category: "action", hint_word: "ቤት = home, እሄዳለሁ = I go", options: ["I am coming back", "I am going home", "I want to rest", "I am leaving now"] },
  { amharic: "ዛሬ ፀሐይ አለ", answer: "It is sunny today", category: "weather", hint_word: "ፀሐይ = sun", options: ["It is raining today", "It is cold today", "It is sunny today", "Today is windy"] },
  { amharic: "ቤተሰቦቼ ጥሩ ናቸው", answer: "My family is well", category: "family", hint_word: "ቤተሰቦቼ = my family", options: ["I miss my family", "My family is well", "My family is big", "I love my family"] },
  { amharic: "አማርኛ እማራለሁ", answer: "I am learning Amharic", category: "learning", hint_word: "እማራለሁ = I am learning", options: ["I speak Amharic", "Amharic is beautiful", "I am learning Amharic", "I love Amharic"] },
  { amharic: "ሰላም ነው", answer: "It is peaceful / Hello", category: "greeting", hint_word: "ሰላም = peace / hello", options: ["It is peaceful / Hello", "How are you?", "Good evening", "Welcome"] },
  { amharic: "ውሃ ጠጣ", answer: "Drink water", category: "command", hint_word: "ውሃ = water, ጠጣ = drink (command)", options: ["Give me water", "Drink water", "Is there water?", "The water is cold"] },
  { amharic: "ልጆቹ ይጫወታሉ", answer: "The children are playing", category: "action", hint_word: "ልጆቹ = the children", options: ["The children are sleeping", "The children are playing", "The children are eating", "The children are studying"] },
  { amharic: "ዛሬ ደስተኛ ነኝ", answer: "I am happy today", category: "emotion", hint_word: "ደስተኛ = happy", options: ["I am tired today", "I am happy today", "I am busy today", "I am well today"] },
];

// Hints revealed per attempt (0-indexed, so attempt 1 reveals hint[0], etc.)
const WORDLE_HINTS = [
  null, // attempt 1 — no hint, just the phrase
  (p) => `This is a ${p.category}`,
  (p) => p.hint_word,
  (p) => `The correct answer has ${p.answer.split(' ').length} words`,
  (p) => `First letter of the answer: "${p.answer[0]}"`,
];

let _wordleState = null;

function getDayIndex() {
  const start = new Date('2025-07-01');
  const now = new Date();
  const diff = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  return Math.abs(diff) % WORDLE_PHRASES.length;
}

function getTodayKey() {
  const d = new Date();
  return `wordle_${d.getFullYear()}_${d.getMonth()}_${d.getDate()}`;
}

function loadWordleState() {
  try {
    const saved = localStorage.getItem(getTodayKey());
    if (saved) return JSON.parse(saved);
  } catch(e) {}
  return null;
}

function saveWordleState(state) {
  try {
    localStorage.setItem(getTodayKey(), JSON.stringify(state));
  } catch(e) {}
}

function maybeShowWordleOnLogin() {
  // Show only for returning users (not first-time), and only once per day
  const saved = loadWordleState();
  if (saved && saved.completed) return; // already played today
  const shownKey = getTodayKey() + '_shown';
  if (localStorage.getItem(shownKey)) return; // already shown this session
  localStorage.setItem(shownKey, '1');
  setTimeout(() => openWordleOverlay(false), 800);
}
window.maybeShowWordleOnLogin = maybeShowWordleOnLogin;

function openWordleOverlay(fromMenu = false) {
  const overlay = document.getElementById('wordleOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  renderWordleGame();
}
window.openWordleOverlay = openWordleOverlay;

function closeWordleOverlay() {
  const overlay = document.getElementById('wordleOverlay');
  if (overlay) overlay.style.display = 'none';
}
window.closeWordleOverlay = closeWordleOverlay;

function renderWordleGame() {
  const mount = document.getElementById('wordleGameMount');
  if (!mount) return;

  const phrase = WORDLE_PHRASES[getDayIndex()];
  const saved = loadWordleState();
  _wordleState = saved || { attempts: [], completed: false, won: false };

  const attemptsLeft = 5 - _wordleState.attempts.length;
  const currentAttempt = _wordleState.attempts.length; // 0-based
  const hint = currentAttempt > 0 && WORDLE_HINTS[currentAttempt]
    ? WORDLE_HINTS[currentAttempt](phrase)
    : null;

  // Shuffle options consistently per day
  const opts = [...phrase.options].sort((a, b) => {
    const seed = getDayIndex();
    return ((a.charCodeAt(0) * seed) % 7) - ((b.charCodeAt(0) * seed) % 7);
  });

  const streakKey = 'wordle_streak';
  const streak = parseInt(localStorage.getItem(streakKey) || '0');

  mount.innerHTML = `
    <div class="wordle-header">
      <div class="wordle-day-label">Day ${getDayIndex() + 1} · ${new Date().toLocaleDateString('en-US', {weekday:'long'})}</div>
      <div class="wordle-streak-badge">🔥 ${streak} day streak</div>
    </div>

    <div class="wordle-phrase-area">
      ${hint ? `<div class="wordle-hint-badge">Hint ${currentAttempt} of 5 — ${hint}</div>` : `<div class="wordle-hint-badge no-hint">Attempt 1 — no hints yet</div>`}
      <div class="wordle-amharic">${phrase.amharic}</div>
      ${hint ? '' : '<div class="wordle-prompt">What does this phrase mean?</div>'}
    </div>

    <div class="wordle-attempts-list">
      ${_wordleState.attempts.map((a, i) => `
        <div class="wordle-attempt-row ${a.correct ? 'correct' : 'wrong'}">
          <div class="wordle-attempt-dot ${a.correct ? 'dot-correct' : 'dot-wrong'}"></div>
          <div class="wordle-attempt-text">${a.choice}</div>
          ${a.correct ? '<span style="color:#166534;font-size:12px;font-weight:700;">✓ Correct!</span>' : '<span style="color:#dc2626;font-size:11px;">✗</span>'}
        </div>
      `).join('')}
      ${!_wordleState.completed ? `
        <div class="wordle-attempt-row active">
          <div class="wordle-attempt-dot dot-active"></div>
          <div class="wordle-attempt-text" style="color:#1d4ed8;font-weight:600;">Choose below</div>
        </div>
      ` : ''}
      ${Array(Math.max(0, 4 - _wordleState.attempts.length - (_wordleState.completed ? 1 : 0))).fill('').map(() => `
        <div class="wordle-attempt-row empty">
          <div class="wordle-attempt-dot dot-empty"></div>
          <div class="wordle-attempt-text"></div>
        </div>
      `).join('')}
    </div>

    ${_wordleState.completed ? renderWordleResult(phrase) : `
      <div class="wordle-options">
        ${opts.map(opt => `
          <button class="wordle-option-btn" onclick="submitWordleAnswer('${opt.replace(/'/g,"\\'")}')">
            ${opt}
          </button>
        `).join('')}
      </div>
    `}
  `;
}

function renderWordleResult(phrase) {
  const score = _wordleState.won
    ? `${_wordleState.attempts.length}/5`
    : 'X/5';
  const shareText = `Fidel Decode Day ${getDayIndex() + 1}\n${score}\n${phrase.amharic}\n\nhttps://senait16-creator.github.io/fidel-classroom/`;

  return `
    <div class="wordle-result">
      <div class="wordle-result-score">${score}</div>
      <div class="wordle-result-label">${_wordleState.won ? 'Decoded!' : 'Better luck tomorrow'}</div>
      <div class="wordle-result-answer">
        <span style="color:#64748b;font-size:12px;">The phrase means:</span><br>
        <strong style="color:#166534;">${phrase.answer}</strong>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;">
        <button class="wordle-share-btn" onclick="navigator.share ? navigator.share({text:'${shareText.replace(/\n/g,'\\n').replace(/'/g,"\\'")}'}): navigator.clipboard.writeText('${shareText.replace(/\n/g,'\\n').replace(/'/g,"\\'")}').then(()=>showToast('Copied to clipboard!'))">
          Share result ↗
        </button>
        <button class="wordle-close-btn" onclick="closeWordleOverlay()">Continue →</button>
      </div>
    </div>
  `;
}

function submitWordleAnswer(choice) {
  const phrase = WORDLE_PHRASES[getDayIndex()];
  if (!_wordleState || _wordleState.completed) return;

  const correct = choice === phrase.answer;
  _wordleState.attempts.push({ choice, correct });

  if (correct || _wordleState.attempts.length >= 5) {
    _wordleState.completed = true;
    _wordleState.won = correct;

    // Update streak
    if (correct) {
      const streakKey = 'wordle_streak';
      const lastWinKey = 'wordle_last_win';
      const today = getTodayKey();
      const lastWin = localStorage.getItem(lastWinKey);
      const yesterday = (() => {
        const d = new Date(); d.setDate(d.getDate() - 1);
        return `wordle_${d.getFullYear()}_${d.getMonth()}_${d.getDate()}`;
      })();
      const streak = parseInt(localStorage.getItem(streakKey) || '0');
      localStorage.setItem(streakKey, lastWin === yesterday ? streak + 1 : 1);
      localStorage.setItem(lastWinKey, today);
    }

    // Save score to Supabase if logged in
    saveWordleScoreToSupabase(_wordleState.attempts.length, _wordleState.won);
  }

  saveWordleState(_wordleState);
  renderWordleGame();
}
window.submitWordleAnswer = submitWordleAnswer;

async function saveWordleScoreToSupabase(attempts, won) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const dayIndex = getDayIndex();
    await supabase.from('wordle_scores').upsert({
      user_id: user.id,
      day_index: dayIndex,
      attempts_used: attempts,
      won: won,
      played_at: new Date().toISOString()
    }, { onConflict: 'user_id,day_index' });
  } catch(e) {}
}

window.openWordleOverlay = openWordleOverlay;
window.closeWordleOverlay = closeWordleOverlay;
window.maybeShowWordleOnLogin = maybeShowWordleOnLogin;

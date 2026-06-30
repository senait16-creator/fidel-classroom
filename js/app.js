// =============================================================================
// APP.JS — Core bootstrap, constants, shared state, utilities, dashboard,
// letter grid, practice sketchpad, progress, leaderboard, team sidebar.
//
// Loads FIRST. All other files depend on globals defined here.
// Load order in index.html:
//   app.js → auth.js → game.js → submissions.js → teacher.js → reading.js → challenge.js
// =============================================================================

const SUPABASE_URL = "https://muisfipoyzkhznfdvnes.supabase.co";
const SUPABASE_KEY = "sb_publishable_VBiJZB8TVM2CSl54aDPP0A_4aDXWb5i";
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const ADMIN_EMAIL = "senaitrichmond16@gmail.com";

// Matching-game streak required to pass a letter family in Fidel Challenge.
// High enough that guessing won't get a student through; low enough that
// one mis-tap doesn't erase several minutes of work.
const STREAK_THRESHOLD = 20;

// Record of which teams exist — actual membership reads live from the
// `teams` table, not this array. Update teams via Supabase, not here.
const TEAMS = ["Red Team 🔴", "Blue Team 🔵", "Green Team 🟢", "Yellow Team 🟡", "Purple Team 🟣"];

// ---------------------------------------------------------------------------
// Global state — shared across all JS files
// ---------------------------------------------------------------------------

let currentUser = null;
let currentProfile = null; // { id, email, nickname, avatar, team_id, is_admin, is_captain, is_suspended }
let masteredLetters = [];
let activeBaseFidel = null;
let activeFamilyArrayData = [];
let activeSubscriptsData = [];
let selectedAvatarSymbol = "🦁";
let isSignUpMode = true;
let isEditingProfile = false;

let activeGamePairs = [];
let selectedGameTokenId = null;
let currentStreakScore = 0;
let gameModeScope = "all";

// Set by challenge.js before launching the matching game in Challenge mode.
// null = normal Practice-mode play (no persistence, no gating).
// When set: { baseLetter, levelNumber, onStreakUpdate, onStreakPassed }
// Cleared back to null when the player exits the game.
let activeChallengeContext = null;

// Practice sketchpad (isolatedFamilyClassroom) — separate from the
// writing submission sketchpad which lives in submissions.js
let canvas, ctx, isDrawing = false;

// ---------------------------------------------------------------------------
// Alphabet data
// ---------------------------------------------------------------------------

const vowelFrameworkLabels = ["ha", "hu", "hee", "ha", "hay", "hih", "ho"];
const standardVowelSubscripts = ["-ä", "-u", "-ee", "-a", "-ay", "-ih", "-o"];

const alphabetData = [
    {base:"ሀ", family:['ሀ','ሁ','ሂ','ሃ','ሄ','ህ','ሆ'], prefix:"h"},
    {base:"ለ", family:['ለ','ሉ','ሊ','ላ','ሌ','ል','ሎ'], prefix:"l"},
    {base:"ሐ", family:['ሐ','ሑ','ሒ','ሓ','ሔ','ሕ','ሖ'], prefix:"ḥ"},
    {base:"መ", family:['መ','ሙ','ሚ','ማ','ሜ','ም','ሞ'], prefix:"m"},
    {base:"ሠ", family:['ሠ','ሡ','ሢ','ሣ','ሤ','ሥ','ሦ'], prefix:"ś"},
    {base:"ረ", family:['ረ','ሩ','ሪ','ራ','ሬ','ር','ሮ'], prefix:"r"},
    {base:"ሰ", family:['ሰ','ሱ','ሲ','ሳ','ሴ','ስ','ሶ'], prefix:"s"},
    {base:"ሸ", family:['ሸ','ሹ','ሺ','ሻ','ሼ','ሽ','ሾ'], prefix:"š"},
    {base:"ቀ", family:['ቀ','ቁ','ቂ','ቃ','ቄ','ቅ','ቆ'], prefix:"q"},
    {base:"በ", family:['በ','ቡ','ቢ','ባ','ቤ','ብ','ቦ'], prefix:"b"},
    {base:"ቨ", family:['ቨ','ቩ','ቪ','ቫ','ቬ','ቭ','ቮ'], prefix:"v"},
    {base:"ተ", family:['ተ','ቱ','ቲ','ታ','ቴ','ት','ቶ'], prefix:"t"},
    {base:"ቸ", family:['ቸ','ቹ','ቺ','ቻ','ቼ','ች','ቾ'], prefix:"č"},
    {base:"ኀ", family:['ኀ','ኁ','ኂ','ኃ','ኄ','ኅ','ኆ'], prefix:"n"},
    {base:"ነ", family:['ነ','ኑ','ኒ','ና','ኔ','ን','ኖ'], prefix:"n"},
    {base:"ኘ", family:['ኘ','ኙ','ኚ','ኛ','ኜ','ኝ','ኞ'], prefix:"ñ"},
    {base:"አ", family:['አ','ኡ','ኢ','ኣ','ኤ','እ','ኦ'], prefix:"ʾ"},
    {base:"ከ", family:['ከ','ኩ','ኪ','ካ','ኬ','ክ','ኮ'], prefix:"k"},
    {base:"ኸ", family:['ኸ','ኹ','ኺ','ኻ','ኼ','ኽ','ኾ'], prefix:"ḫ"},
    {base:"ወ", family:['ወ','ዉ','ዊ','ዋ','ዌ','ው','ዎ'], prefix:"w"},
    {base:"ዐ", family:['ዐ','ዑ','ዒ','ዓ','ዔ','ዕ','ዖ'], prefix:"ʿ"},
    {base:"ዘ", family:['ዘ','ዙ','ዚ','ዛ','ዜ','ዝ','ዞ'], prefix:"z"},
    {base:"ዠ", family:['ዠ','ዡ','ዢ','ዣ','ዤ','ዥ','ዦ'], prefix:"ž"},
    {base:"የ", family:['የ','ዩ','ዪ','ያ','ዬ','ይ','ዮ'], prefix:"y"},
    {base:"ደ", family:['ደ','ዱ','ዲ','ዳ','ዴ','ድ','ዶ'], prefix:"d"},
    {base:"ጀ", family:['ጀ','ጁ','ጂ','ጃ','ጄ','ጅ','ጆ'], prefix:"j"},
    {base:"ገ", family:['ገ','ጉ','ጊ','ጋ','ጌ','ግ','ጎ'], prefix:"g"},
    {base:"ጠ", family:['ጠ','ጡ','ጢ','ጣ','ጤ','ጥ','ጦ'], prefix:"ṭ"},
    {base:"ጨ", family:['ጨ','ጩ','ጪ','ጫ','ጬ','ጭ','ጮ'], prefix:"č̣"},
    {base:"ጰ", family:['ጰ','ጱ','ጲ','ጳ','ጴ','ጵ','ጶ'], prefix:"p̣"},
    {base:"ጸ", family:['ጸ','ጹ','ጺ','ጻ','ጼ','ጽ','ጾ'], prefix:"ṣ"},
    {base:"ፀ", family:['ፀ','ፁ','ፂ','ፃ','ፄ','ፅ','ፆ'], prefix:"ṣ́"},
    {base:"ፈ", family:['ፈ','ፉ','ፊ','ፋ','ፌ','ፍ','ፎ'], prefix:"f"},
    {base:"ፐ", family:['ፐ','ፑ','ፒ','ፓ','ፔ','ፕ','ፖ'], prefix:"p"}
];

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

window.addEventListener('DOMContentLoaded', async () => {
    // auth-btn listener wired here; all other auth handlers live in auth.js
    const authBtn = document.getElementById('auth-btn');
    if (authBtn) authBtn.addEventListener('click', handleAuth);

    const studyAllBtn = document.getElementById('studyAllFlashcardsBtn');
    if (studyAllBtn) {
        studyAllBtn.addEventListener('click', () => {
            openFlashcardStudy(buildFlashcardDeckForFullAlphabet(), "All Letters", () => {
                document.getElementById("studentDashboard").style.display = "block";
            });
            document.getElementById("studentDashboard").style.display = "none";
        });
    }

    document.getElementById('forgotPasswordBtn')?.addEventListener('click', () => {
        document.getElementById('authScreen').style.display = 'none';
        document.getElementById('forgotPasswordScreen').style.display = 'block';
    });

    document.getElementById('backToLoginFromForgotBtn')?.addEventListener('click', () => {
        document.getElementById('forgotPasswordScreen').style.display = 'none';
        resetToGate();
    });

    document.getElementById('sendResetLinkBtn')?.addEventListener('click', sendPasswordResetLink);
    document.getElementById('saveNewPasswordBtn')?.addEventListener('click', saveNewPassword);

    document.getElementById('captainTeamSelect')?.addEventListener('change', (e) => {
        populateCaptainStudentDropdown(e.target.value);
    });
    document.getElementById('setCaptainBtn')?.addEventListener('click', setTeamCaptain);

    // Supabase redirects back with type=recovery after the user clicks a
    // password reset link — skip sign-out and show the new-password screen.
    const isPasswordRecovery = window.location.hash.includes('type=recovery');
    if (isPasswordRecovery) {
        document.getElementById('authScreen').style.display = 'none';
        document.getElementById('newPasswordScreen').style.display = 'block';
        return;
    }

    // Start fresh — clear any stale token from localStorage
    await _supabase.auth.signOut();
    resetToGate();
});

// ---------------------------------------------------------------------------
// Toast notifications
// ---------------------------------------------------------------------------

function showNotificationToast(msg) {
    const container = document.getElementById("toastContainer");
    const element = document.createElement("div");
    element.className = "toast-popup";
    element.innerHTML = `<span>${msg}</span>`;
    container.appendChild(element);
    setTimeout(() => element.remove(), 3000);
}

// Gobez (ጎበዝ = "well done" in Amharic) — styled celebration toast with
// a short twinkle sound. Used for milestones: streak completions, approvals.
function playTwinkleSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5 E5 G5 C6
        notes.forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            const t = audioCtx.currentTime + i * 0.12;
            gain.gain.setValueAtTime(0.25, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
            osc.start(t);
            osc.stop(t + 0.35);
        });
    } catch (e) {
        // Audio not supported — fail silently
    }
}

function showGobezToast(message) {
    const container = document.getElementById("toastContainer");
    const el = document.createElement("div");
    el.className = "toast-popup gobez-toast";
    el.innerHTML = `✨ ጎበዝ! ${message}`;
    container.appendChild(el);
    playTwinkleSound();
    setTimeout(() => el.remove(), 4500);
}

// ---------------------------------------------------------------------------
// Confetti
// ---------------------------------------------------------------------------

function executeVictoryConfettiCelebration() {
    const confCanvas = document.getElementById("confettiCanvas");
    const confCtx = confCanvas.getContext("2d");
    confCanvas.width = window.innerWidth;
    confCanvas.height = window.innerHeight;

    let particles = [];
    const colorPalettes = ["#166534", "#15803d", "#ca8a04", "#fbbf24", "#14532d"];

    for (let i = 0; i < 100; i++) {
        particles.push({
            x: window.innerWidth / 2,
            y: window.innerHeight / 1.5,
            vx: (Math.random() - 0.5) * 12,
            vy: (Math.random() - 0.8) * 15,
            size: Math.random() * 6 + 3,
            color: colorPalettes[Math.floor(Math.random() * colorPalettes.length)],
            rotation: Math.random() * 360,
            rSpeed: Math.random() * 4 - 2
        });
    }

    function animateConfettiLoop() {
        if (particles.length === 0) {
            return confCtx.clearRect(0, 0, confCanvas.width, confCanvas.height);
        }
        confCtx.clearRect(0, 0, confCanvas.width, confCanvas.height);
        particles.forEach((p, idx) => {
            p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.rotation += p.rSpeed;
            confCtx.save();
            confCtx.translate(p.x, p.y);
            confCtx.rotate((p.rotation * Math.PI) / 180);
            confCtx.fillStyle = p.color;
            confCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            confCtx.restore();
            if (p.y > confCanvas.height) particles.splice(idx, 1);
        });
        requestAnimationFrame(animateConfettiLoop);
    }
    animateConfettiLoop();
}

// ---------------------------------------------------------------------------
// First-time streak explainer popup
// Shows once (localStorage flag) before a student's first Challenge game.
// Called from challenge.js via maybeShowStreakExplainer(callback).
// ---------------------------------------------------------------------------

function maybeShowStreakExplainer(onConfirm) {
    const seen = localStorage.getItem('streak_explainer_seen');
    if (seen) { onConfirm(); return; }

    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.6);
        display: flex; align-items: center; justify-content: center;
        z-index: 99998; padding: 24px;
    `;
    overlay.innerHTML = `
        <div style="background:white; border-radius:20px; padding:28px 24px;
                    max-width:380px; width:100%; text-align:center;
                    box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <div style="font-size:40px; margin-bottom:12px;">🔥</div>
            <h2 style="font-size:20px; font-weight:800; color:#166534;
                       margin-bottom:8px;">How the Streak Game Works</h2>
            <p style="font-size:14px; color:#475569; line-height:1.6;
                      margin-bottom:16px;">
                Match each Amharic letter to its sound.
                Get <strong>20 correct in a row</strong> to pass.<br><br>
                Miss one and your streak resets to zero —
                take your time and think before you tap!
            </p>
            <div style="background:#fffbeb; border:1px solid #fde68a;
                        border-radius:12px; padding:12px; margin-bottom:20px;
                        font-size:13px; color:#92400e;">
                💡 <strong>Tip:</strong> Study the flashcards first,
                then play when you feel ready.
            </div>
            <button id="streakExplainerBtn"
                    style="background:#166534; color:white; border:none;
                           border-radius:12px; padding:14px; width:100%;
                           font-size:15px; font-weight:700; cursor:pointer;">
                Got it — Let's Play!
            </button>
        </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('streakExplainerBtn').onclick = () => {
        localStorage.setItem('streak_explainer_seen', 'true');
        overlay.remove();
        onConfirm();
    };
}

// ---------------------------------------------------------------------------
// Practice sketchpad (isolatedFamilyClassroom)
// The writing submission sketchpad is separate — it lives in submissions.js.
// ---------------------------------------------------------------------------

function initSketchpadEngineSystem() {
    canvas = document.getElementById("sketchpad");
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1e293b";

    function getCoordinates(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function startDraw(e) {
        isDrawing = true;
        ctx.beginPath();
        const c = getCoordinates(e);
        ctx.moveTo(c.x, c.y);
    }
    function draw(e) {
        if (!isDrawing) return;
        const c = getCoordinates(e);
        ctx.lineTo(c.x, c.y);
        ctx.stroke();
    }
    function stopDraw() { isDrawing = false; }

    canvas.addEventListener("mousedown", startDraw);
    canvas.addEventListener("mousemove", draw);
    window.addEventListener("mouseup", stopDraw);
    canvas.addEventListener("touchstart", startDraw, { passive: true });
    canvas.addEventListener("touchmove", draw, { passive: true });
    window.addEventListener("touchend", stopDraw);
}

function clearSketchpadCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

async function uploadSketchpadDrawingCanvasData() {
    const emptyCheck = document.createElement("canvas");
    emptyCheck.width = canvas.width;
    emptyCheck.height = canvas.height;
    if (canvas.toDataURL() === emptyCheck.toDataURL()) {
        return showNotificationToast("Draw something before sharing!");
    }

    showNotificationToast("Uploading your drawing...");
    canvas.toBlob(async (blob) => {
        const storagePath = `canvas-${Date.now()}.png`;
        const { error: uploadError } = await _supabase.storage
            .from('art_shares')
            .upload(storagePath, blob, { contentType: 'image/png' });

        if (uploadError) return showNotificationToast(uploadError.message);

        const { data: urlData } = _supabase.storage
            .from('art_shares')
            .getPublicUrl(storagePath);

        // Team students post to team feed; solo students post to class board
        if (currentProfile?.team_id) {
            const { error: insertError } = await _supabase
                .from('team_practice_posts')
                .insert({
                    student_id: currentUser.id,
                    team_id: currentProfile.team_id,
                    base_letter: activeBaseFidel || '?',
                    image_url: urlData.publicUrl
                });

            if (insertError) {
                console.error("Failed to post to team feed:", insertError);
                return showNotificationToast("Couldn't share: " + insertError.message);
            }

            clearSketchpadCanvas();
            showGobezToast("Drawing shared with your team!");
        } else {
            const expirationTimestamp = new Date(
                Date.now() + 24 * 60 * 60 * 1000
            ).toISOString();

            await _supabase.from('photo_shares').insert({
                user_id: currentUser.id,
                image_url: urlData.publicUrl,
                expires_at: expirationTimestamp,
                meta_points: 0
            });

            clearSketchpadCanvas();
            showNotificationToast("Drawing shared to the class board!");
            fetchDisappearingImageCanvasBoard();
        }
    }, "image/png");
}

async function submitVerificationCounterBump(shareId, element) {
    const currentVal = parseInt(element.getAttribute('data-count') || "0");
    const updatedVal = currentVal + 1;
    await _supabase.from('photo_shares')
        .update({ meta_points: updatedVal })
        .eq('id', shareId);
    element.setAttribute('data-count', updatedVal);
    element.innerHTML = `👍 Verified (${updatedVal})`;
    showNotificationToast("Marked as verified!");
}

// ---------------------------------------------------------------------------
// Dashboard launch
// ---------------------------------------------------------------------------

function launchDashboard(viewMode) {
    if (currentUser.email === ADMIN_EMAIL) {
        document.getElementById("adminHeaderToggleBar").style.display = "flex";
    }

    if (viewMode === "teacher") {
        document.getElementById("teacherOnlyDashboard").style.display = "block";
        loadTeacherRosterData();
        teacherRefreshConfigurationDropdowns();
        loadTeacherWritingQueue();
        loadTeacherTeamProgress();
        populateCaptainTeamDropdown();
        loadCurrentCaptains();
    } else {
        document.getElementById("studentDashboard").style.display = "block";
        fetchUserProgress();
        renderLiveLeaderboard();
        fetchDisappearingImageCanvasBoard();
        loadTeamDashboard(currentUser);
        buildMatrixInterfaceGrid();
        renderStudentTeamProgress();

        const captainBtn = document.getElementById("captainDashboardEntryBtn");
        if (captainBtn) {
            captainBtn.style.display = currentProfile?.is_captain ? "block" : "none";
        }
    }
}

// Read-only team progress panel shown to every student on the main dashboard.
async function renderStudentTeamProgress() {
    const mount = document.getElementById("studentTeamProgressMount");
    if (!mount) return;
    mount.innerHTML = `<p style="color:#94a3b8; font-size:12px;">Loading...</p>`;

    const { data: teams } = await _supabase
        .from('teams')
        .select('id, name, current_level, streak_count')
        .order('name');

    if (!teams || teams.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:12px;">No teams yet.</p>`;
        return;
    }

    const { data: statusRows } = await _supabase
        .from('team_level_status')
        .select('team_id, level_number, all_members_cleared, live_quiz_passed');

    mount.innerHTML = "";
    teams.forEach(team => {
        const status = (statusRows || []).find(
            s => s.team_id === team.id && s.level_number === team.current_level
        );
        const isReady = status?.all_members_cleared && !status?.live_quiz_passed;
        const isOwnTeam = currentProfile?.team_id === team.id;

        const row = document.createElement('div');
        row.className = `student-team-row ${isReady ? 'ready' : ''}`;
        row.innerHTML = `
            <span class="student-team-row-name">
                ${team.name}${isOwnTeam ? ' (You)' : ''}
            </span>
            <span class="student-team-row-level">
                Level ${team.current_level} • 🔥${team.streak_count || 0}
                ${isReady ? ' • Ready! 🎉' : ''}
            </span>
        `;
        mount.appendChild(row);
    });
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function toggleDropdownElement(elementId) {
    document.getElementById(elementId).classList.toggle('open');
}

// ---------------------------------------------------------------------------
// Letter grid + classroom workspace
// ---------------------------------------------------------------------------

function buildMatrixInterfaceGrid() {
    const container = document.getElementById("viewFidelGrid");
    container.innerHTML = "";
    alphabetData.forEach(item => {
        const card = document.createElement('div');
        card.className = "fidel-card";
        card.setAttribute('data-fidel', item.base);
        card.innerText = item.base;
        card.onclick = () => launchIsolatedClassroomWorkspace(item);
        container.appendChild(card);
    });
    renderUIProgressUpdates();
}

function generateClassroomSubscripts(prefix) {
    if (prefix === "h" || prefix === "ḥ") return vowelFrameworkLabels;
    return standardVowelSubscripts.map(sub => `${prefix}${sub}`);
}

function launchIsolatedClassroomWorkspace(fidelObj) {
    activeBaseFidel = fidelObj.base;
    activeFamilyArrayData = fidelObj.family;
    activeSubscriptsData = generateClassroomSubscripts(fidelObj.prefix);

    document.getElementById("viewFidelGrid").style.display = "none";
    document.getElementById("isolatedFamilyClassroom").style.display = "block";
    document.getElementById("classroomFamilyTitle").innerText = `Reviewing Row: "${activeBaseFidel}"`;

    document.getElementById("classroomRowGameBtn").onclick = () =>
        openMatchingGameWorkspaceMode(fidelObj);

    document.getElementById("classroomFlashcardBtn").onclick = () => {
        openFlashcardStudy(buildFlashcardDeckForFamily(fidelObj), `"${fidelObj.base}" Family`, () => {
            document.getElementById("isolatedFamilyClassroom").style.display = "block";
        });
        document.getElementById("isolatedFamilyClassroom").style.display = "none";
    };

    const undoBtn = document.getElementById("classroomUndoBtn");
    undoBtn.style.display = masteredLetters.includes(activeBaseFidel) ? "block" : "none";

    renderGiantClassroomRowItems(activeFamilyArrayData, activeSubscriptsData);
    setTimeout(initSketchpadEngineSystem, 50);
}

function renderGiantClassroomRowItems(familyArray, subscriptsArray) {
    const mount = document.getElementById("classroomGiantRowMount");
    mount.innerHTML = "";
    familyArray.forEach((char, idx) => {
        const card = document.createElement('div');
        card.className = "giant-char-card";
        card.innerHTML = `<div class="letter">${char}</div><div class="sub">${subscriptsArray[idx]}</div>`;
        mount.appendChild(card);
    });
}

function shuffleClassroomRowPhonetics() {
    const layoutIndices = [0, 1, 2, 3, 4, 5, 6].sort(() => Math.random() - 0.5);
    const mount = document.getElementById("classroomGiantRowMount");
    mount.innerHTML = "";
    layoutIndices.forEach(idx => {
        const card = document.createElement('div');
        card.className = "giant-char-card";
        card.innerHTML = `<div class="letter">${activeFamilyArrayData[idx]}</div><div class="sub">${activeSubscriptsData[idx]}</div>`;
        mount.appendChild(card);
    });
}

async function classroomMarkAsMasteredDirectly() {
    if (!masteredLetters.includes(activeBaseFidel)) {
        masteredLetters.push(activeBaseFidel);
    }
    await _supabase.from('user_progress').upsert(
        { user_id: currentUser.id, mastered_letters: masteredLetters },
        { onConflict: 'user_id' }
    );
    showGobezToast(`Row "${activeBaseFidel}" saved to your mastered list!`);
    executeVictoryConfettiCelebration();
}

async function classroomUnmasterLetterRow() {
    masteredLetters = masteredLetters.filter(item => item !== activeBaseFidel);
    await _supabase.from('user_progress').upsert(
        { user_id: currentUser.id, mastered_letters: masteredLetters },
        { onConflict: 'user_id' }
    );
    showNotificationToast(`Removed "${activeBaseFidel}" from mastered rows.`);
}

function exitClassroomViewBackToGrid() {
    document.getElementById("isolatedFamilyClassroom").style.display = "none";
    document.getElementById("viewFidelGrid").style.display = "grid";
    buildMatrixInterfaceGrid();
}

// ---------------------------------------------------------------------------
// Progress + leaderboard + photo board
// ---------------------------------------------------------------------------

async function fetchUserProgress() {
    const { data } = await _supabase
        .from('user_progress')
        .select('mastered_letters')
        .eq('user_id', currentUser.id)
        .maybeSingle();
    if (data?.mastered_letters) masteredLetters = data.mastered_letters;
    renderUIProgressUpdates();
}

function renderUIProgressUpdates() {
    document.querySelectorAll('.fidel-card').forEach(card => {
        if (masteredLetters.includes(card.getAttribute('data-fidel'))) {
            card.classList.add('completed');
        }
    });
    const percent = Math.round((masteredLetters.length / 34) * 100);
    document.getElementById("progressBar").style.width = `${percent}%`;
    document.getElementById("progressText").innerText = `${percent}% Complete`;
}

async function renderLiveLeaderboard() {
    const { data: profiles } = await _supabase
        .from('public_profiles')
        .select('id, nickname, avatar');
    const { data: progressRecords } = await _supabase
        .from('user_progress')
        .select('user_id, mastered_letters');

    const progressMap = {};
    progressRecords?.forEach(rec => {
        progressMap[rec.user_id] = rec.mastered_letters || [];
    });

    const leaderList = (profiles || []).map(p => ({
        id: p.id,
        name: p.nickname,
        avatar: p.avatar || '🦁',
        percentage: Math.round(((progressMap[p.id] || []).length / 34) * 100)
    })).sort((a, b) => b.percentage - a.percentage);

    const container = document.getElementById("liveLeaderboardContent");
    container.innerHTML = "";

    if (leaderList.length === 0) {
        container.innerHTML = `<p style="font-size:12px; color:#94a3b8;">No one's started practicing yet!</p>`;
        return;
    }

    leaderList.forEach((player, idx) => {
        const isSelf = currentUser && player.id === currentUser.id;
        const isTopFive = idx < 5;
        const rowClasses = ['leaderboard-row'];
        if (isSelf) rowClasses.push('current-user');
        if (isTopFive) rowClasses.push('top-five');

        container.innerHTML += `
            <div class="${rowClasses.join(' ')}">
                <div class="player-info">
                    <span class="leaderboard-rank">#${idx + 1}</span>
                    <span>${player.avatar}</span>
                    <span>${player.name} ${isSelf ? '(You)' : ''}</span>
                </div>
                <span class="player-score-badge">${player.percentage}%</span>
            </div>`;
    });
}

async function fetchDisappearingImageCanvasBoard() {
    const currentISOTime = new Date().toISOString();
    const { data: activeShares } = await _supabase
        .from('photo_shares')
        .select('id, image_url, expires_at, meta_points, user_id, profiles(nickname, avatar)')
        .gt('expires_at', currentISOTime);

    const container = document.getElementById("disappearingArtGalleryFeed");
    container.innerHTML = "";

    if (!activeShares || activeShares.length === 0) {
        container.innerHTML = `<p style="font-size:12px; color:#94a3b8; grid-column:1/-1;">No shared sketches yet today. Use the drawing pad to share yours!</p>`;
        return;
    }

    activeShares.forEach(share => {
        const hoursLeft = Math.max(
            0,
            Math.round((new Date(share.expires_at) - new Date()) / (1000 * 60 * 60))
        );
        const item = document.createElement('div');
        item.className = "feed-item";
        const initialCount = share.meta_points || 0;
        const isOwner = currentUser && share.user_id === currentUser.id;
        const deleteBtn = isOwner
            ? `<button class="verify-badge-btn" style="color:#ef4444; border-color:#fecaca;"
                       onclick="deleteSharedDrawing('${share.id}', '${share.image_url}')">🗑️ Delete</button>`
            : '';

        item.innerHTML = `
            <img src="${share.image_url}">
            <div class="feed-meta">
                <div class="feed-meta-row">
                    <strong>${share.profiles?.avatar || '🦁'} ${share.profiles?.nickname || 'User'}</strong>
                    <span style="color:#ef4444;">${hoursLeft}h left</span>
                </div>
                <div class="feed-meta-row" style="margin-top:4px; gap:6px;">
                    <button class="verify-badge-btn" data-count="${initialCount}"
                            onclick="submitVerificationCounterBump('${share.id}', this)">
                        👍 Verify Form (${initialCount})
                    </button>
                    ${deleteBtn}
                </div>
            </div>`;
        container.appendChild(item);
    });
}

async function deleteSharedDrawing(shareId, imageUrl) {
    if (!confirm("Delete this drawing? This can't be undone.")) return;

    const pathMatch = imageUrl.match(/art_shares\/(.+)$/);
    const storagePath = pathMatch ? pathMatch[1] : null;

    const { error: dbError } = await _supabase
        .from('photo_shares')
        .delete()
        .eq('id', shareId);

    if (dbError) {
        console.error("Failed to delete photo_shares row:", dbError);
        return showNotificationToast("Couldn't delete: " + dbError.message);
    }

    if (storagePath) {
        const { error: storageError } = await _supabase.storage
            .from('art_shares')
            .remove([storagePath]);
        if (storageError) {
            console.error("Failed to delete storage file (row already removed):", storageError);
        }
    }

    showNotificationToast("Drawing deleted.");
    await fetchDisappearingImageCanvasBoard();
}

// ---------------------------------------------------------------------------
// Team roster sidebar
// ---------------------------------------------------------------------------

function getTeamColorInfo(teamName) {
    if (!teamName) return { hex: 'var(--brand-primary)', amharic: '' };
    if (teamName.includes('Red'))    return { hex: '#ef4444', amharic: 'ቀይ' };
    if (teamName.includes('Yellow')) return { hex: '#f59e0b', amharic: 'ቢጫ' };
    if (teamName.includes('Green'))  return { hex: '#22c55e', amharic: 'አረንጓዴ' };
    if (teamName.includes('Blue'))   return { hex: '#3b82f6', amharic: 'ሰማያዊ' };
    if (teamName.includes('Purple')) return { hex: '#a855f7', amharic: 'ሐምራዊ' };
    return { hex: 'var(--brand-primary)', amharic: '' };
}

function togglePodTeammates() {
    document.getElementById("podTeammatesMount").classList.toggle("open");
    document.getElementById("podToggleBtn").classList.toggle("open");
}

async function loadTeamDashboard(user) {
    const { data: userProfile } = await _supabase
        .from('profiles')
        .select('team_id, nickname, teams!profiles_team_id_fkey(name)')
        .eq('id', user.id)
        .single();

    const mount = document.getElementById("podTeammatesMount");
    const swatch = document.getElementById("podColorSwatch");
    const amharicEl = document.getElementById("podTeamAmharic");
    const headerRow = document.getElementById("podHeaderRow");
    const toggleBtn = document.getElementById("podToggleBtn");

    if (!userProfile?.team_id) {
        document.getElementById("podTeamNameDisplay").innerText = "Practicing Solo";
        if (amharicEl) amharicEl.innerText = "";
        if (swatch) swatch.style.background = "var(--brand-primary)";
        if (toggleBtn) toggleBtn.style.display = "none";
        headerRow.onclick = null;
        mount.classList.add("open");
        mount.innerHTML = `<p class="pod-solo-message">You're practicing solo — no team chat here, but you can still use Practice mode anytime!</p>`;
        return;
    }

    const teamName = userProfile.teams?.name || "Your Team";
    const colorInfo = getTeamColorInfo(teamName);

    document.getElementById("podTeamNameDisplay").innerText = teamName;
    if (amharicEl) amharicEl.innerText = colorInfo.amharic;
    if (swatch) swatch.style.background = colorInfo.hex;
    if (toggleBtn) toggleBtn.style.display = "block";
    headerRow.onclick = togglePodTeammates;

    const { data: members } = await _supabase
        .from('public_profiles')
        .select('nickname, avatar, team_id')
        .eq('team_id', userProfile.team_id);

    mount.innerHTML = "";
    (members || []).forEach(member => {
        const row = document.createElement('div');
        row.className = "teammate-row";
        row.innerHTML = `<span>${member.avatar || '🦁'} ${member.nickname}</span>`;
        mount.appendChild(row);
    });
}

// ---------------------------------------------------------------------------
// Save streak on page unload — fires even if browser tab is closed mid-game
// ---------------------------------------------------------------------------

window.addEventListener('beforeunload', () => {
    if (!activeChallengeContext || !currentUser) return;
    if (currentStreakScore <= 0) return;

    const payload = JSON.stringify({
        student_id: currentUser.id,
        base_letter: activeChallengeContext.baseLetter,
        level_number: activeChallengeContext.levelNumber,
        best_streak: currentStreakScore,
        streak_passed: currentStreakScore >= STREAK_THRESHOLD
    });

    // sendBeacon is reliable on page close; fetch/XHR gets cancelled
    navigator.sendBeacon(
        `${SUPABASE_URL}/rest/v1/student_family_progress?on_conflict=student_id,base_letter`,
        new Blob([payload], { type: 'application/json' })
    );
});

// ---------------------------------------------------------------------------
// Expose to inline onclick="" handlers in index.html
// (Auth functions exported from auth.js, game from game.js,
//  submissions from submissions.js, teacher from teacher.js)
// ---------------------------------------------------------------------------


window.openMatchingGameWorkspaceMode = openMatchingGameWorkspaceMode;
window.shuffleClassroomRowPhonetics = shuffleClassroomRowPhonetics;
window.classroomMarkAsMasteredDirectly = classroomMarkAsMasteredDirectly;
window.classroomUnmasterLetterRow = classroomUnmasterLetterRow;
window.clearSketchpadCanvas = clearSketchpadCanvas;
window.uploadSketchpadDrawingCanvasData = uploadSketchpadDrawingCanvasData;
window.exitClassroomViewBackToGrid = exitClassroomViewBackToGrid;
window.toggleDropdownElement = toggleDropdownElement;
window.submitVerificationCounterBump = submitVerificationCounterBump;
window.deleteSharedDrawing = deleteSharedDrawing;
window.showGobezToast = showGobezToast;
window.maybeShowStreakExplainer = maybeShowStreakExplainer;
window.executeVictoryConfettiCelebration = executeVictoryConfettiCelebration;

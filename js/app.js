const SUPABASE_URL = "https://muisfipoyzkhznfdvnes.supabase.co";
const SUPABASE_KEY = "sb_publishable_VBiJZB8TVM2CSl54aDPP0A_4aDXWb5i";
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const ADMIN_EMAIL = "senaitrichmond16@gmail.com";

// Shared with challenge.js — the matching-game streak required to mark a
// letter family as mastered in Fidel Challenge mode. See reasoning in
// fidel_challenge_schema.sql: high enough that guessing won't get a student
// through, low enough that one mis-tap doesn't erase several minutes of work.
const STREAK_THRESHOLD = 20;

// Teams used for random/balanced assignment + display.
// Keep these labels in sync with whatever you show in the UI elsewhere.
// NOTE: no longer used directly by any function — team membership now reads
// live from the `teams` table (see assignNextTeam, teacherRefreshConfigurationDropdowns).
// Kept only as a record of which teams exist; update via precreate_teams.sql
// in Supabase, not by editing this array.
const TEAMS = ["Red Team 🔴", "Blue Team 🔵", "Green Team 🟢", "Yellow Team 🟡", "Purple Team 🟣"];

let currentUser = null;
let currentProfile = null; // cached profile row: { id, email, nickname, avatar, team_id, is_admin, ... }
let masteredLetters = [];
let activeBaseFidel = null;
let activeFamilyArrayData = [];
let activeSubscriptsData = [];
let selectedAvatarSymbol = "🦁";
let isSignUpMode = true;
let isEditingProfile = false; // true when profileSetupScreen is being used to EDIT an existing profile, not create one

let activeGamePairs = [];
let selectedGameTokenId = null;
let currentStreakScore = 0;
let gameModeScope = "all";

// Set by challenge.js right before launching the shared matching game in
// Challenge mode. null = normal Practice-mode play (no persistence, no
// gating). When set, it looks like:
//   { baseLetter: 'ሀ', levelNumber: 1, onStreakPassed: async () => {...} }
// Cleared back to null whenever the player exits the game workspace.
let activeChallengeContext = null;

let canvas, ctx, isDrawing = false;

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
    // NOTE: the login button in index.html already has onclick="selectAuthFlow('login')"
    // wired inline, and there is no #loginBtn element in the page. Do NOT add a
    // getElementById('loginBtn') listener here — that element does not exist and
    // calling addEventListener on null throws, which silently kills every line of
    // JS that comes after it (this was the #1 bug that broke the whole app).

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

    // Supabase redirects back here with type=recovery in the URL after the
    // user clicks the reset link in their email, and briefly authenticates
    // them via that link's token so they can set a new password. The
    // unconditional signOut() below would kill that session immediately —
    // so check for this case FIRST and skip sign-out/reset-to-gate if so.
    const isPasswordRecovery = window.location.hash.includes('type=recovery');
    if (isPasswordRecovery) {
        document.getElementById('authScreen').style.display = 'none';
        document.getElementById('newPasswordScreen').style.display = 'block';
        return;
    }

    // Every page load starts fresh at the login screen. Explicitly sign out
    // (not just skip the check) so any stale/broken token left in
    // localStorage from a previous session is fully cleared — a lingering
    // bad token was a likely cause of persistent 403s that didn't match
    // what the RLS policies should have allowed.
    await _supabase.auth.signOut();
    resetToGate();
});

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function showNotificationToast(msg) {
    const container = document.getElementById("toastContainer");
    const element = document.createElement("div");
    element.className = "toast-popup";
    element.innerHTML = `<span>${msg}</span>`;
    container.appendChild(element);
    setTimeout(() => element.remove(), 3000);
}

function executeVictoryConfettiCelebration() {
    const confCanvas = document.getElementById("confettiCanvas");
    const confCtx = confCanvas.getContext("2d");
    confCanvas.width = window.innerWidth; confCanvas.height = window.innerHeight;
    let particles = [];
    const colorPalettes = ["#0f766e", "#0d9488", "#14b8a6", "#2563eb", "#334155"];

    for (let i = 0; i < 100; i++) {
        particles.push({
            x: window.innerWidth / 2, y: window.innerHeight / 1.5,
            vx: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.8) * 15,
            size: Math.random() * 6 + 3, color: colorPalettes[Math.floor(Math.random() * colorPalettes.length)],
            rotation: Math.random() * 360, rSpeed: Math.random() * 4 - 2
        });
    }

    function animateConfettiLoop() {
        if (particles.length === 0) return confCtx.clearRect(0, 0, confCanvas.width, confCanvas.height);
        confCtx.clearRect(0, 0, confCanvas.width, confCanvas.height);
        particles.forEach((p, idx) => {
            p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.rotation += p.rSpeed;
            confCtx.save(); confCtx.translate(p.x, p.y); confCtx.rotate((p.rotation * Math.PI) / 180);
            confCtx.fillStyle = p.color; confCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); confCtx.restore();
            if (p.y > confCanvas.height) particles.splice(idx, 1);
        });
        requestAnimationFrame(animateConfettiLoop);
    }
    animateConfettiLoop();
}

// told to add this
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
        <div style="background:white; border-radius:20px; padding:28px 24px; max-width:380px; width:100%; text-align:center; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <div style="font-size:40px; margin-bottom:12px;">🔥</div>
            <h2 style="font-size:20px; font-weight:800; color:#166534; margin-bottom:8px;">How the Streak Game Works</h2>
            <p style="font-size:14px; color:#475569; line-height:1.6; margin-bottom:16px;">
                Match each Amharic letter to its sound. Get <strong>20 correct in a row</strong> to pass.<br><br>
                Miss one and your streak resets to zero — so take your time and think before you tap!
            </p>
            <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:12px; padding:12px; margin-bottom:20px; font-size:13px; color:#92400e;">
                💡 Tip: Study the flashcards first, then play the game when you feel ready.
            </div>
            <button id="streakExplainerBtn" style="background:#166534; color:white; border:none; border-radius:12px; padding:14px; width:100%; font-size:15px; font-weight:700; cursor:pointer;">
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
// Sketchpad
// ---------------------------------------------------------------------------

function initSketchpadEngineSystem() {
    canvas = document.getElementById("sketchpad");
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.strokeStyle = "#1e293b";

    function getCoordinates(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    }
    function startDraw(e) { isDrawing = true; ctx.beginPath(); const c = getCoordinates(e); ctx.moveTo(c.x, c.y); }
    function draw(e) { if (!isDrawing) return; const c = getCoordinates(e); ctx.lineTo(c.x, c.y); ctx.stroke(); }
    function stopDraw() { isDrawing = false; }

    canvas.addEventListener("mousedown", startDraw);
    canvas.addEventListener("mousemove", draw);
    window.addEventListener("mouseup", stopDraw);
    canvas.addEventListener("touchstart", startDraw);
    canvas.addEventListener("touchmove", draw);
    window.addEventListener("touchend", stopDraw);
}

function clearSketchpadCanvas() { ctx.clearRect(0, 0, canvas.width, canvas.height); }

async function uploadSketchpadDrawingCanvasData() {
    const emptyCheck = document.createElement("canvas");
    emptyCheck.width = canvas.width; emptyCheck.height = canvas.height;
    if (canvas.toDataURL() === emptyCheck.toDataURL()) return showNotificationToast("Draw something before sharing!");

    showNotificationToast("Uploading your drawing...");
    canvas.toBlob(async (blob) => {
        const storagePath = `canvas-${Date.now()}.png`;
        const { data: uploadData, error: uploadError } = await _supabase.storage.from('art_shares').upload(storagePath, blob, { contentType: 'image/png' });
        if (uploadError) return showNotificationToast(uploadError.message);

        const { data: urlData } = _supabase.storage.from('art_shares').getPublicUrl(storagePath);
        const expirationTimestamp = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        await _supabase.from('photo_shares').insert({ user_id: currentUser.id, image_url: urlData.publicUrl, expires_at: expirationTimestamp, meta_points: 0 });
        clearSketchpadCanvas();
        showNotificationToast("Drawing shared to the class board!");
        fetchDisappearingImageCanvasBoard();
    }, "image/png");
}

async function submitVerificationCounterBump(shareId, element) {
    const currentVal = parseInt(element.getAttribute('data-count') || "0");
    const updatedVal = currentVal + 1;
    await _supabase.from('photo_shares').update({ meta_points: updatedVal }).eq('id', shareId);
    element.setAttribute('data-count', updatedVal);
    element.innerHTML = `👍 Verified (${updatedVal})`;
    showNotificationToast("Marked as verified!");
}

// ---------------------------------------------------------------------------
// Auth + onboarding
// ---------------------------------------------------------------------------

function resetToGate() {
    document.getElementById("authScreen").style.display = "block";
    document.getElementById("onboardingGate").style.display = "flex";
    document.getElementById("credentialFields").style.display = "none";
    document.getElementById("studentDashboard").style.display = "none";
    document.getElementById("teacherOnlyDashboard").style.display = "none";
    document.getElementById("adminViewSelectorGate").style.display = "none";

    const emailField = document.getElementById("email");
    const passwordField = document.getElementById("password");
    if (emailField) emailField.value = "";
    if (passwordField) passwordField.value = "";
}

function selectAuthFlow(flow) {
    isSignUpMode = (flow === 'signup');
    document.getElementById("onboardingGate").style.display = "none";
    document.getElementById("credentialFields").style.display = "block";
    updateAuthModeLabels();
}

// Lets someone flip between Sign Up and Log In without leaving the
// credentials screen — previously the only way to change their mind was a
// full page refresh, since there was no way back to the gate once a mode
// was chosen.
function switchAuthFlow() {
    isSignUpMode = !isSignUpMode;
    updateAuthModeLabels();
}

function updateAuthModeLabels() {
    const modeLabel = document.getElementById("credentialFieldsModeLabel");
    const switchPrompt = document.getElementById("switchModePrompt");
    const switchBtn = document.getElementById("switchModeBtn");

    if (isSignUpMode) {
        modeLabel.innerText = "Sign Up";
        switchPrompt.innerText = "Already have an account?";
        switchBtn.innerText = "Log In";
    } else {
        modeLabel.innerText = "Log In";
        switchPrompt.innerText = "New here?";
        switchBtn.innerText = "Sign Up";
    }
}

async function handleAuth() {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    if (!email || !password) return showNotificationToast("Please fill in all boxes.");

    showNotificationToast(isSignUpMode ? "Creating your account..." : "Logging in...");

    const { data, error } = isSignUpMode
        ? await _supabase.auth.signUp({ email, password })
        : await _supabase.auth.signInWithPassword({ email, password });

    console.log("Auth response:", { data, error });

    if (error) {
        console.error("Auth error:", error);
        return showNotificationToast(error.message);
    }

    // A user object can exist even when email confirmation is required and
    // there's no active session yet — checking data.user alone was the gap.
    // Without a real session, the next step (querying profiles) has no
    // valid auth.uid() to match against and silently stalls. Check for an
    // actual session explicitly before proceeding.
    if (data?.session && data?.user) {
        await proceedFlowMap(data.user);
    } else if (data?.user && !data?.session) {
        console.warn("User created but no session — email confirmation likely required:", data);
        showNotificationToast("Account created! Check your email to confirm, then log in.");
        resetToGate();
    } else {
        console.warn("Auth returned no error but no usable user/session:", data);
        showNotificationToast("Something went wrong creating your account. Please try again.");
        resetToGate();
    }
}

async function proceedFlowMap(user) {
    currentUser = user;
    const { data: profile, error: profileError } = await _supabase
        .from('profiles')
        .select('id, email, nickname, avatar, team_id, is_admin, is_captain')
        .eq('id', user.id)
        .maybeSingle();

    if (profileError) {
        console.error("Failed to load profile after auth:", profileError);
        showNotificationToast("Couldn't load your profile: " + profileError.message);
    }

    currentProfile = profile || null;

    if (currentUser.email === ADMIN_EMAIL) {
        document.getElementById("authScreen").style.display = "none";
        document.getElementById("adminViewSelectorGate").style.display = "block";
        return;
    }

    if (profile && profile.nickname) {
        selectedAvatarSymbol = profile.avatar || "🦁";
        document.getElementById("authScreen").style.display = "none";
        await applyProfileToHeader(profile);
        enterModeSelect();
    } else {
        // First-time setup: nickname + avatar only. Team is assigned automatically.
        isEditingProfile = false;
        document.getElementById("authScreen").style.display = "none";
        document.getElementById("profileSetupScreen").style.display = "block";
        prefillProfileSetupScreen(null);
    }
}

// Looks up the team name via team_id (the single source of team identity —
// shared by Practice mode's sidebar and Fidel Challenge's board header).
async function fetchTeamName(teamId) {
    if (!teamId) return null;
    const { data: team } = await _supabase.from('teams').select('name').eq('id', teamId).maybeSingle();
    return team?.name || null;
}

async function applyProfileToHeader(profile) {
    document.getElementById("displayUserHeader").innerText = profile.nickname;
    document.getElementById("displayAvatarHeader").innerText = profile.avatar || "🦁";

    const teamDisplay = document.getElementById("sidebarPodBadge");
    const teamName = await fetchTeamName(profile.team_id);

    if (teamName) {
        teamDisplay.innerText = teamName;
    } else {
        teamDisplay.innerText = "Practicing Solo";
    }
}

async function logout() {
    await _supabase.auth.signOut();
    currentUser = null;
    currentProfile = null;
    resetToGate();
}

// ---------------------------------------------------------------------------
// Password reset — kept deliberately simple: Supabase handles the actual
// token generation, email sending, and link expiry. We just trigger it and
// provide a screen for the user to set their new password once they return.
// ---------------------------------------------------------------------------

async function sendPasswordResetLink() {
    const email = document.getElementById('resetEmail').value.trim();
    if (!email) return showNotificationToast("Enter your email first.");

    const { error } = await _supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
    });

    if (error) {
        console.error("Password reset request failed:", error);
        return showNotificationToast("Couldn't send reset link: " + error.message);
    }

    showNotificationToast("Check your email for a reset link!");
}

async function saveNewPassword() {
    const newPassword = document.getElementById('newPasswordInput').value;
    if (!newPassword || newPassword.length < 6) {
        return showNotificationToast("Password must be at least 6 characters.");
    }

    const { error } = await _supabase.auth.updateUser({ password: newPassword });

    if (error) {
        console.error("Password update failed:", error);
        return showNotificationToast("Couldn't update password: " + error.message);
    }

    showNotificationToast("Password updated! Please log in.");
    await _supabase.auth.signOut();
    document.getElementById('newPasswordScreen').style.display = 'none';
    resetToGate();
}

// ---------------------------------------------------------------------------
// Profile setup / edit (shared screen, two modes)
// ---------------------------------------------------------------------------

function prefillProfileSetupScreen(profile) {
    const nameInput = document.getElementById("displayName");
    nameInput.value = profile?.nickname || "";

    const defaultAvatar = profile?.avatar || "🦁";
    selectedAvatarSymbol = defaultAvatar;
    document.querySelectorAll('.avatar-option').forEach(opt => {
        opt.classList.toggle('selected', opt.innerText.trim() === defaultAvatar);
    });

    // The team-vs-solo choice only applies at first signup. Once a student
    // has a profile, switching between team and solo is a bigger decision
    // than a quick nickname/avatar edit, so this section is hidden entirely
    // when editing an existing profile.
    const teamChoiceSection = document.getElementById("teamChoiceSection");
    if (teamChoiceSection) {
        teamChoiceSection.style.display = isEditingProfile ? "none" : "block";
    }

    const saveBtn = document.querySelector('#profileSetupScreen .btn-primary');
    if (saveBtn) saveBtn.innerText = isEditingProfile ? "Save Changes" : "Join the Classroom";
}

function selectAvatar(symbol, element) {
    document.querySelectorAll('.avatar-option').forEach(opt => opt.classList.remove('selected'));
    element.classList.add('selected');
    selectedAvatarSymbol = symbol;
}

// Called by the sidebar profile click (onclick="openProfileEdit()" in index.html).
function openProfileEdit() {
    if (!currentUser) return;
    isEditingProfile = true;

    document.getElementById("studentDashboard").style.display = "none";
    document.getElementById("teacherOnlyDashboard").style.display = "none";
    document.getElementById("profileSetupScreen").style.display = "block";

    prefillProfileSetupScreen(currentProfile);
}

async function saveProfileData(event) {
    const nameInput = document.getElementById("displayName").value.trim();
    const saveBtn = event ? event.target : document.querySelector('#profileSetupScreen .btn-primary');

    if (!nameInput) return showNotificationToast("Please enter a nickname.");

    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerText = "Saving..."; }

    const { data: { user } } = await _supabase.auth.getUser();

    const payload = {
        id: user.id,
        email: user.email,
        nickname: nameInput,
        avatar: selectedAvatarSymbol
    };

    // Only assign a team the FIRST time a profile is created, and only if
    // the student opted into team competition rather than solo practice.
    // Edits to nickname/avatar should never reshuffle an existing team.
    if (!isEditingProfile) {
        const wantsTeam = document.querySelector('input[name="teamChoice"]:checked')?.value !== 'solo';
        payload.team_id = wantsTeam ? await assignNextTeam() : null;
    }

    const { error } = await _supabase.from('profiles').upsert(payload);

    if (error) {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerText = isEditingProfile ? "Save Changes" : "Join the Classroom"; }
        console.error("Save Error:", error);
        return showNotificationToast("Error: " + error.message);
    }

    // Refresh local cache of the profile
    const { data: refreshedProfile } = await _supabase
        .from('profiles')
        .select('id, email, nickname, avatar, team_id, is_admin, is_captain')
        .eq('id', user.id)
        .maybeSingle();
    currentProfile = refreshedProfile || currentProfile;

    if (currentProfile) await applyProfileToHeader(currentProfile);

    document.getElementById("profileSetupScreen").style.display = "none";

    if (isEditingProfile) {
        showNotificationToast("Profile updated!");
        launchDashboard("student");
    } else {
        enterModeSelect();
    }

    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerText = "Save Changes"; }
}

// Picks whichever existing team has the fewest members, so signups stay
// balanced. This is the single source of team identity: Practice mode and
// Fidel Challenge both read from this same `teams` table via
// profiles.team_id, rather than each having their own notion of "team."
//
// NOTE: this function only ever SELECTs from teams, never INSERTs — team
// rows are created once via precreate_teams.sql, not on-the-fly during
// signup. Only the admin is allowed to insert into teams per RLS, so a
// student signing up would get a 403 if this tried to create a missing team.

async function assignNextTeam() {
    // Auto-assignment is disabled during the July cohort — teams are
    // manually arranged by the teacher. New signups default to solo
    // and get assigned via the teacher dashboard.
    showNotificationToast("You'll be assigned to a team by your teacher shortly!");
    return null;
}

    const teamIds = existingTeams.map(t => t.id);

    // Count current membership per team via profiles.team_id.
    const { data: students } = await _supabase.from('profiles').select('team_id');
    const counts = {};
    teamIds.forEach(id => { counts[id] = 0; });
    (students || []).forEach(s => { if (s.team_id && counts[s.team_id] !== undefined) counts[s.team_id]++; });

    return teamIds.reduce((a, b) => (counts[a] <= counts[b] ? a : b));
}

// ---------------------------------------------------------------------------
// Dashboard routing
// ---------------------------------------------------------------------------

function routeAdminTerminalDirectly(targetPanel) {
    document.getElementById("adminViewSelectorGate").style.display = "none";
    launchDashboard(targetPanel);
}

function switchAdminPanelsFromDashboard(targetPanel) {
    document.getElementById("studentDashboard").style.display = "none";
    document.getElementById("teacherOnlyDashboard").style.display = "none";
    launchDashboard(targetPanel);
}

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
        if (captainBtn) captainBtn.style.display = currentProfile?.is_captain ? "block" : "none";
    }
}

// ---------------------------------------------------------------------------
// Teacher dashboard, captain assignment, writing submission review, and
// team level progress/advancement have all moved to teacher.js — see that
// file (loaded after this one) for loadTeacherRosterData,
// removeStudentFromTeam, teacherRefreshConfigurationDropdowns,
// teacherAssignStudentToPod, populateCaptainTeamDropdown,
// populateCaptainStudentDropdown, setTeamCaptain, loadCurrentCaptains,
// loadTeacherWritingQueue, approveWritingSubmission, rejectWritingSubmission,
// checkAndUpdateTeamLevelCompletion, loadTeacherTeamProgress,
// loadTeamMembersForRoster, advanceTeamLevel, and toggleTeacherPanel.
// ---------------------------------------------------------------------------

// Read-only version of the team progress panel, shown to every student on
// the main dashboard — same underlying data (teams + team_level_status,
// both broadly readable per existing RLS policies), but no advance button,
// since marking a live quiz passed is teacher-only.
async function renderStudentTeamProgress() {
    const mount = document.getElementById("studentTeamProgressMount");
    if (!mount) return;
    mount.innerHTML = `<p style="color:#94a3b8; font-size:12px;">Loading...</p>`;

    const { data: teams } = await _supabase.from('teams').select('id, name, current_level, streak_count').order('name');
    if (!teams || teams.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:12px;">No teams yet.</p>`;
        return;
    }

    const { data: statusRows } = await _supabase.from('team_level_status').select('team_id, level_number, all_members_cleared, live_quiz_passed');

    mount.innerHTML = "";
    teams.forEach(team => {
        const status = (statusRows || []).find(s => s.team_id === team.id && s.level_number === team.current_level);
        const isReady = status?.all_members_cleared && !status?.live_quiz_passed;
        const isOwnTeam = currentProfile?.team_id === team.id;

        const row = document.createElement('div');
        row.className = `student-team-row ${isReady ? 'ready' : ''}`;
        row.innerHTML = `
            <span class="student-team-row-name">${team.name}${isOwnTeam ? ' (You)' : ''}</span>
            <span class="student-team-row-level">Level ${team.current_level} • 🔥${team.streak_count || 0}${isReady ? ' • Ready! 🎉' : ''}</span>
        `;
        mount.appendChild(row);
    });
}

// NOTE: advanceTeamLevel and toggleTeacherPanel have moved to teacher.js,
// alongside the rest of the teacher-dashboard-specific functions.

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function toggleDropdownElement(elementId) {
    document.getElementById(elementId).classList.toggle('open');
}

// ---------------------------------------------------------------------------
// Letter grid + matching game
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

    document.getElementById("classroomRowGameBtn").onclick = () => openMatchingGameWorkspaceMode(fidelObj);
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
    let layoutIndices = [0, 1, 2, 3, 4, 5, 6].sort(() => Math.random() - 0.5);
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
    if (!masteredLetters.includes(activeBaseFidel)) masteredLetters.push(activeBaseFidel);
    await _supabase.from('user_progress').upsert({ user_id: currentUser.id, mastered_letters: masteredLetters }, { onConflict: 'user_id' });
    showNotificationToast(`Row "${activeBaseFidel}" saved to your mastered list!`);
    executeVictoryConfettiCelebration();
}

async function classroomUnmasterLetterRow() {
    masteredLetters = masteredLetters.filter(item => item !== activeBaseFidel);
    await _supabase.from('user_progress').upsert({ user_id: currentUser.id, mastered_letters: masteredLetters }, { onConflict: 'user_id' });
    showNotificationToast(`Removed "${activeBaseFidel}" from mastered rows.`);
}

function exitClassroomViewBackToGrid() {
    document.getElementById("isolatedFamilyClassroom").style.display = "none";
    document.getElementById("viewFidelGrid").style.display = "grid";
    buildMatrixInterfaceGrid();
}

function openMatchingGameWorkspaceMode(scope) {
    gameModeScope = scope;
    document.getElementById("viewFidelGrid").style.display = "none";
    document.getElementById("isolatedFamilyClassroom").style.display = "none";
    document.getElementById("gameWorkspace").style.display = "block";

    const exitBtn = document.getElementById("gameExitActionBtn");

    if (activeChallengeContext) {
        // Challenge mode: exit always returns to the family picker, regardless
        // of whether this was launched from "all" or a specific row, since
        // Challenge mode never uses "all" — it's always one family at a time.
        document.getElementById("gameWorkspaceTitle").innerText = `Challenge: Row "${scope.base}"`;
        exitBtn.onclick = () => {
            document.getElementById("gameWorkspace").style.display = "none";
            activeChallengeContext = null;
            if (typeof returnToChallengeFamilyPicker === "function") returnToChallengeFamilyPicker();
        };
    } else if (scope === "all") {
        // Launched from the main Practice dashboard's "Matching Game" button.
        // Hide the WHOLE dashboard (header, pod card, sidebar) — not just the
        // grid sub-section — so this is genuinely full-screen, not a partial
        // state where the game appears underneath leftover dashboard chrome.
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
    generateNewGameRoundData();
}

function generateNewGameRoundData() {
    activeGamePairs = [];
    selectedGameTokenId = null;

    let structuralSelectionList = [];
    if (gameModeScope === "all") {
        let pool = [...alphabetData].sort(() => Math.random() - 0.5).slice(0, 4);
        pool.forEach(item => {
            let rIdx = Math.floor(Math.random() * 7);
            let sub = standardVowelSubscripts[rIdx];
            let phoneticString = (item.prefix === "h" || item.prefix === "ḥ") ? vowelFrameworkLabels[rIdx] : `${item.prefix}${sub}`;
            structuralSelectionList.push({ char: item.family[rIdx], matchKey: item.family[rIdx], displayTxt: item.family[rIdx], kind: "fidel" });
            structuralSelectionList.push({ char: item.family[rIdx], matchKey: item.family[rIdx], displayTxt: phoneticString, kind: "phonetic" });
        });
    } else {
        let indices = [0, 1, 2, 3, 4, 5, 6].sort(() => Math.random() - 0.5).slice(0, 4);
        indices.forEach(idx => {
            let sub = standardVowelSubscripts[idx];
            let phoneticString = (gameModeScope.prefix === "h" || gameModeScope.prefix === "ḥ") ? vowelFrameworkLabels[idx] : `${gameModeScope.prefix}${sub}`;
            structuralSelectionList.push({ char: gameModeScope.family[idx], matchKey: gameModeScope.family[idx], displayTxt: gameModeScope.family[idx], kind: "fidel" });
            structuralSelectionList.push({ char: gameModeScope.family[idx], matchKey: gameModeScope.family[idx], displayTxt: phoneticString, kind: "phonetic" });
        });
    }

    activeGamePairs = structuralSelectionList.sort(() => Math.random() - 0.5);
    renderErgonomicBlockGameElements();
}

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

function selectBlockTokenTrackElement(element, index) {
    if (element.classList.contains("resolved-pair") || element.classList.contains("match-flash")) return;
    const targetToken = activeGamePairs[index];

    if (selectedGameTokenId === null) {
        element.classList.add("active-selected");
        selectedGameTokenId = index;
    } else {
        if (selectedGameTokenId === index) {
            element.classList.remove("active-selected");
            selectedGameTokenId = null;
            return;
        }

        const absolutePriorElement = document.querySelector(`[data-index="${selectedGameTokenId}"]`);
        const priorToken = activeGamePairs[selectedGameTokenId];

        if (targetToken.matchKey === priorToken.matchKey && targetToken.kind !== priorToken.kind) {
            // Flash gold before resolving
            element.classList.remove("active-selected");
            absolutePriorElement.classList.remove("active-selected");
            element.classList.add("match-flash");
            absolutePriorElement.classList.add("match-flash");

            setTimeout(() => {
                element.className = "game-interactive-token resolved-pair";
                absolutePriorElement.className = "game-interactive-token resolved-pair";
                checkBlockGameCompletionState();
            }, 350);

            currentStreakScore++;
            document.getElementById("gameStreakValue").innerText = currentStreakScore;
            selectedGameTokenId = null;

            // Milestone toasts
            if (currentStreakScore === 5) showNotificationToast("🔥 5 in a row!");
            else if (currentStreakScore === 10) showGobezToast("10 streak — halfway there!");
            else if (currentStreakScore === 15) showGobezToast("15 streak — almost there!");
            else showNotificationToast("Match!");

            if (activeChallengeContext) {
                activeChallengeContext.onStreakUpdate?.(currentStreakScore);
                if (currentStreakScore >= STREAK_THRESHOLD) {
                    activeChallengeContext.onStreakPassed?.(currentStreakScore);
                }
            }
        } else {
            currentStreakScore = 0;
            document.getElementById("gameStreakValue").innerText = currentStreakScore;
            showNotificationToast("Not quite! Streak reset.");
            element.classList.remove("active-selected");
            absolutePriorElement.classList.remove("active-selected");
            selectedGameTokenId = null;
        }
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

// ---------------------------------------------------------------------------
// Flashcard self-study (shared engine)
// Used by: Practice mode's single-row screen, Fidel Challenge's family
// detail screen, and the full-alphabet "Study All Letters" button. Pure
// self-study — no streak tracking, no database writes, just a flip-to-
// reveal quiz. The screen is a single top-level element (#flashcardScreen)
// so it isn't trapped invisible inside whichever parent happens to be
// hidden, the same lesson learned from the #gameWorkspace nesting bug.
// ---------------------------------------------------------------------------

let flashcardDeck = [];
let flashcardIndex = 0;
let flashcardCloseCallback = null;

function buildFlashcardDeckForFamily(fidelObj) {
    const subs = (fidelObj.prefix === "h" || fidelObj.prefix === "ḥ")
        ? vowelFrameworkLabels
        : standardVowelSubscripts.map(sub => `${fidelObj.prefix}${sub}`);

    return fidelObj.family.map((char, idx) => ({ char, sound: subs[idx] }));
}

// Builds one big deck covering every letter in every family — used by the
// "Study All Letters" button on the main dashboard.
function buildFlashcardDeckForFullAlphabet() {
    let deck = [];
    alphabetData.forEach(fidelObj => {
        deck = deck.concat(buildFlashcardDeckForFamily(fidelObj));
    });
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

    document.getElementById("flashcardNextBtn").onclick = () => {
        flashcardIndex = (flashcardIndex + 1) % flashcardDeck.length;
        renderFlashcard();
    };
    document.getElementById("flashcardPrevBtn").onclick = () => {
        flashcardIndex = (flashcardIndex - 1 + flashcardDeck.length) % flashcardDeck.length;
        renderFlashcard();
    };
    document.getElementById("flashcardCloseBtn").onclick = closeFlashcardStudy;
}

function closeFlashcardStudy() {
    document.getElementById("flashcardScreen").style.display = "none";
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

// ---------------------------------------------------------------------------
// Writing submission (Fidel Challenge)
// Student picks photo upload OR sketchpad, submits a writing sample for a
// specific letter family, captain/teacher reviews it. Separate from the
// existing photo_shares social feed and its sketchpad — this writes to
// writing_submissions, scoped to one base_letter, with approve/reject status.
// ---------------------------------------------------------------------------

let writingSubmitContext = null; // { baseLetter, onSubmitted }
let writingSketchCtx = null;
let writingSketchDrawing = false;

function openWritingSubmitScreen(baseLetter, onClose) {
    writingSubmitContext = { baseLetter, onClose };

    document.getElementById("writingSubmitTitle").innerText = `Submit Writing: "${baseLetter}"`;
    document.getElementById("writingSubmitScreen").style.display = "block";
    document.getElementById("writingSketchpadArea").style.display = "none";
    document.getElementById("writingRejectionNote").style.display = "none";
    document.querySelectorAll('#writingSubmitScreen .mode-option').forEach(el => el.classList.remove('selected'));

    document.getElementById("writingChoiceUploadCard").onclick = () => {
        document.getElementById("writingPhotoInput").click();
    };
    document.getElementById("writingChoiceSketchCard").onclick = () => {
        document.querySelectorAll('#writingSubmitScreen .mode-option').forEach(el => el.classList.remove('selected'));
        document.getElementById("writingChoiceSketchCard").classList.add('selected');
        document.getElementById("writingSketchpadArea").style.display = "block";
        setTimeout(initWritingSketchpad, 50);
    };

    const photoInput = document.getElementById("writingPhotoInput");
    photoInput.value = "";
    photoInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            document.getElementById("writingChoiceUploadCard").classList.add('selected');
            submitWritingPhoto(file);
        }
    };

    document.getElementById("writingSketchClearBtn").onclick = clearWritingSketchpad;
    document.getElementById("writingSketchSubmitBtn").onclick = submitWritingSketch;

    document.getElementById("writingSubmitCloseBtn").onclick = closeWritingSubmitScreen;
}

function closeWritingSubmitScreen() {
    document.getElementById("writingSubmitScreen").style.display = "none";
    if (writingSubmitContext?.onClose) writingSubmitContext.onClose();
}

function initWritingSketchpad() {
    const canvas = document.getElementById("writingSketchpad");
    if (!canvas) return;
    writingSketchCtx = canvas.getContext("2d");
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    writingSketchCtx.lineWidth = 3;
    writingSketchCtx.lineCap = "round";
    writingSketchCtx.strokeStyle = "#1e293b";

    function getCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    }
    function start(e) { writingSketchDrawing = true; writingSketchCtx.beginPath(); const c = getCoords(e); writingSketchCtx.moveTo(c.x, c.y); }
    function draw(e) { if (!writingSketchDrawing) return; const c = getCoords(e); writingSketchCtx.lineTo(c.x, c.y); writingSketchCtx.stroke(); }
    function stop() { writingSketchDrawing = false; }

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", draw);
    window.addEventListener("mouseup", stop);
    canvas.addEventListener("touchstart", start);
    canvas.addEventListener("touchmove", draw);
    window.addEventListener("touchend", stop);
}

function clearWritingSketchpad() {
    const canvas = document.getElementById("writingSketchpad");
    if (writingSketchCtx && canvas) writingSketchCtx.clearRect(0, 0, canvas.width, canvas.height);
}

async function submitWritingPhoto(file) {
    showNotificationToast("Uploading your photo...");
const storagePath = `writing-${currentUser.id}-${encodeURIComponent(writingSubmitContext.baseLetter)}-${Date.now()}.png`;

    const { error: uploadError } = await _supabase.storage.from('art_shares').upload(storagePath, file, { contentType: file.type });
    if (uploadError) {
        console.error("Writing photo upload failed:", uploadError);
        return showNotificationToast("Upload failed: " + uploadError.message);
    }

    const { data: urlData } = _supabase.storage.from('art_shares').getPublicUrl(storagePath);
    await finalizeWritingSubmission(urlData.publicUrl);
}

async function submitWritingSketch() {
    const canvas = document.getElementById("writingSketchpad");
    const emptyCheck = document.createElement("canvas");
    emptyCheck.width = canvas.width;
    emptyCheck.height = canvas.height;
    if (canvas.toDataURL() === emptyCheck.toDataURL()) {
        return showNotificationToast("Draw something before submitting!");
    }

    showNotificationToast("Submitting your drawing...");
    canvas.toBlob(async (blob) => {
const storagePath = `writing-${currentUser.id}-${encodeURIComponent(writingSubmitContext.baseLetter)}-${Date.now()}.png`;
        const { error: uploadError } = await _supabase.storage.from('art_shares').upload(storagePath, blob, { contentType: 'image/png' });
        if (uploadError) {
            console.error("Writing sketch upload failed:", uploadError);
            return showNotificationToast("Upload failed: " + uploadError.message);
        }
        const { data: urlData } = _supabase.storage.from('art_shares').getPublicUrl(storagePath);
        await finalizeWritingSubmission(urlData.publicUrl);
    }, "image/png");
}

async function finalizeWritingSubmission(imageUrl) {
    const { error } = await _supabase.from('writing_submissions').insert({
        student_id: currentUser.id,
        base_letter: writingSubmitContext.baseLetter,
        image_url: imageUrl,
        status: 'pending'
    });

    if (error) {
        console.error("Failed to save writing submission:", error);
        return showNotificationToast("Couldn't submit: " + error.message);
    }

    showNotificationToast("Submitted! Your captain will review it soon. 🎉");
    closeWritingSubmitScreen();
}

// Fetches and renders the latest writing submission status for a family,
// shown on the family detail screen so a student knows where they stand.
async function renderWritingStatusForFamily(baseLetter) {
    const box = document.getElementById("challengeWritingStatusBox");

    const { data: submissions } = await _supabase
        .from('writing_submissions')
        .select('status, reviewer_note, submitted_at, image_url')
        .eq('student_id', currentUser.id)
        .eq('base_letter', baseLetter)
        .order('submitted_at', { ascending: false })
        .limit(3);

    if (!submissions || submissions.length === 0) {
        box.style.display = "none";
        return;
    }

    box.style.display = "block";
    const latest = submissions[0];

    let statusHTML = '';
    if (latest.status === 'approved') {
        statusHTML = `<div class="challenge-writing-status approved">✓ Your writing for "${baseLetter}" was approved!</div>`;
    } else if (latest.status === 'rejected') {
        statusHTML = `<div class="challenge-writing-status rejected">✗ Needs another try.${latest.reviewer_note ? `<br><strong>Captain's note:</strong> ${latest.reviewer_note}` : ''}</div>`;
    } else {
        statusHTML = `<div class="challenge-writing-status pending">⏳ Waiting for your captain to review.</div>`;
    }

    // Show history if there are older submissions
    if (submissions.length > 1) {
        const historyItems = submissions.slice(1).map(sub => {
            const date = new Date(sub.submitted_at).toLocaleDateString();
            const icon = sub.status === 'approved' ? '✓' : sub.status === 'rejected' ? '✗' : '⏳';
            const color = sub.status === 'approved' ? '#166534' : sub.status === 'rejected' ? '#991b1b' : '#92400e';
            return `<div style="font-size:11px; color:${color}; padding:3px 0; border-top:1px solid #f1f5f9; margin-top:4px;">
                ${icon} ${date}${sub.reviewer_note ? ` — "${sub.reviewer_note}"` : ''}
            </div>`;
        }).join('');

        statusHTML += `<div style="margin-top:8px;">${historyItems}</div>`;
    }

    box.innerHTML = statusHTML;
}

// ---------------------------------------------------------------------------
// Progress + leaderboard + photo board
// ---------------------------------------------------------------------------

async function fetchUserProgress() {
    const { data } = await _supabase.from('user_progress').select('mastered_letters').eq('user_id', currentUser.id).maybeSingle();
    if (data && data.mastered_letters) masteredLetters = data.mastered_letters;
    renderUIProgressUpdates();
}

function renderUIProgressUpdates() {
    document.querySelectorAll('.fidel-card').forEach(card => {
        if (masteredLetters.includes(card.getAttribute('data-fidel'))) card.classList.add('completed');
    });
    const percent = Math.round((masteredLetters.length / 34) * 100);
    document.getElementById("progressBar").style.width = `${percent}%`;
    document.getElementById("progressText").innerText = `${percent}% Complete`;
}

async function renderLiveLeaderboard() {
    const { data: profiles } = await _supabase.from('public_profiles').select('id, nickname, avatar');
    const { data: progressRecords } = await _supabase.from('user_progress').select('user_id, mastered_letters');

    const progressMap = {};
    progressRecords?.forEach(rec => { progressMap[rec.user_id] = rec.mastered_letters || []; });

    let leaderList = (profiles || []).map(p => ({
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

        container.innerHTML += `<div class="${rowClasses.join(' ')}"><div class="player-info"><span class="leaderboard-rank">#${idx + 1}</span><span>${player.avatar}</span><span>${player.name} ${isSelf ? '(You)' : ''}</span></div><span class="player-score-badge">${player.percentage}%</span></div>`;
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
        const hoursLeft = Math.max(0, Math.round((new Date(share.expires_at) - new Date()) / (1000 * 60 * 60)));
        const item = document.createElement('div');
        item.className = "feed-item";
        const initialCount = share.meta_points || 0;
        const isOwner = currentUser && share.user_id === currentUser.id;
        const deleteBtn = isOwner
            ? `<button class="verify-badge-btn" style="color:#ef4444; border-color:#fecaca;" onclick="deleteSharedDrawing('${share.id}', '${share.image_url}')">🗑️ Delete</button>`
            : '';
        item.innerHTML = `<img src="${share.image_url}"><div class="feed-meta"><div class="feed-meta-row"><strong>${share.profiles?.avatar || '🦁'} ${share.profiles?.nickname || 'User'}</strong><span style="color:#ef4444;">${hoursLeft}h left</span></div><div class="feed-meta-row" style="margin-top:4px; gap:6px;"><button class="verify-badge-btn" data-count="${initialCount}" onclick="submitVerificationCounterBump('${share.id}', this)">👍 Verify Form (${initialCount})</button>${deleteBtn}</div></div>`;
        container.appendChild(item);
    });
}

async function deleteSharedDrawing(shareId, imageUrl) {
    if (!confirm("Delete this drawing? This can't be undone.")) return;

    // Extract the storage path from the public URL so we can remove the
    // actual file, not just the database row pointing to it.
    const pathMatch = imageUrl.match(/art_shares\/(.+)$/);
    const storagePath = pathMatch ? pathMatch[1] : null;

    const { error: dbError } = await _supabase.from('photo_shares').delete().eq('id', shareId);
    if (dbError) {
        console.error("Failed to delete photo_shares row:", dbError);
        return showNotificationToast("Couldn't delete: " + dbError.message);
    }

    if (storagePath) {
        const { error: storageError } = await _supabase.storage.from('art_shares').remove([storagePath]);
        if (storageError) console.error("Failed to delete storage file (row already removed):", storageError);
    }

    showNotificationToast("Drawing deleted.");
    await fetchDisappearingImageCanvasBoard();
}

// ---------------------------------------------------------------------------
// Team roster sidebar
// ---------------------------------------------------------------------------

// Maps a team name to its display color and the Amharic word for that
// color, so the team card can show "ሰማያዊ" (semayawi) next to Blue Team,
// reinforcing real vocabulary rather than just decoration.
function getTeamColorInfo(teamName) {
    if (!teamName) return { hex: 'var(--brand-primary)', amharic: '' };
    if (teamName.includes('Red')) return { hex: '#ef4444', amharic: 'ቀይ' };
    if (teamName.includes('Yellow')) return { hex: '#f59e0b', amharic: 'ቢጫ' };
    if (teamName.includes('Green')) return { hex: '#22c55e', amharic: 'አረንጓዴ' };
    if (teamName.includes('Blue')) return { hex: '#3b82f6', amharic: 'ሰማያዊ' };
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
// Captain / work-approval system
// ---------------------------------------------------------------------------
// NOTE: kept intentionally unwired for now. Your `profiles` table currently
// has no `role` or `team_id` column, and `teams`/`work_submissions` tables
// aren't part of the active schema. These functions are left here so the
// feature can be wired up later without rewriting it from scratch, but
// nothing in the current UI calls them.

async function submitWorkForVerification(imageUrl) {
    const { data: profile } = await _supabase.from('profiles').select('team_id').eq('id', currentUser.id).single();

    await _supabase.from('work_submissions').insert({
        student_id: currentUser.id,
        team_id: profile.team_id,
        image_url: imageUrl,
        status: 'pending'
    });

    showNotificationToast("Work submitted to your Captain!");
}

async function approveStudentWork(submissionId) {
    const { data: team } = await _supabase.from('teams').select('captain_id').eq('captain_id', currentUser.id).maybeSingle();

    if (!team) {
        showNotificationToast("Only the Captain can approve work!");
        return;
    }

    await _supabase.from('work_submissions').update({ status: 'approved' }).eq('id', submissionId);
    showNotificationToast("Work approved! Progress updated.");
}

async function renderCaptainInbox() {
    const { data: submissions } = await _supabase
        .from('work_submissions')
        .select('*, profiles(nickname)')
        .eq('status', 'pending');

    const inboxContainer = document.getElementById('captainInboxMount');
    if (!inboxContainer) return;

    inboxContainer.innerHTML = `<h3>Pending Submissions</h3>`;

    (submissions || []).forEach(sub => {
        const div = document.createElement('div');
        div.className = 'submission-card';
        div.innerHTML = `
            <p>${sub.profiles.nickname} submitted work</p>
            <img src="${sub.image_url}" style="width:100px; height:100px;">
            <button onclick="approveStudentWork('${sub.id}')">Approve</button>
        `;
        inboxContainer.appendChild(div);
    });
}

async function checkMySubmissionStatus() {
    const { data: statusData } = await _supabase
        .from('work_submissions')
        .select('status')
        .eq('student_id', currentUser.id)
        .order('created_at', { ascending: false })
        .maybeSingle();

    const statusMount = document.getElementById('myStatusMount');
    if (!statusMount) return;

    if (statusData) {
        statusMount.innerHTML = `
            <div class="status-badge ${statusData.status}">
                Status: ${statusData.status.toUpperCase()}
            </div>
        `;
    }
}

// ---------------------------------------------------------------------------
// Save streak progress before page unload so a crash or accidental close
// doesn't wipe a student's best streak mid-game.
// ---------------------------------------------------------------------------
window.addEventListener('beforeunload', () => {
    if (!activeChallengeContext || !currentUser) return;
    if (currentStreakScore <= 0) return;

    // Use sendBeacon for reliability on page close — fetch/XHR gets cancelled
    // but sendBeacon fires even when the page is unloading.
    const payload = JSON.stringify({
        student_id: currentUser.id,
        base_letter: activeChallengeContext.baseLetter,
        level_number: activeChallengeContext.levelNumber,
        best_streak: currentStreakScore,
        streak_passed: currentStreakScore >= STREAK_THRESHOLD
    });

    // Supabase REST upsert via sendBeacon
    navigator.sendBeacon(
        `${SUPABASE_URL}/rest/v1/student_family_progress?on_conflict=student_id,base_letter`,
        new Blob([payload], { type: 'application/json' })
    );
});
// ---------------------------------------------------------------------------
// Expose functions used via inline onclick="" handlers in index.html
// ---------------------------------------------------------------------------

window.handleAuth = handleAuth;
window.selectAuthFlow = selectAuthFlow;
window.switchAuthFlow = switchAuthFlow;
window.resetToGate = resetToGate;
window.routeAdminTerminalDirectly = routeAdminTerminalDirectly;
window.selectAvatar = selectAvatar;
window.saveProfileData = saveProfileData;
window.switchAdminPanelsFromDashboard = switchAdminPanelsFromDashboard;
// NOTE: removeStudentFromTeam and teacherAssignStudentToPod are now
// exported from teacher.js, alongside the functions themselves.
window.logout = logout;
window.openMatchingGameWorkspaceMode = openMatchingGameWorkspaceMode;
window.shuffleClassroomRowPhonetics = shuffleClassroomRowPhonetics;
window.classroomMarkAsMasteredDirectly = classroomMarkAsMasteredDirectly;
window.classroomUnmasterLetterRow = classroomUnmasterLetterRow;
window.clearSketchpadCanvas = clearSketchpadCanvas;
window.uploadSketchpadDrawingCanvasData = uploadSketchpadDrawingCanvasData;
window.exitClassroomViewBackToGrid = exitClassroomViewBackToGrid;
window.openProfileEdit = openProfileEdit;
window.toggleDropdownElement = toggleDropdownElement;
window.submitVerificationCounterBump = submitVerificationCounterBump;
window.deleteSharedDrawing = deleteSharedDrawing;
window.approveStudentWork = approveStudentWork;

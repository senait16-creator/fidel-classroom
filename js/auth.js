// =============================================================================
// AUTH.JS
// Handles all authentication, profile setup/editing, onboarding overlays,
// and dashboard routing. Loads AFTER app.js — relies on globals defined there:
//   _supabase, SUPABASE_URL, ADMIN_EMAIL, currentUser, currentProfile,
//   selectedAvatarSymbol, isSignUpMode, isEditingProfile,
//   showNotificationToast, showGobezToast, enterModeSelect, launchDashboard
// =============================================================================

// ---------------------------------------------------------------------------
// Gate / reset
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

// ---------------------------------------------------------------------------
// Auth flow selection (Sign Up vs Log In toggle)
// ---------------------------------------------------------------------------

function selectAuthFlow(flow) {
    isSignUpMode = (flow === 'signup');
    document.getElementById("onboardingGate").style.display = "none";
    document.getElementById("credentialFields").style.display = "block";
    updateAuthModeLabels();
}

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

// ---------------------------------------------------------------------------
// Core auth handler
// ---------------------------------------------------------------------------

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
    // valid auth.uid() to match against and silently stalls.
    if (data?.session && data?.user) {
        await proceedFlowMap(data.user);
    } else if (data?.user && !data?.session) {
        console.warn("User created but no session — email confirmation likely required:", data);
        showNotificationToast("Account created! Check your email to confirm, then log in.");
        resetToGate();
    } else {
        console.warn("Auth returned no error but no usable user/session:", data);
        showNotificationToast("Something went wrong. Please try again.");
        resetToGate();
    }
}

// ---------------------------------------------------------------------------
// Post-auth routing
// ---------------------------------------------------------------------------

async function proceedFlowMap(user) {
    currentUser = user;

    const { data: profile, error: profileError } = await _supabase
        .from('profiles')
        .select('id, email, nickname, avatar, team_id, is_admin, is_captain, is_suspended')
        .eq('id', user.id)
        .maybeSingle();

    if (profileError) {
        console.error("Failed to load profile after auth:", profileError);
        showNotificationToast("Couldn't load your profile: " + profileError.message);
    }

    currentProfile = profile || null;

    // Suspended account check
    if (currentProfile?.is_suspended) {
        await _supabase.auth.signOut();
        showNotificationToast("Your account has been suspended. Please contact your teacher.");
        resetToGate();
        return;
    }

    // Admin routing
   if (currentUser.email === ADMIN_EMAIL) {
        document.getElementById("authScreen").style.display = "none";
        launchDashboard("teacher");
        return;
    }

    if (profile && profile.nickname) {
        selectedAvatarSymbol = profile.avatar || "🦁";
        document.getElementById("authScreen").style.display = "none";
        await applyProfileToHeader(profile);

        const modeGreetSub = document.getElementById('modeGreetingSub');
        if (modeGreetSub) {
            modeGreetSub.innerText = `Welcome back, ${profile.nickname}`;
        }

        enterModeSelect();

        setTimeout(() => {
            if (typeof maybeShowWordleOnLogin === 'function') maybeShowWordleOnLogin();
        }, 600);

    } else {
        isEditingProfile = false;
        document.getElementById("authScreen").style.display = "none";
        document.getElementById("profileSetupScreen").style.display = "block";
        prefillProfileSetupScreen(null);
    }
}
// ---------------------------------------------------------------------------
// Team name lookup (shared by header + challenge board)
// ---------------------------------------------------------------------------

async function fetchTeamName(teamId) {
    if (!teamId) return null;
    const { data: team } = await _supabase
        .from('teams')
        .select('name')
        .eq('id', teamId)
        .maybeSingle();
    return team?.name || null;
}

async function applyProfileToHeader(profile) {
    document.getElementById("displayUserHeader").innerText = profile.nickname;
    document.getElementById("displayAvatarHeader").innerText = profile.avatar || "🦁";

    const teamDisplay = document.getElementById("sidebarPodBadge");
    const teamName = await fetchTeamName(profile.team_id);
    teamDisplay.innerText = teamName || "Practicing Solo";
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

async function logout() {
    await _supabase.auth.signOut();
    currentUser = null;
    currentProfile = null;
    resetToGate();
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

async function sendPasswordResetLink() {
    const email = document.getElementById('resetEmail').value.trim();
    if (!email) return showNotificationToast("Enter your email first.");

    const { error } = await _supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://senait16-creator.github.io/fidel-classroom/'
    });

    if (error) return showNotificationToast("Couldn't send reset link: " + error.message);

    showNotificationToast("Reset link sent! Check your email.");
    document.getElementById("forgotPasswordScreen").style.display = "none";
    document.getElementById("authScreen").style.display = "flex";
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

    // Team-vs-solo choice only shown at first signup — not during profile edits
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
    const saveBtn = event
        ? event.target
        : document.querySelector('#profileSetupScreen .btn-primary');

    if (!nameInput) return showNotificationToast("Please enter a nickname.");

    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerText = "Saving..."; }

    const { data: { user } } = await _supabase.auth.getUser();

    const payload = {
        id: user.id,
        email: user.email,
        nickname: nameInput,
        avatar: selectedAvatarSymbol
    };

    // Only assign a team at first profile creation, never during edits
    if (!isEditingProfile) {
        const wantsTeam = document.querySelector('input[name="teamChoice"]:checked')?.value !== 'solo';
        payload.team_id = wantsTeam ? await assignNextTeam() : null;
    }

    const { error } = await _supabase.from('profiles').upsert(payload);

    if (error) {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerText = isEditingProfile ? "Save Changes" : "Join the Classroom";
        }
        console.error("Save Error:", error);
        return showNotificationToast("Error: " + error.message);
    }

    // Refresh local cache
    const { data: refreshedProfile } = await _supabase
        .from('profiles')
        .select('id, email, nickname, avatar, team_id, is_admin, is_captain, is_suspended')
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

// ---------------------------------------------------------------------------
// Team assignment
// Auto-assignment disabled for July cohort — teacher assigns manually.
// Re-enable by restoring the original balanced-assignment logic below.
// ---------------------------------------------------------------------------

async function assignNextTeam() {
    // July cohort: all new signups go Solo, teacher assigns via dashboard
    showNotificationToast("You'll be assigned to a team by your teacher shortly!");
    return null;

    // --- Original auto-assignment (restore when cohort structure changes) ---
    // const { data: existingTeams } = await _supabase.from('teams').select('id, name');
    // if (!existingTeams || existingTeams.length === 0) {
    //     showNotificationToast("No teams set up yet — ask your teacher.");
    //     return null;
    // }
    // const teamIds = existingTeams.map(t => t.id);
    // const { data: students } = await _supabase.from('profiles').select('team_id');
    // const counts = {};
    // teamIds.forEach(id => { counts[id] = 0; });
    // (students || []).forEach(s => {
    //     if (s.team_id && counts[s.team_id] !== undefined) counts[s.team_id]++;
    // });
    // return teamIds.reduce((a, b) => (counts[a] <= counts[b] ? a : b));
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

// ---------------------------------------------------------------------------
// First-time onboarding card
// Shows once ever (localStorage flag) when a user reaches mode select
// for the first time. Called from enterModeSelect() in challenge.js.
// ---------------------------------------------------------------------------

function showOnboardingCard() {
    const overlay = document.createElement('div');
    overlay.id = 'onboardingOverlay';
    overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.65);
        display: flex; align-items: center; justify-content: center;
        z-index: 99998; padding: 24px;
    `;
    overlay.innerHTML = `
        <div style="background:white; border-radius:20px; padding:32px 24px;
                    max-width:400px; width:100%; text-align:center;
                    box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <div style="font-size:36px; font-family:'Abyssinica SIL',serif;
                        font-weight:700; color:#166534; margin-bottom:4px;">ሰላም!</div>
            <h2 style="font-size:22px; font-weight:800; color:#1e293b; margin-bottom:8px;">
                Welcome to Fidel Classroom
            </h2>
            <p style="font-size:14px; color:#64748b; margin-bottom:22px; line-height:1.6;">
                Learn the Amharic alphabet and practice reading and writing!
            </p>

            <div style="text-align:left; display:flex; flex-direction:column; gap:14px; margin-bottom:22px;">
                <div style="display:flex; gap:12px; align-items:flex-start;">
                    <span style="font-size:24px; flex-shrink:0; margin-top:2px;">📖</span>
                    <div>
                        <strong style="font-size:14px; color:#166534; display:block; margin-bottom:3px;">
                            Practice the Fidel
                        </strong>
                        <p style="font-size:13px; color:#64748b; margin:0; line-height:1.5;">
                            Explore letters freely, use flashcards and the matching game at your own pace.
                        </p>
                    </div>
                </div>
                <div style="display:flex; gap:12px; align-items:flex-start;">
                    <span style="font-size:24px; flex-shrink:0; margin-top:2px;">🏆</span>
                    <div>
                        <strong style="font-size:14px; color:#166534; display:block; margin-bottom:3px;">
                            Fidel Challenge
                        </strong>
                        <p style="font-size:13px; color:#64748b; margin:0; line-height:1.5;">
                            Compete with your team. Play games, learn with others, and submit your handwriting for approval. The whole team advances together!
                        </p>
                    </div>
                </div>
                <div style="display:flex; gap:12px; align-items:flex-start;">
                    <span style="font-size:24px; flex-shrink:0; margin-top:2px;">📘</span>
                    <div>
                        <strong style="font-size:14px; color:#166534; display:block; margin-bottom:3px;">
                            Reading Path
                        </strong>
                        <p style="font-size:13px; color:#64748b; margin:0; line-height:1.5;">
                            Once you know the letters, start reading real full sentences.
                        </p>
                    </div>
                </div>
            </div>

            <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:12px;
                        padding:12px 14px; margin-bottom:20px; font-size:13px;
                        color:#92400e; text-align:left;">
                💡 <strong>New here?</strong> Start with <em>Practice the Fidel</em>
            </div>

            <button onclick="document.getElementById('onboardingOverlay').remove();"
                    style="background:#166534; color:white; border:none; border-radius:12px;
                           padding:14px; width:100%; font-size:15px; font-weight:700;
                           cursor:pointer;">
                Let's Go! ➜
            </button>
        </div>
    `;
    document.body.appendChild(overlay);
}

// ---------------------------------------------------------------------------
// Button wiring — password reset flow
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById("forgotPasswordBtn").onclick = () => {
        document.getElementById("authScreen").style.display = "none";
        document.getElementById("forgotPasswordScreen").style.display = "block";
    };

    document.getElementById("backToLoginFromForgotBtn").onclick = () => {
        document.getElementById("forgotPasswordScreen").style.display = "none";
        document.getElementById("authScreen").style.display = "flex";
    };

    document.getElementById("sendResetLinkBtn").onclick = sendPasswordResetLink;
    document.getElementById("saveNewPasswordBtn").onclick = saveNewPassword;
    document.getElementById("auth-btn").onclick = handleAuth;
});

// ---------------------------------------------------------------------------
// Auth state listener — handles PASSWORD_RECOVERY from email link
// ---------------------------------------------------------------------------

_supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
        document.querySelectorAll('body > div').forEach(el => el.style.display = 'none');
        document.getElementById("newPasswordScreen").style.display = "block";
        return;
    }

    if (event === 'SIGNED_IN' && session?.user) {
        const authScreen = document.getElementById("authScreen");
        if (authScreen && authScreen.style.display !== "none") {
            await proceedFlowMap(session.user);
        }
    }
});

// ---------------------------------------------------------------------------
// Expose to inline onclick="" handlers in index.html
// ---------------------------------------------------------------------------

window.resetToGate = resetToGate;
window.selectAuthFlow = selectAuthFlow;
window.switchAuthFlow = switchAuthFlow;
window.handleAuth = handleAuth;
window.logout = logout;
window.selectAvatar = selectAvatar;
window.openProfileEdit = openProfileEdit;
window.saveProfileData = saveProfileData;
window.routeAdminTerminalDirectly = routeAdminTerminalDirectly;
window.switchAdminPanelsFromDashboard = switchAdminPanelsFromDashboard;
window.showOnboardingCard = showOnboardingCard;

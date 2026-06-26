// 1. All your IMPORTS go at the very top
import { SUPABASE_URL } from './config.js';
import { initSketchpad } from './game.js';
import { handleAuth } from './auth.js';
import { showScreen } from './ui.js';
// js/app.js
import { handleAuth, selectAuthFlow } from './auth.js';
// js/app.js
import { supabase } from './supabaseClient.js';
import { updateAuthState } from './state.js';
// 1. All your IMPORTS go at the very top
import { SUPABASE_URL } from './config.js';
import { supabase } from './supabaseClient.js';
import { updateAuthState } from './state.js';
import { handleAuth, selectAuthFlow } from './auth.js';
import { initSketchpad } from './game.js';
import { showScreen } from './ui.js';


// This runs automatically whenever the user logs in or out
supabase.auth.onAuthStateChange((event, session) => {
    console.log("Auth event:", event);
    updateAuthState(session?.user ?? null);
});

// Check status immediately on load
const { data: { session } } = await supabase.auth.getSession();
updateAuthState(session?.user ?? null);

// This makes the functions available to your HTML buttons
window.handleAuth = handleAuth;
window.selectAuthFlow = selectAuthFlow;

console.log("App initialized and modules loaded.");

// When the app starts, show only the login screen
document.addEventListener('DOMContentLoaded', () => {
    showScreen('authScreen');
});

// Now your app.js can "talk" to your functions
window.handleAuth = handleAuth;

// 2. Then, your logic
console.log("The Brain is connected!");
console.log("Supabase URL is:", SUPABASE_URL);

// 3. Then, your initialization functions
initSketchpad();
// --- CONFIGURATION & STATE ---
const SUPABASE_URL = "https://muisfipoyzkhznfdvnes.supabase.co"; 
const SUPABASE_KEY = "sb_publishable_VBiJZB8TVM2CSl54aDPP0A_4aDXWb5i";
// Note: Ensure 'supabase' is imported or initialized from your supabaseClient.js
// If you use the client from your supabaseClient.js, replace _supabase below with the imported one.
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const ADMIN_EMAIL = "senaitrichmond16@gmail.com";
const CLASSROOM_COLORS = ["Red Team 🔴", "Blue Team 🔵", "Green Team 🟢", "Yellow Team 🟡", "Purple Team 🟣"];

let currentUser = null; 
let masteredLetters = []; 
let activeBaseFidel = null; 
let activeFamilyArrayData = []; 
let activeSubscriptsData = []; 
let selectedAvatarSymbol = "🦁"; 
let isSignUpMode = true;

let activeGamePairs = []; 
let selectedGameTokenId = null; 
let currentStreakScore = 0;
let gameModeScope = "all";

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

// 2. Initialization Logic
// Watch for login/logout changes
supabase.auth.onAuthStateChange((event, session) => {
    console.log("Auth event:", event);
    updateAuthState(session?.user ?? null);
});

// Check current status on load
(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    updateAuthState(session?.user ?? null);
})();

// 3. Make functions available to HTML (The "Bridge")
window.handleAuth = handleAuth;
window.selectAuthFlow = selectAuthFlow;

// 4. App Start
document.addEventListener('DOMContentLoaded', () => {
    console.log("The Brain is connected! Supabase URL:", SUPABASE_URL);
    showScreen('authScreen');
    initSketchpad();
});
// --- PROFILE & UI FUNCTIONS ---

function showNotificationToast(msg) {
    const container = document.getElementById("toastContainer");
    const element = document.createElement("div");
    element.className = "toast-popup";
    element.innerHTML = `<span>${msg}</span>`;
    container.appendChild(element);
    setTimeout(() => element.remove(), 3000);
}

// --- AUTHENTICATION & FLOW ---
async function handleAuth() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    let { data, error } = isSignUpMode 
        ? await _supabase.auth.signUp({ email, password })
        : await _supabase.auth.signInWithPassword({ email, password });

    if (error) return showNotificationToast(error.message);

    currentUser = data.user;
    
    const { data: profile } = await _supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
    
    if (profile) {
        launchDashboard(currentUser.email === ADMIN_EMAIL ? "teacher" : "student");
    } else {
        document.getElementById("authScreen").style.display = "none";
        document.getElementById("profileSetupScreen").style.display = "block";
        populateTeamSetupDropdownOptions();
    }
}

async function proceedFlowMap(user) {
    currentUser = user;
    const { data: profile } = await _supabase.from('profiles').select('display_name, avatar_character, team_color').eq('id', user.id).maybeSingle();

    if (currentUser.email === ADMIN_EMAIL) {
        document.getElementById("authScreen").style.display = "none";
        document.getElementById("adminViewSelectorGate").style.display = "block";
        return;
    }

    if (profile && profile.display_name) {
        selectedAvatarSymbol = profile.avatar_character;
        document.getElementById("displayUserHeader").innerText = profile.display_name;
        document.getElementById("displayAvatarHeader").innerText = profile.avatar_character;
        document.getElementById("sidebarPodBadge").innerText = profile.team_color || "No Team Assigned";
        launchDashboard("student");
    } else {
        document.getElementById("authScreen").style.display = "none";
        document.getElementById("profileSetupScreen").style.display = "block";
        populateTeamSetupDropdownOptions();
    }
}

// --- TEACHER & SUBMISSION LOGIC ---
async function loadTeacherRosterData() {
    const tbody = document.getElementById("teacherRosterTableBody");
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="3">Loading...</td></tr>';
    const { data: students } = await _supabase.from('profiles').select('id, display_name, avatar_character, team_color');
    const { data: progress } = await _supabase.from('user_progress').select('user_id, mastered_letters');

    const progressMap = {};
    progress?.forEach(rec => { progressMap[rec.user_id] = rec.mastered_letters || []; });

    tbody.innerHTML = '';
    students?.forEach(s => {
        const masteredCount = (progressMap[s.id] || []).length;
        tbody.innerHTML += `<tr><td>${s.avatar_character} ${s.display_name}</td><td>${s.team_color}</td><td>${masteredCount} complete</td></tr>`;
    });
}

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
async function saveProfileData() {
    const nameInput = document.getElementById("displayName").value.trim();
    const teamSelection = document.getElementById("profileTeamSelect").value; 
    
    if (!nameInput) return showNotificationToast("Please enter a nickname.");

    try {
        const { error } = await _supabase.from('profiles').upsert({ 
            id: currentUser.id, 
            display_name: nameInput, 
            avatar_character: selectedAvatarSymbol,
             
        });
        
        if (error) throw error;
        launchDashboard("student");
    } catch (err) {
        showNotificationToast("Database update error: " + err.message);
    }
}

function launchDashboard(role) {
    document.getElementById("authScreen").style.display = "none";
    document.getElementById("profileSetupScreen").style.display = "none";
    document.getElementById("adminViewSelectorGate").style.display = "none";
    
    if (role === "teacher") {
        document.getElementById("teacherOnlyDashboard").style.display = "block";
        document.getElementById("studentDashboard").style.display = "none";
    } else {
        document.getElementById("teacherOnlyDashboard").style.display = "none";
        document.getElementById("studentDashboard").style.display = "block";
        initSketchpadEngineSystem();
        // Ensure renderFidelGrid() is defined elsewhere in your game.js or here
        if (typeof renderFidelGrid === 'function') renderFidelGrid();
    }
}

function populateTeamSelect() {
    const select = document.getElementById("profileTeamSelect");
    if (!select) return;
    select.innerHTML = ""; 
    CLASSROOM_COLORS.forEach(team => {
        let opt = document.createElement("option");
        opt.value = team;
        opt.innerHTML = team;
        select.appendChild(opt);
    });
}

// --- DASHBOARD & NAVIGATION ---
function launchDashboard(role) {
    document.getElementById("authScreen").style.display = "none";
    document.getElementById("profileSetupScreen").style.display = "none";
    document.getElementById("adminViewSelectorGate").style.display = "none";
    
    if (role === "teacher") {
        document.getElementById("teacherOnlyDashboard").style.display = "block";
        document.getElementById("studentDashboard").style.display = "none";
    } else {
        document.getElementById("teacherOnlyDashboard").style.display = "none";
        document.getElementById("studentDashboard").style.display = "block";
        initSketchpadEngineSystem();
        if (typeof renderFidelGrid === 'function') renderFidelGrid();
    }
}

// --- SKETCHPAD ENGINE ---
function initSketchpadEngineSystem() {
    canvas = document.getElementById("sketchpad");
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    ctx.lineWidth = 3; 
    ctx.lineCap = "round"; 
    ctx.strokeStyle = "#1e293b";

    // Only add event listeners once
    canvas.addEventListener("mousedown", startDraw); 
    canvas.addEventListener("mousemove", draw); 
    window.addEventListener("mouseup", stopDraw);
    canvas.addEventListener("touchstart", startDraw); 
    canvas.addEventListener("touchmove", draw); 
    window.addEventListener("touchend", stopDraw);
}

function getCoordinates(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
}

function startDraw(e) { isDrawing = true; ctx.beginPath(); const coords = getCoordinates(e); ctx.moveTo(coords.x, coords.y); }
function draw(e) { if (!isDrawing) return; const coords = getCoordinates(e); ctx.lineTo(coords.x, coords.y); ctx.stroke(); }
function stopDraw() { isDrawing = false; }
function clearSketchpadCanvas() { ctx.clearRect(0, 0, canvas.width, canvas.height); }

// --- DATA HANDLING ---
function populateTeamSelect() {
    const select = document.getElementById("profileTeamSelect");
    if(!select) return;
    select.innerHTML = "";
    CLASSROOM_COLORS.forEach(team => {
        let opt = document.createElement("option");
        opt.value = team;
        opt.innerHTML = team;
        select.appendChild(opt);
    });
}

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
        if(typeof fetchDisappearingImageCanvasBoard === 'function') fetchDisappearingImageCanvasBoard();
    }, "image/png");
}

window.saveProfileData = saveProfileData;
window.loadTeacherRoster = loadTeacherRoster;
window.teacherAssignStudentToPod = teacherAssignStudentToPod;
window.initTeacherDashboard = initTeacherDashboard;
window.handleAuth = handleAuth;
window.submitWorkForVerification = submitWorkForVerification;
window.approveStudentWork = approveStudentWork; // (Ensure you have this function defined)

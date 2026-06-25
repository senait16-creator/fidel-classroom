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

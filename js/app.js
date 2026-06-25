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

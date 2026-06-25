export function handleAuth() {
    console.log("Login button clicked!");
    // Your Supabase logic goes here
}
// js/auth.js
export function handleAuth() {
    console.log("Auth logic triggered!");
    // Your actual Supabase logic will go here later.
    // For now, this confirms your button is connected to the module.
    alert("Check the console—the module is working!");
}

export function selectAuthFlow(type) {
    console.log("Selected flow:", type);
    // Logic to show/hide email/password fields
}

// js/auth.js
import { supabase } from './supabaseClient.js';

export async function handleAuth() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
    });
    
    if (error) console.error("Error:", error.message);
    else console.log("Success:", data);
}

import { supabase } from './supabaseClient.js';

export async function handleAuth() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    // Check if you are in sign up mode (define this variable globally if needed)
    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
    });
    
    if (error) {
        console.error("Error:", error.message);
    } else {
        console.log("Success:", data);
    }
}

export function selectAuthFlow(type) {
    console.log("Selected flow:", type);
    // Logic to show/hide fields
    document.getElementById("onboardingGate").style.display = "none";
    document.getElementById("credentialFields").style.display = "block";
}

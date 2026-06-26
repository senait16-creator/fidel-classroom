// 1. IMPORT ONLY THE NECESSARY MODULES
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// 2. CONFIGURE THE CONNECTION
// Keep your URL and Key at the very top so they are easy to find
const SUPABASE_URL = "https://muisfipoyzkhznfdvnes.supabase.co"; 
const SUPABASE_KEY = "sb_publishable_VBiJZB8TVM2CSl54aDPP0A_4aDXWb5i";

// 3. INITIALIZE THE CLIENT
// This variable is now your "Golden Key" to the database
export const _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log("Supabase Client initialized successfully.");

//Everything under this


// 1. All your IMPORTS go at the very top
import { SUPABASE_URL } from './config.js';
import { initSketchpad } from './game.js';

// 2. Then, your logic
console.log("The Brain is connected!");
console.log("Supabase URL is:", SUPABASE_URL);

// 3. Then, your initialization functions
initSketchpad();

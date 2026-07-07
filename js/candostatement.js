// =============================================================================
// CANDOSTATEMENTS.JS — the Can-Do Statement model for Guided Course.
//
// Design: statement CONTENT lives here as a plain config array (same pattern
// as alphabetData, WORDLE_PHRASES, VERSE_LIBRARY, EXPLORE_CATEGORIES) so
// adding/reordering/editing statements never needs a migration. Only actual
// STUDENT PROGRESS — which statements a student has self-assessed or been
// verified on — lives in Supabase (can_do_progress table).
//
// Each statement has three possible states, tracked per (student, statement):
//   not_started   — ⬜ default, nothing recorded yet
//   self_assessed — 🟡 the student marked "I think I can" — or the app
//                     pre-filled it for statements it can already tell are
//                     probably true (verification:'auto', e.g. mastered
//                     all 34 letters)
//   verified      — 🟢 a teacher gave the final confirmation. Always. No
//                     status ever reaches 'verified' without that,
//                     including the 'auto' statements above.
//
// A student can never set their own row to 'verified' directly — that's
// enforced at the database level (see the RLS policies delivered alongside
// this file), not just in this UI, so the state can't be spoofed by editing
// client-side code.
//
// Loads AFTER: app.js.
// =============================================================================

let canDoStatementsCache = null;

async function fetchCanDoStatements() {
    if (canDoStatementsCache) return canDoStatementsCache;

    const { data, error } = await _supabase
        .from('can_do_statements')
        .select('key, level_number, lesson_order, category, text, verification, order_index, icon, xp_reward')
        .eq('is_active', true)
        .order('level_number', { ascending: true })
        .order('order_index', { ascending: true });

    if (error) {
        console.error("Failed to load Can-Do statements:", error);
        showNotificationToast("Couldn't load Can-Do statements.");
        return [];
    }

    canDoStatementsCache = data || [];
    return canDoStatementsCache;
}

// ---------------------------------------------------------------------------
// Progress loading
// ---------------------------------------------------------------------------

async function loadCanDoProgressMap() {
    const { data } = await _supabase
        .from('can_do_progress')
        .select('statement_key, status')
        .eq('student_id', currentUser.id);

    const map = {};
    (data || []).forEach(row => { map[row.statement_key] = row.status; });
    return map;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function candoStatusPill(status) {
    if (status === 'verified')      return `<span class="candoo-status-pill verified">🟢 Verified</span>`;
    if (status === 'self_assessed') return `<span class="candoo-status-pill self-assessed">🟡 Self-Assessed</span>`;
    return `<span class="candoo-status-pill not-started">⬜ Not Started</span>`;
}

// Auto-assess path — statements the app can already tell are probably
// true. Pre-fills self_assessed (never verified — the database won't
// allow a student-owned write to set 'verified' regardless of what this
// code sends) so it lands in the teacher's queue automatically instead
// of waiting on the student to tap "I think I can" themselves.
async function loadCanDoProgressMapWithAutoCheck() {
    const progressMap = await loadCanDoProgressMap();

    const { data: progressRow } = await _supabase
        .from('user_progress')
        .select('mastered_letters')
        .eq('user_id', currentUser.id)
        .maybeSingle();
    const autoCheckContext = { masteredLettersCount: (progressRow?.mastered_letters || []).length };

    for (const statement of CAN_DO_STATEMENTS) {
        if (statement.verification !== 'auto') continue;
        if (progressMap[statement.key]) continue; // already self_assessed or verified
        if (statement.autoCheck(autoCheckContext)) {
            await _supabase.from('can_do_progress').upsert({
                student_id: currentUser.id,
                statement_key: statement.key,
                status: 'self_assessed',
                self_assessed_at: new Date().toISOString()
            }, { onConflict: 'student_id,statement_key' });
            progressMap[statement.key] = 'self_assessed';
        }
    }

    return progressMap;
}

// Shared renderer — used by both the full Can-Do Statements screen and
// the per-chapter "Chapter Goals" card (My Amharic Path), which passes a
// categoryFilter so only that chapter's related statements show up.
async function renderCanDoRows(targetId, categoryFilter) {
    const mount = document.getElementById(targetId);
    if (!mount) return;
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading...</p>`;

    const progressMap = await loadCanDoProgressMapWithAutoCheck();
    const statements = categoryFilter
    ? CAN_DO_STATEMENTS.filter(s => s.category === categoryFilter)
    : CAN_DO_STATEMENTS;
    const categories = [...new Set(statements.map(s => s.category))];

    mount.innerHTML = categories.map(category => {
        const rows = statements.filter(s => s.category === category).map(statement => {
            const status = progressMap[statement.key] || 'not_started';
            const actionHTML = status === 'not_started'
                ? `<button type="button" class="candoo-assess-btn" onclick="selfAssessCanDo('${statement.key}', '${targetId}', ${categoryFilter ? `'${categoryFilter}'` : 'null'})">I think I can</button>`
                : '';
            return `
                <div class="candoo-row">
                    <span class="candoo-text">${statement.text}</span>
                    <div class="candoo-row-right">
                        ${candoStatusPill(status)}
                        ${actionHTML}
                    </div>
                </div>`;
        }).join('');

        return `
            <div class="candoo-category">
                <div class="candoo-category-title">${category}</div>
                ${rows}
            </div>`;
    }).join('');
}

function renderCanDoScreen(targetId = 'canDoStatementsMount') {
    return renderCanDoRows(targetId, null);
}

async function selfAssessCanDo(statementKey, targetId, categoryFilter) {
    const { error } = await _supabase.from('can_do_progress').upsert({
        student_id: currentUser.id,
        statement_key: statementKey,
        status: 'self_assessed',
        self_assessed_at: new Date().toISOString()
    }, { onConflict: 'student_id,statement_key' });

    if (error) return showNotificationToast("Couldn't save: " + error.message);

    showGobezToast('Marked as self-assessed!');
    renderCanDoRows(targetId, categoryFilter || null);
}

// ---------------------------------------------------------------------------
// Entry / exit
// ---------------------------------------------------------------------------

function chooseModeCanDo() {
    if (typeof closeHamburgerMenu === 'function') closeHamburgerMenu();
    showScreen("canDoScreen");
    renderCanDoScreen();
}

function exitCanDo() {
    const screen = document.getElementById("canDoScreen");
    if (screen) screen.style.display = "none";
    if (typeof enterModeSelect === "function") enterModeSelect();
}

// ---------------------------------------------------------------------------
// Expose
// ---------------------------------------------------------------------------

window.renderCanDoScreen  = renderCanDoScreen;
window.renderCanDoRows    = renderCanDoRows;
window.selfAssessCanDo    = selfAssessCanDo;
window.chooseModeCanDo    = chooseModeCanDo;
window.exitCanDo          = exitCanDo;

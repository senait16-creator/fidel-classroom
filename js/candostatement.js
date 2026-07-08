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

const CAN_DO_STATEMENTS = [
    { key: 'intro_self',          category: 'Introductions',    text: 'I can introduce myself.',                       verification: 'speaking' },
    { key: 'ask_name',            category: 'Introductions',    text: "I can ask someone's name.",                     verification: 'speaking' },
    { key: 'describe_family',     category: 'Family & Daily Life', text: 'I can describe my family.',                  verification: 'speaking' },
    { key: 'order_coffee',        category: 'Family & Daily Life', text: 'I can order coffee.',                        verification: 'speaking' },
    { key: 'short_conversation',  category: 'Conversation',     text: 'I can hold a short conversation.',              verification: 'speaking' },
    { key: 'daily_question',      category: 'Conversation',     text: 'I can answer the Question of the Day.',        verification: 'speaking' },
    { key: 'talk_about_yesterday',category: 'Past Tense',       text: 'I can talk about what I did yesterday.',        verification: 'speaking' },
    { key: 'describe_my_day',     category: 'Past Tense',       text: 'I can describe my day, start to finish.',       verification: 'speaking' },
    {
        // "auto" means the app can already tell this is probably true — it
        // pre-fills self_assessed automatically instead of making the
        // student tap "I think I can" themselves. It still goes through
        // the teacher queue for the final ✓, same as every other
        // statement — the database enforces that no status ever reaches
        // 'verified' without a teacher, no exceptions for this either.
        key: 'read_fidel', category: 'Alphabet', text: 'I can read all Fidel.', verification: 'auto',
        autoCheck: (ctx) => ctx.masteredLettersCount >= 34
    },
    { key: 'write_fidel',         category: 'Alphabet',         text: 'I can write basic Fidel letters.',              verification: 'speaking' }
];

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

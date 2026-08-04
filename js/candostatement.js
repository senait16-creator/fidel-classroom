// =============================================================================
// CANDOSTATEMENTS.JS — the Can-Do Statement model for Guided Course.
//
// Design: statement CONTENT lives here as a plain config array (same pattern
// as alphabetData, WORDLE_PHRASES, VERSE_LIBRARY, EXPLORE_CATEGORIES) so
// adding/reordering/editing statements never needs a migration. Only actual
// STUDENT PROGRESS lives in Supabase (can_do_progress table).
//
// Self-report only — a student checks a statement off themselves, no
// teacher confirmation step. Two states per (student, statement):
//   not_started   — ⬜ no row in can_do_progress yet
//   self_assessed — ✅ the student checked it — or the app pre-filled it
//                     for statements it can already tell are probably true
//                     (verification:'auto', e.g. mastered all 34 letters)
//
// Unchecking deletes the row (see toggleCanDo), so a statement can be
// un-marked just as easily as it was checked.
//
// 'verified' is still read as a synonym for "done" (candoIsDone,
// toggleCanDo) so any rows written before teacher verification was
// removed keep showing as checked instead of silently reverting.
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
    { key: 'talk_about_plans',    category: 'Future Plans',     text: 'I can talk about my plans.',                    verification: 'speaking' },
    { key: 'make_invitation',     category: 'Future Plans',     text: 'I can invite someone to do something.',         verification: 'speaking' },
    { key: 'ask_location',        category: 'Places & Directions', text: 'I can ask where something is.',              verification: 'speaking' },
    { key: 'describe_location',   category: 'Places & Directions', text: 'I can describe where something is located.', verification: 'speaking' },
    { key: 'days_of_week',        category: 'Time & Schedule',  text: 'I can say the days of the week.',               verification: 'speaking' },
    { key: 'make_appointment',    category: 'Time & Schedule',  text: 'I can tell time and make an appointment.',      verification: 'speaking' },
    { key: 'go_shopping',         category: 'Shopping',         text: 'I can go shopping and ask for what I want.',    verification: 'speaking' },
    { key: 'colors_sizes',        category: 'Shopping',         text: 'I can talk about colors and sizes.',            verification: 'speaking' },
    { key: 'give_instructions',   category: 'Commands & Requests', text: 'I can give simple instructions.',            verification: 'speaking' },
    { key: 'polite_request',      category: 'Commands & Requests', text: 'I can make a polite request.',               verification: 'speaking' },
    { key: 'order_meal',          category: 'Food & Dining',    text: 'I can order a meal.',                            verification: 'speaking' },
    { key: 'likes_dislikes',      category: 'Food & Dining',    text: "I can say what I like and don't like.",          verification: 'speaking' },
    { key: 'say_feelings',        category: 'Health & Feelings', text: "I can say how I'm feeling.",                    verification: 'speaking' },
    { key: 'describe_health_problem', category: 'Health & Feelings', text: 'I can describe a simple health problem.',   verification: 'speaking' },
    { key: 'tell_my_story',       category: 'Fluency Milestones', text: 'I can tell my story in Amharic: introductions, family, and daily life.', verification: 'speaking' },
    { key: 'extended_conversation', category: 'Fluency Milestones', text: 'I can have an extended conversation covering the past, present, and future.', verification: 'speaking' },
    { key: 'talk_weather',        category: 'Weather & Seasons', text: 'I can talk about the weather.',                  verification: 'speaking' },
    { key: 'talk_seasons',        category: 'Weather & Seasons', text: 'I can talk about the seasons.',                  verification: 'speaking' },
    { key: 'talk_job_studies',    category: 'Work & School',    text: 'I can talk about my job or studies.',            verification: 'speaking' },
    { key: 'describe_work_routine', category: 'Work & School',  text: 'I can describe my daily work or school routine.', verification: 'speaking' },
    { key: 'travel_transport',    category: 'Travel',           text: 'I can travel by bus, taxi, or train.',           verification: 'speaking' },
    { key: 'checkin_hotel',       category: 'Travel',           text: 'I can buy a ticket and check into a hotel.',     verification: 'speaking' },
    {
        // "auto" means the app can already tell this is probably true — it
        // pre-fills self_assessed automatically instead of making the
        // student check it themselves.
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

function candoIsDone(status) {
    return status === 'self_assessed' || status === 'verified';
}

// Auto-assess path — statements the app can already tell are probably
// true. Pre-fills self_assessed automatically instead of waiting on the
// student to check it themselves.
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
            const done = candoIsDone(progressMap[statement.key]);
            const filterArg = categoryFilter ? `'${categoryFilter}'` : 'null';

            // Auto-derived statements (e.g. "I can read all Fidel" once 34
            // letters are mastered) aren't a self-report once true — the app
            // itself re-derives them on every render, so unchecking would
            // just have them silently re-check themselves. Lock the box
            // instead of offering an uncheck that can't actually stick.
            if (statement.verification === 'auto' && done) {
                return `
                    <label class="candoo-row done candoo-row-auto">
                        <input type="checkbox" class="candoo-checkbox" checked disabled>
                        <span class="candoo-text">${statement.text} <span class="candoo-auto-tag">Automatically tracked</span></span>
                    </label>`;
            }

            return `
                <label class="candoo-row ${done ? 'done' : ''}">
                    <input type="checkbox" class="candoo-checkbox" ${done ? 'checked' : ''}
                        onchange="toggleCanDo('${statement.key}', '${targetId}', ${filterArg}, this.checked)">
                    <span class="candoo-text">${statement.text}</span>
                </label>`;
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

// Self-report toggle — checking a box marks it done, unchecking removes
// the row entirely so it goes back to not_started. No teacher step.
async function toggleCanDo(statementKey, targetId, categoryFilter, checked) {
    const error = checked
        ? (await _supabase.from('can_do_progress').upsert({
            student_id: currentUser.id,
            statement_key: statementKey,
            status: 'self_assessed',
            self_assessed_at: new Date().toISOString()
        }, { onConflict: 'student_id,statement_key' })).error
        : (await _supabase.from('can_do_progress')
            .delete()
            .eq('student_id', currentUser.id)
            .eq('statement_key', statementKey)).error;

    if (error) {
        showNotificationToast("Couldn't save: " + error.message);
        return renderCanDoRows(targetId, categoryFilter || null);
    }

    if (checked) showGobezToast(`Marked as achieved! ${icon('confetti')}`);
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
window.toggleCanDo        = toggleCanDo;
window.chooseModeCanDo    = chooseModeCanDo;
window.exitCanDo          = exitCanDo;

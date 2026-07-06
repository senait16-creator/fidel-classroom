// =============================================================================
// DAILYFEED.JS — Verse of the Day, Question of the Day, and the "what
// happened today" banner row on the Community page. These are the
// daily-rotating pieces that turn Community into a reason to open the app
// every day, not just when there's new practice work to check.
//
// Rotation uses the same day-index approach as wordle.js (days since a
// fixed epoch, mod the list length) so everyone sees the same item on the
// same day without needing a server-side scheduler.
//
// Verse of the Day: content here is a best-effort Amharic rendering —
// worth a native-speaker pass before relying on it for a class.
//
// Loads AFTER: app.js, team/progress.js (buildLiveTestSchedulingLink).
// =============================================================================

const VERSE_LIBRARY = [
    {
        amharic: "በመጀመሪያ እግዚአብሔር ሰማይንና ምድርን ፈጠረ።",
        translit: "Bemejemeria Igziabiher semayinna midirin fetere.",
        english: "In the beginning God created the heavens and the earth.",
        reference: "Genesis 1:1"
    },
    {
        amharic: "እግዚአብሔር እረኛዬ ነው፤ የሚያሳጣኝ የለም።",
        translit: "Igziabiher irenyaye now; yemiyasat'agn yelem.",
        english: "The LORD is my shepherd; I shall not want.",
        reference: "Psalm 23:1"
    },
    {
        amharic: "ይህ እግዚአብሔር የሠራው ቀን ነው፤ በእርሱ ደስ ይበለን ሐሴትም እናድርግ።",
        translit: "Yih Igziabiher yeserawi k'en now; be'irsu des yibelen haset'imi inadirig.",
        english: "This is the day the LORD has made; let us rejoice and be glad in it.",
        reference: "Psalm 118:24"
    },
    {
        amharic: "በፍጹም ልብህ በእግዚአብሔር ታመን በራስህም ማስተዋል አትደገፍ።",
        translit: "Befitsum libih be'igziabiher tamen berasihimi mastewal atidegef.",
        english: "Trust in the LORD with all your heart, and lean not on your own understanding.",
        reference: "Proverbs 3:5"
    },
    {
        amharic: "ኃይልን በሚሰጠኝ በክርስቶስ ሁሉን እችላለሁ።",
        translit: "Hayilin bemiset'egn bekristos hulun ichilalehu.",
        english: "I can do all things through Christ who strengthens me.",
        reference: "Philippians 4:13"
    }
];

const QUESTION_LIBRARY = [
    { amharic: "ስምህ ማን ነው?", english: "What is your name?" },
    { amharic: "የት ነው የምትኖረው?", english: "Where do you live?" },
    { amharic: "ስንት ዓመትህ ነው?", english: "How old are you?" },
    { amharic: "ቤተሰብህን ግለጽ።", english: "Describe your family." },
    { amharic: "ተወዳጅ ምግብህ ምንድን ነው?", english: "What is your favorite food?" },
    { amharic: "ዛሬ ስሜትህ እንዴት ነው?", english: "How do you feel today?" },
    { amharic: "ወደፊት ምን መሆን ትፈልጋለህ?", english: "What do you want to be in the future?" }
];

// ---------------------------------------------------------------------------
// Day keying — same approach as wordle.js's getDayIndex/getTodayKey, kept
// separate here since each list rotates at its own length.
// ---------------------------------------------------------------------------

function dailyFeedDayIndex(listLength) {
    const start = new Date('2025-07-01');
    const now = new Date();
    const diff = Math.floor((now - start) / (1000 * 60 * 60 * 24));
    return Math.abs(diff) % listLength;
}

function dailyFeedTodayKey(prefix) {
    const d = new Date();
    return `${prefix}_${d.getFullYear()}_${d.getMonth()}_${d.getDate()}`;
}

// ---------------------------------------------------------------------------
// Verse of the Day
// ---------------------------------------------------------------------------

function renderVerseOfDay(targetId = 'verseOfDayMount') {
    const mount = document.getElementById(targetId);
    if (!mount) return;

    const verse = VERSE_LIBRARY[dailyFeedDayIndex(VERSE_LIBRARY.length)];
    mount.innerHTML = `
        <div class="eyebrow">Verse of the Day</div>
        <p class="verse-amharic">${verse.amharic}</p>
        <p class="verse-translit">${verse.translit}</p>
        <p class="verse-en">"${verse.english}" — ${verse.reference}</p>`;
}

// ---------------------------------------------------------------------------
// Question of the Day — personal answer, saved locally (same "today only"
// pattern Wordle uses). No shared table yet; add one later if the class
// should see each other's answers.
// ---------------------------------------------------------------------------

function renderQuestionOfDay(targetId = 'questionOfDayMount') {
    const mount = document.getElementById(targetId);
    if (!mount) return;

    const question = QUESTION_LIBRARY[dailyFeedDayIndex(QUESTION_LIBRARY.length)];
    const savedAnswer = localStorage.getItem(dailyFeedTodayKey('qotd'));

    if (savedAnswer) {
        mount.innerHTML = `
            <div class="eyebrow">Question of the Day</div>
            <p class="qotd-amharic">${question.amharic}</p>
            <p class="qotd-en">"${question.english}"</p>
            <div class="qotd-answered">
                <strong>✓ Your answer:</strong> ${savedAnswer}
            </div>
            <button type="button" class="qotd-edit-btn" onclick="editQuestionOfDayAnswer('${targetId}')">Edit answer</button>`;
        return;
    }

    mount.innerHTML = `
        <div class="eyebrow">Question of the Day</div>
        <p class="qotd-amharic">${question.amharic}</p>
        <p class="qotd-en">"${question.english}"</p>
        <textarea id="${targetId}-input" class="qotd-textarea" placeholder="Type your answer (Amharic or English)..."></textarea>
        <button type="button" class="btn-primary" style="font-size:13px; padding:9px 16px;" onclick="submitQuestionOfDayAnswer('${targetId}')">Share my answer</button>`;
}

function submitQuestionOfDayAnswer(targetId) {
    const input = document.getElementById(`${targetId}-input`);
    const answer = input ? input.value.trim() : '';
    if (!answer) return showNotificationToast('Type an answer first!');

    localStorage.setItem(dailyFeedTodayKey('qotd'), answer);
    showGobezToast('Answer saved!');
    renderQuestionOfDay(targetId);
}

function editQuestionOfDayAnswer(targetId) {
    localStorage.removeItem(dailyFeedTodayKey('qotd'));
    renderQuestionOfDay(targetId);
}

// ---------------------------------------------------------------------------
// Daily Wordle status — reads the same state wordle.js already tracks
// (loadWordleState/getTodayKey), just renders it as a Community summary row
// instead of duplicating the game logic.
// ---------------------------------------------------------------------------

function renderWordleStatusMini(targetId = 'wordleStatusMount') {
    const mount = document.getElementById(targetId);
    if (!mount || typeof loadWordleState !== 'function') return;

    const state = loadWordleState();
    let statusHTML = '<span class="mini-status open">Play now →</span>';
    let subText = "Today's word puzzle";

    if (state?.completed) {
        if (state.won) {
            statusHTML = `<span class="mini-status done">Solved · ${state.attempts.length}/5</span>`;
            subText = 'Nice work today!';
        } else {
            statusHTML = '<span class="mini-status open">Missed today</span>';
            subText = 'Come back tomorrow for a new one';
        }
    }

    mount.innerHTML = `
        <span class="wordle-status-icon">🟩</span>
        <div class="wordle-status-text">
            <strong>Daily Wordle</strong>
            <span class="mini-sub">${subText}</span>
        </div>
        ${statusHTML}`;
}

// ---------------------------------------------------------------------------
// Today banners — live test slots (static, reuses the Calendly link already
// wired into the level-completion flow) + real classmates-leveled-up-today
// count from level_completion_requests.
// ---------------------------------------------------------------------------

async function renderTodayBanners(targetId = 'todayBannersMount') {
    const mount = document.getElementById(targetId);
    if (!mount) return;

    const schedulingLink = typeof buildLiveTestSchedulingLink === 'function'
        ? buildLiveTestSchedulingLink()
        : 'https://calendly.com/senaitrichmond16/fidel-test';

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const { data: approvedToday } = await _supabase
        .from('level_completion_requests')
        .select('student_id, profiles!level_completion_requests_student_id_fkey(nickname)')
        .eq('status', 'approved')
        .gte('reviewed_at', startOfToday.toISOString());

    const names = [...new Set((approvedToday || []).map(r => r.profiles?.nickname).filter(Boolean))];
    const levelUpSub = names.length === 0
        ? 'No one yet today — could be you!'
        : names.length <= 2
            ? `${names.join(' and ')} cleared a level today.`
            : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more cleared a level today.`;

    mount.innerHTML = `
        <a class="banner-card" href="${schedulingLink}" target="_blank" rel="noopener">
            <div class="banner-icon">🎤</div>
            <p class="banner-title">Book Your Live Test</p>
            <p class="banner-sub">Cleared all 3 families? Schedule it here.</p>
        </a>
        <div class="banner-card">
            <div class="banner-icon">🎉</div>
            <p class="banner-title">${names.length} Leveled Up Today</p>
            <p class="banner-sub">${levelUpSub}</p>
        </div>`;
}

// ---------------------------------------------------------------------------
// Expose
// ---------------------------------------------------------------------------

window.renderVerseOfDay = renderVerseOfDay;
window.renderQuestionOfDay = renderQuestionOfDay;
window.submitQuestionOfDayAnswer = submitQuestionOfDayAnswer;
window.editQuestionOfDayAnswer = editQuestionOfDayAnswer;
window.renderWordleStatusMini = renderWordleStatusMini;
window.renderTodayBanners = renderTodayBanners;

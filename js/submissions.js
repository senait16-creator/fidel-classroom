// =============================================================================
// SUBMISSIONS.JS
// Writing submission flow, sketchpad (with undo), photo sharing, vocab routing.
// Loads AFTER app.js, utils/compress.js.
// =============================================================================

// ---------------------------------------------------------------------------
// Writing submit screen — state
// ---------------------------------------------------------------------------

// writingSubmitContext holds everything about the current submission:
//   baseLetter  — the letter family being submitted for
//   levelNumber — which challenge level this belongs to
//   returnTo    — 'teamHub' | 'practiceSheet' | 'challengeDetail'
//                 used by the Back button to navigate back correctly
let writingSubmitContext = null;

// ---------------------------------------------------------------------------
// Open / close writing submit screen
// ---------------------------------------------------------------------------

function openWritingSubmitScreen(baseLetter, returnToOrOnClose, levelNumber) {
    // Support legacy callers that passed a callback: openWritingSubmitScreen(letter, fn)
    // New callers pass a returnTo string: openWritingSubmitScreen(letter, 'teamHub', level)
    let returnTo = 'teamHub';
    let legacyOnClose = null;
    if (typeof returnToOrOnClose === 'function') {
        legacyOnClose = returnToOrOnClose;
    } else if (typeof returnToOrOnClose === 'string') {
        returnTo = returnToOrOnClose;
    }

    writingSubmitContext = { baseLetter, levelNumber: levelNumber || null, returnTo, legacyOnClose };

    // Title
    document.getElementById("writingSubmitTitle").innerText = `"${baseLetter}" Writing`;

    // Show the letter family row for reference
    const fidelObj = alphabetData.find(item => item.base === baseLetter);
    const letterDisplay = document.getElementById("writingSubmitLetterDisplay");
    const letterRow     = document.getElementById("writingSubmitLetterRow");
    if (fidelObj && letterDisplay && letterRow) {
        letterRow.innerText = (fidelObj.family || fidelObj.forms || []).join("  ");
        letterDisplay.style.display = "block";
    }

    // Reset UI
    document.getElementById("writingSketchpadArea").style.display  = "none";
    document.getElementById("writingRejectionNote").style.display  = "none";
    const uploadCard = document.getElementById("writingChoiceUploadCard");
    const sketchCard = document.getElementById("writingChoiceSketchCard");
    if (uploadCard) uploadCard.style.border = "2px solid #e2e8f0";
    if (sketchCard) sketchCard.style.border = "2px solid #e2e8f0";

    // Clear undo history for a fresh session
    _writingHistory = [];

    renderWritingStatusForFamily(baseLetter);

    // Wire upload card
    uploadCard.onclick = () => document.getElementById("writingPhotoInput").click();

    // Wire sketch card
    sketchCard.onclick = () => {
        sketchCard.style.border = "2px solid #166534";
        document.getElementById("writingSketchpadArea").style.display = "block";
        setTimeout(initWritingSketchpadWithUndo, 50);
    };

    // Wire photo input
    const photoInput = document.getElementById("writingPhotoInput");
    photoInput.value = "";
    photoInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) { uploadCard.style.border = "2px solid #166534"; submitWritingPhoto(file); }
    };

    // Wire sketchpad action buttons (defensive — a missing button must never
    // crash this function and leave the screen half-wired)
    const wire = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.onclick = fn;
        else console.warn(`openWritingSubmitScreen: #${id} not found in DOM`);
    };
    wire("writingSketchClearBtn",  clearWritingSketchpad);
    wire("writingSketchUndoBtn",   undoWritingSketchpad);
    wire("writingSketchSubmitBtn", submitWritingSketch);
    wire("writingSubmitCloseBtn",  closeWritingSubmitScreen);

    // Show screen as its own focused page
    [
        "modeSelectScreen",
        "studentDashboard",
        "challengeDashboardScreen",
        "challengeLevelsScreen",
        "challengeFamilyScreen",
        "challengeFamilyDetailScreen",
        "teamHubScreen",
        "captainDashboardScreen",
        "readingLevelsScreen",
        "letterBoardScreen",
        "gameWorkspace"
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
    });

    document.getElementById("writingSubmitScreen").style.display = "flex";
}

function closeWritingSubmitScreen() {
    document.getElementById("writingSubmitScreen").style.display = "none";

    // Legacy callback support
    if (writingSubmitContext?.legacyOnClose) {
        writingSubmitContext.legacyOnClose();
        return;
    }

    const returnTo = writingSubmitContext?.returnTo || 'teamHub';
    if (returnTo === 'practiceSheet') {
        const sheet = document.getElementById('familyPracticeSheet');
        if (sheet) sheet.style.display = 'flex';
        if (writingSubmitContext?.baseLetter && typeof renderWritingStatusForFamily === 'function') {
            renderWritingStatusForFamily(writingSubmitContext.baseLetter, 'practiceSheetWritingStatusBox');
        }
    } else if (returnTo === 'challengeDetail') {
        const detail = document.getElementById('challengeFamilyDetailScreen');
        if (detail) detail.style.display = 'block';
        if (writingSubmitContext?.baseLetter && typeof renderWritingStatusForFamily === 'function') {
            renderWritingStatusForFamily(writingSubmitContext.baseLetter);
        }
    } else {
        // 'teamHub' and any unknown target now land on the Competition page —
        // the team hub is retired as a destination.
        if (typeof chooseModeChallenge === 'function') chooseModeChallenge();
    }
}

// ---------------------------------------------------------------------------
// Writing sketchpad — with undo history
// ---------------------------------------------------------------------------

let _writingHistory   = [];   // ImageData snapshots for undo
let _writingIsDrawing = false;

function initWritingSketchpadWithUndo() {
    const canvas = document.getElementById("writingSketchpad");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    // Size to display dimensions, respecting device pixel ratio
    const rect = canvas.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 1;
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineWidth   = 3;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.strokeStyle = "#1e293b";
    canvas._ctx = ctx;

    // Remove old listeners before re-attaching to avoid stacking
    const newCanvas = canvas.cloneNode(false);
    canvas.parentNode.replaceChild(newCanvas, canvas);
    const c   = document.getElementById("writingSketchpad");
    const ctx2 = c.getContext("2d");
    c._ctx = ctx2;
    // Re-apply settings after clone
    ctx2.lineWidth   = 3;
    ctx2.lineCap     = "round";
    ctx2.lineJoin    = "round";
    ctx2.strokeStyle = "#1e293b";

    function getPos(e) {
        const r   = c.getBoundingClientRect();
        const src = e.touches ? e.touches[0] : e;
        return { x: (src.clientX - r.left), y: (src.clientY - r.top) };
    }

    function pushSnapshot() {
        if (_writingHistory.length >= 30) _writingHistory.shift();
        _writingHistory.push(ctx2.getImageData(0, 0, c.width, c.height));
    }

    c.addEventListener("mousedown", e => {
        _writingIsDrawing = true;
        pushSnapshot();
        const p = getPos(e);
        ctx2.beginPath();
        ctx2.moveTo(p.x, p.y);
    });
    c.addEventListener("mousemove", e => {
        if (!_writingIsDrawing) return;
        const p = getPos(e);
        ctx2.lineTo(p.x, p.y);
        ctx2.stroke();
    });
    c.addEventListener("mouseup",   () => { _writingIsDrawing = false; });
    c.addEventListener("mouseleave",() => { _writingIsDrawing = false; });
    c.addEventListener("touchstart", e => {
        e.preventDefault();
        _writingIsDrawing = true;
        pushSnapshot();
        const p = getPos(e);
        ctx2.beginPath();
        ctx2.moveTo(p.x, p.y);
    }, { passive: false });
    c.addEventListener("touchmove", e => {
        e.preventDefault();
        if (!_writingIsDrawing) return;
        const p = getPos(e);
        ctx2.lineTo(p.x, p.y);
        ctx2.stroke();
    }, { passive: false });
    c.addEventListener("touchend", () => { _writingIsDrawing = false; });
}

// Kept for back-compat (some callers use old name)
function initWritingSketchpad() { initWritingSketchpadWithUndo(); }

function undoWritingSketchpad() {
    const canvas = document.getElementById("writingSketchpad");
    if (!canvas || _writingHistory.length === 0) return;
    const ctx = canvas.getContext("2d");
    ctx.putImageData(_writingHistory.pop(), 0, 0);
}

function clearWritingSketchpad() {
    _writingHistory = [];
    const canvas = document.getElementById("writingSketchpad");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ---------------------------------------------------------------------------
// Practice sketchpad (id="sketchpad") — with undo
// Embedded in the student dashboard letter family view.
// ---------------------------------------------------------------------------

let _sketchpadHistory   = [];
let _sketchpadInitted   = false;

function initSketchpadWithUndo(canvasId) {
    canvasId = canvasId || 'sketchpad';
    const canvas = document.getElementById(canvasId);
    if (!canvas || canvas._sketchInitted) return;
    canvas._sketchInitted = true;

    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 1;
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineWidth   = 3;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.strokeStyle = "#1e293b";
    canvas._ctx = ctx;

    let isDown = false;

    function getPos(e) {
        const r   = canvas.getBoundingClientRect();
        const src = e.touches ? e.touches[0] : e;
        return { x: src.clientX - r.left, y: src.clientY - r.top };
    }

    function pushSnap() {
        if (_sketchpadHistory.length >= 30) _sketchpadHistory.shift();
        _sketchpadHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    }

    canvas.addEventListener("mousedown", e => { isDown = true; pushSnap(); const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
    canvas.addEventListener("mousemove", e => { if (!isDown) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
    canvas.addEventListener("mouseup",   () => { isDown = false; });
    canvas.addEventListener("mouseleave",() => { isDown = false; });
    canvas.addEventListener("touchstart", e => { e.preventDefault(); isDown = true; pushSnap(); const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }, { passive: false });
    canvas.addEventListener("touchmove",  e => { e.preventDefault(); if (!isDown) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); }, { passive: false });
    canvas.addEventListener("touchend",   () => { isDown = false; });
}

function undoSketchpadCanvas() {
    const canvas = document.getElementById('sketchpad');
    if (!canvas || _sketchpadHistory.length === 0) return;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(_sketchpadHistory.pop(), 0, 0);
}

function clearSketchpadCanvas() {
    _sketchpadHistory = [];
    const canvas = document.getElementById('sketchpad');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ---------------------------------------------------------------------------
// Photo upload — practice sketchpad shares to teamHubPracticeFeed ONLY
// (replaces the old disappearingArtGalleryFeed path)
// ---------------------------------------------------------------------------

async function uploadSketchpadDrawingCanvasData() {
    const canvas = document.getElementById('sketchpad');
    if (!canvas) return;

    const ctx  = canvas._ctx || canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const hasPixels = Array.from(data).some((v, i) => i % 4 === 3 && v > 0);
    if (!hasPixels) { showNotificationToast('Draw something first!'); return; }

    showNotificationToast('Sharing to team feed...');

    try {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
        const compressed = typeof compressImage === 'function' ? await compressImage(blob, 800) : blob;
        const filename = `practice_${currentUser.id}_${Date.now()}.jpg`;

        const { error: uploadErr } = await _supabase.storage
            .from('team_practice_posts')
            .upload(filename, compressed, { contentType: 'image/jpeg', upsert: false });
        if (uploadErr) throw uploadErr;

        const { data: urlData } = _supabase.storage.from('team_practice_posts').getPublicUrl(filename);

        const { error: postErr } = await _supabase.from('team_practice_posts').insert({
            uploader_id: currentUser.id,
            team_id:     currentProfile?.team_id || null,
            image_url:   urlData.publicUrl,
            base_letter: null,
            post_type:   'share',
            created_at:  new Date().toISOString()
        });
        if (postErr) throw postErr;

        showNotificationToast('Shared to your team feed! ✓');
        clearSketchpadCanvas();

        // Reload the team feed if visible
        if (typeof loadTeamPracticeFeed === 'function') loadTeamPracticeFeed();

    } catch (err) {
        console.error('Share failed:', err);
        showNotificationToast('Share failed — try again.');
    }
}

// ---------------------------------------------------------------------------
// Writing submission — photo upload path
// ---------------------------------------------------------------------------

async function submitWritingPhoto(file) {
    if (!file) return;
    if (!writingSubmitContext?.baseLetter) return showNotificationToast("Choose a letter before submitting.");
    if (file.size > 25 * 1024 * 1024) return showNotificationToast("Photo is too large — please use one under 25MB.");

    showNotificationToast("Compressing and uploading...");
    const compressed = typeof compressImage === 'function' ? await compressImage(file) : file;
    const letterIndex = alphabetData.findIndex(item => item.base === writingSubmitContext.baseLetter);
    const storagePath = `writing-${currentUser.id}-fam${letterIndex}-${Date.now()}.jpg`;

    const { error: uploadError } = await _supabase.storage
        .from('art_shares')
        .upload(storagePath, compressed, { contentType: 'image/jpeg' });

    if (uploadError) return showNotificationToast("Upload failed: " + uploadError.message);

    const { data: urlData } = _supabase.storage.from('art_shares').getPublicUrl(storagePath);
    await finalizeWritingSubmission(urlData.publicUrl);
}

// ---------------------------------------------------------------------------
// Writing submission — sketch path
// ---------------------------------------------------------------------------

async function submitWritingSketch() {
    const canvas = document.getElementById("writingSketchpad");
    const emptyCheck = document.createElement("canvas");
    emptyCheck.width  = canvas.width;
    emptyCheck.height = canvas.height;
    if (canvas.toDataURL() === emptyCheck.toDataURL()) {
        return showNotificationToast("Draw something before submitting!");
    }

    showNotificationToast("Submitting your drawing...");
    canvas.toBlob(async (blob) => {
        const letterIndex = alphabetData.findIndex(item => item.base === writingSubmitContext.baseLetter);
        const storagePath = `writing-${currentUser.id}-fam${letterIndex}-${Date.now()}.jpg`;

        const { error: uploadError } = await _supabase.storage
            .from('art_shares')
            .upload(storagePath, blob, { contentType: 'image/jpeg' });

        if (uploadError) return showNotificationToast("Upload failed: " + uploadError.message);

        const { data: urlData } = _supabase.storage.from('art_shares').getPublicUrl(storagePath);
        await finalizeWritingSubmission(urlData.publicUrl);
    }, "image/jpeg", 0.78);
}

// ---------------------------------------------------------------------------
// Writing submission — finalize (insert DB record)
// ---------------------------------------------------------------------------

async function finalizeWritingSubmission(imageUrl) {
    const { error } = await _supabase.from('writing_submissions').insert({
        student_id:   currentUser.id,
        base_letter:  writingSubmitContext.baseLetter,
        level_number: writingSubmitContext.levelNumber || null,
        image_url:    imageUrl,
        status:       'pending',
        submitted_at: new Date().toISOString()
    });

    if (error) return showNotificationToast("Couldn't submit: " + error.message);

    showNotificationToast("Submitted! Your captain will review it soon. 🎉");
    closeWritingSubmitScreen();
}

// ---------------------------------------------------------------------------
// Share approved writing to the class Community feed
// The image already lives in storage (art_shares) — we just create a post
// record pointing at it. post_type 'approved_share' marks it as captain-
// approved work, which the Community feed badges with ✓ Approved.
// ---------------------------------------------------------------------------

async function shareApprovedWritingToClass(imageUrl, baseLetter, btnEl) {
    if (btnEl) { btnEl.disabled = true; btnEl.innerText = "Sharing..."; }

    const { error } = await _supabase.from('team_practice_posts').insert({
        uploader_id: currentUser.id,
        team_id:     currentProfile?.team_id || null,
        image_url:   imageUrl,
        base_letter: baseLetter,
        post_type:   'approved_share',
        created_at:  new Date().toISOString()
    });

    if (error) {
        if (btnEl) { btnEl.disabled = false; btnEl.innerText = "🎉 Share with the class"; }
        return showNotificationToast("Couldn't share: " + error.message);
    }

    showGobezToast("Shared with the class! 🎉");
    if (btnEl) btnEl.outerHTML = `
        <p style="font-size:12px; color:#047857; margin-top:8px;">
            🎉 Shared with the class — check the Community feed!
        </p>`;
}

// ---------------------------------------------------------------------------
// Render writing status for a family (shown inside writingSubmitScreen)
// ---------------------------------------------------------------------------

async function renderWritingStatusForFamily(baseLetter, targetId = "challengeWritingStatusBox") {
    const box = document.getElementById(targetId);
    if (!box) return;

    const { data: submissions } = await _supabase
        .from('writing_submissions')
        .select('status, reviewer_note, submitted_at, image_url')
        .eq('student_id', currentUser.id)
        .eq('base_letter', baseLetter)
        .order('submitted_at', { ascending: false })
        .limit(3);

    if (!submissions || submissions.length === 0) { box.style.display = "none"; return; }

    box.style.display = "block";
    const latest = submissions[0];
    let statusHTML = '';

    if (latest.status === 'approved') {
        statusHTML = `<div class="challenge-writing-status approved">✓ Your writing for "${baseLetter}" was approved!</div>`;

        // Share-after-approval: only approved work can be shared to the class.
        // Check whether this exact image was already shared (dedupe).
        const { data: existingShare } = await _supabase
            .from('team_practice_posts')
            .select('id')
            .eq('uploader_id', currentUser.id)
            .eq('image_url', latest.image_url)
            .limit(1);

        if (existingShare && existingShare.length > 0) {
            statusHTML += `
                <p style="font-size:12px; color:#047857; margin-top:8px;">
                    🎉 Shared with the class — check the Community feed!
                </p>`;
        } else {
            statusHTML += `
                <button class="btn-primary"
                        style="margin-top:10px; font-size:13px; padding:10px 16px;"
                        onclick="shareApprovedWritingToClass('${latest.image_url}', '${baseLetter}', this)">
                    🎉 Share with the class
                </button>
                <p style="font-size:11px; color:#94a3b8; margin-top:6px;">
                    Optional — post your approved work to the Community feed for reactions.
                </p>`;
        }
    } else if (latest.status === 'rejected') {
        statusHTML = `<div class="challenge-writing-status rejected">✗ Needs another try.${latest.reviewer_note ? `<br><strong>Captain's note:</strong> ${latest.reviewer_note}` : ''}</div>`;
    } else {
        statusHTML = `<div class="challenge-writing-status pending">⏳ Waiting for your captain to review.</div>`;
    }

    if (submissions.length > 1) {
        const history = submissions.slice(1).map(sub => {
            const date  = new Date(sub.submitted_at).toLocaleDateString();
            const icon  = sub.status === 'approved' ? '✓' : sub.status === 'rejected' ? '✗' : '⏳';
            const color = sub.status === 'approved' ? '#166534' : sub.status === 'rejected' ? '#991b1b' : '#92400e';
            return `<div style="font-size:11px; color:${color}; padding:3px 0; border-top:1px solid #f1f5f9; margin-top:4px;">${icon} ${date}${sub.reviewer_note ? ` — "${sub.reviewer_note}"` : ''}</div>`;
        }).join('');
        statusHTML += `<div style="margin-top:8px;">${history}</div>`;
    }
    box.innerHTML = statusHTML;
}

// ---------------------------------------------------------------------------
// Mode routing — Vocab + Wordle
// ---------------------------------------------------------------------------

function chooseModeVocab() {
    if (typeof hideAllScreens === 'function') hideAllScreens();

    const vocabScreen = document.getElementById('vocabScreen');
    if (vocabScreen) {
        vocabScreen.style.display = 'block';
    } else {
        // Vocab screen not yet built — fall back to reading path as placeholder
        if (typeof enterReadingPath === 'function') enterReadingPath();
    }

    // Trigger Wordle if available
    setTimeout(() => {
        if (typeof maybeShowWordleOnLogin === 'function') maybeShowWordleOnLogin();
    }, 100);
}

// Captain button on mode select — show/hide based on profile
function updateModeSelectCaptainButton() {
    const btn = document.getElementById('modeSelectCaptainBtn');
    if (!btn) return;
    btn.style.display = currentProfile?.is_captain ? 'flex' : 'none';
}

// ---------------------------------------------------------------------------
// Bind sketchpad buttons (call once on app init)
// ---------------------------------------------------------------------------

function bindSketchpadButtons() {
    // Practice pad — HTML calls undoSketchpadCanvas / clearSketchpadCanvas by name, no rebind needed
    initSketchpadWithUndo('sketchpad');

    // Writing pad undo/clear — re-bound each time openWritingSubmitScreen runs
    // (no init here; writing pad inits lazily when sketchCard is tapped)
}

// ---------------------------------------------------------------------------
// Expose
// ---------------------------------------------------------------------------

window.openWritingSubmitScreen        = openWritingSubmitScreen;
window.closeWritingSubmitScreen       = closeWritingSubmitScreen;
window.initWritingSketchpad           = initWritingSketchpad;
window.initWritingSketchpadWithUndo   = initWritingSketchpadWithUndo;
window.undoWritingSketchpad           = undoWritingSketchpad;
window.clearWritingSketchpad          = clearWritingSketchpad;
window.initSketchpadWithUndo          = initSketchpadWithUndo;
window.undoSketchpadCanvas            = undoSketchpadCanvas;
window.clearSketchpadCanvas           = clearSketchpadCanvas;
window.uploadSketchpadDrawingCanvasData = uploadSketchpadDrawingCanvasData;
window.submitWritingPhoto             = submitWritingPhoto;
window.submitWritingSketch            = submitWritingSketch;
window.finalizeWritingSubmission      = finalizeWritingSubmission;
window.renderWritingStatusForFamily   = renderWritingStatusForFamily;
window.shareApprovedWritingToClass    = shareApprovedWritingToClass;
window.chooseModeVocab                = chooseModeVocab;
window.updateModeSelectCaptainButton  = updateModeSelectCaptainButton;
window.bindSketchpadButtons           = bindSketchpadButtons;

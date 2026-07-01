// =============================================================================
// SUBMISSIONS.JS
// Writing submission flow with image compression.
// Loads AFTER app.js, utils/compress.js.
// =============================================================================

let writingSubmitContext = null;
let writingSketchCtx = null;
let writingSketchDrawing = false;

function openWritingSubmitScreen(baseLetter, onClose) {
    writingSubmitContext = { baseLetter, onClose };

    document.getElementById("writingSubmitTitle").innerText = `"${baseLetter}" Writing`;
    document.getElementById("writingSubmitScreen").style.display = "flex";
    document.getElementById("writingSketchpadArea").style.display = "none";
    document.getElementById("writingRejectionNote").style.display = "none";

    // Show the letter family row at the top for reference
    const fidelObj = alphabetData.find(item => item.base === baseLetter);
    const letterDisplay = document.getElementById("writingSubmitLetterDisplay");
    const letterRow = document.getElementById("writingSubmitLetterRow");
    if (fidelObj && letterDisplay && letterRow) {
        letterRow.innerText = fidelObj.family.join("  ");
        letterDisplay.style.display = "block";
    }

    // Reset button borders
    const uploadCard = document.getElementById("writingChoiceUploadCard");
    const sketchCard = document.getElementById("writingChoiceSketchCard");
    if (uploadCard) uploadCard.style.border = "2px solid #e2e8f0";
    if (sketchCard) sketchCard.style.border = "2px solid #e2e8f0";

    renderWritingStatusForFamily(baseLetter);

    uploadCard.onclick = () => {
        document.getElementById("writingPhotoInput").click();
    };

    sketchCard.onclick = () => {
        sketchCard.style.border = "2px solid #166534";
        document.getElementById("writingSketchpadArea").style.display = "block";
        setTimeout(initWritingSketchpad, 50);
    };

    const photoInput = document.getElementById("writingPhotoInput");
    photoInput.value = "";
    photoInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            uploadCard.style.border = "2px solid #166534";
            submitWritingPhoto(file);
        }
    };

    document.getElementById("writingSketchClearBtn").onclick = clearWritingSketchpad;
    document.getElementById("writingSketchSubmitBtn").onclick = submitWritingSketch;
    document.getElementById("writingSubmitCloseBtn").onclick = closeWritingSubmitScreen;
}

function closeWritingSubmitScreen() {
    document.getElementById("writingSubmitScreen").style.display = "none";
    if (writingSubmitContext?.onClose) writingSubmitContext.onClose();
}

function initWritingSketchpad() {
    const canvas = document.getElementById("writingSketchpad");
    if (!canvas) return;
    writingSketchCtx = canvas.getContext("2d");
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    writingSketchCtx.lineWidth = 3;
    writingSketchCtx.lineCap = "round";
    writingSketchCtx.strokeStyle = "#1e293b";

    function getCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    }
    function start(e) { writingSketchDrawing = true; writingSketchCtx.beginPath(); const c = getCoords(e); writingSketchCtx.moveTo(c.x, c.y); }
    function draw(e) { if (!writingSketchDrawing) return; const c = getCoords(e); writingSketchCtx.lineTo(c.x, c.y); writingSketchCtx.stroke(); }
    function stop() { writingSketchDrawing = false; }

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", draw);
    window.addEventListener("mouseup", stop);
    canvas.addEventListener("touchstart", start, { passive: true });
    canvas.addEventListener("touchmove", draw, { passive: true });
    window.addEventListener("touchend", stop);
}

function clearWritingSketchpad() {
    const canvas = document.getElementById("writingSketchpad");
    if (writingSketchCtx && canvas) writingSketchCtx.clearRect(0, 0, canvas.width, canvas.height);
}

async function submitWritingPhoto(file) {
    showNotificationToast("Compressing and uploading...");
    const compressed = await compressImage(file);
    const letterIndex = alphabetData.findIndex(item => item.base === writingSubmitContext.baseLetter);
    const storagePath = `writing-${currentUser.id}-fam${letterIndex}-${Date.now()}.jpg`;

    const { error: uploadError } = await _supabase.storage.from('art_shares').upload(storagePath, compressed, { contentType: 'image/jpeg' });
    if (uploadError) {
        console.error("Writing photo upload failed:", uploadError);
        return showNotificationToast("Upload failed: " + uploadError.message);
    }
    const { data: urlData } = _supabase.storage.from('art_shares').getPublicUrl(storagePath);
    await finalizeWritingSubmission(urlData.publicUrl);
}

async function submitWritingSketch() {
    const canvas = document.getElementById("writingSketchpad");
    const emptyCheck = document.createElement("canvas");
    emptyCheck.width = canvas.width;
    emptyCheck.height = canvas.height;
    if (canvas.toDataURL() === emptyCheck.toDataURL()) return showNotificationToast("Draw something before submitting!");

    showNotificationToast("Submitting your drawing...");
    canvas.toBlob(async (blob) => {
        const letterIndex = alphabetData.findIndex(item => item.base === writingSubmitContext.baseLetter);
        const storagePath = `writing-${currentUser.id}-fam${letterIndex}-${Date.now()}.jpg`;

        const { error: uploadError } = await _supabase.storage.from('art_shares').upload(storagePath, blob, { contentType: 'image/jpeg' });
        if (uploadError) {
            console.error("Writing sketch upload failed:", uploadError);
            return showNotificationToast("Upload failed: " + uploadError.message);
        }
        const { data: urlData } = _supabase.storage.from('art_shares').getPublicUrl(storagePath);
        await finalizeWritingSubmission(urlData.publicUrl);
    }, "image/jpeg", 0.78);
}

async function finalizeWritingSubmission(imageUrl) {
    const { error } = await _supabase.from('writing_submissions').insert({
        student_id: currentUser.id,
        base_letter: writingSubmitContext.baseLetter,
        image_url: imageUrl,
        status: 'pending'
    });
    if (error) {
        console.error("Failed to save writing submission:", error);
        return showNotificationToast("Couldn't submit: " + error.message);
    }
    showGobezToast("Submitted! Your captain will review it soon. 🎉");
    closeWritingSubmitScreen();
}

async function renderWritingStatusForFamily(baseLetter) {
    const box = document.getElementById("challengeWritingStatusBox");
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
    } else if (latest.status === 'rejected') {
        statusHTML = `<div class="challenge-writing-status rejected">✗ Needs another try.${latest.reviewer_note ? `<br><strong>Captain's note:</strong> ${latest.reviewer_note}` : ''}</div>`;
    } else {
        statusHTML = `<div class="challenge-writing-status pending">⏳ Waiting for your captain to review.</div>`;
    }

    if (submissions.length > 1) {
        const history = submissions.slice(1).map(sub => {
            const date = new Date(sub.submitted_at).toLocaleDateString();
            const icon = sub.status === 'approved' ? '✓' : sub.status === 'rejected' ? '✗' : '⏳';
            const color = sub.status === 'approved' ? '#166534' : sub.status === 'rejected' ? '#991b1b' : '#92400e';
            return `<div style="font-size:11px; color:${color}; padding:3px 0; border-top:1px solid #f1f5f9; margin-top:4px;">${icon} ${date}${sub.reviewer_note ? ` — "${sub.reviewer_note}"` : ''}</div>`;
        }).join('');
        statusHTML += `<div style="margin-top:8px;">${history}</div>`;
    }
    box.innerHTML = statusHTML;
}

window.openWritingSubmitScreen = openWritingSubmitScreen;
window.closeWritingSubmitScreen = closeWritingSubmitScreen;
window.clearWritingSketchpad = clearWritingSketchpad;
window.renderWritingStatusForFamily = renderWritingStatusForFamily;

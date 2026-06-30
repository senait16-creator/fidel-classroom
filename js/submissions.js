// =============================================================================
// SUBMISSIONS.JS
// Writing submission flow — student picks photo upload OR sketchpad,
// submits a writing sample for a specific letter family, captain/teacher
// reviews it. Separate from the photo_shares social feed — this writes to
// writing_submissions, scoped to one base_letter, with approve/reject status.
//
// Loads AFTER app.js. Relies on globals defined there:
//   _supabase, currentUser, currentProfile,
//   showNotificationToast, showGobezToast
// =============================================================================

let writingSubmitContext = null; // { baseLetter, onClose }
let writingSketchCtx = null;
let writingSketchDrawing = false;

// ---------------------------------------------------------------------------
// Entry point — opens the submission screen for a specific letter family
// onClose is called when the screen is dismissed (back button or after submit)
// ---------------------------------------------------------------------------

function openWritingSubmitScreen(baseLetter, onClose) {
    writingSubmitContext = { baseLetter, onClose };

    document.getElementById("writingSubmitTitle").innerText = `Submit Writing: "${baseLetter}"`;
    document.getElementById("writingSubmitScreen").style.display = "block";
    document.getElementById("writingSketchpadArea").style.display = "none";
    document.getElementById("writingRejectionNote").style.display = "none";

    document.querySelectorAll('#writingSubmitScreen .mode-option')
        .forEach(el => el.classList.remove('selected'));

    // Load and show previous submission status if any
    renderWritingStatusForFamily(baseLetter);

    // Photo upload option
    document.getElementById("writingChoiceUploadCard").onclick = () => {
        document.getElementById("writingPhotoInput").click();
    };

    // Sketchpad option
    document.getElementById("writingChoiceSketchCard").onclick = () => {
        document.querySelectorAll('#writingSubmitScreen .mode-option')
            .forEach(el => el.classList.remove('selected'));
        document.getElementById("writingChoiceSketchCard").classList.add('selected');
        document.getElementById("writingSketchpadArea").style.display = "block";
        setTimeout(initWritingSketchpad, 50);
    };

    // Photo file input handler
    const photoInput = document.getElementById("writingPhotoInput");
    photoInput.value = "";
    photoInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            document.getElementById("writingChoiceUploadCard").classList.add('selected');
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

// ---------------------------------------------------------------------------
// Sketchpad for the submission screen
// Separate from the practice sketchpad in isolatedFamilyClassroom —
// this one writes to writing_submissions, not photo_shares.
// ---------------------------------------------------------------------------

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

    function start(e) {
        writingSketchDrawing = true;
        writingSketchCtx.beginPath();
        const c = getCoords(e);
        writingSketchCtx.moveTo(c.x, c.y);
    }

    function draw(e) {
        if (!writingSketchDrawing) return;
        const c = getCoords(e);
        writingSketchCtx.lineTo(c.x, c.y);
        writingSketchCtx.stroke();
    }

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
    if (writingSketchCtx && canvas) {
        writingSketchCtx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

// ---------------------------------------------------------------------------
// Upload handlers — photo file and sketchpad blob both funnel into
// finalizeWritingSubmission() once the image is in storage.
// ---------------------------------------------------------------------------

async function submitWritingPhoto(file) {
    showNotificationToast("Uploading your photo...");

    // encodeURIComponent prevents Amharic characters from breaking the
    // storage path — Supabase rejects filenames with non-ASCII characters.
    const storagePath = `writing-${currentUser.id}-${encodeURIComponent(writingSubmitContext.baseLetter)}-${Date.now()}.png`;

    const { error: uploadError } = await _supabase.storage
        .from('art_shares')
        .upload(storagePath, file, { contentType: file.type });

    if (uploadError) {
        console.error("Writing photo upload failed:", uploadError);
        return showNotificationToast("Upload failed: " + uploadError.message);
    }

    const { data: urlData } = _supabase.storage
        .from('art_shares')
        .getPublicUrl(storagePath);

    await finalizeWritingSubmission(urlData.publicUrl);
}

async function submitWritingSketch() {
    const canvas = document.getElementById("writingSketchpad");
    const emptyCheck = document.createElement("canvas");
    emptyCheck.width = canvas.width;
    emptyCheck.height = canvas.height;

    if (canvas.toDataURL() === emptyCheck.toDataURL()) {
        return showNotificationToast("Draw something before submitting!");
    }

    showNotificationToast("Submitting your drawing...");

    canvas.toBlob(async (blob) => {
        const storagePath = `writing-${currentUser.id}-${encodeURIComponent(writingSubmitContext.baseLetter)}-${Date.now()}.png`;

        const { error: uploadError } = await _supabase.storage
            .from('art_shares')
            .upload(storagePath, blob, { contentType: 'image/png' });

        if (uploadError) {
            console.error("Writing sketch upload failed:", uploadError);
            return showNotificationToast("Upload failed: " + uploadError.message);
        }

        const { data: urlData } = _supabase.storage
            .from('art_shares')
            .getPublicUrl(storagePath);

        await finalizeWritingSubmission(urlData.publicUrl);
    }, "image/png");
}

// ---------------------------------------------------------------------------
// Save submission row to writing_submissions table
// ---------------------------------------------------------------------------

async function finalizeWritingSubmission(imageUrl) {
    const { error } = await _supabase
        .from('writing_submissions')
        .insert({
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

// ---------------------------------------------------------------------------
// Submission status display
// Shows the last 3 submissions for a family so the student can track history
// and see any rejection notes from their captain.
// ---------------------------------------------------------------------------

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

    if (!submissions || submissions.length === 0) {
        box.style.display = "none";
        return;
    }

    box.style.display = "block";
    const latest = submissions[0];

    let statusHTML = '';

    if (latest.status === 'approved') {
        statusHTML = `
            <div class="challenge-writing-status approved">
                ✓ Your writing for "${baseLetter}" was approved!
            </div>`;
    } else if (latest.status === 'rejected') {
        statusHTML = `
            <div class="challenge-writing-status rejected">
                ✗ Needs another try.
                ${latest.reviewer_note
                    ? `<br><strong>Captain's note:</strong> ${latest.reviewer_note}`
                    : ''}
            </div>`;
    } else {
        statusHTML = `
            <div class="challenge-writing-status pending">
                ⏳ Waiting for your captain to review.
            </div>`;
    }

    // Show history for older submissions if they exist
    if (submissions.length > 1) {
        const historyItems = submissions.slice(1).map(sub => {
            const date = new Date(sub.submitted_at).toLocaleDateString();
            const icon = sub.status === 'approved' ? '✓'
                : sub.status === 'rejected' ? '✗'
                : '⏳';
            const color = sub.status === 'approved' ? '#166534'
                : sub.status === 'rejected' ? '#991b1b'
                : '#92400e';
            return `
                <div style="font-size:11px; color:${color}; padding:3px 0;
                            border-top:1px solid #f1f5f9; margin-top:4px;">
                    ${icon} ${date}
                    ${sub.reviewer_note ? ` — "${sub.reviewer_note}"` : ''}
                </div>`;
        }).join('');

        statusHTML += `<div style="margin-top:8px;">${historyItems}</div>`;
    }

    box.innerHTML = statusHTML;
}

// ---------------------------------------------------------------------------
// Expose to inline handlers and other JS files
// ---------------------------------------------------------------------------

window.openWritingSubmitScreen = openWritingSubmitScreen;
window.closeWritingSubmitScreen = closeWritingSubmitScreen;
window.clearWritingSketchpad = clearWritingSketchpad;
window.renderWritingStatusForFamily = renderWritingStatusForFamily;

       const SUPABASE_URL = "https://muisfipoyzkhznfdvnes.supabase.co"; 
        const SUPABASE_KEY = "sb_publishable_VBiJZB8TVM2CSl54aDPP0A_4aDXWb5i";
        const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
console.log("App script is loading...");

        const ADMIN_EMAIL = "senaitrichmond16@gmail.com";
        const CLASSROOM_COLORS = ["Red Team 🔴", "Blue Team 🔵", "Green Team 🟢", "Yellow Team 🟡", "Purple Team 🟣"];

        let currentUser = null; let masteredLetters = []; let activeBaseFidel = null; 
        let activeFamilyArrayData = []; let activeSubscriptsData = []; let selectedAvatarSymbol = "🦁"; 
        let isSignUpMode = true;

        let activeGamePairs = []; let selectedGameTokenId = null; let currentStreakScore = 0;
        let gameModeScope = "all";

        let canvas, ctx, isDrawing = false;

        const vowelFrameworkLabels = ["ha", "hu", "hee", "ha", "hay", "hih", "ho"];
        const standardVowelSubscripts = ["-ä", "-u", "-ee", "-a", "-ay", "-ih", "-o"];

        const alphabetData = [
            {base:"ሀ", family:['ሀ','ሁ','ሂ','ሃ','ሄ','ህ','ሆ'], prefix:"h"},
            {base:"ለ", family:['ለ','ሉ','ሊ','ላ','ሌ','ል','ሎ'], prefix:"l"},
            {base:"ሐ", family:['ሐ','ሑ','ሒ','ሓ','ሔ','ሕ','ሖ'], prefix:"ḥ"},
            {base:"መ", family:['መ','ሙ','ሚ','ማ','ሜ','ም','ሞ'], prefix:"m"},
            {base:"ሠ", family:['ሠ','ሡ','ሢ','ሣ','ሤ','ሥ','ሦ'], prefix:"ś"},
            {base:"ረ", family:['ረ','ሩ','ሪ','ራ','ሬ','ር','ሮ'], prefix:"r"},
            {base:"ሰ", family:['ሰ','ሱ','ሲ','ሳ','ሴ','ስ','ሶ'], prefix:"s"},
            {base:"ሸ", family:['ሸ','ሹ','ሺ','ሻ','ሼ','ሽ','ሾ'], prefix:"š"},
            {base:"ቀ", family:['ቀ','ቁ','ቂ','ቃ','ቄ','ቅ','ቆ'], prefix:"q"},
            {base:"በ", family:['በ','ቡ','ቢ','ባ','ቤ','ብ','ቦ'], prefix:"b"},
            {base:"ቨ", family:['ቨ','ቩ','ቪ','ቫ','ቬ','ቭ','ቮ'], prefix:"v"},
            {base:"ተ", family:['ተ','ቱ','ቲ','ታ','ቴ','ት','ቶ'], prefix:"t"},
            {base:"ቸ", family:['ቸ','ቹ','ቺ','ቻ','ቼ','ች','ቾ'], prefix:"č"},
            {base:"ኀ", family:['ኀ','ኁ','ኂ','ኃ','ኄ','ኅ','ኆ'], prefix:"n"},
            {base:"ነ", family:['ነ','ኑ','ኒ','ና','ኔ','ን','ኖ'], prefix:"n"},
            {base:"ኘ", family:['ኘ','ኙ','ኚ','ኛ','ኜ','ኝ','ኞ'], prefix:"ñ"},
            {base:"አ", family:['አ','ኡ','ኢ','ኣ','ኤ','እ','ኦ'], prefix:"ʾ"},
            {base:"ከ", family:['ከ','ኩ','ኪ','ካ','ኬ','ክ','ኮ'], prefix:"k"},
            {base:"ኸ", family:['ኸ','ኹ','ኺ','ኻ','ኼ','ኽ','ኾ'], prefix:"ḫ"},
            {base:"ወ", family:['ወ','ዉ','ዊ','ዋ','ዌ','ው','ዎ'], prefix:"w"},
            {base:"ዐ", family:['ዐ','ዑ','ዒ','ዓ','ዔ','ዕ','ዖ'], prefix:"ʿ"},
            {base:"ዘ", family:['ዘ','ዙ','ዚ','ዛ','ዜ','ዝ','ዞ'], prefix:"z"},
            {base:"ዠ", family:['ዠ','ዡ','ዢ','ዣ','ዤ','ዥ','ዦ'], prefix:"ž"},
            {base:"የ", family:['የ','ዩ','ዪ','ያ','ዬ','ይ','ዮ'], prefix:"y"},
            {base:"ደ", family:['ደ','ዱ','ዲ','ዳ','ዴ','ድ','ዶ'], prefix:"d"},
            {base:"ጀ", family:['ጀ','ጁ','ጂ','ጃ','ጄ','ጅ','ጆ'], prefix:"j"},
            {base:"ገ", family:['ገ','ጉ','ጊ','ጋ','ጌ','ግ','ጎ'], prefix:"g"},
            {base:"ጠ", family:['ጠ','ጡ','ጢ','ጣ','ጤ','ጥ','ጦ'], prefix:"ṭ"},
            {base:"ጨ", family:['ጨ','ጩ','ጪ','ጫ','ጬ','ጭ','ጮ'], prefix:"č̣"},
            {base:"ጰ", family:['ጰ','ጱ','ጲ','ጳ','ጴ','ጵ','ጶ'], prefix:"p̣"},
            {base:"ጸ", family:['ጸ','ጹ','ጺ','ጻ','ጼ','ጽ','ጾ'], prefix:"ṣ"},
            {base:"ፀ", family:['ፀ','ፁ','ፂ','ፃ','ፄ','ፅ','ፆ'], prefix:"ṣ́"},
            {base:"ፈ", family:['ፈ','ፉ','ፊ','ፋ','ፌ','ፍ','ፎ'], prefix:"f"},
            {base:"ፐ", family:['ፐ','ፑ','ፒ','ፓ','ፔ','ፕ','ፖ'], prefix:"p"}
        ];

        window.addEventListener('DOMContentLoaded', () => { 
            resetToGate(); 
        });

       const TEAMS = ['Red', 'Blue', 'Green', 'Yellow'];

async function assignNextTeam() {
    // 1. Get current counts
    const { data: students } = await _supabase.from('profiles').select('team_color');
    
    // 2. Count current assignments
    const counts = { 'Red': 0, 'Blue': 0, 'Green': 0, 'Yellow': 0 };
    students.forEach(s => { if(counts[s.team_color] !== undefined) counts[s.team_color]++; });

    // 3. Find the team with the minimum count (keeps it balanced!)
    const nextTeam = TEAMS.reduce((a, b) => counts[a] <= counts[b] ? a : b);
    
    return nextTeam;
}

document.getElementById('loginBtn').addEventListener('click', () => {
    selectAuthFlow('login');
});

async function changeStudentTeam(studentId, newColor) {
    const { error } = await _supabase
        .from('profiles')
        .update({ team_color: newColor })
        .eq('id', studentId);

    if (error) {
        console.error("Assignment failed:", error);
    } else {
        alert("Student team updated successfully!");
        refreshRoster(); // Refresh the teacher's table view
    }
}

async function checkAdminStatus() {
    const { data: { user } } = await _supabase.auth.getUser();
    
    const { data: profile } = await _supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

    if (profile && profile.is_admin) {
        // Show the teacher dashboard and hide the student one
        document.getElementById('teacherOnlyDashboard').style.display = 'block';
        document.getElementById('adminHeaderToggleBar').style.display = 'flex';
    } else {
        // Hide teacher panels for regular students
        document.getElementById('teacherOnlyDashboard').style.display = 'none';
        document.getElementById('adminHeaderToggleBar').style.display = 'none';
    }
}

function showNotificationToast(msg) {
            const container = document.getElementById("toastContainer");
            const element = document.createElement("div");
            element.className = "toast-popup";
            element.innerHTML = `<span>${msg}</span>`;
            container.appendChild(element);
            setTimeout(() => element.remove(), 3000);
        }

        function initSketchpadEngineSystem() {
            canvas = document.getElementById("sketchpad");
            if (!canvas) return;
            ctx = canvas.getContext("2d");
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.strokeStyle = "#1e293b";

            function getCoordinates(e) {
                const rect = canvas.getBoundingClientRect();
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                return { x: clientX - rect.left, y: clientY - rect.top };
            }
            function startDraw(e) { isDrawing = true; ctx.beginPath(); const coords = getCoordinates(e); ctx.moveTo(coords.x, coords.y); }
            function draw(e) { if (!isDrawing) return; const coords = getCoordinates(e); ctx.lineTo(coords.x, coords.y); ctx.stroke(); }
            function stopDraw() { isDrawing = false; }

            canvas.addEventListener("mousedown", startDraw); canvas.addEventListener("mousemove", draw); window.addEventListener("mouseup", stopDraw);
            canvas.addEventListener("touchstart", startDraw); canvas.addEventListener("touchmove", draw); window.addEventListener("touchend", stopDraw);
        }

        function clearSketchpadCanvas() { ctx.clearRect(0, 0, canvas.width, canvas.height); }

        async function uploadSketchpadDrawingCanvasData() {
            const emptyCheck = document.createElement("canvas");
            emptyCheck.width = canvas.width; emptyCheck.height = canvas.height;
            if (canvas.toDataURL() === emptyCheck.toDataURL()) return showNotificationToast("Draw something before sharing!");

            showNotificationToast("Uploading your drawing...");
            canvas.toBlob(async (blob) => {
                const storagePath = `canvas-${Date.now()}.png`;
                const { data: uploadData, error: uploadError } = await _supabase.storage.from('art_shares').upload(storagePath, blob, { contentType: 'image/png' });
                if (uploadError) return showNotificationToast(uploadError.message);

                const { data: urlData } = _supabase.storage.from('art_shares').getPublicUrl(storagePath);
                const expirationTimestamp = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

                await _supabase.from('photo_shares').insert({ user_id: currentUser.id, image_url: urlData.publicUrl, expires_at: expirationTimestamp, meta_points: 0 });
                clearSketchpadCanvas();
                showNotificationToast("Drawing shared to the class board!");
                fetchDisappearingImageCanvasBoard();
            }, "image/png");
        }
async function renderCaptainInbox() {
    // 1. Fetch pending work for this captain's team
    const { data: submissions } = await _supabase
        .from('work_submissions')
        .select('*, profiles(display_name)')
        .eq('status', 'pending');

    const inboxContainer = document.getElementById('captainInboxMount'); // Make sure this exists in your HTML
    if (!inboxContainer) return;

    inboxContainer.innerHTML = `<h3>Pending Submissions</h3>`;

    submissions.forEach(sub => {
        const div = document.createElement('div');
        div.className = 'submission-card';
        div.innerHTML = `
            <p>${sub.profiles.display_name} submitted work</p>
            <img src="${sub.image_url}" style="width:100px; height:100px;">
            <button onclick="approveStudentWork('${sub.id}')">Approve</button>
        `;
        inboxContainer.appendChild(div);
    });
}
        async function checkMySubmissionStatus() {
    const { data: statusData } = await _supabase
        .from('work_submissions')
        .select('status')
        .eq('student_id', currentUser.id)
        .order('created_at', { ascending: false })
        .maybeSingle();

    const statusMount = document.getElementById('myStatusMount');
    if (!statusMount) return;

    if (statusData) {
        statusMount.innerHTML = `
            <div class="status-badge ${statusData.status}">
                Status: ${statusData.status.toUpperCase()}
            </div>
        `;
    }
}
        async function submitVerificationCounterBump(shareId, element) {
            const currentVal = parseInt(element.getAttribute('data-count') || "0");
            const updatedVal = currentVal + 1;
            await _supabase.from('photo_shares').update({ meta_points: updatedVal }).eq('id', shareId);
            element.setAttribute('data-count', updatedVal);
            element.innerHTML = `👍 Verified (${updatedVal})`;
            showNotificationToast("Marked as verified!");
        }

        function executeVictoryConfettiCelebration() {
            const confCanvas = document.getElementById("confettiCanvas");
            const confCtx = confCanvas.getContext("2d");
            confCanvas.width = window.innerWidth; confCanvas.height = window.innerHeight;
            let particles = [];
            const colorPalettes = ["#0f766e", "#0d9488", "#14b8a6", "#2563eb", "#334155"];

            for (let i = 0; i < 100; i++) {
                particles.push({
                    x: window.innerWidth / 2, y: window.innerHeight / 1.5,
                    vx: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.8) * 15,
                    size: Math.random() * 6 + 3, color: colorPalettes[Math.floor(Math.random() * colorPalettes.length)],
                    rotation: Math.random() * 360, rSpeed: Math.random() * 4 - 2
                });
            }

            function animateConfettiLoop() {
                if (particles.length === 0) return confCtx.clearRect(0,0,confCanvas.width,confCanvas.height);
                confCtx.clearRect(0, 0, confCanvas.width, confCanvas.height);
                particles.forEach((p, idx) => {
                    p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.rotation += p.rSpeed;
                    confCtx.save(); confCtx.translate(p.x, p.y); confCtx.rotate((p.rotation * Math.PI) / 180);
                    confCtx.fillStyle = p.color; confCtx.fillRect(-p.size/2, -p.size/2, p.size, p.size); confCtx.restore();
                    if (p.y > confCanvas.height) particles.splice(idx, 1);
                });
                requestAnimationFrame(animateConfettiLoop);
            }
            animateConfettiLoop();
        }

        function resetToGate() {
            document.getElementById("authScreen").style.display = "block";
            document.getElementById("onboardingGate").style.display = "flex";
            document.getElementById("credentialFields").style.display = "none";
            document.getElementById("studentDashboard").style.display = "none";
            document.getElementById("teacherOnlyDashboard").style.display = "none";
            document.getElementById("adminViewSelectorGate").style.display = "none";
        }

        function selectAuthFlow(flow) {
            isSignUpMode = (flow === 'signup');
            document.getElementById("onboardingGate").style.display = "none";
            document.getElementById("credentialFields").style.display = "block";
        }

        async function handleAuth() {
            const email = document.getElementById("email").value.trim();
            const password = document.getElementById("password").value;
            if (!email || !password) return showNotificationToast("Please fill in all boxes.");

            const { data, error } = isSignUpMode 
                ? await _supabase.auth.signUp({ email, password })
                : await _supabase.auth.signInWithPassword({ email, password });

            if (error) return showNotificationToast(error.message);
            if (data?.user) proceedFlowMap(data.user);
        }

        async function proceedFlowMap(user) {
            currentUser = user;
const { data: profile } = await _supabase
    .from('profiles')
    .select('nickname, avatar, team_color') // Updated column names
    .eq('id', user.id)
    .maybeSingle();
               
            if (currentUser.email === ADMIN_EMAIL) {
                document.getElementById("authScreen").style.display = "none";
                document.getElementById("adminViewSelectorGate").style.display = "block";
                return;
            }

            if (profile && profile.nickname) {
    selectedAvatarSymbol = profile.avatar; // Updated name
    document.getElementById("displayUserHeader").innerText = profile.nickname;
    document.getElementById("displayAvatarHeader").innerText = profile.avatar;
                   
                   const teamDisplay = document.getElementById("sidebarPodBadge");
    teamDisplay.innerText = profile.team_color !== 'unassigned' ? profile.team_color : "No Team Assigned";
                   
                   teamDisplay.style.color = profile.team_color; 
    
    launchDashboard("student");
                   
            } else {
                document.getElementById("authScreen").style.display = "none";
                document.getElementById("profileSetupScreen").style.display = "block";
                populateTeamSetupDropdownOptions();
            }
        }

        function populateTeamSetupDropdownOptions() {
            const selectElement = document.getElementById("profileTeamSelect");
            selectElement.innerHTML = '';
            CLASSROOM_COLORS.forEach(color => {
                selectElement.innerHTML += `<option value="${color}">${color}</option>`;
            });
        }
async function submitWorkForVerification(imageUrl) {
    const { data: profile } = await _supabase.from('profiles').select('team_id').eq('id', currentUser.id).single();

    await _supabase.from('work_submissions').insert({
        student_id: currentUser.id,
        team_id: profile.team_id,
        image_url: imageUrl,
        status: 'pending'
    });

    showNotificationToast("Work submitted to your Captain!");
}
        async function approveStudentWork(submissionId) {
    // Only allow if current user is the Captain
    const { data: team } = await _supabase.from('teams').select('captain_id').eq('captain_id', currentUser.id).maybeSingle();

    if (!team) {
        showNotificationToast("Only the Captain can approve work!");
        return;
    }

    await _supabase.from('work_submissions').update({ status: 'approved' }).eq('id', submissionId);
    showNotificationToast("Work approved! Progress updated.");
    // Trigger a refresh of the Team Board here
}
        function routeAdminTerminalDirectly(targetPanel) {
            document.getElementById("adminViewSelectorGate").style.display = "none";
            launchDashboard(targetPanel);
        }

        function switchAdminPanelsFromDashboard(targetPanel) {
            document.getElementById("studentDashboard").style.display = "none";
            document.getElementById("teacherOnlyDashboard").style.display = "none";
            launchDashboard(targetPanel);
        }

        function launchDashboard(viewMode) {
            if (currentUser.email === ADMIN_EMAIL) {
                document.getElementById("adminHeaderToggleBar").style.display = "flex";
            }

            if (viewMode === "teacher") {
                document.getElementById("teacherOnlyDashboard").style.display = "block";
                loadTeacherRosterData();
                teacherRefreshConfigurationDropdowns();
            } else {
            document.getElementById("studentDashboard").style.display = "block";
            fetchUserProgress();
            renderLiveLeaderboard();
            fetchDisappearingImageCanvasBoard();

            // --- NEW TEAM LOGIC ---
            loadTeamDashboard(currentUser); 
            // ----------------------

            buildMatrixInterfaceGrid();
        }
        }

      async function loadTeacherRosterData() {
    const tbody = document.getElementById("teacherRosterTableBody");
    tbody.innerHTML = '<tr><td colspan="3" style="color:#94a3b8; text-align:center;">Loading class roster...</td></tr>';

    // 1. Updated: Use 'nickname', 'avatar', and 'team_color'
    const { data: students } = await _supabase
        .from('profiles')
        .select('id, nickname, avatar, team_color'); 
        
    const { data: progress } = await _supabase
        .from('user_progress')
        .select('user_id, mastered_letters');

    const progressMap = {};
    progress?.forEach(rec => { progressMap[rec.user_id] = rec.mastered_letters || []; });

    tbody.innerHTML = '';
    if(!students || students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="color:#94a3b8; text-align:center;">No students registered yet.</td></tr>';
        return;
    }

    students.forEach(s => {
        const masteredCount = (progressMap[s.id] || []).length;
        
        // 2. Updated: Use 'team_color', handle 'unassigned'
        const teamDisplay = (s.team_color && s.team_color !== 'unassigned') 
            ? `<span style="color:${s.team_color}; font-weight:700;">${s.team_color}</span>` 
            : '<span style="color:#94a3b8; font-style:italic;">Unassigned</span>';

        // 3. Updated: Use 'nickname' and 'avatar'
        tbody.innerHTML += `
            <tr>
                <td style="font-weight:500;">${s.avatar || '🦁'} ${s.nickname}</td>
                <td>${teamDisplay}</td>
                <td><strong>${masteredCount} / 34 rows</strong> complete</td>
            </tr>
        `;
    });
}

        function openMatchingGameWorkspaceMode(scope) {
            gameModeScope = scope;
            document.getElementById("viewFidelGrid").style.display = "none";
            document.getElementById("isolatedFamilyClassroom").style.display = "none";
            document.getElementById("gameWorkspace").style.display = "block";

            const exitBtn = document.getElementById("gameExitActionBtn");
            if (scope === "all") {
                document.getElementById("gameWorkspaceTitle").innerText = "Game Arena: All Letters";
                exitBtn.onclick = () => {
                    document.getElementById("gameWorkspace").style.display = "none";
                    document.getElementById("viewFidelGrid").style.display = "grid";
                };
            } else {
                document.getElementById("gameWorkspaceTitle").innerText = `Game Arena: Row "${scope.base}"`;
                exitBtn.onclick = () => {
                    document.getElementById("gameWorkspace").style.display = "none";
                    document.getElementById("isolatedFamilyClassroom").style.display = "block";
                };
            }

            currentStreakScore = 0;
            document.getElementById("gameStreakValue").innerText = currentStreakScore;
            generateNewGameRoundData();
        }

        function generateNewGameRoundData() {
            activeGamePairs = [];
            selectedGameTokenId = null;

            let structuralSelectionList = [];
            if (gameModeScope === "all") {
                let pool = [...alphabetData].sort(() => Math.random() - 0.5).slice(0, 4);
                pool.forEach(item => {
                    let rIdx = Math.floor(Math.random() * 7);
                    let sub = standardVowelSubscripts[rIdx];
                    let phoneticString = (item.prefix === "h" || item.prefix === "ḥ") ? vowelFrameworkLabels[rIdx] : `${item.prefix}${sub}`;
                    structuralSelectionList.push({ char: item.family[rIdx], matchKey: item.family[rIdx], displayTxt: item.family[rIdx], kind: "fidel" });
                    structuralSelectionList.push({ char: item.family[rIdx], matchKey: item.family[rIdx], displayTxt: phoneticString, kind: "phonetic" });
                });
            } else {
                let indices = [0,1,2,3,4,5,6].sort(() => Math.random() - 0.5).slice(0, 4);
                indices.forEach(idx => {
                    let sub = standardVowelSubscripts[idx];
                    let phoneticString = (gameModeScope.prefix === "h" || gameModeScope.prefix === "ḥ") ? vowelFrameworkLabels[idx] : `${gameModeScope.prefix}${sub}`;
                    structuralSelectionList.push({ char: gameModeScope.family[idx], matchKey: gameModeScope.family[idx], displayTxt: gameModeScope.family[idx], kind: "fidel" });
                    structuralSelectionList.push({ char: gameModeScope.family[idx], matchKey: gameModeScope.family[idx], displayTxt: phoneticString, kind: "phonetic" });
                });
            }

            activeGamePairs = structuralSelectionList.sort(() => Math.random() - 0.5);
            renderErgonomicBlockGameElements();
        }

        function renderErgonomicBlockGameElements() {
            const mount = document.getElementById("ergonomicBlockGameMount");
            mount.innerHTML = "";

            activeGamePairs.forEach((tokenData, index) => {
                const tokenElement = document.createElement("div");
                tokenElement.className = "game-interactive-token";
                tokenElement.innerText = tokenData.displayTxt;
                tokenElement.setAttribute("data-index", index);
                tokenElement.onclick = () => selectBlockTokenTrackElement(tokenElement, index);
                mount.appendChild(tokenElement);
            });
        }

        function selectBlockTokenTrackElement(element, index) {
            if (element.classList.contains("resolved-pair")) return;
            const targetToken = activeGamePairs[index];

            if (selectedGameTokenId === null) {
                element.classList.add("active-selected");
                selectedGameTokenId = index;
            } else {
                if (selectedGameTokenId === index) {
                    element.classList.remove("active-selected");
                    selectedGameTokenId = null;
                    return;
                }

                const absolutePriorElement = document.querySelector(`[data-index="${selectedGameTokenId}"]`);
                const priorToken = activeGamePairs[selectedGameTokenId];

                if (targetToken.matchKey === priorToken.matchKey && targetToken.kind !== priorToken.kind) {
                    element.className = "game-interactive-token resolved-pair";
                    absolutePriorElement.className = "game-interactive-token resolved-pair";
                    currentStreakScore++;
                    document.getElementById("gameStreakValue").innerText = currentStreakScore;
                    showNotificationToast("Match found!");
                    selectedGameTokenId = null;
                    checkBlockGameCompletionState();
                } else {
                    currentStreakScore = 0;
                    document.getElementById("gameStreakValue").innerText = currentStreakScore;
                    showNotificationToast("Not quite right! Streak reset.");
                    element.classList.remove("active-selected");
                    absolutePriorElement.classList.remove("active-selected");
                    selectedGameTokenId = null;
                }
            }
        }

        function checkBlockGameCompletionState() {
            const unresolved = document.querySelectorAll("#ergonomicBlockGameMount .game-interactive-token:not(.resolved-pair)");
            if (unresolved.length === 0) {
                executeVictoryConfettiCelebration();
                showNotificationToast("You cleared the board! Starting next round...");
                setTimeout(generateNewGameRoundData, 1000);
            }
        }

        function selectAvatar(symbol, element) {
            document.querySelectorAll('.avatar-option').forEach(opt => opt.classList.remove('selected'));
            element.classList.add('selected'); selectedAvatarSymbol = symbol;
        }

async function saveProfileData() {
    const nameInput = document.getElementById("displayName").value.trim();
    if (!nameInput) return showNotificationToast("Please enter a nickname.");

    let selectedColorTeam = document.getElementById("profileTeamSelect").value;
    if (!selectedColorTeam || selectedColorTeam === "") {
        return showNotificationToast("Please select a color team!");
    }

    // --- Add a loading state here ---
    const saveBtn = event.target; 
    saveBtn.disabled = true;
    saveBtn.innerText = "Saving...";

    const { data: { user } } = await _supabase.auth.getUser();

    const { error } = await _supabase
        .from('profiles')
        .upsert({ 
            id: user.id, 
            nickname: nameInput,
            avatar: selectedAvatarSymbol,
            team_color: selectedColorTeam 
        });

    if (error) {
        saveBtn.disabled = false;
        saveBtn.innerText = "Join the Classroom";
        console.error("Save Error:", error);
        return showNotificationToast("Error: " + error.message);
    }

    // --- Continue with UI updates and navigation ---
    document.getElementById("displayUserHeader").innerText = nameInput;
    document.getElementById("displayAvatarHeader").innerText = selectedAvatarSymbol;
    const teamBadge = document.getElementById("sidebarPodBadge");
    teamBadge.innerText = selectedColorTeam;
    teamBadge.style.color = selectedColorTeam;
    
    launchDashboard("student");

    // UI Updates
    document.getElementById("displayUserHeader").innerText = nameInput;
    document.getElementById("displayAvatarHeader").innerText = selectedAvatarSymbol;
    
    launchDashboard("student");

        async function teacherRefreshConfigurationDropdowns() {
            const { data: students } = await _supabase.from('profiles').select('id, display_name');

            const sSelect = document.getElementById("teacherStudentSelect");
            sSelect.innerHTML = '<option value="">Select Student...</option>';
            students?.forEach(s => { sSelect.innerHTML += `<option value="${s.id}">${s.display_name}</option>`; });

            const pSelect = document.getElementById("teacherPodSelect");
            pSelect.innerHTML = '<option value="">Select Color Team...</option>';
            CLASSROOM_COLORS.forEach(color => { pSelect.innerHTML += `<option value="${color}">${color}</option>`; });
        }

       async function teacherAssignStudentToPod() {
    const studentId = document.getElementById("teacherStudentSelect").value;
    const chosenColor = document.getElementById("teacherPodSelect").value;

    if (!studentId || !chosenColor) {
        return showNotificationToast("Please pick both a student and a team color.");
    }

    showNotificationToast("Updating team assignment...");
    
    const { error } = await _supabase
        .from('profiles')
        .update({ team_color: chosenColor }) 
        .eq('id', studentId);

    if (error) {
        console.error("Error moving student:", error);
        return showNotificationToast("Failed to move student: " + error.message);
    }

    showNotificationToast(`Student assigned to ${chosenColor}!`);
    
    // Refresh the UI to reflect the change
    await loadTeacherRosterData();
    await teacherRefreshConfigurationDropdowns();
}
        
function toggleDropdownElement(elementId) {
            document.getElementById(elementId).classList.toggle('open');
        }

        function buildMatrixInterfaceGrid() {
            const container = document.getElementById("viewFidelGrid"); container.innerHTML = "";
            alphabetData.forEach(item => {
                const card = document.createElement('div');
                card.className = "fidel-card"; card.setAttribute('data-fidel', item.base); card.innerText = item.base;
                card.onclick = () => launchIsolatedClassroomWorkspace(item);
                container.appendChild(card);
            });
            renderUIProgressUpdates();
        }

        function generateClassroomSubscripts(prefix) {
            if (prefix === "h" || prefix === "ḥ") return vowelFrameworkLabels;
            return standardVowelSubscripts.map(sub => `${prefix}${sub}`);
        }

        function launchIsolatedClassroomWorkspace(fidelObj) {
            activeBaseFidel = fidelObj.base; activeFamilyArrayData = fidelObj.family;
            activeSubscriptsData = generateClassroomSubscripts(fidelObj.prefix);

            document.getElementById("viewFidelGrid").style.display = "none";
            document.getElementById("isolatedFamilyClassroom").style.display = "block";
            document.getElementById("classroomFamilyTitle").innerText = `Reviewing Row: "${activeBaseFidel}"`;

            document.getElementById("classroomRowGameBtn").onclick = () => openMatchingGameWorkspaceMode(fidelObj);

            const undoBtn = document.getElementById("classroomUndoBtn");
            if (masteredLetters.includes(activeBaseFidel)) {
                undoBtn.style.display = "block";
            } else {
                undoBtn.style.display = "none";
            }

            renderGiantClassroomRowItems(activeFamilyArrayData, activeSubscriptsData);
            setTimeout(initSketchpadEngineSystem, 50);
        }

        function renderGiantClassroomRowItems(familyArray, subscriptsArray) {
            const mount = document.getElementById("classroomGiantRowMount"); mount.innerHTML = "";
            familyArray.forEach((char, idx) => {
                const card = document.createElement('div');
                card.className = "giant-char-card";
                card.innerHTML = `<div class="letter">${char}</div><div class="sub">${subscriptsArray[idx]}</div>`;
                mount.appendChild(card);
            });
        }

        function shuffleClassroomRowPhonetics() {
            let layoutIndices = [0,1,2,3,4,5,6].sort(() => Math.random() - 0.5);
            const mount = document.getElementById("classroomGiantRowMount"); mount.innerHTML = "";
            layoutIndices.forEach(idx => {
                const card = document.createElement('div');
                card.className = "giant-char-card";
                card.innerHTML = `<div class="letter">${activeFamilyArrayData[idx]}</div><div class="sub">${activeSubscriptsData[idx]}</div>`;
                mount.appendChild(card);
            });
        }

        async function classroomMarkAsMasteredDirectly() {
            if (!masteredLetters.includes(activeBaseFidel)) masteredLetters.push(activeBaseFidel);
            await _supabase.from('user_progress').upsert({ user_id: currentUser.id, mastered_letters: masteredLetters }, { onConflict: 'user_id' });
            showNotificationToast(`Row "${activeBaseFidel}" saved to your mastered list!`);
            executeVictoryConfettiCelebration();

        }

        async function classroomUnmasterLetterRow() {
            masteredLetters = masteredLetters.filter(item => item !== activeBaseFidel);
            await _supabase.from('user_progress').upsert({ user_id: currentUser.id, mastered_letters: masteredLetters }, { onConflict: 'user_id' });
            showNotificationToast(`Removed "${activeBaseFidel}" from mastered rows.`);

        }

        function exitClassroomViewBackToGrid() {
            document.getElementById("isolatedFamilyClassroom").style.display = "none";
            document.getElementById("viewFidelGrid").style.display = "grid";
            buildMatrixInterfaceGrid();
        }



        async function fetchDisappearingImageCanvasBoard() {
            const currentISOTime = new Date().toISOString();
            const { data: activeShares } = await _supabase.from('photo_shares').select('id, image_url, expires_at, meta_points, user_id, profiles(display_name, avatar_character)').gt('expires_at', currentISOTime);
            const container = document.getElementById("disappearingArtGalleryFeed"); container.innerHTML = "";
            if (!activeShares || activeShares.length === 0) {
                container.innerHTML = `<p style="font-size:12px; color:#94a3b8; grid-column:1/-1;">No shared sketches yet today. Use the drawing pad to share yours!</p>`; return;
            }
            activeShares.forEach(share => {
                const hoursLeft = Math.max(0, Math.round((new Date(share.expires_at) - new Date()) / (1000 * 60 * 60)));
                const item = document.createElement('div'); item.className = "feed-item";
                const initialCount = share.meta_points || 0;
                item.innerHTML = `<img src="${share.image_url}"><div class="feed-meta"><div class="feed-meta-row"><strong>${share.profiles?.avatar_character || '🦁'} ${share.profiles?.display_name || 'User'}</strong><span style="color:#ef4444;">${hoursLeft}h left</span></div><div class="feed-meta-row" style="margin-top:4px;"><button class="verify-badge-btn" data-count="${initialCount}" onclick="submitVerificationCounterBump(${share.id}, this)">👍 Verify Form (${initialCount})</button></div></div>`;
                container.appendChild(item);
            });
        }

        async function fetchUserProgress() {
            const { data } = await _supabase.from('user_progress').select('mastered_letters').eq('user_id', currentUser.id).maybeSingle();
            if (data && data.mastered_letters) masteredLetters = data.mastered_letters;
            renderUIProgressUpdates();
        }

        function renderUIProgressUpdates() {
            document.querySelectorAll('.fidel-card').forEach(card => {
                if (masteredLetters.includes(card.getAttribute('data-fidel'))) card.classList.add('completed');
            });
            const percent = Math.round((masteredLetters.length / 34) * 100);
            document.getElementById("progressBar").style.width = `${percent}%`; 
            document.getElementById("progressText").innerText = `${percent}% Complete`;
        }

      async function renderLiveLeaderboard() {
    // Select new column names
    const { data: profiles } = await _supabase.from('profiles').select('id, nickname, avatar');
    const { data: progressRecords } = await _supabase.from('user_progress').select('user_id, mastered_letters');
    
    const progressMap = {}; 
    progressRecords.forEach(rec => { progressMap[rec.user_id] = rec.mastered_letters || []; });

    let leaderList = profiles.map(p => ({
        id: p.id, 
        name: p.nickname, // New column
        avatar: p.avatar || '🦁', // New column
        percentage: Math.round(((progressMap[p.id] || []).length / 34) * 100)
    })).sort((a, b) => b.percentage - a.percentage);

            const container = document.getElementById("liveLeaderboardContent"); container.innerHTML = "";
            leaderList.slice(0, 5).forEach((player, idx) => {
                const isSelf = currentUser && player.id === currentUser.id;
                container.innerHTML += `<div class="leaderboard-row ${isSelf ? 'current-user' : ''}"><div class="player-info"><span>#${idx + 1}</span><span>${player.avatar}</span><span>${player.name} ${isSelf ? '(You)' : ''}</span></div><span class="player-score-badge">${player.percentage}%</span></div>`;
            });
        }
// Add this to your main script to fetch and display the team status
 async function loadTeamDashboard(user) {
    const { data: userProfile } = await _supabase
        .from('profiles')
        .select('team_color, nickname, role')
        .eq('id', user.id)
        .single();

    if (!userProfile?.team_color) {
        document.getElementById("podTeammatesMount").innerHTML = "<p>No Team Assigned</p>";
        return;
    }

    const { data: members } = await _supabase
        .from('profiles')
        .select('nickname, avatar, team_color')
        .eq('team_color', userProfile.team_color);

    const mount = document.getElementById("podTeammatesMount");
    mount.innerHTML = `<h4>Team: <span style="color:${userProfile.team_color}">${userProfile.team_color}</span></h4>`;

    members.forEach(member => {
        const row = document.createElement('div');
        row.className = "teammate-row";
        row.innerHTML = `<span>${member.avatar || '🦁'} ${member.nickname}</span>`;
        mount.appendChild(row);
    });

    if (userProfile.role === 'captain') {
        const inboxMount = document.createElement('div');
        inboxMount.id = 'captainInboxMount';
        mount.appendChild(inboxMount);
        renderCaptainInbox(); 
    }
}

       async function saveProfileData() {
    // ... all your existing code to save to Supabase ...

    // After the save is successful, update the UI here:
    document.getElementById("displayUserHeader").innerText = nameInput;
    document.getElementById("displayAvatarHeader").innerText = selectedAvatarSymbol;
    
    // ... then call your dashboard ...
    launchDashboard("student");
}
window.handleAuth = handleAuth;
window.selectAuthFlow = selectAuthFlow;
window.resetToGate = resetToGate;
window.routeAdminTerminalDirectly = routeAdminTerminalDirectly;
window.selectAvatar = selectAvatar;
window.saveProfileData = saveProfileData;
window.switchAdminPanelsFromDashboard = switchAdminPanelsFromDashboard;
window.teacherAssignStudentToPod = teacherAssignStudentToPod;
window.logout = logout;
window.openMatchingGameWorkspaceMode = openMatchingGameWorkspaceMode;
window.shuffleClassroomRowPhonetics = shuffleClassroomRowPhonetics;
window.classroomMarkAsMasteredDirectly = classroomMarkAsMasteredDirectly;
window.classroomUnmasterLetterRow = classroomUnmasterLetterRow;
window.clearSketchpadCanvas = clearSketchpadCanvas;
window.uploadSketchpadDrawingCanvasData = uploadSketchpadDrawingCanvasData;
window.exitClassroomViewBackToGrid = exitClassroomViewBackToGrid;
window.openProfileEdit = openProfileEdit;
window.toggleDropdownElement = toggleDropdownElement;

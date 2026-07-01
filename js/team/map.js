// =============================================================================
// JS/TEAM/MAP.JS
// Challenge level map — full screen winding path with coffee cup level icons,
// coffee bean connectors, and team position dots.
// Loads after app.js, team/hub.js.
// =============================================================================

async function openChallengeMap() {
    document.getElementById('challengeMapOverlay').style.display = 'flex';
    await renderChallengeMap();
}

function closeChallengeMap() {
    document.getElementById('challengeMapOverlay').style.display = 'none';
}

async function renderChallengeMap() {
    const mount = document.getElementById('challengeMapMount');
    mount.innerHTML = `
        <div style="text-align:center; padding:60px 20px; color:#94a3b8;">
            <div style="font-size:32px; margin-bottom:12px;">☕</div>
            Loading map...
        </div>`;

    const [teamsRes, levelsRes, myTeamRes] = await Promise.all([
        _supabase.from('teams').select('id, name, current_level').order('name'),
        _supabase.from('challenge_levels').select('level_number, title, letter_families').order('level_number'),
        currentProfile?.team_id
            ? _supabase.from('teams').select('current_level').eq('id', currentProfile.team_id).maybeSingle()
            : Promise.resolve({ data: null })
    ]);

    const teams = teamsRes.data || [];
    const levels = levelsRes.data || [];
    const myCurrentLevel = myTeamRes.data?.current_level || 1;

    // Map level number → which teams are currently there
    const teamsByLevel = {};
    teams.forEach(team => {
        const lvl = team.current_level || 1;
        if (!teamsByLevel[lvl]) teamsByLevel[lvl] = [];
        teamsByLevel[lvl].push({ name: team.name, color: getTeamHex(team.name), id: team.id });
    });

    mount.innerHTML = '';

    const container = document.createElement('div');
    container.style.cssText = `
        padding: 24px 20px 60px;
        max-width: 380px;
        margin: 0 auto;
        width: 100%;
    `;

    // Legend
    const legend = document.createElement('div');
    legend.style.cssText = `
        display: flex; gap: 16px; flex-wrap: wrap; justify-content: center;
        margin-bottom: 28px; padding: 12px 16px;
        background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;
    `;
    teams.forEach(team => {
        const dot = document.createElement('div');
        dot.style.cssText = `
            display: flex; align-items: center; gap: 6px;
            font-size: 12px; font-weight: 600; color: #475569;
        `;
        dot.innerHTML = `
            <span style="width:10px; height:10px; border-radius:50%;
                         background:${getTeamHex(team.name)}; display:inline-block;
                         ${team.id === currentProfile?.team_id ? 'box-shadow:0 0 0 2px white, 0 0 0 3px ' + getTeamHex(team.name) + ';' : ''}">
            </span>
            ${team.name.replace(' Team', '').replace(/[🔴🔵🟢🟡🟣]/g, '').trim()}
            ${team.id === currentProfile?.team_id ? '<span style="color:#166534;">(you)</span>' : ''}
        `;
        legend.appendChild(dot);
    });
    container.appendChild(legend);

    // Build rows of 3 levels each, alternating direction
    const rows = [];
    for (let i = 0; i < levels.length; i += 3) {
        rows.push(levels.slice(i, i + 3));
    }

    rows.forEach((row, rowIdx) => {
        const isReversed = rowIdx % 2 === 1;
        const displayRow = isReversed ? [...row].reverse() : row;

        // Row of level nodes
        const rowEl = document.createElement('div');
        rowEl.style.cssText = `
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 0;
            flex-direction: ${isReversed ? 'row-reverse' : 'row'};
        `;

        displayRow.forEach((level, idx) => {
            const levelNum = level.level_number;
            const isCompleted = levelNum < myCurrentLevel;
            const isCurrent = levelNum === myCurrentLevel;
            const isLocked = levelNum > myCurrentLevel;
            const teamsHere = teamsByLevel[levelNum] || [];
            const isMyTeamHere = teamsHere.some(t => t.id === currentProfile?.team_id);

            // Level node wrapper
            const nodeWrap = document.createElement('div');
            nodeWrap.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 6px;
                flex: 0 0 80px;
            `;

            // Coffee cup SVG icon
            const cupEl = document.createElement('div');
            cupEl.style.cssText = `
                position: relative;
                cursor: ${isLocked ? 'default' : 'pointer'};
                transition: transform 0.2s;
            `;

            const cupColor = isCompleted ? '#166534' : isCurrent ? '#ca8a04' : '#cbd5e1';
            const cupBg = isCompleted ? '#f0fdf4' : isCurrent ? '#fffbeb' : '#f8fafc';
            const numberColor = isCompleted ? '#166534' : isCurrent ? '#92400e' : '#94a3b8';

            cupEl.innerHTML = `
                <svg width="64" height="72" viewBox="0 0 64 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <!-- Cup body -->
                    <path d="M10 20 L14 58 Q14 62 18 62 L46 62 Q50 62 50 58 L54 20 Z"
                          fill="${cupBg}" stroke="${cupColor}" stroke-width="${isCurrent ? '3' : '2'}"/>
                    <!-- Cup handle -->
                    <path d="M50 32 Q60 32 60 40 Q60 48 50 48"
                          fill="none" stroke="${cupColor}" stroke-width="${isCurrent ? '3' : '2'}"
                          stroke-linecap="round"/>
                    <!-- Saucer -->
                    <ellipse cx="32" cy="64" rx="22" ry="5" fill="${cupBg}" stroke="${cupColor}" stroke-width="1.5"/>
                    <!-- Steam lines (only for current) -->
                    ${isCurrent ? `
                        <path d="M22 14 Q24 8 22 4" stroke="#ca8a04" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
                        <path d="M32 12 Q34 6 32 2" stroke="#ca8a04" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
                        <path d="M42 14 Q44 8 42 4" stroke="#ca8a04" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
                    ` : ''}
                    <!-- Level number or checkmark -->
                    <text x="32" y="44" text-anchor="middle" dominant-baseline="middle"
                          font-family="Inter, Ubuntu, sans-serif" font-weight="800"
                          font-size="${isCompleted ? '18' : '16'}"
                          fill="${numberColor}">
                        ${isCompleted ? '✓' : isLocked ? '🔒' : levelNum}
                    </text>
                    ${isCurrent ? `
                        <circle cx="32" cy="20" r="18" fill="none" stroke="#ca8a04"
                                stroke-width="2" stroke-dasharray="4 3" opacity="0.5"/>
                    ` : ''}
                </svg>
            `;

            if (!isLocked) {
                cupEl.onmouseenter = () => { cupEl.style.transform = 'scale(1.08)'; };
                cupEl.onmouseleave = () => { cupEl.style.transform = ''; };
                cupEl.onclick = () => {
                    closeChallengeMap();
                    if (isCurrent && typeof enterTeamHub === 'function') enterTeamHub();
                };
            }

            // Level label
            const label = document.createElement('div');
            label.style.cssText = `
                font-size: 10px;
                font-weight: 700;
                color: ${isLocked ? '#94a3b8' : isCurrent ? '#92400e' : '#166534'};
                text-align: center;
                line-height: 1.3;
                max-width: 70px;
                font-family: 'Inter', 'Ubuntu', sans-serif;
                letter-spacing: 0.2px;
            `;
            label.innerText = level.title || `Level ${levelNum}`;

            // Team dots
            const dotsEl = document.createElement('div');
            dotsEl.style.cssText = `
                display: flex; gap: 3px; justify-content: center;
                flex-wrap: wrap; max-width: 60px; min-height: 12px;
            `;
            teamsHere.forEach(team => {
                const isMe = team.id === currentProfile?.team_id;
                const dot = document.createElement('div');
                dot.title = team.name;
                dot.style.cssText = `
                    width: ${isMe ? '11px' : '8px'};
                    height: ${isMe ? '11px' : '8px'};
                    border-radius: 50%;
                    background: ${team.color};
                    flex-shrink: 0;
                    ${isMe ? `box-shadow: 0 0 0 2px white, 0 0 0 3px ${team.color}; animation: teamPulse 2s ease-in-out infinite;` : ''}
                `;
                dotsEl.appendChild(dot);
            });

            nodeWrap.appendChild(cupEl);
            nodeWrap.appendChild(dotsEl);
            nodeWrap.appendChild(label);
            rowEl.appendChild(nodeWrap);

            // Coffee bean connector between cups (not after last in row)
            if (idx < displayRow.length - 1) {
                const beanConnector = document.createElement('div');
                beanConnector.style.cssText = `
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 3px;
                    flex: 1;
                    padding-bottom: 20px;
                    opacity: ${isLocked ? '0.35' : '0.7'};
                `;
                for (let b = 0; b < 3; b++) {
                    const bean = document.createElement('div');
                    const beanFilled = isCompleted || (isCurrent && idx === 0);
                    bean.style.cssText = `
                        width: 9px;
                        height: 13px;
                        border-radius: 50% 50% 50% 50% / 55% 55% 45% 45%;
                        background: ${beanFilled ? '#ca8a04' : '#cbd5e1'};
                        transform: rotate(${(b - 1) * 20}deg);
                        flex-shrink: 0;
                        border: 1px solid ${beanFilled ? '#a16207' : '#b8c0cc'};
                    `;
                    beanConnector.appendChild(bean);
                }
                rowEl.appendChild(beanConnector);
            }
        });

        container.appendChild(rowEl);

        // Vertical coffee bean connector between rows
        if (rowIdx < rows.length - 1) {
            const vertConnector = document.createElement('div');
            const alignSide = isReversed ? 'flex-start' : 'flex-end';
            const paddingSide = isReversed ? 'padding-left: 28px;' : 'padding-right: 28px;';
            vertConnector.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: ${alignSide};
                ${paddingSide}
                gap: 4px;
                padding-top: 6px;
                padding-bottom: 6px;
                opacity: 0.5;
            `;
            for (let b = 0; b < 4; b++) {
                const bean = document.createElement('div');
                bean.style.cssText = `
                    width: 13px;
                    height: 9px;
                    border-radius: 50%;
                    background: #cbd5e1;
                    border: 1px solid #b8c0cc;
                `;
                vertConnector.appendChild(bean);
            }
            container.appendChild(vertConnector);
        }
    });

    mount.appendChild(container);
}

// ---------------------------------------------------------------------------
// Today card — shown at top of team hub
// ---------------------------------------------------------------------------

async function renderTodayCard(mountId) {
    const mount = document.getElementById(mountId);
    if (!mount) return;

    if (!currentProfile?.team_id || currentProfile?.is_captain) {
        mount.style.display = 'none';
        return;
    }

    const { data: team } = await _supabase
        .from('teams').select('current_level, name')
        .eq('id', currentProfile.team_id).maybeSingle();

    if (!team) { mount.style.display = 'none'; return; }

    const { data: level } = await _supabase
        .from('challenge_levels').select('letter_families, title')
        .eq('level_number', team.current_level).maybeSingle();

    const families = level?.letter_families || [];

    const { data: progressRows } = await _supabase
        .from('student_family_progress')
        .select('base_letter, streak_passed, writing_passed, best_streak')
        .eq('student_id', currentUser.id)
        .eq('level_number', team.current_level);

    const progressMap = {};
    (progressRows || []).forEach(r => { progressMap[r.base_letter] = r; });

    let nextFamily = null;
    let nextAction = null;
    let allDone = true;

    for (const letter of families) {
        const p = progressMap[letter] || { streak_passed: false, writing_passed: false, best_streak: 0 };
        if (!p.streak_passed || !p.writing_passed) {
            allDone = false;
            nextFamily = letter;
            nextAction = !p.streak_passed ? 'game' : 'writing';
            break;
        }
    }

    const teamHex = getTeamHex(team.name);
    mount.style.display = 'block';

    if (allDone) {
        mount.innerHTML = `
            <div class="today-card today-card-complete">
                <div style="font-size:28px; margin-bottom:8px;">⭐</div>
                <p class="today-card-heading">Level ${team.current_level} Complete!</p>
                <p class="today-card-sub">You cleared all 3 families. Submit for teacher approval to advance your team.</p>
                <button onclick="submitLevelCompletion(${team.current_level})" class="btn-primary today-action-btn">
                    Submit for Level Approval →
                </button>
            </div>`;
        return;
    }

    const p = progressMap[nextFamily] || { best_streak: 0, streak_passed: false };
    const streakPct = Math.min(100, Math.round(((p.best_streak || 0) / STREAK_THRESHOLD) * 100));
    const fidelObj = alphabetData.find(item => item.base === nextFamily);

    mount.innerHTML = `
        <div class="today-card">
            <div class="today-card-top">
                <div>
                    <p class="today-card-label">Today's Focus · Level ${team.current_level}</p>
                    <p class="today-card-heading" style="font-family:'Lora',serif;">
                        ${nextFamily} Family
                    </p>
                    <p class="today-card-sub">
                        ${nextAction === 'game'
                            ? 'Play the matching game and get a streak of 20 to pass.'
                            : 'Streak done! Now submit your handwriting for captain approval.'}
                    </p>
                </div>
                <span class="today-card-letter" style="color:${teamHex};">${nextFamily}</span>
            </div>

            ${nextAction === 'game' ? `
                <div style="margin-bottom:14px;">
                    <div style="display:flex; justify-content:space-between;
                                font-size:12px; font-weight:600; color:#64748b; margin-bottom:6px;">
                        <span>Matching Game Streak</span>
                        <span>${p.best_streak || 0} / ${STREAK_THRESHOLD}</span>
                    </div>
                    <div style="background:#e2e8f0; border-radius:8px; height:8px; overflow:hidden;">
                        <div style="height:100%; width:${streakPct}%; background:${teamHex};
                                    border-radius:8px; transition:width 0.5s;"></div>
                    </div>
                </div>
                <button onclick="openFamilyFromTodayCard('${nextFamily}', ${team.current_level})"
                        class="today-action-btn"
                        style="background:${teamHex}; color:white; border:none;">
                    Play Matching Game →
                </button>
            ` : `
                <div style="background:#f0fdf4; border-radius:10px; padding:10px 14px;
                            margin-bottom:14px; font-size:13px; color:#166534; font-weight:600;">
                    ✓ Streak passed — submit your handwriting next!
                </div>
                <button onclick="openFamilyFromTodayCard('${nextFamily}', ${team.current_level})"
                        class="today-action-btn"
                        style="background:#7c3aed; color:white; border:none;">
                    Submit My Writing →
                </button>
            `}
        </div>`;
}

function openFamilyFromTodayCard(baseLetter, levelNumber) {
    const fidelObj = alphabetData.find(item => item.base === baseLetter);
    if (!fidelObj) return;
    const progress = {};
    openEmbeddedFamilyPractice(fidelObj, levelNumber, progress);
}

// ---------------------------------------------------------------------------
// Expose
// ---------------------------------------------------------------------------

window.openChallengeMap = openChallengeMap;
window.closeChallengeMap = closeChallengeMap;
window.renderTodayCard = renderTodayCard;
window.openFamilyFromTodayCard = openFamilyFromTodayCard;

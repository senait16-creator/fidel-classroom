// =============================================================================
// STUDENTSHELL.JS
// The persistent Home / Learn / Competition / Profile bottom-nav shell that
// replaced Mode Select as the student landing experience. Fidel Practice,
// Word Builder, and Amharic Path stay their own full-screen destinations —
// this file only owns the shell itself: tab switching, the Home tab's
// greeting/milestone note, and the Profile tab's identity/stats/Can-Do/
// Achievements/settings content. Competition's content is still rendered by
// renderChallengeDashboard() in challenge.js, unchanged — this file just
// calls it at the right time.
//
// Loads LAST (after challenge.js, submissions.js, candostatement.js,
// push.js) so every function it calls is already defined.
// =============================================================================

function switchStudentShellTab(tabName) {
    document.querySelectorAll('.stushell-tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.dataset.tab === tabName);
    });
    document.querySelectorAll('.stushell-nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    window.scrollTo({ top: 0 });

    if (tabName === 'profile' && typeof renderStudentShellProfile === 'function') {
        renderStudentShellProfile();
    }
}
window.switchStudentShellTab = switchStudentShellTab;

// ---------------------------------------------------------------------------
// Entry points — called instead of directly showing screens, so the shell
// and its correct tab are always both handled together.
// ---------------------------------------------------------------------------

async function enterStudentShellHomeTab() {
    showScreen('studentShellScreen', 'block');
    switchStudentShellTab('home');

    const greeting = document.getElementById('stushellGreeting');
    if (greeting) greeting.innerText = currentProfile?.nickname ? `Selam, ${currentProfile.nickname} 👋` : 'Selam 👋';

    if (typeof applyModeLockStyling === 'function') applyModeLockStyling();

    const [team, levels] = await Promise.all([
        typeof getTeamBoardInfo === 'function' ? getTeamBoardInfo() : { name: 'No Team Yet', current_level: 1 },
        typeof fetchChallengeLevels === 'function' ? fetchChallengeLevels() : []
    ]);

    const teamHex = typeof getTeamHex === 'function' ? getTeamHex(team.name) : '#166534';
    const heroTeamDot = document.getElementById('challengeHeroTeamDot');
    const heroMetaLine = document.getElementById('challengeHeroMetaLine');
    if (heroTeamDot) heroTeamDot.style.background = teamHex;
    if (heroMetaLine) {
        const week = typeof getProgramWeekNumber === 'function' ? getProgramWeekNumber() : null;
        heroMetaLine.innerText = `${team.name} • Level ${team.current_level}${week ? ` • Week ${week}` : ''}`;
    }

    const totalLevels = levels.length > 0 ? Math.max(...levels.map(l => l.level_number)) : 12;
    const currentLevelNum = team.current_level || 1;
    const pePercent = Math.min(100, Math.max(0, Math.round(((currentLevelNum - 1) / totalLevels) * 100)));
    const peLabel = document.getElementById('peProgressLabel');
    const peFill = document.getElementById('peProgressFill');
    if (peLabel) peLabel.innerText = `${currentLevelNum} / ${totalLevels} Levels`;
    if (peFill) peFill.style.width = `${pePercent}%`;

    const currentLevelCard = document.getElementById('challengeCurrentLevelCard');
    if (currentLevelCard) currentLevelCard.style.display = currentProfile?.is_captain ? 'none' : '';

    if (typeof renderChallengeDashboardMap === 'function') await renderChallengeDashboardMap(levels, team);
    if (typeof renderLevelCompletionBanner === 'function') await renderLevelCompletionBanner('levelCompletionMount');
    if (typeof renderStudentShellHomeNote === 'function') await renderStudentShellHomeNote();
}
window.enterStudentShellHomeTab = enterStudentShellHomeTab;

async function enterStudentShellCompetitionTab() {
    showScreen('studentShellScreen', 'block');
    switchStudentShellTab('competition');
    if (typeof renderChallengeDashboard === 'function') await renderChallengeDashboard();
}
window.enterStudentShellCompetitionTab = enterStudentShellCompetitionTab;

// ---------------------------------------------------------------------------
// Home — single milestone update line. Most recent real milestone
// (level_ready / level_passed / team_level_up), not a full feed.
// ---------------------------------------------------------------------------

async function renderStudentShellHomeNote() {
    const mount = document.getElementById('stushellHomeNoteMount');
    if (!mount) return;
    mount.style.display = 'none';

    const events = await fetchStudentShellMilestones(1);
    if (events.length === 0) return;

    const e = events[0];
    mount.innerHTML = `${MILESTONE_ICON[e.event_type] || '⭐'} ${milestoneLabel(e)}`;
    mount.style.display = 'flex';
}

// ---------------------------------------------------------------------------
// Shared milestone fetch — the student's own level_ready/level_passed
// events plus their team's team_level_up events, most recent first. Used
// by both Home's single note line and Profile's Achievements card so they
// never drift into two different definitions of "what counts."
// ---------------------------------------------------------------------------

const MILESTONE_ICON = { level_ready: '🎯', level_passed: '✅', team_level_up: '🏆' };

function milestoneLabel(e) {
    if (e.event_type === 'level_ready') return `Ready for your Level ${e.level_number} live test`;
    if (e.event_type === 'level_passed') return `Passed your Level ${e.level_number} live test`;
    if (e.event_type === 'team_level_up') return e.title || `Your team reached Level ${e.level_number}`;
    return e.title || 'New milestone';
}

async function fetchStudentShellMilestones(limit) {
    if (!currentUser?.id) return [];

    const queries = [
        _supabase.from('calendar_events')
            .select('event_type, event_date, level_number, title')
            .eq('student_id', currentUser.id)
            .in('event_type', ['level_ready', 'level_passed'])
            .order('event_date', { ascending: false })
            .limit(limit)
    ];
    if (currentProfile?.team_id) {
        queries.push(
            _supabase.from('calendar_events')
                .select('event_type, event_date, level_number, title')
                .eq('team_id', currentProfile.team_id)
                .eq('event_type', 'team_level_up')
                .order('event_date', { ascending: false })
                .limit(limit)
        );
    }

    const results = await Promise.all(queries);
    let events = [];
    results.forEach(r => { if (r.data) events = events.concat(r.data); });
    events.sort((a, b) => new Date(b.event_date) - new Date(a.event_date));
    return events.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Writing quick link — opens the writing submission screen for whichever
// family in the student's team's current level still needs writing
// approved, since openWritingSubmitScreen() needs a specific family.
// ---------------------------------------------------------------------------

async function openWritingQuickLink() {
    if (!currentProfile?.team_id) {
        showNotificationToast("You'll be able to submit writing once you're on a team.");
        return;
    }

    const team = await getTeamBoardInfo();
    const currentLevel = team.current_level || 1;

    const { data: level } = await _supabase
        .from('challenge_levels')
        .select('letter_families')
        .eq('level_number', currentLevel)
        .maybeSingle();
    const families = level?.letter_families || [];

    const { data: progress } = await _supabase
        .from('student_family_progress')
        .select('base_letter, writing_passed')
        .eq('student_id', currentUser.id)
        .eq('level_number', currentLevel);

    const progressByLetter = {};
    (progress || []).forEach(p => { progressByLetter[p.base_letter] = p; });

    const nextFamily = families.find(f => !progressByLetter[f]?.writing_passed);

    if (!nextFamily) {
        showNotificationToast(`You're all caught up on writing for Level ${currentLevel}! 🎉`);
        return;
    }

    openWritingSubmitScreen(nextFamily, 'teamHub', currentLevel, { photoOnly: true });
}
window.openWritingQuickLink = openWritingQuickLink;

// ---------------------------------------------------------------------------
// Profile tab
// ---------------------------------------------------------------------------

async function renderStudentShellProfile() {
    const avatarEl = document.getElementById('stushellProfileAvatar');
    const nameEl = document.getElementById('stushellProfileName');
    const teamEl = document.getElementById('stushellProfileTeam');
    if (avatarEl) avatarEl.innerText = currentProfile?.avatar || '🦁';
    if (nameEl) nameEl.innerHTML = `${currentProfile?.nickname || 'Student'} ${icon('pencil')}`;

    const team = await (typeof getTeamBoardInfo === 'function' ? getTeamBoardInfo() : Promise.resolve(null));
    if (teamEl) teamEl.innerText = currentProfile?.team_id ? team.name : 'Practicing Solo';

    const badgeEl = document.getElementById('stushellCaptainBadge');
    const badgeTeamEl = document.getElementById('stushellCaptainBadgeTeam');
    if (badgeEl) {
        if (currentProfile?.is_captain && currentProfile?.team_id) {
            if (badgeTeamEl) badgeTeamEl.innerText = team.name;
            badgeEl.style.display = 'inline-flex';
        } else {
            badgeEl.style.display = 'none';
        }
    }

    const levelValEl = document.getElementById('stushellStatLevel');
    if (levelValEl) levelValEl.innerText = currentProfile?.team_id ? (team.current_level || 1) : '–';

    if (typeof updatePushMenuButton === 'function') updatePushMenuButton();

    await renderStudentShellCanDoPreview();
    await renderStudentShellAchievements();
}
window.renderStudentShellProfile = renderStudentShellProfile;

async function renderStudentShellCanDoPreview() {
    const mount = document.getElementById('stushellCanDoPreview');
    const statEl = document.getElementById('stushellStatCanDo');
    if (!mount || typeof CAN_DO_STATEMENTS === 'undefined' || typeof loadCanDoProgressMap !== 'function') return;

    const progressMap = await loadCanDoProgressMap();
    const doneCount = CAN_DO_STATEMENTS.filter(s => candoIsDone(progressMap[s.key])).length;

    if (statEl) statEl.innerText = `${doneCount}`;

    const doneOne = CAN_DO_STATEMENTS.find(s => candoIsDone(progressMap[s.key]));
    const todoOne = CAN_DO_STATEMENTS.find(s => !candoIsDone(progressMap[s.key]));

    mount.innerHTML = `
        <div class="stushell-skill-progress">${doneCount} / ${CAN_DO_STATEMENTS.length} mastered</div>
        ${doneOne ? `<div class="stushell-skill-chip done"><span class="sc-mark">✓</span>${doneOne.text}</div>` : ''}
        ${todoOne ? `<div class="stushell-skill-chip todo"><span class="sc-mark"></span>${todoOne.text}</div>` : ''}
    `;
}

async function renderStudentShellAchievements() {
    const mount = document.getElementById('stushellAchievementsMount');
    if (!mount) return;
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading...</p>`;

    const events = await fetchStudentShellMilestones(4);

    if (events.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Nothing yet — keep practicing!</p>`;
        return;
    }

    mount.innerHTML = events.map(e => `
        <div class="stushell-achieve-row">
            <span class="ai">${MILESTONE_ICON[e.event_type] || '⭐'}</span>
            <span>${milestoneLabel(e)}</span>
            <span class="stushell-achieve-time">${typeof formatTimeAgo === 'function' ? formatTimeAgo(e.event_date) : ''}</span>
        </div>
    `).join('');
}

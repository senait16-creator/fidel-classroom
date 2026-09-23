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
    document.querySelectorAll('.app-sidebar-link[data-tab]').forEach(link => {
        link.classList.toggle('active', link.dataset.tab === tabName);
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

    const [team, levels, myLevel] = await Promise.all([
        typeof getTeamBoardInfo === 'function' ? getTeamBoardInfo() : { name: 'No Team Yet', current_level: 1 },
        typeof fetchChallengeLevels === 'function' ? fetchChallengeLevels() : [],
        typeof getMyCurrentLevel === 'function' ? getMyCurrentLevel() : 1
    ]);

    // Fidel's next-step card is hidden for captains (they get the Captain
    // Dashboard on the Team tab instead) — unchanged from before this
    // redesign, just relocated into the next-steps grid.
    const currentLevelCard = document.getElementById('challengeCurrentLevelCard');
    if (currentLevelCard) currentLevelCard.style.display = currentProfile?.is_captain ? 'none' : '';
    const recommendedBadge = document.getElementById('nextstepRecommendedBadge');
    if (recommendedBadge) recommendedBadge.style.display = currentProfile?.is_captain ? 'none' : '';

    if (typeof renderChallengeDashboardMap === 'function') await renderChallengeDashboardMap(levels, myLevel);
    if (typeof renderLevelCompletionBanner === 'function') await renderLevelCompletionBanner('levelCompletionMount');
    if (typeof renderStudentShellHomeNote === 'function') await renderStudentShellHomeNote();

    renderTeamTeaser(team);
    if (typeof renderCaptainHomeWritingStatus === 'function') await renderCaptainHomeWritingStatus();

    await Promise.all([
        renderWordBuilderNextStepCard(),
        renderAmharicPathNextStepCard(),
        renderCurriculumFidelRow(levels, myLevel),
        renderCurriculumWordBuilderRow(),
        renderCurriculumAmharicPathList()
    ]);

    wireNextStepsTimeButtons();
}
window.enterStudentShellHomeTab = enterStudentShellHomeTab;

// ---------------------------------------------------------------------------
// Team teaser card — identity + a way in, not the full dashboard. Race,
// schedule, Star Board and captain tools all still live on the Team tab
// (data-tab="competition"); this only orients.
// ---------------------------------------------------------------------------

async function renderTeamTeaser(team) {
    const nameEl = document.getElementById('teamTeaserName');
    const subEl = document.getElementById('teamTeaserSub');
    if (nameEl) nameEl.innerText = team.name;

    if (!currentProfile?.team_id) {
        if (subEl) subEl.innerText = 'Join a team to unlock team races and the Star Board.';
        return;
    }

    let meetingLine = '';
    try {
        const { data: meeting } = await _supabase
            .from('team_meetings').select('day_of_week, meeting_time')
            .eq('team_id', currentProfile.team_id).maybeSingle();
        if (meeting?.day_of_week) {
            const time = typeof formatMeetingTimeForDisplay === 'function' ? formatMeetingTimeForDisplay(meeting.meeting_time) : meeting.meeting_time;
            meetingLine = `Meets ${meeting.day_of_week}${time ? ` · ${time}` : ''}`;
        }
    } catch (e) { /* team_meetings row is optional */ }

    if (subEl) subEl.innerText = meetingLine || `Level ${team.current_level} · Streak ${team.streak_count || 0}`;
}

// ---------------------------------------------------------------------------
// Captain-only writing-review badge — now on the Team teaser card instead
// of a standalone Home note.
// ---------------------------------------------------------------------------

async function renderCaptainHomeWritingStatus() {
    const badge = document.getElementById('teamTeaserWritingBadge');
    if (!badge) return;

    if (!currentProfile?.is_captain || !currentProfile?.team_id) {
        badge.style.display = 'none';
        return;
    }

    const { data: members } = await _supabase
        .from('profiles').select('id').eq('team_id', currentProfile.team_id).neq('id', currentUser.id);
    const memberIds = (members || []).map(m => m.id);

    let pendingCount = 0;
    if (memberIds.length > 0) {
        const { count } = await _supabase
            .from('writing_submissions').select('id', { count: 'exact', head: true })
            .in('student_id', memberIds).eq('status', 'pending');
        pendingCount = count || 0;
    }

    badge.classList.toggle('has-pending', pendingCount > 0);
    badge.innerText = pendingCount > 0 ? `${pendingCount} to review` : 'All caught up';
    badge.style.display = 'inline-flex';
}
window.renderCaptainHomeWritingStatus = renderCaptainHomeWritingStatus;

// ---------------------------------------------------------------------------
// Word Builder next-step card — same "prefer where they left off, else
// first incomplete level" logic as enterWordBuilderHome() in wordbuilder.js,
// trimmed down to a compact summary.
// ---------------------------------------------------------------------------

async function fetchWordBuilderNextStep() {
    const [{ data: wbLevels }, { data: wordRows }, { data: levelProgress }, { data: wordProgress }] = await Promise.all([
        _supabase.from('word_builder_levels').select('level_number, topic_title').order('level_number'),
        _supabase.from('word_builder_words').select('id, level_number, item_order, amharic_text, english_meaning').order('item_order'),
        _supabase.from('word_builder_level_progress').select('level_number').eq('student_id', currentUser.id),
        _supabase.from('word_builder_progress').select('word_id').eq('student_id', currentUser.id)
    ]);

    const allLevels = wbLevels || [];
    const completedLevels = new Set((levelProgress || []).map(r => r.level_number));
    const readWordIds = new Set((wordProgress || []).map(r => r.word_id));
    const wordsByLevel = {};
    (wordRows || []).forEach(w => { (wordsByLevel[w.level_number] ||= []).push(w); });

    let target = null;
    for (const l of allLevels) {
        const words = wordsByLevel[l.level_number] || [];
        if (words.length === 0 || completedLevels.has(l.level_number)) continue;
        if (words.some(w => readWordIds.has(w.id))) target = l;
    }
    if (!target) target = allLevels.find(l => !completedLevels.has(l.level_number) && (wordsByLevel[l.level_number] || []).length > 0);

    if (!target) return null;
    const words = wordsByLevel[target.level_number] || [];
    const readCount = words.filter(w => readWordIds.has(w.id)).length;
    return { level: target, words, readCount };
}

async function renderWordBuilderNextStepCard() {
    const mount = document.getElementById('nextstepWordBuilderMount');
    if (!mount) return;
    const step = await fetchWordBuilderNextStep();
    if (!step) { mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No levels yet — check back soon.</p>`; return; }

    mount.innerHTML = `
        <p class="challenge-continue-label">${step.level.topic_title || `Level ${step.level.level_number}`}</p>
        <div class="nextstep-word-sample">${step.words.slice(0, 3).map(w => w.amharic_text).join(' · ')}</div>
        <div class="nextstep-caption">${step.readCount} of ${step.words.length} words learned</div>
        <button class="challenge-continue-btn" onclick="enterWordBuilderHome()">Learn words</button>
    `;
}

// ---------------------------------------------------------------------------
// Amharic Path next-step card — first lesson (in level_number, lesson_order
// order) without a completed chapter_lesson_progress row.
// ---------------------------------------------------------------------------

async function fetchAmharicPathNextStep() {
    const { data: chapters } = await _supabase
        .from('reading_levels').select('level_number, title, admin_only').order('level_number');
    const visibleChapters = (chapters || []).filter(c => !c.admin_only || currentProfile?.is_admin);
    if (visibleChapters.length === 0) return null;

    const { data: lessons } = await _supabase
        .from('chapter_lessons').select('id, level_number, lesson_order, title, is_challenge')
        .in('level_number', visibleChapters.map(c => c.level_number))
        .order('level_number').order('lesson_order');

    const { data: progress } = await _supabase
        .from('chapter_lesson_progress').select('lesson_id').eq('student_id', currentUser.id);
    const completedIds = new Set((progress || []).map(p => p.lesson_id));

    const target = (lessons || []).find(l => !completedIds.has(l.id));
    if (!target) return null;
    const chapter = visibleChapters.find(c => c.level_number === target.level_number);
    return { chapter, lesson: target };
}

async function renderAmharicPathNextStepCard() {
    const mount = document.getElementById('nextstepAmharicPathMount');
    if (!mount) return;
    const step = await fetchAmharicPathNextStep();
    if (!step) { mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No chapters yet — check back soon.</p>`; return; }

    mount.innerHTML = `
        <p class="challenge-continue-label">${step.chapter.title}</p>
        <div class="nextstep-lesson-title">Lesson ${step.lesson.lesson_order}: ${step.lesson.title}</div>
        <button class="challenge-continue-btn" onclick="enterModeIfUnlocked('amharicPath', enterAmharicPath)">Start lesson</button>
    `;
}

// ---------------------------------------------------------------------------
// "My curriculum" rows — a browsable summary of all three tracks, each
// level/chapter shown as a card so a student can jump around freely
// (nothing here is locked, matching the un-gated Word Builder/Fidel design).
// ---------------------------------------------------------------------------

async function renderCurriculumFidelRow(levels, myLevel) {
    const mount = document.getElementById('curriculumFidelRow');
    if (!mount || !levels?.length) return;

    mount.innerHTML = levels.map(l => {
        const done = l.level_number < myLevel;
        const current = l.level_number === myLevel;
        return `
            <div class="curriculum-card${current ? ' curriculum-card-current' : ''}${done ? ' curriculum-card-done' : ''}">
                <span class="curriculum-card-label">${done ? `Level ${l.level_number} · Done` : current ? "You're here" : `Level ${l.level_number}`}</span>
                <span class="curriculum-card-fi">${(l.letter_families || []).join(' ')}</span>
            </div>
        `;
    }).join('');
}

async function renderCurriculumWordBuilderRow() {
    const mount = document.getElementById('curriculumWordBuilderRow');
    if (!mount) return;

    const [{ data: wbLevels }, { data: wordRows }, { data: levelProgress }] = await Promise.all([
        _supabase.from('word_builder_levels').select('level_number, topic_title').order('level_number'),
        _supabase.from('word_builder_words').select('id, level_number, amharic_text').order('item_order'),
        _supabase.from('word_builder_level_progress').select('level_number').eq('student_id', currentUser.id)
    ]);
    if (!wbLevels?.length) { mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No levels yet.</p>`; return; }

    const completedLevels = new Set((levelProgress || []).map(r => r.level_number));
    const wordsByLevel = {};
    (wordRows || []).forEach(w => { (wordsByLevel[w.level_number] ||= []).push(w); });
    const step = await fetchWordBuilderNextStep();
    const currentLevelNumber = step?.level?.level_number;

    mount.innerHTML = wbLevels.map(l => {
        const words = wordsByLevel[l.level_number] || [];
        const done = completedLevels.has(l.level_number);
        const current = l.level_number === currentLevelNumber;
        return `
            <div class="curriculum-card${current ? ' curriculum-card-current' : ''}${done ? ' curriculum-card-done' : ''}" onclick="enterWordBuilderHome()">
                <span class="curriculum-card-label">${done ? 'Done' : current ? `You're here · ${words.length} words` : `${words.length} words`}</span>
                <span class="curriculum-card-title">${l.topic_title || `Level ${l.level_number}`}</span>
                <span class="curriculum-card-fi">${words.slice(0, 3).map(w => w.amharic_text).join(' · ')}</span>
            </div>
        `;
    }).join('');
}

async function renderCurriculumAmharicPathList() {
    const mount = document.getElementById('curriculumAmharicPathList');
    const titleEl = document.getElementById('curriculumAmharicPathTitle');
    if (!mount) return;

    const step = await fetchAmharicPathNextStep();
    if (!step) { mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No chapters yet.</p>`; return; }
    if (titleEl) titleEl.innerText = `Amharic Path · ${step.chapter.title}`;

    const [{ data: lessons }, { data: progress }] = await Promise.all([
        _supabase.from('chapter_lessons').select('id, lesson_order, title')
            .eq('level_number', step.chapter.level_number).order('lesson_order'),
        _supabase.from('chapter_lesson_progress').select('lesson_id').eq('student_id', currentUser.id)
    ]);
    const completedIds = new Set((progress || []).map(p => p.lesson_id));

    mount.innerHTML = (lessons || []).map(l => {
        const done = completedIds.has(l.id);
        const current = l.id === step.lesson.id;
        return `
            <div class="curriculum-list-row${current ? ' curriculum-list-row-current' : ''}" onclick="enterModeIfUnlocked('amharicPath', enterAmharicPath)">
                <span class="curriculum-list-badge${done ? ' curriculum-list-badge-done' : ''}">${done ? '✓' : l.lesson_order}</span>
                <span class="curriculum-list-title">${l.title}</span>
            </div>
        `;
    }).join('');
}

// ---------------------------------------------------------------------------
// "Short on time?" row — both currently lead to the same recommended next
// action; a true lighter-weight review mode is a future refinement.
// ---------------------------------------------------------------------------

function wireNextStepsTimeButtons() {
    const goToRecommended = () => {
        if (currentProfile?.is_captain) return enterModeIfUnlocked('amharicPath', enterAmharicPath);
        return enterModeIfUnlocked('practice', enterPracticeHome);
    };
    const reviewBtn = document.getElementById('nextstepsReviewBtn');
    const fullBtn = document.getElementById('nextstepsFullLessonBtn');
    if (reviewBtn) reviewBtn.onclick = goToRecommended;
    if (fullBtn) fullBtn.onclick = goToRecommended;
}

async function openTeamHubFromHome() {
    if (typeof chooseModeChallenge === 'function') await chooseModeChallenge();
    if (typeof openCaptainTeamHub === 'function') openCaptainTeamHub();
}
window.openTeamHubFromHome = openTeamHubFromHome;

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
// family in the student's own current level still needs writing approved,
// since openWritingSubmitScreen() needs a specific family.
// ---------------------------------------------------------------------------

async function openWritingQuickLink() {
    if (!currentProfile?.team_id) {
        showNotificationToast("You'll be able to submit writing once you're on a team.");
        return;
    }

    const currentLevel = await getMyCurrentLevel();

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

    // Individual progress exists independent of team assignment now, so
    // this always shows a real value rather than "–" for teamless students.
    const myLevel = await (typeof getMyCurrentLevel === 'function' ? getMyCurrentLevel() : Promise.resolve(1));

    if (typeof updatePushMenuButton === 'function') updatePushMenuButton();

    await renderProfileProgressBars(myLevel);
    await renderStudentShellCanDoPreview();
    await renderStudentShellAchievements();
}
window.renderStudentShellProfile = renderStudentShellProfile;

// ---------------------------------------------------------------------------
// "How far you've come" — one progress bar per track. Fidel reuses the
// same 11-level total as everywhere else on the app; Word Builder and
// Amharic Path totals come from their own tables.
// ---------------------------------------------------------------------------

async function renderProfileProgressBars(myLevel) {
    const mount = document.getElementById('profileProgressBars');
    if (!mount) return;

    const [levels, { count: wordsLearned }, { data: wbLevels }, apStep] = await Promise.all([
        typeof fetchChallengeLevels === 'function' ? fetchChallengeLevels() : Promise.resolve([]),
        _supabase.from('word_builder_progress').select('id', { count: 'exact', head: true }).eq('student_id', currentUser.id),
        _supabase.from('word_builder_levels').select('level_number'),
        typeof fetchAmharicPathNextStep === 'function' ? fetchAmharicPathNextStep() : Promise.resolve(null)
    ]);

    const totalFidelLevels = levels.length || 11;
    const fidelPercent = Math.min(100, Math.max(0, Math.round(((myLevel - 1) / totalFidelLevels) * 100)));
    const currentFamilies = levels.find(l => l.level_number === myLevel)?.letter_families || [];

    const totalWbLevels = wbLevels?.length || 1;
    const wordsPercent = Math.min(100, Math.round(((wordsLearned || 0) / (totalWbLevels * 9)) * 100));

    let apLine = 'Not started yet';
    let apPercent = 0;
    if (apStep) {
        const { data: chapterLessons } = await _supabase
            .from('chapter_lessons').select('id').eq('level_number', apStep.chapter.level_number);
        const { data: progress } = await _supabase
            .from('chapter_lesson_progress').select('lesson_id').eq('student_id', currentUser.id);
        const completedIds = new Set((progress || []).map(p => p.lesson_id));
        const doneInChapter = (chapterLessons || []).filter(l => completedIds.has(l.id)).length;
        const total = chapterLessons?.length || 1;
        apLine = `${doneInChapter} of ${total} lessons in ${apStep.chapter.title}`;
        apPercent = Math.min(100, Math.round((doneInChapter / total) * 100));
    }

    mount.innerHTML = `
        <div class="profile-progress-row">
            <div class="profile-progress-top"><span class="profile-progress-label profile-progress-fidel">Fidel</span><span class="profile-progress-sub">Level ${myLevel} of ${totalFidelLevels} · ${currentFamilies.length} letter families</span></div>
            <div class="profile-progress-track"><div class="profile-progress-fill profile-progress-fill-fidel" style="width:${fidelPercent}%;"></div></div>
        </div>
        <div class="profile-progress-row">
            <div class="profile-progress-top"><span class="profile-progress-label profile-progress-wb">Words</span><span class="profile-progress-sub">${wordsLearned || 0} words learned</span></div>
            <div class="profile-progress-track"><div class="profile-progress-fill profile-progress-fill-wb" style="width:${wordsPercent}%;"></div></div>
        </div>
        <div class="profile-progress-row">
            <div class="profile-progress-top"><span class="profile-progress-label profile-progress-ap">Amharic Path</span><span class="profile-progress-sub">${apLine}</span></div>
            <div class="profile-progress-track"><div class="profile-progress-fill profile-progress-fill-ap" style="width:${apPercent}%;"></div></div>
        </div>
    `;
}

async function renderStudentShellCanDoPreview() {
    const mount = document.getElementById('stushellCanDoPreview');
    if (!mount || typeof CAN_DO_STATEMENTS === 'undefined' || typeof loadCanDoProgressMap !== 'function') return;

    const progressMap = await loadCanDoProgressMap();
    const doneCount = CAN_DO_STATEMENTS.filter(s => candoIsDone(progressMap[s.key])).length;

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
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Nothing yet. Keep practicing!</p>`;
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

// ---------------------------------------------------------------------------
// + Upload sheet — two choices, reached from the phone bottom nav's raised
// + button and the computer sidebar's Upload button.
// ---------------------------------------------------------------------------

async function openUploadSheet() {
    const sheet = document.getElementById('uploadSheetScreen');
    if (!sheet) return;
    sheet.style.display = 'block';

    const sub = document.getElementById('uploadSheetHandwritingSub');
    if (!sub) return;
    if (!currentProfile?.team_id) {
        sub.innerText = "You'll be able to submit once you're on a team";
        return;
    }

    const currentLevel = await getMyCurrentLevel();
    const { data: level } = await _supabase
        .from('challenge_levels').select('letter_families').eq('level_number', currentLevel).maybeSingle();
    const families = level?.letter_families || [];

    const { data: progress } = await _supabase
        .from('student_family_progress').select('base_letter, writing_passed')
        .eq('student_id', currentUser.id).eq('level_number', currentLevel);
    const progressByLetter = {};
    (progress || []).forEach(p => { progressByLetter[p.base_letter] = p; });

    const nextFamily = families.find(f => !progressByLetter[f]?.writing_passed);
    sub.innerText = nextFamily ? `Ready for: the ${nextFamily} family (Level ${currentLevel})` : `All caught up for Level ${currentLevel}`;
}
window.openUploadSheet = openUploadSheet;

function closeUploadSheet() {
    const sheet = document.getElementById('uploadSheetScreen');
    if (sheet) sheet.style.display = 'none';
}
window.closeUploadSheet = closeUploadSheet;

function handleUploadSheetFileChosen(inputEl) {
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) return;
    closeUploadSheet();
    if (typeof postPhotoToTeamFeed === 'function') postPhotoToTeamFeed(file);
}
window.handleUploadSheetFileChosen = handleUploadSheetFileChosen;

// Computer-only: drag a photo straight onto the "Post to team feed" row.
(function wireUploadSheetDragDrop() {
    document.addEventListener('DOMContentLoaded', () => {
        const row = document.getElementById('uploadSheetTeamFeedRow');
        if (!row) return;
        ['dragover', 'dragenter'].forEach(evt => row.addEventListener(evt, e => {
            e.preventDefault();
            row.classList.add('upload-sheet-option-dragover');
        }));
        ['dragleave', 'dragend', 'drop'].forEach(evt => row.addEventListener(evt, () => {
            row.classList.remove('upload-sheet-option-dragover');
        }));
        row.addEventListener('drop', e => {
            e.preventDefault();
            const file = e.dataTransfer?.files?.[0];
            if (!file) return;
            closeUploadSheet();
            if (typeof postPhotoToTeamFeed === 'function') postPhotoToTeamFeed(file);
        });
    });
})();

// =============================================================================
// COMMUNITY.JS
// The third destination: class-wide celebration feed.
//   Competition = motivation & progress
//   Level       = learning & completing work
//   Community   = celebrating & interacting   ← this file
//
// Reads from team_practice_posts WITHOUT a team filter (whole class).
// NOTE: requires the Supabase RLS SELECT policy on team_practice_posts to
// allow class-wide reads. If posts from other teams don't appear, loosen
// the policy in the Supabase dashboard.
//
// Loads AFTER: app.js, team/hub.js (reuses formatTimeAgo).
// =============================================================================

// ---------------------------------------------------------------------------
// Entry / exit
// ---------------------------------------------------------------------------

function chooseModeCommunity() {
    showScreen("communityScreen");

    if (typeof renderTodayBanners === 'function') renderTodayBanners('todayBannersMount');
    if (typeof renderStarBoard === 'function') renderStarBoard('starBoardMount');
    if (typeof renderCommunityTeamLeaderboard === 'function') renderCommunityTeamLeaderboard('communityTeamRaceMount');

    if (typeof renderVerseOfDay === 'function') renderVerseOfDay('verseOfDayMount');
    if (typeof renderWordleStatusMini === 'function') renderWordleStatusMini('wordleStatusMount');
    if (typeof renderSongOfWeek === 'function') renderSongOfWeek('songOfWeekMount');
    if (typeof renderQuestionOfDay === 'function') renderQuestionOfDay('questionOfDayMount');

    if (typeof renderFeaturedWriting === 'function') renderFeaturedWriting('featuredWritingMount');
    if (typeof renderRecentAchievements === 'function') renderRecentAchievements('recentAchievementsMount');

    if (typeof renderLiveLeaderboard === 'function') renderLiveLeaderboard('communityLeaderboardMount');
    renderCommunityFeed();
}

function exitCommunity() {
    const screen = document.getElementById("communityScreen");
    if (screen) screen.style.display = "none";
    if (typeof enterModeSelect === "function") enterModeSelect();
}

// ---------------------------------------------------------------------------
// Feed — class-wide, newest first
// ---------------------------------------------------------------------------

async function renderCommunityFeed() {
    const mount = document.getElementById("communityFeedMount");
    if (!mount) return;
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px; padding:8px 0;">Loading the class feed...</p>`;

    // No .eq('team_id') — whole class sees everything
    const { data: posts, error } = await _supabase
        .from('team_practice_posts')
        .select(`
            id, base_letter, image_url, created_at, post_type, uploader_id, team_id,
            profiles!uploader_id(nickname, avatar)
        `)
        .order('created_at', { ascending: false })
        .limit(40);

    if (error) {
        mount.innerHTML = `<p style="color:#ef4444; font-size:13px;">Couldn't load the feed: ${error.message}</p>`;
        return;
    }

    if (!posts || posts.length === 0) {
        mount.innerHTML = `
            <div class="team-hub-empty" style="text-align:center; padding:32px 16px;">
                <div style="font-size:32px; margin-bottom:8px;">🎨</div>
                No posts yet — approved writing shared from levels will show up here!
            </div>`;
        return;
    }

    const postIds = posts.map(p => p.id);
    const { data: reactions } = await _supabase
        .from('post_reactions')
        .select('post_id, reactor_id, reaction')
        .in('post_id', postIds);

    mount.innerHTML = '';
    posts.forEach(post => {
        const postReactions = (reactions || []).filter(r => r.post_id === post.id);
        const myReaction = postReactions.find(r => r.reactor_id === currentUser.id)?.reaction || null;
        const isOwn = post.uploader_id === currentUser.id;
        const canDelete = isOwn || currentProfile?.is_admin;
        const isApprovedWork = post.post_type === 'approved_share';

        const reactionTypes = ['👍', '🔥', '💪', '❤️'];
        const reactionHTML = reactionTypes.map(emoji => {
            const count = postReactions.filter(r => r.reaction === emoji).length;
            const isActive = myReaction === emoji;
            return `<button class="reaction-btn ${isActive ? 'reacted' : ''}"
                            onclick="toggleCommunityReaction('${post.id}', '${emoji}', this)">
                ${emoji}<span class="reaction-count">${count || ''}</span>
            </button>`;
        }).join('');

        const card = document.createElement('div');
        card.className = 'practice-post-card';
        card.dataset.postId = post.id;
        card.innerHTML = `
            <img src="${post.image_url}" class="practice-post-img" alt="Shared work">
            <div class="practice-post-meta">
                <div class="practice-post-header">
                    <span class="practice-post-author">
                        ${post.profiles?.avatar || '🦁'} ${post.profiles?.nickname || 'Student'}
                    </span>
                    <div style="display:flex; align-items:center; gap:8px;">
                        ${isApprovedWork
                            ? `<span style="font-size:10px; font-weight:700; background:#d1fae5; color:#047857;
                                            padding:2px 8px; border-radius:8px;">✓ Approved</span>`
                            : ''}
                        ${post.base_letter
                            ? `<span class="practice-post-letter">${post.base_letter}</span>`
                            : ''}
                        <span class="practice-post-time">${formatTimeAgo(post.created_at)}</span>
                    </div>
                </div>
                <div class="reaction-row">${reactionHTML}</div>
                ${canDelete ? `
                    <button class="btn-secondary"
                            style="font-size:11px; color:#ef4444; padding:2px 0; text-align:left;"
                            onclick="deleteCommunityPost('${post.id}', '${post.image_url}')">
                        🗑️ Delete${!isOwn ? ' (Teacher)' : ''}
                    </button>` : ''}
            </div>
        `;
        mount.appendChild(card);
    });
}

async function toggleCommunityReaction(postId, emoji, buttonEl) {
    const isCurrentlyReacted = buttonEl.classList.contains('reacted');
    const card = buttonEl.closest('.practice-post-card');
    card.querySelectorAll('.reaction-btn').forEach(btn => btn.classList.remove('reacted'));

    if (!isCurrentlyReacted) {
        buttonEl.classList.add('reacted');
        await _supabase.from('post_reactions').upsert(
            { post_id: postId, reactor_id: currentUser.id, reaction: emoji },
            { onConflict: 'post_id,reactor_id' }
        );
    } else {
        await _supabase.from('post_reactions')
            .delete()
            .eq('post_id', postId)
            .eq('reactor_id', currentUser.id);
    }
    await renderCommunityFeed();
}

async function deleteCommunityPost(postId, imageUrl) {
    if (!confirm('Delete this post?')) return;

    const pathMatch = imageUrl.match(/team_practice_posts\/(.+)$/);
    const storagePath = pathMatch ? pathMatch[1] : null;

    const { error } = await _supabase.from('team_practice_posts').delete().eq('id', postId);
    if (error) return showNotificationToast("Couldn't delete: " + error.message);

    if (storagePath) {
        await _supabase.storage.from('team_practice_posts').remove([storagePath]);
    }
    showNotificationToast('Post deleted.');
    await renderCommunityFeed();
}

// ---------------------------------------------------------------------------
// Featured Writing — one class-wide pick per week, teacher-curated.
// Requires the featured_writing table (see featured_writing.sql).
// ---------------------------------------------------------------------------

async function renderFeaturedWriting(mountId) {
    const mount = document.getElementById(mountId);
    if (!mount) return;

    const weekStart = typeof _starWeekStart === 'function' ? _starWeekStart() : null;
    if (!weekStart) { mount.innerHTML = ''; return; }

    const { data: featured, error } = await _supabase
        .from('featured_writing')
        .select('id, student_id, image_url, base_letter, note, profiles!featured_writing_student_id_fkey(nickname, avatar)')
        .eq('week_start', weekStart)
        .maybeSingle();

    if (error) {
        // Table probably not created yet — hide quietly rather than break the page
        console.warn('Featured writing unavailable:', error.message);
        mount.innerHTML = '';
        return;
    }

    const pickerBtn = currentProfile?.is_admin
        ? `<button class="btn-secondary featured-writing-pick-btn" id="pickFeaturedWritingBtn">${featured ? '🔄 Change Featured Writing' : '✍️ Pick Featured Writing'}</button>`
        : '';

    if (!featured) {
        mount.innerHTML = `
            <p style="color:#94a3b8; font-size:13px; margin:0 0 8px;">No writing featured yet this week.</p>
            ${pickerBtn}
        `;
    } else {
        mount.innerHTML = `
            <div class="featured-writing-card">
                <img src="${featured.image_url}" alt="${featured.profiles?.nickname || 'Student'}'s writing"
                     class="featured-writing-img" loading="lazy"
                     onclick="window.open('${featured.image_url}', '_blank')">
                <div>
                    <div class="featured-writing-name">
                        ${featured.profiles?.avatar || '🦁'} ${featured.profiles?.nickname || 'Student'}'s
                        <span style="font-family:'Abyssinica SIL',serif;">${featured.base_letter}</span> family
                    </div>
                    ${featured.note ? `<div class="featured-writing-note">"${featured.note}"</div>` : ''}
                </div>
            </div>
            ${pickerBtn}
        `;
    }

    const pickBtn = document.getElementById('pickFeaturedWritingBtn');
    if (pickBtn) pickBtn.onclick = () => openFeaturedWritingPicker(weekStart);
}

async function openFeaturedWritingPicker(weekStart) {
    const { data: submissions, error } = await _supabase
        .from('writing_submissions')
        .select(`
            id, student_id, base_letter, image_url, reviewed_at,
            profiles!writing_submissions_student_id_fkey(nickname, avatar)
        `)
        .eq('status', 'approved')
        .order('reviewed_at', { ascending: false })
        .limit(20);

    if (error || !submissions || submissions.length === 0) {
        return showNotificationToast('No approved writing to feature yet.');
    }

    document.getElementById('featuredWritingPickerOverlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'featuredWritingPickerOverlay';
    overlay.style.cssText = `
        position:fixed; inset:0; background:rgba(0,0,0,0.65); z-index:99997;
        display:flex; align-items:center; justify-content:center; padding:20px;
    `;
    overlay.innerHTML = `
        <div style="background:white; border-radius:20px; padding:20px; max-width:420px; width:100%; max-height:80vh; overflow-y:auto;">
            <h3 style="margin:0 0 12px; font-size:16px; color:#166534;">Pick this week's Featured Writing</h3>
            <div style="display:flex; flex-direction:column; gap:8px;">
                ${submissions.map(sub => `
                    <button class="featured-picker-row"
                            data-id="${sub.id}" data-student="${sub.student_id}"
                            data-letter="${sub.base_letter}" data-image="${sub.image_url}"
                            data-name="${(sub.profiles?.nickname || 'Student').replace(/"/g, '&quot;')}">
                        <img src="${sub.image_url}" alt="writing sample">
                        <span>${sub.profiles?.avatar || '🦁'} ${sub.profiles?.nickname || 'Student'} — ${sub.base_letter}</span>
                    </button>
                `).join('')}
            </div>
            <button class="btn-secondary" id="closeFeaturedPickerBtn" style="width:100%; margin-top:12px;">Cancel</button>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('closeFeaturedPickerBtn').onclick = () => overlay.remove();
    overlay.querySelectorAll('.featured-picker-row').forEach(btn => {
        btn.onclick = async () => {
            const note = prompt(`Optional note about ${btn.dataset.name}'s writing (e.g. "Beautiful strokes!"):`);
            const { error: saveError } = await _supabase.from('featured_writing').upsert({
                student_id: btn.dataset.student,
                submission_id: btn.dataset.id,
                image_url: btn.dataset.image,
                base_letter: btn.dataset.letter,
                note: note || null,
                featured_by: currentUser.id,
                week_start: weekStart
            }, { onConflict: 'week_start' });

            overlay.remove();
            if (saveError) return showNotificationToast("Couldn't save: " + saveError.message);
            showGobezToast('Featured Writing updated! ✨');
            await renderFeaturedWriting('featuredWritingMount');
        };
    });
}

// ---------------------------------------------------------------------------
// Recent Achievements — fully automatic, no curation. Synthesized from
// tables that already exist: chapter completions, streak milestones, team
// level advances, writing approvals, and new-student welcomes. Keeps the
// page feeling alive daily even if nobody uploads a photo.
// ---------------------------------------------------------------------------

async function renderRecentAchievements(mountId) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px; margin:0;">Loading...</p>`;

    const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const events = [];

    const [chapters, streaks, teamsAdvanced, approvals] = await Promise.all([
        _supabase.from('reading_chapter_progress')
            .select('student_id, level_number, completed_at, profiles!reading_chapter_progress_student_id_fkey(nickname)')
            .eq('checkpoint_passed', true)
            .gte('completed_at', sinceIso)
            .order('completed_at', { ascending: false })
            .limit(10),
        _supabase.from('student_family_progress')
            .select('student_id, best_streak, completed_at, profiles!student_family_progress_student_id_fkey(nickname)')
            .eq('streak_passed', true)
            .gte('completed_at', sinceIso)
            .order('completed_at', { ascending: false })
            .limit(10),
        _supabase.from('teams')
            .select('name, current_level, last_advanced_at')
            .gte('last_advanced_at', sinceIso)
            .order('last_advanced_at', { ascending: false })
            .limit(10),
        _supabase.from('writing_submissions')
            .select('student_id, base_letter, reviewed_at, profiles!writing_submissions_student_id_fkey(nickname)')
            .eq('status', 'approved')
            .gte('reviewed_at', sinceIso)
            .order('reviewed_at', { ascending: false })
            .limit(10)
    ]);

    (chapters.data || []).forEach(row => events.push({
        icon: '📘', time: row.completed_at,
        text: `${row.profiles?.nickname || 'A student'} completed Chapter ${row.level_number}`
    }));
    (streaks.data || []).forEach(row => events.push({
        icon: '🔥', time: row.completed_at,
        text: `${row.profiles?.nickname || 'A student'} reached a ${row.best_streak} streak`
    }));
    (teamsAdvanced.data || []).forEach(row => events.push({
        icon: '🏁', time: row.last_advanced_at,
        text: `${row.name} advanced to Level ${row.current_level}`
    }));
    (approvals.data || []).forEach(row => events.push({
        icon: '✓', time: row.reviewed_at,
        text: `${row.profiles?.nickname || 'A student'}'s writing was approved`
    }));

    events.sort((a, b) => new Date(b.time) - new Date(a.time));
    const recent = events.slice(0, 12);

    if (recent.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px; margin:0;">Nothing new this week yet — check back soon!</p>`;
        return;
    }

    mount.innerHTML = recent.map(e => `
        <div class="achieve-row">
            <div class="achieve-icon">${e.icon}</div>
            <span>${e.text}</span>
            <span class="achieve-time">${typeof formatTimeAgo === 'function' ? formatTimeAgo(e.time) : ''}</span>
        </div>
    `).join('');
}

// ---------------------------------------------------------------------------
// Expose
// ---------------------------------------------------------------------------

window.chooseModeCommunity      = chooseModeCommunity;
window.exitCommunity            = exitCommunity;
window.renderCommunityFeed      = renderCommunityFeed;
window.toggleCommunityReaction  = toggleCommunityReaction;
window.deleteCommunityPost      = deleteCommunityPost;
window.renderFeaturedWriting    = renderFeaturedWriting;
window.openFeaturedWritingPicker = openFeaturedWritingPicker;
window.renderRecentAchievements = renderRecentAchievements;

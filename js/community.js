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

    if (typeof renderStarBoard === 'function') renderStarBoard('starBoardMount');

    if (typeof renderVerseOfDay === 'function') renderVerseOfDay('verseOfDayMount');
    if (typeof renderWordleStatusMini === 'function') renderWordleStatusMini('wordleStatusMount');
    if (typeof renderQuestionOfDay === 'function') renderQuestionOfDay('questionOfDayMount');
    if (typeof renderTodayBanners === 'function') renderTodayBanners('todayBannersMount');
    if (typeof renderSongOfWeek === 'function') renderSongOfWeek('songOfWeekMount');

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
// Expose
// ---------------------------------------------------------------------------

window.chooseModeCommunity      = chooseModeCommunity;
window.exitCommunity            = exitCommunity;
window.renderCommunityFeed      = renderCommunityFeed;
window.toggleCommunityReaction  = toggleCommunityReaction;
window.deleteCommunityPost      = deleteCommunityPost;

// =============================================================================
// SONGWEEK.JS — Song of the Week. Each team picks one song (Spotify, Apple
// Music, or YouTube link) per week; Community shows your team's pick plus
// every other team's, so it doubles as a light cross-team showcase.
//
// Needs the team_song_of_week table — see the SQL delivered alongside this
// file. Unlike Verse/Question of the Day, this is real shared data (every
// team needs to see every other team's pick), so it can't live in
// localStorage the way those do.
//
// Loads AFTER: app.js.
// =============================================================================

const SONG_PLATFORMS = {
    spotify: { label: 'Spotify',      icon: '🟢' },
    apple:   { label: 'Apple Music',  icon: '🍎' },
    youtube: { label: 'YouTube',      icon: '▶️' },
    other:   { label: 'Link',         icon: '🎵' }
};

function detectSongPlatform(url) {
    if (/spotify\.com/i.test(url))              return 'spotify';
    if (/music\.apple\.com/i.test(url))         return 'apple';
    if (/youtube\.com|youtu\.be/i.test(url))    return 'youtube';
    return 'other';
}

// Simple epoch-week bucket — doesn't need to be ISO-standard, just needs to
// be the same value for everyone during the same 7-day span. Same epoch
// wordle.js/dailyfeed.js use for their own day-index rotation.
function getSongWeekKey() {
    const start = new Date('2025-07-01');
    const now = new Date();
    const diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
    return `week_${Math.floor(diffDays / 7)}`;
}

function songSubmitFormHTML(targetId) {
    return `
        <div class="song-input-row">
            <input type="url" id="${targetId}-url" class="song-url-input"
                   placeholder="Paste a Spotify, Apple Music, or YouTube link">
            <button type="button" class="btn-primary" style="font-size:13px; padding:9px 14px;"
                    onclick="submitTeamSong('${targetId}')">Save</button>
        </div>`;
}

function toggleSongSubmitForm(targetId) {
    const form = document.getElementById(`${targetId}-form`);
    if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

async function renderSongOfWeek(targetId = 'songOfWeekMount') {
    const mount = document.getElementById(targetId);
    if (!mount) return;
    mount.innerHTML = `<div class="eyebrow">Song of the Week</div><p class="mini-sub">Loading...</p>`;

    const weekKey = getSongWeekKey();
    const myTeamId = currentProfile?.team_id;

    const { data: teams } = await _supabase.from('teams').select('id, name').order('name');
    const { data: songs, error } = await _supabase
        .from('team_song_of_week')
        .select('team_id, song_url, platform')
        .eq('week_key', weekKey);

    if (error) {
        mount.innerHTML = `<div class="eyebrow">Song of the Week</div><p style="font-size:12px; color:#ef4444;">Couldn't load: ${error.message}</p>`;
        return;
    }

    const songByTeam = {};
    (songs || []).forEach(s => { songByTeam[s.team_id] = s; });
    const mySong = myTeamId ? songByTeam[myTeamId] : null;

    let html = `<div class="eyebrow">Song of the Week</div>`;

    if (!myTeamId) {
        html += `<p class="mini-sub">Join a team to pick your team's song of the week.</p>`;
    } else if (mySong) {
        const platform = SONG_PLATFORMS[mySong.platform] || SONG_PLATFORMS.other;
        html += `
            <a class="song-my-pick" href="${mySong.song_url}" target="_blank" rel="noopener">
                <span class="song-platform-icon">${platform.icon}</span>
                <div class="song-my-pick-text">
                    <strong>Your team's pick</strong>
                    <span class="mini-sub">${platform.label} — tap to listen ↗</span>
                </div>
            </a>
            <button type="button" class="qotd-edit-btn" onclick="toggleSongSubmitForm('${targetId}')">Change song</button>
            <div id="${targetId}-form" style="display:none; margin-top:10px;">
                ${songSubmitFormHTML(targetId)}
            </div>`;
    } else {
        html += `
            <p class="mini-sub" style="margin-bottom:10px;">Your team hasn't picked a song yet this week!</p>
            ${songSubmitFormHTML(targetId)}`;
    }

    const otherPicks = (teams || []).filter(t => t.id !== myTeamId && songByTeam[t.id]);
    if (otherPicks.length > 0) {
        html += `<div class="song-other-teams">`;
        otherPicks.forEach(t => {
            const s = songByTeam[t.id];
            const platform = SONG_PLATFORMS[s.platform] || SONG_PLATFORMS.other;
            html += `
                <a class="song-other-row" href="${s.song_url}" target="_blank" rel="noopener">
                    <span>${platform.icon}</span>
                    <span class="song-other-team-name">${t.name}</span>
                    <span class="song-other-open">Listen ↗</span>
                </a>`;
        });
        html += `</div>`;
    }

    mount.innerHTML = html;
}

async function submitTeamSong(targetId) {
    const input = document.getElementById(`${targetId}-url`);
    const url = input ? input.value.trim() : '';
    if (!url) return showNotificationToast('Paste a song link first!');
    if (!currentProfile?.team_id) return showNotificationToast('Join a team first!');

    const platform = detectSongPlatform(url);

    const { error } = await _supabase.from('team_song_of_week').upsert({
        team_id: currentProfile.team_id,
        submitted_by: currentUser.id,
        song_url: url,
        platform: platform,
        week_key: getSongWeekKey()
    }, { onConflict: 'team_id,week_key' });

    if (error) return showNotificationToast("Couldn't save: " + error.message);

    showGobezToast('Song of the week saved!');
    renderSongOfWeek(targetId);
}

// ---------------------------------------------------------------------------
// Expose
// ---------------------------------------------------------------------------

window.renderSongOfWeek = renderSongOfWeek;
window.submitTeamSong = submitTeamSong;
window.toggleSongSubmitForm = toggleSongSubmitForm;

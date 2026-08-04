// =============================================================================
// STARBOARD.JS
// Star of the Week — captains celebrate one teammate per week.
//   Community page  → renderStarBoard('starBoardMount')   (everyone sees it)
//   Competition pg  → renderStarPicker('starPickerMount') (captains only)
//
// Requires the star_of_week table (see star_of_week.sql).
// Loads AFTER: app.js (needs _supabase, currentUser, currentProfile,
// showNotificationToast).
// =============================================================================

// ---------------------------------------------------------------------------
// Week helper — weeks start on Monday
// ---------------------------------------------------------------------------

function _starWeekStart() {
    const d = new Date();
    const day = d.getDay();                    // 0 = Sunday
    const diff = (day === 0 ? -6 : 1 - day);   // back to Monday
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    return monday.toISOString().slice(0, 10);  // YYYY-MM-DD
}

// ---------------------------------------------------------------------------
// STAR BOARD — Community page, one card per team
// ---------------------------------------------------------------------------

async function renderStarBoard(mountId) {
    const mount = document.getElementById(mountId);
    if (!mount) return;

    const { data: stars, error } = await _supabase
        .from('star_of_week')
        .select(`
            id, team_id, shoutout, submission_image_url, week_start,
            student:profiles!star_of_week_student_id_fkey(nickname, avatar),
            teams(name)
        `)
        .eq('week_start', _starWeekStart())
        .order('created_at', { ascending: true });

    if (error) {
        // Table probably not created yet — hide quietly rather than break the feed
        console.warn('Star board unavailable:', error.message);
        mount.innerHTML = '';
        return;
    }

    if (!stars || stars.length === 0) {
        mount.innerHTML = `
            <div class="card star-board-empty">
                No stars yet this week. Captains, pick a teammate to celebrate!
            </div>`;
        return;
    }

    const cards = stars.map(s => {
        const avatar   = s.student?.avatar || '🦁';
        const name     = s.student?.nickname || 'Student';
        const teamName = s.teams?.name || 'Team';
        return `
        <div class="star-board-card">
            <div class="star-board-card-top">
                <div class="star-avatar-badge">
                    <span class="star-avatar-emoji">${avatar}</span>
                    <span class="star-gold-star">${icon('star')}</span>
                </div>
                <div>
                    <div class="star-student-name">${name}</div>
                    <div class="star-team-name">${teamName}</div>
                </div>
            </div>
            ${s.shoutout ? `<div class="star-shoutout">“${s.shoutout}”</div>` : ''}
            ${s.submission_image_url ? `
                <img class="star-writing-img" src="${s.submission_image_url}"
                     alt="${name}'s writing" loading="lazy">` : ''}
        </div>`;
    }).join('');

    mount.innerHTML = `
        <div class="star-board-sub">This week's stars, chosen by team captains</div>
        <div class="star-board-grid">${cards}</div>`;
}

// ---------------------------------------------------------------------------
// CAPTAIN PICKER — Competition page card (captains only)
// ---------------------------------------------------------------------------

let _starMembers = [];   // teammates
let _starSubs    = [];   // selected member's approved submissions
let _starPick    = { memberIdx: null, subIdx: null };

async function renderStarPicker(mountId) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    if (!currentProfile?.is_captain || !currentProfile?.team_id) {
        mount.innerHTML = '';
        return;
    }

    mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">Loading...</p>`;
    _starPick = { memberIdx: null, subIdx: null };
    _starSubs = [];

    // Current pick this week (if any)
    const { data: existing } = await _supabase
        .from('star_of_week')
        .select('student_id, shoutout, student:profiles!star_of_week_student_id_fkey(nickname, avatar)')
        .eq('team_id', currentProfile.team_id)
        .eq('week_start', _starWeekStart())
        .maybeSingle();

    // Teammates (not the captain themselves — spread the spotlight!)
    const { data: members } = await _supabase
        .from('profiles')
        .select('id, nickname, avatar')
        .eq('team_id', currentProfile.team_id)
        .neq('id', currentUser.id)
        .order('nickname');

    _starMembers = members || [];

    if (_starMembers.length === 0) {
        mount.innerHTML = `<p style="color:#94a3b8; font-size:13px;">No teammates yet.</p>`;
        return;
    }

    const currentBanner = existing ? `
        <div class="star-current-banner">
            ${icon('star')} This week: <strong>${existing.student?.avatar || '🦁'}
            ${existing.student?.nickname || 'Student'}</strong>
            <span style="color:#92400e;"> · tap a name to change your pick</span>
        </div>` : `
        <p style="font-size:12px; color:#64748b; margin:0 0 10px;">
            Pick one teammate to celebrate on the class Star Board this week.
        </p>`;

    const chips = _starMembers.map((m, i) => `
        <button class="star-picker-chip" id="starChip${i}" onclick="starPickMember(${i})">
            ${m.avatar || '🦁'} ${m.nickname}
        </button>`).join('');

    mount.innerHTML = `
        ${currentBanner}
        <div class="star-picker-chips">${chips}</div>
        <div id="starPickerDetail"></div>`;
}

async function starPickMember(idx) {
    _starPick = { memberIdx: idx, subIdx: null };
    _starSubs = [];

    document.querySelectorAll('.star-picker-chip')
        .forEach((el, i) => el.classList.toggle('selected', i === idx));

    const detail = document.getElementById('starPickerDetail');
    if (!detail) return;
    detail.innerHTML = `<p style="color:#94a3b8; font-size:13px; margin-top:10px;">Loading their work...</p>`;

    const member = _starMembers[idx];
    const { data: subs } = await _supabase
        .from('writing_submissions')
        .select('id, base_letter, image_url, submitted_at')
        .eq('student_id', member.id)
        .eq('status', 'approved')
        .order('submitted_at', { ascending: false })
        .limit(6);

    _starSubs = subs || [];

    const thumbs = _starSubs.length > 0
        ? `<p class="star-picker-label">Choose a piece of their writing to show off:</p>
           <div class="star-sub-thumbs">
               ${_starSubs.map((s, i) => `
                   <div class="star-sub-thumb" id="starSub${i}" onclick="starPickSubmission(${i})">
                       <img src="${s.image_url}" alt="${s.base_letter} writing" loading="lazy">
                       <span>${s.base_letter}</span>
                   </div>`).join('')}
           </div>`
        : `<p style="font-size:12px; color:#94a3b8; margin-top:10px;">
               No approved writing yet, but you can still make them the star,
               their writing spot will just be empty.
           </p>`;

    detail.innerHTML = `
        ${thumbs}
        <input type="text" id="starShoutoutInput" class="star-shoutout-input"
               maxlength="90" placeholder="Add a shout-out (optional), e.g. Amazing ሀ family work!">
        <button class="btn-primary star-save-btn" onclick="saveStarOfWeek()">
            ${icon('star')} Make ${member.nickname} the Star of the Week
        </button>`;
}

function starPickSubmission(idx) {
    _starPick.subIdx = idx;
    document.querySelectorAll('.star-sub-thumb')
        .forEach((el, i) => el.classList.toggle('selected', i === idx));
}

async function saveStarOfWeek() {
    const member = _starMembers[_starPick.memberIdx];
    if (!member) return;

    const shoutout = document.getElementById('starShoutoutInput')?.value.trim() || null;
    const imageUrl = _starPick.subIdx !== null ? _starSubs[_starPick.subIdx]?.image_url : null;

    const { error } = await _supabase
        .from('star_of_week')
        .upsert({
            team_id:              currentProfile.team_id,
            student_id:           member.id,
            chosen_by:            currentUser.id,
            submission_image_url: imageUrl,
            shoutout:             shoutout,
            week_start:           _starWeekStart()
        }, { onConflict: 'team_id,week_start' });

    if (error) {
        showNotificationToast("Couldn't save: " + error.message);
        return;
    }

    showNotificationToast(`${icon('star')} ${member.nickname} is your Star of the Week!`);
    renderStarPicker('starPickerMount');
}

// ---------------------------------------------------------------------------
// Expose
// ---------------------------------------------------------------------------

window.renderStarBoard    = renderStarBoard;
window.renderStarPicker   = renderStarPicker;
window.starPickMember     = starPickMember;
window.starPickSubmission = starPickSubmission;
window.saveStarOfWeek     = saveStarOfWeek;

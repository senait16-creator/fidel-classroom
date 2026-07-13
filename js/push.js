// =============================================================================
// JS/PUSH.JS
// Web Push subscribe/unsubscribe flow — the "Enable Notifications" toggle
// in the hamburger menu. Actually sending pushes happens server-side (the
// send-push Edge Function); this file only manages the subscription record
// and asks the browser/OS for permission.
//
// iOS specifics: Web Push only works for a PWA added to the Home Screen
// (iOS/iPadOS 16.4+) — a plain Safari tab can't receive push at all, no
// matter what permission is granted. isRunningStandalone() below is how we
// detect that and steer the user to "Add to Home Screen" first instead of
// silently failing.
//
// Loads AFTER app.js (needs currentUser, _supabase, showNotificationToast).
// =============================================================================

// Generated once for this app — the public half is safe to ship in client
// code (that's the whole point of VAPID); the private half lives only as
// a secret on the send-push Edge Function, never in this file.
const VAPID_PUBLIC_KEY = 'BJEFPJRBlun6aunzZ5mrvxPu1RfV6U_tH2eGmVBnDUt6ZnO4Hm_rV-sLhYLZUoQ_HQrjGVEwwovaGHBG0wUTqUM';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
}

function isPushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// True once installed to the Home Screen (Android Chrome and iOS Safari
// both expose this, just via different properties).
function isRunningStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOS() {
    return /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
}

// One of: 'unsupported', 'needs-install', 'denied', 'granted', 'default'
function getPushPermissionState() {
    if (!isPushSupported()) return 'unsupported';
    if (isIOS() && !isRunningStandalone()) return 'needs-install';
    return Notification.permission; // 'default' | 'granted' | 'denied'
}

async function enablePushNotifications() {
    const state = getPushPermissionState();

    // TEMPORARY DEBUG BUILD — alert() at every step so failures are
    // impossible to miss on a phone with no console attached. Remove once
    // the real subscribe issue is found.
    alert('DEBUG 1: permission state = ' + state);

    if (state === 'unsupported') {
        return showNotificationToast("Push notifications aren't supported on this browser.");
    }
    if (state === 'needs-install') {
        return showNotificationToast('Add Fidel Classroom to your Home Screen first (Share → Add to Home Screen), then enable notifications from there.');
    }
    if (state === 'denied') {
        return showNotificationToast("Notifications are blocked for this app — enable them in your device's notification settings.");
    }

    try {
        const permission = await Notification.requestPermission();
        alert('DEBUG 2: requestPermission result = ' + permission);
        if (permission !== 'granted') {
            return showNotificationToast('Notifications not enabled.');
        }

        const registration = await navigator.serviceWorker.ready;
        alert('DEBUG 3: service worker ready, scope = ' + registration.scope);

        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
        alert('DEBUG 4: subscribed, endpoint = ' + subscription.endpoint.slice(0, 60) + '...');

        const json = subscription.toJSON();
        alert('DEBUG 5: currentUser.id = ' + (currentUser && currentUser.id));

        const { error } = await _supabase.from('push_subscriptions').upsert({
            student_id: currentUser.id,
            endpoint: json.endpoint,
            p256dh: json.keys.p256dh,
            auth: json.keys.auth
        }, { onConflict: 'endpoint' });

        if (error) {
            alert('DEBUG 6 ERROR: upsert failed — ' + error.message);
            console.error('Failed to save push subscription:', error);
            return showNotificationToast("Couldn't save notification settings: " + error.message);
        }

        alert('DEBUG 6: upsert succeeded!');
        showGobezToast('Notifications enabled! 🔔');
        updatePushMenuButton();
    } catch (err) {
        alert('DEBUG CATCH: ' + (err && err.message) + '\n\n' + (err && err.stack));
        console.error('Push subscribe failed:', err);
        showNotificationToast("Couldn't enable notifications: " + err.message);
    }
}

async function disablePushNotifications() {
    try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = registration ? await registration.pushManager.getSubscription() : null;
        if (subscription) {
            await _supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
            await subscription.unsubscribe();
        }
        showNotificationToast('Notifications turned off.');
        updatePushMenuButton();
    } catch (err) {
        console.error('Push unsubscribe failed:', err);
        showNotificationToast("Couldn't turn off notifications: " + err.message);
    }
}

async function togglePushNotifications() {
    // getRegistration() (not .ready) — .ready never resolves at all if no
    // service worker has ever successfully registered, hanging this
    // function forever before it could reach enablePushNotifications().
    const registration = await navigator.serviceWorker.getRegistration();
    const existing = registration ? await registration.pushManager.getSubscription() : null;
    if (existing) {
        await disablePushNotifications();
    } else {
        await enablePushNotifications();
    }
}

// Keeps the hamburger menu's notification row in sync with actual
// permission/subscription state — call after opening the menu and after
// any enable/disable action.
async function updatePushMenuButton() {
    const row = document.getElementById('pushNotifRow');
    const label = document.getElementById('pushNotifLabel');
    if (!row || !label) return;

    if (!isPushSupported()) { row.style.display = 'none'; return; }
    row.style.display = 'flex';

    const state = getPushPermissionState();
    if (state === 'needs-install') {
        label.innerText = '🔔 Add to Home Screen to enable';
        return;
    }
    if (state === 'denied') {
        label.innerText = '🔕 Notifications blocked';
        return;
    }

    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = registration ? await registration.pushManager.getSubscription() : null;
    label.innerText = subscription ? '🔕 Turn Off Notifications' : '🔔 Enable Notifications';
}

// ---------------------------------------------------------------------------
// Sending pushes — fire-and-forget calls into the send-push Edge Function.
// Never blocks or fails the calling flow if push delivery has an issue;
// worst case a student just doesn't get pinged, the in-app state is still
// correct either way.
// ---------------------------------------------------------------------------

async function sendPushNotification(payload) {
    try {
        const { error } = await _supabase.functions.invoke('send-push', { body: payload });
        if (error) console.error('send-push invoke failed:', error);
    } catch (err) {
        console.error('send-push invoke threw:', err);
    }
}

// ---------------------------------------------------------------------------
// Expose
// ---------------------------------------------------------------------------

window.enablePushNotifications = enablePushNotifications;
window.disablePushNotifications = disablePushNotifications;
window.togglePushNotifications = togglePushNotifications;
window.updatePushMenuButton = updatePushMenuButton;
window.sendPushNotification = sendPushNotification;

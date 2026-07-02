// =============================================================================
// NAVIGATION.JS
// Adds browser Back/Forward support on top of the existing screen functions.
// This is a safe bridge layer: it does not redesign screens yet.
// =============================================================================

(function () {
    let isHandlingPopState = false;
    let hasInitializedAppHistory = false;

    const NAV_ROUTES = {
        modeSelect: {
            label: 'Mode Select',
            run: () => window.__originalEnterModeSelect?.()
        },
        challengeDashboard: {
            label: 'Challenge Dashboard',
            run: () => window.__originalChooseModeChallenge?.()
        },
        teamHub: {
            label: 'Team Hub',
            run: () => window.__originalEnterTeamHub?.()
        },
        readingPath: {
            label: 'Reading Path',
            run: () => window.__originalEnterReadingPath?.()
        },
        letterBoard: {
            label: 'Letter Board',
            run: () => window.__originalOpenLetterBoard?.()
        },
        captainDashboard: {
            label: 'Captain Dashboard',
            run: () => window.__originalEnterCaptainDashboard?.()
        }
    };

    function updateHistory(routeName, options = {}) {
        if (isHandlingPopState) return;
        if (!NAV_ROUTES[routeName]) return;

        const state = { fidelRoute: routeName };
        const hash = `#${routeName}`;

        if (options.replace || !hasInitializedAppHistory) {
            history.replaceState(state, '', hash);
            hasInitializedAppHistory = true;
        } else {
            history.pushState(state, '', hash);
        }
    }

    async function goToRoute(routeName) {
        const route = NAV_ROUTES[routeName];
        if (!route) return;

        try {
            await route.run();
        } catch (error) {
            console.error(`Navigation failed: ${routeName}`, error);
            if (typeof showNotificationToast === 'function') {
                showNotificationToast(`Couldn't open ${route.label}.`);
            }
        }
    }

    function wrapNavigationFunction(name, routeName, options = {}) {
        const original = window[name];
        if (typeof original !== 'function') return;

        window[`__original${name.charAt(0).toUpperCase()}${name.slice(1)}`] = original;

        window[name] = async function (...args) {
            const result = await original.apply(this, args);
            updateHistory(routeName, options);
            return result;
        };
    }

    function installNavigationWrappers() {
        if (window.__fidelNavigationInstalled) return;
        window.__fidelNavigationInstalled = true;

        wrapNavigationFunction('enterModeSelect', 'modeSelect', { replace: true });
        wrapNavigationFunction('chooseModeChallenge', 'challengeDashboard');
        wrapNavigationFunction('enterTeamHub', 'teamHub');
        wrapNavigationFunction('enterReadingPath', 'readingPath');
        wrapNavigationFunction('openLetterBoard', 'letterBoard');
        wrapNavigationFunction('enterCaptainDashboard', 'captainDashboard');

        window.addEventListener('popstate', async (event) => {
            const routeName = event.state?.fidelRoute;
            if (!routeName || !NAV_ROUTES[routeName]) return;

            isHandlingPopState = true;
            await goToRoute(routeName);
            isHandlingPopState = false;
        });
    }

    document.addEventListener('DOMContentLoaded', installNavigationWrappers);

    window.fidelNavigate = function (routeName, options = {}) {
        updateHistory(routeName, options);
        return goToRoute(routeName);
    };
})();

/* player-shaka.js - Shaka Player Integration and DRM manager */

export let shakaPlayer = null;
export let hasFallenBack = false;
export let shakaReady = false;
let lastShakaErrorCode = null;

/**
 * Triggers fallback sandboxed iframe when native DASH/DRM playback fails
 */
export function triggerFallback(activeConfig, video, playerControls, centerPlayHud, iframeFallback, loader, instant = false) {
    if (hasFallenBack) return;
    hasFallenBack = true;

    console.warn("[PLAYER FALLBACK] Activando señal alternativa por fallo de reproducción DRM.");

    const performSwitch = () => {
        // Detect iOS (all iOS browsers use WebKit — Chrome/Firefox/etc are just skins over Safari)
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
            || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        if (isIOS) {
            // iOS: Show styled message inside the player instead of loading iframe with ads
            video.style.display = "none";
            playerControls.style.display = "none";
            centerPlayHud.style.display = "none";
            loader.style.display = "flex";
            loader.style.opacity = "1";
            const spinner = loader.querySelector(".spinner");
            if (spinner) spinner.style.display = "none";
            const loaderText = loader.querySelector(".loader-text");
            if (loaderText) {
                const errInfo = lastShakaErrorCode ? ` [code ${lastShakaErrorCode}]` : '';
                loaderText.innerHTML = `
                    <span style="font-size: 36px; margin-bottom: 10px; display: block;">📡</span>
                    <strong style="font-size: 15px; margin-bottom: 6px; display: block;">Señal no disponible en este dispositivo</strong>
                    <span style="font-size: 13px; opacity: 0.7; line-height: 1.5;">
                        Tu navegador no soporta la reproducción DRM.<br>
                        Probá desde una PC o un dispositivo Android con Chrome.
                    </span>
                    ${errInfo ? `<span style="font-size: 11px; opacity: 0.4; margin-top: 8px; display: block; font-family: monospace;">${errInfo}</span>` : ''}
                `;
            }
        } else {
            // PC/Android: Load iframe fallback as usual
            video.style.display = "none";
            playerControls.style.display = "none";
            centerPlayHud.style.display = "none";
            iframeFallback.style.display = "block";
            iframeFallback.src = activeConfig.iframeUrl;
            hideLoader(loader);
        }
    };

    if (instant) {
        performSwitch();
    } else {
        showErrorText(loader, "Conectando con la señal en vivo...");
        setTimeout(performSwitch, 1500);
    }
}

/**
 * Helper to hide the loader screen using GSAP
 */
export function hideLoader(loader) {
    if (typeof gsap !== "undefined") {
        gsap.to(loader, { opacity: 0, duration: 0.5, onComplete: () => loader.style.display = "none" });
    } else {
        loader.style.display = "none";
    }
}

/**
 * Helper to display custom text on the loader screen
 */
export function showErrorText(loader, msg) {
    loader.style.display = "flex";
    loader.style.opacity = 1;
    const loaderText = loader.querySelector(".loader-text");
    if (loaderText) loaderText.textContent = msg;
}

/**
 * Initializes Shaka Player instance, sets up DRM keys and loads stream manifest
 */
export async function initPlayer(activeConfig, video, playerControls, centerPlayHud, iframeFallback, playIcon, loader, volumeSlider) {
    if (typeof shaka === "undefined") {
        console.error("Shaka Player CDN is not loaded.");
        return;
    }
    
    shaka.polyfill.installAll();

    // If configuration decryption failed, fallback immediately
    if (!activeConfig) {
        triggerFallback(activeConfig, video, playerControls, centerPlayHud, iframeFallback, loader, true);
        return;
    }

    // iOS detection (all iOS browsers are WebKit — Chrome/Firefox/etc are skins over Safari)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // iOS: ManagedMediaSource is destroyed by scroll when the video lives in the main document.
    // Fix: host Shaka inside an iframe — the iframe's document is isolated from the parent
    // scroll, so iOS doesn't destroy its ManagedMediaSource during scroll.
    if (isIOS) {
        hasFallenBack = true;
        video.style.display = "none";
        playerControls.style.display = "none";
        centerPlayHud.style.display = "none";

        const frame = document.createElement('iframe');
        frame.setAttribute('allow', 'autoplay; encrypted-media; fullscreen');
        frame.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;background:#000;';

        // Player container needs relative positioning for the absolute iframe
        const playerContainer = video.closest('#player-container') || video.parentElement;
        playerContainer.style.position = 'relative';
        playerContainer.appendChild(frame);

        // Send config when the frame signals it's ready; fall back to external on error
        window.addEventListener('message', ({ data }) => {
            if (data?.type === 'player-frame-ready') {
                frame.contentWindow.postMessage(
                    { type: 'player-frame-init', config: activeConfig },
                    location.origin
                );
            }
            if (data?.type === 'player-frame-error') {
                // Our player failed — fall back to external iframe (with ads)
                frame.src = activeConfig.iframeUrl;
            }
        });

        // Load our own player page (same origin = no sandbox restrictions)
        frame.src = '/player-frame.html';

        hideLoader(loader);
        return;
    }

    if (!shaka.Player.isBrowserSupported()) {
        console.warn("[SHAKA] isBrowserSupported() = false — attempting anyway.");
    }


    shakaPlayer = new shaka.Player(video);

    if (isIOS) {
        // iOS path: software CENC AES-CTR decryption via Web Crypto.
        //
        // The stream uses the 'cenc' protection scheme (AES-128-CTR).
        // iOS Safari CDM only supports 'cbcs' (AES-128-CBC), so native DRM fails
        // silently → black screen. We bypass the CDM entirely:
        //   1. Strip ContentProtection from the manifest so Shaka never calls requestMediaKeySession.
        //   2. Patch init segments (encv→avc1, sinf→free) so MSE treats content as clear.
        //   3. Decrypt each media segment's mdat via Web Crypto before Shaka sees it.

        console.log("[SHAKA] iOS detected — activating software CENC decryption path.");

        const { createIOSDecryptor } = await import('./ios-cenc-decryptor.js');
        const decryptor = await createIOSDecryptor(activeConfig.key);
        const net = shakaPlayer.getNetworkingEngine();

        // Filter 1: remove ContentProtection elements from DASH manifest.
        net.registerResponseFilter((type, response) => {
            if (type !== shaka.net.NetworkingEngine.RequestType.MANIFEST) return;
            const xml = new TextDecoder().decode(new Uint8Array(response.data));
            const stripped = xml
                .replace(/<ContentProtection\b[^>]*\/>/g, '')
                .replace(/<ContentProtection\b[\s\S]*?<\/ContentProtection>/g, '');
            response.data = new TextEncoder().encode(stripped).buffer;
        });

        // Filter 2: transform init segments and decrypt media segments.
        // Detection by first MP4 box type (reliable vs URI matching).
        net.registerResponseFilter(async (type, response) => {
            if (type !== shaka.net.NetworkingEngine.RequestType.SEGMENT) return;
            const bytes = new Uint8Array(response.data);
            const firstBox = bytes.length >= 8
                ? String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]) : '';
            const isInit = firstBox === 'ftyp' || firstBox === 'moov';
            if (isInit) {
                response.data = decryptor.transformInit(response.data);
            } else {
                response.data = await decryptor.decryptMedia(response.data);
            }
        });

        // No clearKeys — DRM is handled by our filters above.
        shakaPlayer.configure({
            manifest: { dash: { clockSyncUri: '' } },
            streaming: { bufferingGoal: 20, rebufferingGoal: 10, lowLatencyMode: false }
        });

    } else {
        // Non-iOS path: native ClearKey via browser CDM.
        const clearKeyMap = {};
        clearKeyMap[activeConfig.keyId] = activeConfig.key;

        shakaPlayer.configure({
            drm: { clearKeys: clearKeyMap },
            manifest: { dash: { clockSyncUri: '' } },
            streaming: { bufferingGoal: 20, rebufferingGoal: 10, lowLatencyMode: true }
        });
    }

    // Grace period after exiting iOS native fullscreen: the MSE pipeline takes a moment
    // to re-stabilize and Shaka may fire transient CRITICAL errors during that window.
    let postFullscreenGrace = false;
    video.addEventListener('webkitendfullscreen', () => {
        postFullscreenGrace = true;
        setTimeout(() => { postFullscreenGrace = false; }, 3000);
    });

    // Grace period during touch gestures (scroll, control taps, etc.):
    // iOS fires 'scroll' events AFTER the viewport has already moved, so ManagedMediaSource
    // can be interrupted before the first 'scroll' event arrives. 'touchstart' fires
    // immediately when the finger touches the screen — before any scroll begins.
    let scrollGrace = false;
    let scrollGraceTimer = null;

    const activateTouchGrace = () => {
        scrollGrace = true;
        clearTimeout(scrollGraceTimer);
        scrollGraceTimer = null;
    };
    const scheduleTouchGraceEnd = () => {
        clearTimeout(scrollGraceTimer);
        scrollGraceTimer = setTimeout(() => { scrollGrace = false; }, 3000);
    };

    document.addEventListener('touchstart', activateTouchGrace, { passive: true });
    document.addEventListener('touchend', scheduleTouchGraceEnd, { passive: true });
    document.addEventListener('touchcancel', scheduleTouchGraceEnd, { passive: true });

    // Desktop fallback: trackpad / wheel scroll has no touch events.
    window.addEventListener('scroll', () => {
        scrollGrace = true;
        clearTimeout(scrollGraceTimer);
        scrollGraceTimer = setTimeout(() => { scrollGrace = false; }, 2000);
    }, { passive: true });

    // Grace period on app resume: when the user switches back from another app,
    // ManagedMediaSource resumes and Shaka may fire transient CRITICAL errors.
    let visibilityGrace = false;
    let visibilityGraceTimer = null;
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            visibilityGrace = true;
            clearTimeout(visibilityGraceTimer);
            visibilityGraceTimer = setTimeout(() => { visibilityGrace = false; }, 3000);
        }
    });

    // When iOS destroys ManagedMediaSource during scroll/interaction, the video element
    // fires 'emptied' and drops to readyState=0. retryStreaming() is useless at that point
    // because there is no source attached — we need a full shakaPlayer.load() to rebuild
    // the pipeline.
    //
    // ROOT CAUSE of the reload loop: calling video.play() immediately after shakaPlayer.load()
    // while readyState is still 0 (HAVE_NOTHING) triggers MEDIA_ERR_DECODE (code=3), which
    // fires another 'emptied', which starts the whole cycle again. Fix: use a one-shot
    // 'canplay' listener so play() only fires once the pipeline has data (readyState >= 3).
    let reloadInProgress = false;
    let postReloadGrace = false;
    let postReloadGraceTimer = null;
    let reloadAttempts = 0;
    video.addEventListener('playing', () => { reloadAttempts = 0; });

    video.addEventListener('emptied', () => {
        if (!shakaReady || hasFallenBack || reloadInProgress) return;
        if (reloadAttempts >= 3) {
            triggerFallback(activeConfig, video, playerControls, centerPlayHud, iframeFallback, loader);
            return;
        }
        reloadInProgress = true;
        reloadAttempts++;

        const doReload = async () => {
            if (hasFallenBack) { reloadInProgress = false; return; }
            if (scrollGrace) { setTimeout(doReload, 300); return; }
            // Skip if Shaka already recovered on its own while we waited
            if (video.readyState >= 3) {
                reloadInProgress = false;
                return;
            }
            try {
                await shakaPlayer.load(activeConfig.manifest);
                postReloadGrace = true;
                clearTimeout(postReloadGraceTimer);
                postReloadGraceTimer = setTimeout(() => { postReloadGrace = false; }, 5000);
                video.volume = volumeSlider.value;
                // CRITICAL: never call play() on readyState=0 — it triggers MEDIA_ERR_DECODE
                // (code=3) → new 'emptied' → reload loop.
                //
                // After load() resolves, 'canplay' may have ALREADY fired during the await
                // (Shaka can buffer segments before resolving the Promise). If we only
                // registered a 'canplay' listener here we'd miss it and the video would
                // stay black forever in silence.
                //
                // Fix: check readyState immediately. If >= 3 (HAVE_FUTURE_DATA) → play()
                // directly, data is already there. Otherwise register the listener — it will
                // fire once the buffer fills up.
                if (video.readyState >= 3) {
                    video.play().catch(() => {});
                } else {
                    video.addEventListener('canplay', () => { video.play().catch(() => {}); }, { once: true });
                }
            } catch (e) {
                if (!hasFallenBack) triggerFallback(activeConfig, video, playerControls, centerPlayHud, iframeFallback, loader);
            } finally {
                reloadInProgress = false;
            }
        };
        setTimeout(doReload, 300);
    });

    // Returns true when we should NOT trigger fallback:
    // - During iOS native fullscreen (orientation errors)
    // - For 3s after exiting fullscreen (MSE re-stabilization)
    // - During and 2s after scroll (video out of viewport on iOS)
    // - For 3s after returning from background/another app
    // - For 5s after a forced reload (stream re-initialization)
    const suppressFallback = () =>
        !!video.webkitDisplayingFullscreen || postFullscreenGrace || scrollGrace || visibilityGrace || postReloadGrace;

    // Listen for player errors — only fallback on CRITICAL severity (2).
    // RECOVERABLE errors (network hiccups, segment retries) are handled internally by Shaka.
    // When a CRITICAL error is suppressed (transient iOS interruption), retryStreaming()
    // tells Shaka to resume — without it, Shaka stays dead and the screen goes black.
    shakaPlayer.addEventListener('error', (event) => {
        lastShakaErrorCode = event.detail.code;
        const isCritical = event.detail.severity === 2;
        const sup = suppressFallback();
        console.error("Shaka error code", event.detail.code, "severity", event.detail.severity, "object", event.detail);
        if (!isCritical) return;
        // If our emptied→load cycle is already running, don't also call retryStreaming()
        // — two concurrent recovery paths conflict and leave the stream in a broken state.
        if (reloadInProgress) return;

        if (sup) {
            setTimeout(() => {
                if (!hasFallenBack && !reloadInProgress) shakaPlayer.retryStreaming();
            }, 800);
        } else {
            triggerFallback(activeConfig, video, playerControls, centerPlayHud, iframeFallback, loader);
        }
    });

    // Listen for video tag errors.
    // Skip MEDIA_ERR_ABORTED (code 1): fires on rapid play/pause, not fatal.
    // When suppressed and readyState > 0: try to resume — iOS may have paused internally.
    // When readyState = 0: ManagedMediaSource is destroyed; the emptied listener handles
    // the full reload — do NOT call play() here, it would trigger another MEDIA_ERR_DECODE.
    video.addEventListener('error', () => {
        if (!video.error || video.error.code === MediaError.MEDIA_ERR_ABORTED) return;
        if (reloadInProgress) return; // emptied listener is already handling recovery

        if (suppressFallback()) {
            if (video.readyState >= 3) {
                // HAVE_FUTURE_DATA: browser has buffered frames — safe to call play()
                setTimeout(() => {
                    if (!hasFallenBack && video.paused) video.play().catch(() => {});
                }, 800);
            }
            // readyState < 3: not enough data yet — calling play() here would trigger code=3 again.
            // The emptied listener or canplay handler will resume playback once data arrives.
        } else {
            console.error("Video element error code:", video.error.code, "message:", video.error.message);
            triggerFallback(activeConfig, video, playerControls, centerPlayHud, iframeFallback, loader);
        }
    });

    try {
        await shakaPlayer.load(activeConfig.manifest);
        console.log("Stream loaded natively successfully!");
        lastShakaErrorCode = null;
        shakaReady = true;
        hideLoader(loader);

        // Set default volume
        video.volume = volumeSlider.value;

        // Try to play stream and handle autoplay blockages
        video.play().catch(err => {
            console.log("Autoplay blocked by browser. Ready for user click.", err);
            playIcon.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
            centerPlayHud.classList.add("active");
            if (typeof gsap !== "undefined") {
                gsap.fromTo(centerPlayHud, { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(1.5)" });
            }
        });
    } catch (e) {
        lastShakaErrorCode = e.code ?? e.message ?? 'load-exception';
        console.error("Shaka loading error:", e);
        triggerFallback(activeConfig, video, playerControls, centerPlayHud, iframeFallback, loader);
    }
}

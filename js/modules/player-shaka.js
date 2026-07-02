/* player-shaka.js - Shaka Player Integration and DRM manager */

export let shakaPlayer = null;
export let hasFallenBack = false;
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

    // On iOS 17+, ManagedMediaSource requires disableRemotePlayback before Shaka attaches.
    if (window.ManagedMediaSource) {
        video.disableRemotePlayback = true;
    }

    if (!shaka.Player.isBrowserSupported()) {
        console.warn("[SHAKA] isBrowserSupported() = false — attempting anyway (iOS software CENC path).");
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

    // Returns true when we should NOT trigger fallback:
    // - During iOS native fullscreen: orientation changes cause transient errors
    //   that the native player handles internally and recovers from.
    const suppressFallback = () => !!video.webkitDisplayingFullscreen;

    // Listen for player errors — only fallback on CRITICAL severity (2).
    // RECOVERABLE errors (network hiccups, segment retries) are handled internally by Shaka.
    shakaPlayer.addEventListener('error', (event) => {
        lastShakaErrorCode = event.detail.code;
        console.error("Shaka error code", event.detail.code, "severity", event.detail.severity, "object", event.detail);
        const isCritical = event.detail.severity === 2;
        if (isCritical && !suppressFallback()) {
            triggerFallback(activeConfig, video, playerControls, centerPlayHud, iframeFallback, loader);
        }
    });

    // Listen for video tag errors
    // Skip MEDIA_ERR_ABORTED (code 1): fires on rapid play/pause and is not fatal.
    // Skip everything while in iOS native fullscreen: rotation causes transient errors.
    video.addEventListener('error', () => {
        if (video.error
            && video.error.code !== MediaError.MEDIA_ERR_ABORTED
            && !suppressFallback()) {
            console.error("Video element error code:", video.error.code, "message:", video.error.message);
            triggerFallback(activeConfig, video, playerControls, centerPlayHud, iframeFallback, loader);
        }
    });

    try {
        await shakaPlayer.load(activeConfig.manifest);
        console.log("Stream loaded natively successfully!");
        lastShakaErrorCode = null;
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

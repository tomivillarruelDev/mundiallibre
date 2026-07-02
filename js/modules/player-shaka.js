/* player-shaka.js - Shaka Player Integration and DRM manager */

export let shakaPlayer = null;
export let hasFallenBack = false;

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
                loaderText.innerHTML = `
                    <span style="font-size: 36px; margin-bottom: 10px; display: block;">📡</span>
                    <strong style="font-size: 15px; margin-bottom: 6px; display: block;">Señal no disponible en este dispositivo</strong>
                    <span style="font-size: 13px; opacity: 0.7; line-height: 1.5;">
                        Tu navegador no soporta la reproducción DRM.<br>
                        Probá desde una PC o un dispositivo Android con Chrome.
                    </span>
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

    // On iOS 17+, ManagedMediaSource requires disableRemotePlayback to enable MSE.
    // This must be set before Shaka attaches to the video element.
    if (window.ManagedMediaSource) {
        video.disableRemotePlayback = true;
    }

    // Attempt playback on all browsers — including iOS.
    // isBrowserSupported() is overly conservative: it returns false on iOS even though
    // Shaka 4.x polyfills ManagedMediaSource (iOS 17+) and has software ClearKey
    // decryption that doesn't rely on the browser's CDM. We let it try and fall back
    // only on actual failure via the error listeners and try/catch below.
    if (!shaka.Player.isBrowserSupported()) {
        console.warn("[SHAKA] isBrowserSupported() = false — attempting anyway with polyfills.");
    }

    shakaPlayer = new shaka.Player(video);

    // Configure DRM ClearKey
    const clearKeyMap = {};
    clearKeyMap[activeConfig.keyId] = activeConfig.key;

    shakaPlayer.configure({
        drm: {
            clearKeys: clearKeyMap
        },
        manifest: {
            dash: {
                clockSyncUri: '' // Prevents clock errors on slow lines
            }
        },
        streaming: {
            bufferingGoal: 20,
            rebufferingGoal: 10,
            lowLatencyMode: true
        }
    });

    // Listen for player errors
    shakaPlayer.addEventListener('error', (event) => {
        console.error("Shaka error code", event.detail.code, "object", event.detail);
        triggerFallback(activeConfig, video, playerControls, centerPlayHud, iframeFallback, loader);
    });

    // Listen for video tag errors
    video.addEventListener('error', () => {
        if (video.error) {
            console.error("Video element error code:", video.error.code, "message:", video.error.message);
            triggerFallback(activeConfig, video, playerControls, centerPlayHud, iframeFallback, loader);
        }
    });

    try {
        await shakaPlayer.load(activeConfig.manifest);
        console.log("Stream loaded natively successfully!");
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
        console.error("Shaka loading error:", e);
        triggerFallback(activeConfig, video, playerControls, centerPlayHud, iframeFallback, loader);
    }
}

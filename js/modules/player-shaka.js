/* player-shaka.js - Shaka Player Integration and DRM manager */
/* Iframe fallback (señal alternativa) desactivado — se usa solo el reproductor nativo */

export let shakaPlayer = null;

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
 * Shows a styled error message inside the player when playback is not possible.
 * This replaces the old iframe fallback — the user stays within the site design.
 */
function showPlaybackError(video, playerControls, centerPlayHud, loader) {
    video.style.display = "none";
    playerControls.style.display = "none";
    centerPlayHud.style.display = "none";

    // Transform the loader into an error message screen
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
}

/**
 * Initializes Shaka Player instance, sets up DRM keys and loads stream manifest.
 * On unsupported browsers (iOS), attempts native playback as a last resort
 * and shows an in-player error message if that also fails — never redirects to iframe.
 */
export async function initPlayer(activeConfig, video, playerControls, centerPlayHud, iframeFallback, playIcon, loader, volumeSlider) {
    if (typeof shaka === "undefined") {
        console.error("Shaka Player CDN is not loaded.");
        showPlaybackError(video, playerControls, centerPlayHud, loader);
        return;
    }
    
    shaka.polyfill.installAll();

    // If configuration decryption failed, show error
    if (!activeConfig) {
        console.error("Configuration decryption failed.");
        showPlaybackError(video, playerControls, centerPlayHud, loader);
        return;
    }

    if (shaka.Player.isBrowserSupported()) {
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

        // Listen for player errors — show in-player error, never iframe
        shakaPlayer.addEventListener('error', (event) => {
            console.error("Shaka error code", event.detail.code, "object", event.detail);
            showPlaybackError(video, playerControls, centerPlayHud, loader);
        });
        
        // Listen for video tag errors
        video.addEventListener('error', () => {
            if (video.error) {
                console.error("Video element error code:", video.error.code, "message:", video.error.message);
                showPlaybackError(video, playerControls, centerPlayHud, loader);
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
            showPlaybackError(video, playerControls, centerPlayHud, loader);
        }
    } else {
        // Browser not supported (iOS/Safari WebKit) — attempt native playback as last resort
        console.warn("Shaka Player not supported. Attempting native video playback...");
        
        try {
            // Try loading the manifest directly into the video element
            // This can work on some browsers with HLS support
            video.src = activeConfig.manifest;
            
            video.addEventListener('error', () => {
                console.error("Native video playback failed on unsupported browser.");
                showPlaybackError(video, playerControls, centerPlayHud, loader);
            }, { once: true });

            await video.play();
            console.log("Native video playback started successfully!");
            hideLoader(loader);
            video.volume = volumeSlider.value;
        } catch (e) {
            console.warn("Native playback failed:", e);
            showPlaybackError(video, playerControls, centerPlayHud, loader);
        }
    }
}

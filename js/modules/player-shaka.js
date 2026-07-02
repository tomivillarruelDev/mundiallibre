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

    // On iOS 17+, ManagedMediaSource requires disableRemotePlayback before Shaka attaches.
    if (window.ManagedMediaSource) {
        video.disableRemotePlayback = true;
    }

    if (!shaka.Player.isBrowserSupported()) {
        console.warn("[SHAKA] isBrowserSupported() = false — attempting anyway (iOS software CENC path).");
    }

    // ── DEBUG PANEL (iOS only, remove after diagnosis) ──────────────────────────
    if (isIOS) {
        const wrapper = Object.assign(document.createElement('div'), {
            style: 'margin:8px 0;border:1px solid #0f0;border-radius:6px;overflow:hidden'
        });
        const header = Object.assign(document.createElement('div'), {
            style: 'display:flex;align-items:center;justify-content:space-between;background:#0f0;padding:4px 8px'
        });
        const label = Object.assign(document.createElement('span'), {
            style: 'color:#000;font:bold 11px monospace'
        });
        label.textContent = 'DEBUG LOG';
        const copyBtn = Object.assign(document.createElement('button'), {
            style: 'background:#000;color:#0f0;border:1px solid #0f0;border-radius:4px;padding:4px 12px;font:bold 12px monospace;cursor:pointer'
        });
        copyBtn.textContent = '📋 COPIAR TODO';
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(panel.value).then(() => {
                copyBtn.textContent = '✅ COPIADO';
                setTimeout(() => { copyBtn.textContent = '📋 COPIAR TODO'; }, 2000);
            }).catch(() => {
                panel.select();
                document.execCommand('copy');
                copyBtn.textContent = '✅ COPIADO';
                setTimeout(() => { copyBtn.textContent = '📋 COPIAR TODO'; }, 2000);
            });
        });
        header.appendChild(label);
        header.appendChild(copyBtn);
        const panel = Object.assign(document.createElement('textarea'), {
            id: '__dbg',
            readOnly: true,
            style: 'display:block;width:100%;box-sizing:border-box;height:240px;margin:0;padding:6px;background:#0a0a0a;color:#0f0;font:11px monospace;border:none;resize:vertical'
        });
        wrapper.appendChild(header);
        wrapper.appendChild(panel);

        // Insert right after the player container
        const playerRef = document.getElementById('player-container');
        if (playerRef && playerRef.parentNode) {
            playerRef.parentNode.insertBefore(wrapper, playerRef.nextSibling);
        } else {
            document.body.appendChild(wrapper);
        }

        const ts = () => new Date().toISOString().slice(11,22);
        window.__iosLog = (m) => {
            panel.value += ts() + ' ' + m + '\n';
            if (panel.value.length > 8000) panel.value = panel.value.slice(-6000);
            panel.scrollTop = panel.scrollHeight;
        };
        ['touchstart','touchend','touchcancel','scroll'].forEach(ev =>
            document.addEventListener(ev, () => window.__iosLog('[touch] ' + ev), { passive: true })
        );
        ['play','pause','ended','stalled','waiting','suspend','emptied'].forEach(ev =>
            video.addEventListener(ev, () => window.__iosLog('[video] ' + ev + ' paused=' + video.paused + ' readyState=' + video.readyState))
        );
        video.addEventListener('error', () =>
            window.__iosLog('[video.error] code=' + (video.error && video.error.code))
        );
        document.addEventListener('visibilitychange', () =>
            window.__iosLog('[visibility] ' + document.visibilityState)
        );
        video.addEventListener('webkitendfullscreen', () => window.__iosLog('[webkit] endfullscreen'));
        video.addEventListener('webkitbeginfullscreen', () => window.__iosLog('[webkit] beginfullscreen'));
    }
    // ── END DEBUG PANEL ─────────────────────────────────────────────────────────

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
    // because there is no source — we need a full shakaPlayer.load() to rebuild the pipeline.
    // We wait until the user stops touching (scrollGrace=false) to avoid reloading while
    // iOS would destroy it again immediately.
    let reloadInProgress = false;
    video.addEventListener('emptied', () => {
        if (!shakaReady || hasFallenBack || reloadInProgress) return;
        reloadInProgress = true;
        window.__iosLog && window.__iosLog('[reload] emptied — esperando fin de toque');

        const doReload = async () => {
            if (hasFallenBack) { reloadInProgress = false; return; }
            if (scrollGrace) { setTimeout(doReload, 300); return; }
            try {
                window.__iosLog && window.__iosLog('[reload] shakaPlayer.load()...');
                await shakaPlayer.load(activeConfig.manifest);
                video.volume = volumeSlider.value;
                video.play().catch(() => {});
                window.__iosLog && window.__iosLog('[reload] OK');
            } catch (e) {
                window.__iosLog && window.__iosLog('[reload] FAILED: ' + e);
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
    const suppressFallback = () =>
        !!video.webkitDisplayingFullscreen || postFullscreenGrace || scrollGrace || visibilityGrace;

    // Listen for player errors — only fallback on CRITICAL severity (2).
    // RECOVERABLE errors (network hiccups, segment retries) are handled internally by Shaka.
    // When a CRITICAL error is suppressed (transient iOS interruption), retryStreaming()
    // tells Shaka to resume — without it, Shaka stays dead and the screen goes black.
    shakaPlayer.addEventListener('error', (event) => {
        lastShakaErrorCode = event.detail.code;
        const isCritical = event.detail.severity === 2;
        const sup = suppressFallback();
        window.__iosLog && window.__iosLog('[shaka] code=' + event.detail.code + ' sev=' + event.detail.severity + ' suppress=' + sup + ' grace:scroll=' + scrollGrace + ' fs=' + postFullscreenGrace + ' vis=' + visibilityGrace);
        console.error("Shaka error code", event.detail.code, "severity", event.detail.severity, "object", event.detail);
        if (!isCritical) return;

        if (sup) {
            setTimeout(() => {
                if (!hasFallenBack) { window.__iosLog && window.__iosLog('[shaka] retryStreaming'); shakaPlayer.retryStreaming(); }
            }, 800);
        } else {
            triggerFallback(activeConfig, video, playerControls, centerPlayHud, iframeFallback, loader);
        }
    });

    // Listen for video tag errors.
    // Skip MEDIA_ERR_ABORTED (code 1): fires on rapid play/pause, not fatal.
    // When suppressed, try to resume play — iOS may have paused the video internally.
    video.addEventListener('error', () => {
        if (!video.error || video.error.code === MediaError.MEDIA_ERR_ABORTED) return;
        window.__iosLog && window.__iosLog('[video.err] code=' + video.error.code + ' suppress=' + suppressFallback());

        if (suppressFallback()) {
            setTimeout(() => {
                if (!hasFallenBack && video.paused) video.play().catch(() => {});
            }, 800);
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

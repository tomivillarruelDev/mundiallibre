/* app.js - MundialLibre Logic & Player Integration */

document.addEventListener("DOMContentLoaded", () => {
    // -------------------------------------------------------------
    // DEFAULT CONFIGURATION & DECRYPTION
    // -------------------------------------------------------------
    const SECRET_KEY = "mundiallibre_secure_salt_2026";
    
    // Encrypted representation of the streaming parameters
    const ENCRYPTED_TOKEN = "FlcaHRkETlZLBhMWN1FJQRgTCzYVBB8AfQgSWkIZBR1eRk4cHgYSF1NpEQFQQBpLPhoTHwQ+UVUfVQkbQAcLEgUaAAYXCnEQCg5aHRArXBddWzpQAAZVVRcIVVwAVVgPU0YEO0IBWkBAU2pKBVhGbVAHHVsMGwcCDBIYQgQSFkdzUQ4GDDsBfUlDVRU5UQUBU1VHDAZbVQ9eWQNHXWxGBFtBQ1ZnFVcPRWwQHBBdCAxMXksADggNV0BcbkRRVEEUV2xHUwoSbwZWAlJZQlxWWFNfDUtOUAw5AQQOECcXM1FbThwrRkBBDEJaAgUdAAEaAAYIAyZdChESXQEsAw4eACwcQFpGTwg=";

    // Decrypt helper for browser
    function decrypt(encoded) {
        try {
            const decoded = atob(encoded);
            let result = "";
            for (let i = 0; i < decoded.length; i++) {
                const charCode = decoded.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length);
                result += String.fromCharCode(charCode);
            }
            return JSON.parse(result);
        } catch (e) {
            console.error("Failed to decrypt token:", e);
            return null;
        }
    }

    // Decrypt active streaming parameters on startup
    const activeConfig = decrypt(ENCRYPTED_TOKEN);

    // DOM Elements
    const video = document.getElementById("video-player");
    const iframeFallback = document.getElementById("iframe-fallback");
    const playerContainer = document.getElementById("player-container");
    const playerControls = document.getElementById("player-controls");
    const loader = document.getElementById("player-loader");
    const playBtn = document.getElementById("play-btn");
    const playIcon = document.getElementById("play-icon");
    const centerPlayHud = document.getElementById("center-play-hud");
    const liveSyncBtn = document.getElementById("live-sync-btn");
    const muteBtn = document.getElementById("mute-btn");
    const volumeIcon = document.getElementById("volume-icon");
    const volumeSlider = document.getElementById("volume-slider");
    const currentTimeText = document.getElementById("current-time");
    const durationText = document.getElementById("duration");
    const timelineContainer = document.getElementById("timeline-container");
    const playBar = document.getElementById("play-bar");
    const bufferBar = document.getElementById("buffer-bar");
    const scrubberDot = document.getElementById("scrubber-dot");
    const fullscreenBtn = document.getElementById("fullscreen-btn");
    const qualityBtn = document.getElementById("quality-btn");
    const qualityMenu = document.getElementById("quality-menu");

    let shakaPlayer = null;
    let isLive = true;
    let hasFallenBack = false;

    // -------------------------------------------------------------
    // GSAP INTRO ANIMATIONS
    // -------------------------------------------------------------
    const playIntroAnimations = () => {
        gsap.from(".app-header", { y: -30, opacity: 0, duration: 0.6, ease: "power2.out" });
        gsap.from(".animate-player", { scale: 0.96, opacity: 0, duration: 0.7, ease: "power2.out", delay: 0.1 });
        gsap.from(".animate-details", { y: 20, opacity: 0, duration: 0.6, ease: "power2.out", delay: 0.2 });
    };
    playIntroAnimations();

    // -------------------------------------------------------------
    // AUTO FALLBACK SYSTEM (IF DRM/SHAKA FAILS)
    // -------------------------------------------------------------
    function triggerFallback(errorReason) {
        if (hasFallenBack) return;
        hasFallenBack = true;

        console.warn(`[PLAYER FALLBACK] Activando señal alternativa por: ${errorReason}`);
        showErrorText("Cargando señal de transmisión alternativa...");

        setTimeout(() => {
            // Hide native player & custom controls
            video.style.display = "none";
            playerControls.style.display = "none";
            centerPlayHud.style.display = "none";

            // Show sandboxed iframe
            iframeFallback.style.display = "block";
            iframeFallback.src = activeConfig.iframeUrl;

            // Hide loader so user can click iframe controls
            hideLoader();
        }, 1500);
    }

    // -------------------------------------------------------------
    // SHAKA PLAYER INTEGRATION
    // -------------------------------------------------------------
    async function initPlayer() {
        shaka.polyfill.installAll();

        // If configuration decryption failed, fallback immediately
        if (!activeConfig) {
            triggerFallback("Error de desencripción de token");
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

            // Listen for errors
            shakaPlayer.addEventListener('error', onPlayerErrorEvent);
            video.addEventListener('error', onVideoError);

            try {
                await shakaPlayer.load(activeConfig.manifest);
                console.log("Stream loaded natively successfully!");
                hideLoader();
                
                // Set default volume
                video.volume = volumeSlider.value;

                // Try to play stream and handle autoplay blockages
                video.play().catch(err => {
                    console.log("Autoplay blocked by browser. Ready for user click.", err);
                    playIcon.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
                    centerPlayHud.classList.add("active");
                    gsap.fromTo(centerPlayHud, { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(1.5)" });
                });
            } catch (e) {
                onPlayerError(e);
            }
        } else {
            console.warn("Shaka Player not supported on this browser.");
            triggerFallback("Navegador incompatible");
        }
    }

    function onPlayerErrorEvent(event) {
        onPlayerError(event.detail);
    }

    function onPlayerError(error) {
        console.error("Shaka error code", error.code, "object", error);
        triggerFallback(`Shaka Error [${error.code}]`);
    }

    function onVideoError() {
        if (video.error) {
            console.error("Video element error code:", video.error.code, "message:", video.error.message);
            triggerFallback(`Video element error [${video.error.code}]`);
        }
    }

    function hideLoader() {
        gsap.to(loader, { opacity: 0, duration: 0.5, onComplete: () => loader.style.display = "none" });
    }

    function showErrorText(msg) {
        loader.style.display = "flex";
        loader.style.opacity = 1;
        const loaderText = loader.querySelector(".loader-text");
        if (loaderText) loaderText.textContent = msg;
    }

    // -------------------------------------------------------------
    // CUSTOM CONTROLS INTERACTIVE BEHAVIOR
    // -------------------------------------------------------------
    
    // Play/Pause Action
    const togglePlay = () => {
        if (hasFallenBack) return; // Ignore native controls when in iframe fallback

        if (video.paused) {
            video.play().catch(console.error);
            playIcon.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
            gsap.to(centerPlayHud, { scale: 0.8, opacity: 0, duration: 0.25, ease: "power2.in" });
        } else {
            video.pause();
            playIcon.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
            centerPlayHud.classList.add("active");
            gsap.fromTo(centerPlayHud, { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(1.5)" });
        }
    };

    playBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        togglePlay();
    });
    
    centerPlayHud.addEventListener("click", (e) => {
        e.stopPropagation();
        togglePlay();
    });

    playerContainer.addEventListener("click", () => {
        togglePlay();
    });

    // Volume Adjustment
    const updateVolumeIcon = (vol, muted) => {
        if (muted || vol === 0) {
            volumeIcon.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;
        } else if (vol < 0.5) {
            volumeIcon.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/></svg>`;
        } else {
            volumeIcon.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
        </svg>`;
        }
    };

    volumeSlider.addEventListener("input", (e) => {
        video.volume = e.target.value;
        video.muted = false;
        updateVolumeIcon(video.volume, false);
    });

    muteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        video.muted = !video.muted;
        updateVolumeIcon(video.volume, video.muted);
        volumeSlider.value = video.muted ? 0 : video.volume;
    });

    // Time Formatting helper
    function formatTime(seconds) {
        if (isNaN(seconds) || seconds === Infinity) return "00:00";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        
        let result = "";
        if (h > 0) result += (h < 10 ? "0" + h : h) + ":";
        result += (m < 10 ? "0" + m : m) + ":";
        result += (s < 10 ? "0" + s : s);
        return result;
    }

    // Timeline Progress & Buffer update
    video.addEventListener("timeupdate", () => {
        if (!shakaPlayer || hasFallenBack) return;
        
        const seekRange = shakaPlayer.seekRange();
        const start = seekRange.start;
        const end = seekRange.end;
        const duration = end - start;
        const current = video.currentTime - start;
        
        if (duration > 0) {
            currentTimeText.textContent = formatTime(video.currentTime);
            
            const percentage = (current / duration) * 100;
            playBar.style.width = `${percentage}%`;
            scrubberDot.style.left = `${percentage}%`;
            
            if (video.buffered.length > 0) {
                const bufferedEnd = video.buffered.end(video.buffered.length - 1);
                const bufferPercentage = ((bufferedEnd - start) / duration) * 100;
                bufferBar.style.width = `${Math.min(bufferPercentage, 100)}%`;
            }
            
            const latency = end - video.currentTime;
            if (latency < 6) {
                liveSyncBtn.classList.add("at-live");
                liveSyncBtn.querySelector(".sync-text").textContent = "DIRECTO";
                isLive = true;
            } else {
                liveSyncBtn.classList.remove("at-live");
                liveSyncBtn.querySelector(".sync-text").textContent = `VIVO -${Math.round(latency)}s`;
                isLive = false;
            }
        }
    });

    // Seek on Timeline click/drag
    const seek = (event) => {
        if (!shakaPlayer || hasFallenBack) return;
        const rect = timelineContainer.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, clickX / rect.width));
        
        const seekRange = shakaPlayer.seekRange();
        const duration = seekRange.end - seekRange.start;
        const targetTime = seekRange.start + (duration * percentage);
        
        video.currentTime = targetTime;
    };

    timelineContainer.addEventListener("mousedown", (e) => {
        if (hasFallenBack) return;
        seek(e);
        const onMouseMove = (moveEvent) => seek(moveEvent);
        const onMouseUp = () => {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
        };
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    });

    // Live Sync Button Click
    liveSyncBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (shakaPlayer && !hasFallenBack) {
            const seekRange = shakaPlayer.seekRange();
            video.currentTime = seekRange.end - 2;
            isLive = true;
        }
    });

    // Fullscreen toggle
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            if (playerContainer.requestFullscreen) {
                playerContainer.requestFullscreen();
            } else if (playerContainer.mozRequestFullScreen) {
                playerContainer.mozRequestFullScreen();
            } else if (playerContainer.webkitRequestFullscreen) {
                playerContainer.webkitRequestFullscreen();
            } else if (playerContainer.msRequestFullscreen) {
                playerContainer.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    };

    fullscreenBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFullscreen();
    });

    playerContainer.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        toggleFullscreen();
    });

    // Quality Select Logic
    qualityBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!hasFallenBack) {
            qualityMenu.classList.toggle("active");
        }
    });

    document.addEventListener("click", () => {
        qualityMenu.classList.remove("active");
    });

    // Quality Variant Selection
    qualityMenu.addEventListener("click", (e) => {
        const option = e.target.closest(".quality-option");
        if (!option || hasFallenBack) return;
        
        qualityMenu.querySelectorAll(".quality-option").forEach(opt => opt.classList.remove("active"));
        option.classList.add("active");
        
        const mode = option.dataset.quality;
        
        if (!shakaPlayer) return;
        
        if (mode === "auto") {
            shakaPlayer.configure({ abr: { enabled: true } });
        } else {
            shakaPlayer.configure({ abr: { enabled: false } });
            
            const tracks = shakaPlayer.getVariantTracks();
            let targetHeight = 1080;
            if (mode === "720p") targetHeight = 720;
            if (mode === "480p") targetHeight = 480;
            
            const bestTrack = tracks.find(track => track.height === targetHeight);
            if (bestTrack) {
                shakaPlayer.selectVariantTrack(bestTrack, true);
            }
        }
    });

    // -------------------------------------------------------------
    // RUN THE SHAKA PLAYER
    // -------------------------------------------------------------
    initPlayer();
});

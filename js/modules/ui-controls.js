/* ui-controls.js - Video Player User Interface Controls Handler */

import { shakaPlayer, hasFallenBack } from './player-shaka.js';

/**
 * Formats time in seconds to HH:MM:SS or MM:SS format
 * @param {number} seconds 
 * @returns {string} Formatted string
 */
export function formatTime(seconds) {
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

/**
 * Initializes and registers event listeners for all player controls
 * @param {Object} elements Group of DOM elements
 */
export function setupUIControls(elements) {
    const {
        video,
        playerContainer,
        playBtn,
        playIcon,
        centerPlayHud,
        liveSyncBtn,
        muteBtn,
        volumeIcon,
        volumeSlider,
        timelineContainer,
        playBar,
        bufferBar,
        scrubberDot,
        fullscreenBtn,
        qualityBtn,
        qualityMenu
    } = elements;

    let isLive = true;
    let sessionStartTime = null;

    // Play/Pause Action
    const togglePlay = () => {
        if (hasFallenBack) return; // Ignore custom controls in iframe fallback

        if (video.paused) {
            video.play().catch(console.error);
            playIcon.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
            if (typeof gsap !== "undefined") {
                gsap.to(centerPlayHud, { scale: 0.8, opacity: 0, duration: 0.25, ease: "power2.in" });
            } else {
                centerPlayHud.style.opacity = 0;
            }
        } else {
            video.pause();
            playIcon.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
            centerPlayHud.classList.add("active");
            if (typeof gsap !== "undefined") {
                gsap.fromTo(centerPlayHud, { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(1.5)" });
            } else {
                centerPlayHud.style.opacity = 1;
            }
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
            volumeIcon.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;
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

    // Timeline Progress & Buffer update
    video.addEventListener("timeupdate", () => {
        const activePlayer = shakaPlayer;
        if (!activePlayer || hasFallenBack) return;
        
        const seekRange = activePlayer.seekRange();
        const start = seekRange.start;
        const end = seekRange.end;
        const duration = end - start;
        const current = video.currentTime - start;
        
        // Initialize the base session start time when playback starts
        if (sessionStartTime === null && video.currentTime > 0) {
            sessionStartTime = video.currentTime;
        }

        if (duration > 0) {
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
        const activePlayer = shakaPlayer;
        if (!activePlayer || hasFallenBack) return;
        const rect = timelineContainer.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, clickX / rect.width));
        
        const seekRange = activePlayer.seekRange();
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
        const activePlayer = shakaPlayer;
        if (activePlayer && !hasFallenBack) {
            const seekRange = activePlayer.seekRange();
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
        const activePlayer = shakaPlayer;
        if (!option || hasFallenBack || !activePlayer) return;
        
        qualityMenu.querySelectorAll(".quality-option").forEach(opt => opt.classList.remove("active"));
        option.classList.add("active");
        
        const mode = option.dataset.quality;
        
        if (mode === "auto") {
            activePlayer.configure({ abr: { enabled: true } });
        } else {
            activePlayer.configure({ abr: { enabled: false } });
            
            const tracks = activePlayer.getVariantTracks();
            let targetHeight = 1080;
            if (mode === "720p") targetHeight = 720;
            if (mode === "480p") targetHeight = 480;
            
            const bestTrack = tracks.find(track => track.height === targetHeight);
            if (bestTrack) {
                activePlayer.selectVariantTrack(bestTrack, true);
            }
        }
    });
}

/* main.js - Orchestration Entry Point for MundialLibre Web App */

import { ENCRYPTED_TOKEN, decrypt } from "./modules/security.js";
import {
  playIntroAnimations,
  triggerGoalCelebration,
} from "./modules/animations.js";
import { loadMatchMetadata } from "./modules/live-scores.js";
import { initPlayer } from "./modules/player-shaka.js";
import { setupUIControls } from "./modules/ui-controls.js";

document.addEventListener("DOMContentLoaded", () => {
  const startApp = () => {
    // 1. Decrypt active streaming parameters on startup
    const activeConfig = decrypt(ENCRYPTED_TOKEN);

    // 2. Play intro UI animations using GSAP
    playIntroAnimations();

    // 3. Load dynamic match metadata (Scoreboards, override parameters, and fallbacks)
    loadMatchMetadata(activeConfig);

    // Group DOM elements for modular pass-down
    const elements = {
      video: document.getElementById("video-player"),
      iframeFallback: document.getElementById("iframe-fallback"),
      playerContainer: document.getElementById("player-container"),
      playerControls: document.getElementById("player-controls"),
      loader: document.getElementById("player-loader"),
      playBtn: document.getElementById("play-btn"),
      playIcon: document.getElementById("play-icon"),
      centerPlayHud: document.getElementById("center-play-hud"),
      liveSyncBtn: document.getElementById("live-sync-btn"),
      muteBtn: document.getElementById("mute-btn"),
      volumeIcon: document.getElementById("volume-icon"),
      volumeSlider: document.getElementById("volume-slider"),
      timelineContainer: document.getElementById("timeline-container"),
      playBar: document.getElementById("play-bar"),
      bufferBar: document.getElementById("buffer-bar"),
      scrubberDot: document.getElementById("scrubber-dot"),
      fullscreenBtn: document.getElementById("fullscreen-btn"),
      qualityBtn: document.getElementById("quality-btn"),
      qualityMenu: document.getElementById("quality-menu"),
    };

    // 4. Setup and register custom player controls event listeners
    setupUIControls(elements);

    // 5. Initialize Shaka Player after the first paint to reduce startup blocking
    window.setTimeout(() => {
      initPlayer(
        activeConfig,
        elements.video,
        elements.playerControls,
        elements.centerPlayHud,
        elements.iframeFallback,
        elements.playIcon,
        elements.loader,
        elements.volumeSlider,
      );
    }, 250);
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(() => startApp(), { timeout: 1000 });
  } else {
    window.setTimeout(startApp, 150);
  }
});

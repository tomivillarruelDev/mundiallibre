/* animations.js - UI Intro Animations Module using GSAP */

let lastCelebrationAt = 0;
const CELEBRATION_COOLDOWN_MS = 4000;

/**
 * Runs intro GSAP animations for the page elements
 */
export function playIntroAnimations() {
  if (typeof gsap !== "undefined") {
    gsap.from(".app-header", {
      y: -30,
      opacity: 0,
      duration: 0.6,
      ease: "power2.out",
    });
    gsap.from(".animate-player", {
      scale: 0.96,
      opacity: 0,
      duration: 0.7,
      ease: "power2.out",
      delay: 0.1,
    });
    gsap.from(".animate-details", {
      y: 20,
      opacity: 0,
      duration: 0.6,
      ease: "power2.out",
      delay: 0.2,
    });
  }
}

/**
 * Triggers a beautiful goal celebration with fullscreen text and canvas-confetti bursts
 */
export function triggerGoalCelebration() {
  const now = performance.now();
  if (now - lastCelebrationAt < CELEBRATION_COOLDOWN_MS) {
    return;
  }
  lastCelebrationAt = now;

  // 1. Confetti Burst
  if (typeof confetti !== "undefined") {
    const fire = (particleRatio, opts) => {
      confetti({
        ...opts,
        particleCount: Math.floor(100 * particleRatio),
        colors: ["#FFE600", "#009EE3", "#FF3B30", "#FFFFFF"],
      });
    };

    fire(0.25, { spread: 26, startVelocity: 55, origin: { x: 0.1, y: 0.85 } });
    fire(0.2, { spread: 60, origin: { x: 0.1, y: 0.85 } });
    fire(0.35, {
      spread: 100,
      decay: 0.91,
      scalar: 0.8,
      origin: { x: 0.1, y: 0.85 },
    });
    fire(0.1, {
      spread: 120,
      startVelocity: 25,
      decay: 0.92,
      scalar: 1.2,
      origin: { x: 0.1, y: 0.85 },
    });
    fire(0.1, { spread: 120, startVelocity: 45, origin: { x: 0.1, y: 0.85 } });

    fire(0.25, { spread: 26, startVelocity: 55, origin: { x: 0.9, y: 0.85 } });
    fire(0.2, { spread: 60, origin: { x: 0.9, y: 0.85 } });
    fire(0.35, {
      spread: 100,
      decay: 0.91,
      scalar: 0.8,
      origin: { x: 0.9, y: 0.85 },
    });
    fire(0.1, {
      spread: 120,
      startVelocity: 25,
      decay: 0.92,
      scalar: 1.2,
      origin: { x: 0.9, y: 0.85 },
    });
    fire(0.1, { spread: 120, startVelocity: 45, origin: { x: 0.9, y: 0.85 } });
  }

  // 2. Goal Text Animation
  const goalOverlay = document.createElement("div");
  goalOverlay.className = "goal-celebration-overlay";
  goalOverlay.innerHTML = `<div class="goal-text-glow">¡GOOOOOOL!</div>`;
  document.body.appendChild(goalOverlay);

  if (typeof gsap !== "undefined") {
    const tl = gsap.timeline({
      onComplete: () => goalOverlay.remove(),
    });

    tl.fromTo(goalOverlay, { opacity: 0 }, { opacity: 1, duration: 0.25 })
      .fromTo(
        ".goal-text-glow",
        { scale: 0.3, y: 80, rotation: -10 },
        { scale: 1.1, y: 0, rotation: 0, duration: 0.5, ease: "back.out(1.8)" },
      )
      .to(".goal-text-glow", { scale: 1, duration: 0.15 })
      .to(".goal-text-glow", { x: -8, duration: 0.04, repeat: 7, yoyo: true })
      .to(".goal-text-glow", { x: 0, duration: 0.04 })
      .to(goalOverlay, { opacity: 0, duration: 0.8, delay: 1.8 });
  } else {
    setTimeout(() => goalOverlay.remove(), 3000);
  }
}

/* animations.js - UI Intro Animations Module using GSAP */

/**
 * Runs intro GSAP animations for the page elements
 */
export function playIntroAnimations() {
    if (typeof gsap !== "undefined") {
        gsap.from(".app-header", { y: -30, opacity: 0, duration: 0.6, ease: "power2.out" });
        gsap.from(".animate-player", { scale: 0.96, opacity: 0, duration: 0.7, ease: "power2.out", delay: 0.1 });
        gsap.from(".animate-details", { y: 20, opacity: 0, duration: 0.6, ease: "power2.out", delay: 0.2 });
    }
}

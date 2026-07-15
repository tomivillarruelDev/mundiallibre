/* match-mode.js - Edición Especial Argentina para Mundial Libre (Premium & Humanizada) */

// VARIABLE DE CONTROL PRINCIPAL (100% VISUAL)
const ARGENTINA_MATCH_MODE = true;

(function() {
  let confettiAnimationFrame = null;
  let isMatchModeActive = false;

  // Inicialización en DOMContentLoaded (o inmediato si ya cargó)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMatchMode);
  } else {
    initMatchMode();
  }

  function initMatchMode() {
    if (ARGENTINA_MATCH_MODE) {
      activateMatchMode();
    } else {
      deactivateMatchMode();
    }
  }

  // ==========================================================================
  // ACTIVACIÓN DEL MODO PARTIDO (100% VISUAL)
  // ==========================================================================
  function activateMatchMode() {
    if (isMatchModeActive) return;
    isMatchModeActive = true;

    console.log("🇦🇷 [Mundial Libre] Activando Edición Especial Argentina (Previa Premium)...");

    // 1. Agregar clase al body
    document.body.classList.add("argentina-match-mode");

    // 2. Inyectar la hoja de estilos de forma dinámica
    injectStylesheet();

    // 3. Crear overlay de fondo
    createBackgroundOverlay();

    // 4. Crear cinta/ticker de marquesina superior debajo del navbar
    createTickerBar();

    // 5. Crear guirnalda superior de banderines (colgada del ticker, no-sticky)
    createGarland();

    // 6. Crear Hero Heading y Pared de Héroes
    createHero();

    // 7. Crear Nueva Sección Layout Previa (Muchachos + VS Card + Info Card + Plantel Card)
    createPreviaSection();

    // 8. Crear Cinta de Figuras (Avatares horizontales)
    createPlayersRowSection();

    // 9. Crear Separador deportivo
    createSportDivider("previa-scaloneta-divider");

    // 10. Crear Franja "La Scaloneta"
    createScalonetaBar();

    // 11. Crear Frase Destacada (Cita elegante)
    createQuoteSection();

    // 12. Crear Separador deportivo
    createSportDivider("quote-protagonists-divider");

    // 13. Crear Sección Protagonistas (Tarjetas de Messi, Scaloni, Dibu, Julián)
    createProtagonistsSection();

    // 14. Crear Mini Homenaje antes del footer
    createMiniHomenajeSection();

    // 15. Iniciar Confetti sutil
    startSutilConfetti();
  }

  // ==========================================================================
  // DESACTIVACIÓN Y LIMPIEZA
  // ==========================================================================
  function deactivateMatchMode() {
    if (!isMatchModeActive) return;
    isMatchModeActive = false;

    console.log("🇦🇷 [Mundial Libre] Desactivando Edición Especial Argentina... Volviendo al diseño original.");

    // 1. Quitar clase al body
    document.body.classList.remove("argentina-match-mode");

    // 2. Remover hoja de estilos
    removeElementById("match-mode-styles-link");

    // 3. Remover elementos inyectados
    removeElementById("match-bg-overlay");
    removeElementById("match-garland");
    removeElementById("match-sticky-header-group");
    removeElementById("match-hero-section");
    removeElementById("match-previa-section");
    removeElementById("match-players-row-section");
    removeElementById("previa-scaloneta-divider");
    removeElementById("match-scaloneta-bar");
    removeElementById("match-quote-section");
    removeElementById("quote-protagonists-divider");
    removeElementById("match-protagonists-section");
    removeElementById("match-homenaje-section");

    // 4. Detener confetti
    if (confettiAnimationFrame) {
      cancelAnimationFrame(confettiAnimationFrame);
      confettiAnimationFrame = null;
    }
    removeElementById("match-confetti-canvas");
  }

  // ==========================================================================
  // HELPERS VISUALES (SVGs Vectoriales para evitar "AR" de Windows)
  // ==========================================================================
  function getArgentinaFlagSVG(extraClass = "") {
    return `
      <svg class="match-flag-svg-icon ${extraClass}" width="18" height="12" viewBox="0 0 3 2" xmlns="http://www.w3.org/2000/svg" style="display:inline-block; vertical-align:middle; border-radius:1.5px; box-shadow:0 1px 3px rgba(0,0,0,0.35); outline:1px solid rgba(255,255,255,0.1);">
        <rect width="3" height="2" fill="#6EC6FF"/>
        <rect y="0.66" width="3" height="0.68" fill="#FFFFFF"/>
        <circle cx="1.5" cy="1" r="0.22" fill="#D4AF37" stroke="#9A7B1C" stroke-width="0.04"/>
      </svg>
    `;
  }

  function getEnglandFlagSVG(extraClass = "") {
    return `
      <svg class="match-flag-svg-icon ${extraClass}" width="18" height="12" viewBox="0 0 50 30" xmlns="http://www.w3.org/2000/svg" style="display:inline-block; vertical-align:middle; border-radius:1.5px; box-shadow:0 1px 3px rgba(0,0,0,0.35); outline:1px solid rgba(255,255,255,0.1);">
        <rect width="50" height="30" fill="#FFFFFF"/>
        <rect y="12" width="50" height="6" fill="#CF142B"/>
        <rect x="22" width="6" height="30" fill="#CF142B"/>
      </svg>
    `;
  }

  function getCheckIconSVG() {
    return `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `;
  }

  // ==========================================================================
  // MÉTODOS DE INYECCIÓN DE COMPONENTES
  // ==========================================================================
  function injectStylesheet() {
    if (document.getElementById("match-mode-styles-link")) return;
    const link = document.createElement("link");
    link.id = "match-mode-styles-link";
    link.rel = "stylesheet";
    link.href = "/css/match-mode.css";
    document.head.appendChild(link);
  }

  function removeElementById(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  function createBackgroundOverlay() {
    if (document.getElementById("match-bg-overlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "match-bg-overlay";
    overlay.className = "match-bg-overlay";
    document.body.insertBefore(overlay, document.body.firstChild);
  }

  function createTickerBar() {
    if (document.getElementById("match-sticky-header-group")) return;

    // Crear grupo sticky contenedor
    const stickyGroup = document.createElement("div");
    stickyGroup.id = "match-sticky-header-group";
    stickyGroup.className = "match-sticky-header-group";

    // Crear ticker bar
    const ticker = document.createElement("div");
    ticker.id = "match-ticker-bar";
    ticker.className = "match-ticker-bar";

    const flag = getArgentinaFlagSVG("ticker-flag");
    const content = `
      <div class="match-ticker-item">${flag} &nbsp; <span class="ticker-dorado">VAMOS SELECCIÓN</span></div>
      <div class="match-ticker-item"><span>•</span> EDICIÓN ESPECIAL ARGENTINA</div>
      <div class="match-ticker-item"><span>•</span><span class="ticker-dorado">MUCHACHOOOS</span></div>
      <div class="match-ticker-item"><span>•</span> EL SENTIMIENTO DE UN PAÍS</div>
      <div class="match-ticker-item"><span>•</span> ${flag} &nbsp; <span class="ticker-dorado">TRANSMISIÓN PREMIUM BAJA LATENCIA</span></div>
    `;

    ticker.innerHTML = `
      <div class="match-ticker-track">
        ${content} ${content} ${content}
      </div>
    `;

    stickyGroup.appendChild(ticker);

    // Insertar el grupo sticky justo después del header
    const header = document.getElementById("app-navbar");
    if (header) {
      header.parentNode.insertBefore(stickyGroup, header.nextSibling);
    } else {
      document.body.insertBefore(stickyGroup, document.body.childNodes[1]);
    }
  }

  function createGarland() {
    if (document.getElementById("match-garland")) return;
    const garland = document.createElement("div");
    garland.id = "match-garland";
    garland.className = "match-garland-container";

    // Calcular cuántos banderines caben en la pantalla
    const bannerWidth = 20; // ancho de cada banderín en px
    const gap = 8;
    const count = Math.ceil(window.innerWidth / (bannerWidth + gap)) + 1;

    let banderinesHTML = "";
    for (let i = 0; i < count; i++) {
      // Banderines de cristal translúcidos con mayor vivacidad y Sol de Mayo estilizado
      banderinesHTML += `
        <svg class="match-garland-svg-item" width="20" height="28" viewBox="0 0 20 28" fill="none" xmlns="http://www.w3.org/2000/svg" style="
          flex-shrink: 0;
          animation: match-swing ${3.4 + (i % 3) * 0.9}s ease-in-out infinite alternate;
          animation-delay: ${(i % 6) * 0.15}s;
          transform-origin: top center;
          filter: drop-shadow(0 3px 5px rgba(0,0,0,0.3));
        ">
          <defs>
            <!-- Celeste Acero Vívido de Cristal -->
            <linearGradient id="celesteGrad-${i}" x1="0" y1="0" x2="20" y2="28" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="rgba(78, 172, 252, 0.72)"/>
              <stop offset="50%" stop-color="rgba(122, 213, 255, 0.8)"/>
              <stop offset="100%" stop-color="rgba(50, 142, 227, 0.65)"/>
            </linearGradient>
            <!-- Blanco Seda Vívido de Cristal -->
            <linearGradient id="blancoGrad-${i}" x1="0" y1="9" x2="20" y2="18" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="rgba(255, 255, 255, 0.85)"/>
              <stop offset="60%" stop-color="rgba(242, 246, 250, 0.75)"/>
              <stop offset="100%" stop-color="rgba(221, 227, 235, 0.6)"/>
            </linearGradient>
            <!-- Sombra de Pliegues 3D -->
            <linearGradient id="foldGrad-${i}" x1="0" y1="0" x2="20" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#000000" stop-opacity="0.18"/>
              <stop offset="35%" stop-color="#000000" stop-opacity="0"/>
              <stop offset="65%" stop-color="#FFFFFF" stop-opacity="0.1"/>
              <stop offset="100%" stop-color="#000000" stop-opacity="0.22"/>
            </linearGradient>
          </defs>

          <!-- Banderín (Triangular) -->
          <path d="M0 0H20V9.33H0V0Z" fill="url(#celesteGrad-${i})"/>
          <path d="M0 9.33H20V18.66H0V9.33Z" fill="url(#blancoGrad-${i})"/>
          <path d="M0 18.66H20L10 28L0 18.66Z" fill="url(#celesteGrad-${i})"/>

          <!-- Sombra de pliegue multiplicada -->
          <path d="M0 0H20L10 28L0 0Z" fill="url(#foldGrad-${i})" style="mix-blend-mode: multiply; opacity: 0.8;"/>

          <!-- Sol de Mayo premium sutil -->
          <g transform="translate(10, 14)" style="opacity: 0.82;">
            <!-- Rayos del Sol -->
            <path d="M-0.3 -3.5H0.3V3.5H-0.3Z" fill="#D4AF37"/>
            <path d="M-3.5 -0.3H3.5V0.3H-3.5Z" fill="#D4AF37"/>
            <path d="M-2.5 -2.5L2.5 2.5" stroke="#D4AF37" stroke-width="0.5"/>
            <path d="M-2.5 2.5L2.5 -2.5" stroke="#D4AF37" stroke-width="0.5"/>
            <!-- Centro del Sol -->
            <circle cx="0" cy="0" r="1.5" fill="#FFEAA7" stroke="#9A7B1C" stroke-width="0.25"/>
          </g>

          <!-- Hilo superior -->
          <line x1="0" y1="0.5" x2="20" y2="0.5" stroke="#FFFFFF" stroke-opacity="0.3" stroke-width="1"/>
        </svg>
      `;
    }

    garland.innerHTML = banderinesHTML;

    // Inyectar en el body para que sea absoluto y suba con el scroll
    document.body.insertBefore(garland, document.body.firstChild);

    // Ajustar si la pantalla cambia de tamaño
    window.addEventListener("resize", debounce(() => {
      if (!isMatchModeActive) return;
      removeElementById("match-garland");
      createGarland();
    }, 250));
  }

  function createHero() {
    if (document.getElementById("match-hero-section")) return;

    const hero = document.createElement("div");
    hero.id = "match-hero-section";
    hero.className = "match-hero-section";

    hero.innerHTML = `
      <div class="match-hero-badges">
        <span class="match-badge match-badge-albiceleste">
          ${getArgentinaFlagSVG()} &nbsp; EDICIÓN ESPECIAL
        </span>
        <span class="match-badge match-badge-dorado">
          SELECCIÓN ARGENTINA
        </span>
        <span class="match-badge match-badge-live">
          <span class="live-dot-pulse"></span>
          SEMIFINAL
        </span>
      </div>
      <div class="match-hero-title-container">
        <div style="font-size:0.7rem; font-weight:900; color:var(--color-match-dorado); letter-spacing:0.25em; text-transform:uppercase; margin-bottom: 2px;">La ilusión vuelve a rodar</div>
        <h2 class="match-hero-title">VAMOS <span>ARGENTINA</span></h2>
        <div class="match-hero-stars">
          ${getStarSVG()}${getStarSVG()}${getStarSVG()}
        </div>
      </div>
      <p class="match-hero-subtitle" id="match-hero-subtitle">Edición especial previa al partido de la Selección</p>
    `;

    // Insertar arriba del reproductor
    const playerContainer = document.getElementById("player-container");
    if (playerContainer) {
      const playerWrapperRelative = playerContainer.closest(".player-container-relative");
      if (playerWrapperRelative) {
        playerWrapperRelative.parentNode.insertBefore(hero, playerWrapperRelative);
      } else {
        playerContainer.parentNode.insertBefore(hero, playerContainer);
      }
    }
  }

  function getStarSVG() {
    return `
      <svg class="match-star-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.62L12 2L9.19 8.62L2 9.24L7.45 13.97L5.82 21L12 17.27Z"/>
      </svg>
    `;
  }

  function createPreviaSection() {
    if (document.getElementById("match-previa-section")) return;

    const wrapper = document.createElement("div");
    wrapper.id = "match-previa-section";
    wrapper.className = "match-previa-section";

    wrapper.innerHTML = `
      <!-- Panel de Muchachos (Izquierda) -->
      <div class="match-banner-card">
        <div class="match-banner-decor-line"></div>
        <h3 class="match-banner-title">MUCHACHOOOOS...</h3>
        <p class="match-banner-subtitle">AHORA NOS VOLVIMO' A ILUSIONAR</p>
        <p class="match-banner-desc">Toda Argentina esperando el próximo partido. Una cita con el destino en la fase final.</p>
        <div class="match-banner-footer">Edición Especial • Mundial Libre 2026</div>
      </div>

      <!-- Tarjeta del Partido (Derecha) -->
      <div class="match-card-vs">
        <div class="match-vs-header">SEMIFINAL</div>
        <div class="match-teams-row">
          <div class="match-team-box">
            ${getArgentinaFlagSVG("team-flag-large")}
            <span class="match-team-name">ARGENTINA</span>
          </div>
          <div class="match-vs-divider">VS</div>
          <div class="match-team-box">
            ${getEnglandFlagSVG("team-flag-large")}
            <span class="match-team-name">INGLATERRA</span>
          </div>
        </div>
        <div class="match-vs-footer">PREVIA EN VIVO</div>
      </div>
    `;

    // Ubicación: debajo de las métricas (.match-section-divider), arriba de la agenda
    const divider = document.querySelector(".match-section-divider");
    const agendaContainer = document.querySelector(".matches-agenda-container");
    if (divider) {
      divider.parentNode.insertBefore(wrapper, divider.nextSibling);
    } else if (agendaContainer) {
      agendaContainer.parentNode.insertBefore(wrapper, agendaContainer);
    } else {
      const main = document.querySelector(".main-content");
      if (main) main.appendChild(wrapper);
    }
  }

  function createPlayersRowSection() {
    if (document.getElementById("match-players-row-section")) return;

    const section = document.createElement("div");
    section.id = "match-players-row-section";
    section.className = "match-players-row-section";

    const players = [
      { name: "Messi", img: "/assets/messi.webp" },
      { name: "Julián", img: "/assets/julian.webp" },
      { name: "Dibu", img: "/assets/dibu.webp" },
      { name: "Enzo", img: "/assets/enzo.webp" },
      { name: "Paredes", img: "/assets/paredes.webp" },
      { name: "Cuti", img: "/assets/cuti.webp" },
      { name: "Scaloni", img: "/assets/scaloni.webp" }
    ];

    let avatarsHTML = "";
    players.forEach(p => {
      avatarsHTML += `
        <div class="match-player-avatar-item">
          <img class="match-player-avatar-img" src="${p.img}" alt="${p.name}" width="44" height="44" loading="lazy" decoding="async" />
          <span class="match-player-avatar-name">${p.name}</span>
        </div>
      `;
    });

    section.innerHTML = `
      <div class="match-players-row-title">Figuras de la Previa</div>
      <div class="match-players-avatars-container">
        ${avatarsHTML}
      </div>
    `;

    const previaSection = document.getElementById("match-previa-section");
    if (previaSection) {
      previaSection.parentNode.insertBefore(section, previaSection.nextSibling);
    }
  }

  function createSportDivider(id) {
    if (document.getElementById(id)) return;
    const div = document.createElement("div");
    div.id = id;
    div.className = "match-section-divider-sport";
    div.innerHTML = `
      <div class="match-divider-line-sport"></div>
      ${getArgentinaFlagSVG("divider-flag")}
      <div class="match-divider-line-sport"></div>
    `;
    
    // Insertar de acuerdo al contexto
    if (id === "previa-scaloneta-divider") {
      const ref = document.getElementById("match-players-row-section");
      if (ref) ref.parentNode.insertBefore(div, ref.nextSibling);
    } else if (id === "quote-protagonists-divider") {
      const ref = document.getElementById("match-quote-section");
      if (ref) ref.parentNode.insertBefore(div, ref.nextSibling);
    }
  }

  function createScalonetaBar() {
    if (document.getElementById("match-scaloneta-bar")) return;

    const bar = document.createElement("div");
    bar.id = "match-scaloneta-bar";
    bar.className = "match-scaloneta-bar";

    bar.innerHTML = `
      <div class="match-scaloneta-title">
        ${getArgentinaFlagSVG()} &nbsp; LA SCALONETA ESTÁ LISTA
      </div>
      <div class="match-scaloneta-desc">Un equipo. Una ilusión. Noventa minutos para seguir soñando.</div>
    `;

    const divider = document.getElementById("previa-scaloneta-divider");
    if (divider) {
      divider.parentNode.insertBefore(bar, divider.nextSibling);
    }
  }

  function createQuoteSection() {
    if (document.getElementById("match-quote-section")) return;

    const quote = document.createElement("div");
    quote.id = "match-quote-section";
    quote.className = "match-quote-container";

    quote.innerHTML = `
      <div class="match-quote-line"></div>
      <div style="font-size:0.75rem; font-weight:800; color:var(--color-match-celeste); letter-spacing:0.18em; text-transform:uppercase; margin-bottom:-0.8rem; opacity:0.85; text-align:center;">Hoy juega la camiseta</div>
      <blockquote class="match-quote-text">
        Hoy no juega un equipo. Juega un país.
      </blockquote>
      <div class="match-quote-author">Mundial Libre Ediciones Especiales</div>
      <div class="match-quote-line" style="margin-top: 1.8rem;"></div>
    `;

    const scalonetaBar = document.getElementById("match-scaloneta-bar");
    if (scalonetaBar) {
      scalonetaBar.parentNode.insertBefore(quote, scalonetaBar.nextSibling);
    } else {
      const main = document.querySelector(".main-content");
      if (main) main.appendChild(quote);
    }
  }

  function createProtagonistsSection() {
    if (document.getElementById("match-protagonists-section")) return;

    const section = document.createElement("div");
    section.id = "match-protagonists-section";
    section.className = "match-protagonists-section";

    const protagonists = [
      {
        name: "Lionel Messi",
        role: "Líder y Capitán",
        quote: '"El guía de la Selección buscará escribir otra página de gloria."',
        img: "/assets/messi.webp"
      },
      {
        name: "Emiliano Martínez",
        role: "Arquero",
        quote: '"Siempre aparece cuando el equipo y la historia más lo necesitan."',
        img: "/assets/dibu.webp"
      },
      {
        name: "Cristian Romero",
        role: "Defensor",
        quote: '"Solidez, firmeza y orgullo en cada cruce defensivo del equipo."',
        img: "/assets/cuti.webp"
      },
      {
        name: "Leandro Paredes",
        role: "Mediocampista",
        quote: '"El equilibrio y la templanza en el corazón del mediocampo."',
        img: "/assets/paredes.webp"
      },
      {
        name: "Julián Álvarez",
        role: "Delantero",
        quote: '"Presión, sacrificio incansable y gol en la fase decisiva."',
        img: "/assets/julian.webp"
      },
      {
        name: "Lionel Scaloni",
        role: "Director Técnico",
        quote: '"El arquitecto que transformó un grupo en una familia de campeones."',
        img: "/assets/scaloni.webp"
      }
    ];

    let gridHTML = "";
    protagonists.forEach(p => {
      gridHTML += `
        <div class="match-protagonist-card">
          <img class="match-protagonist-img" src="${p.img}" alt="${p.name}" width="92" height="92" loading="lazy" decoding="async" />
          <h4 class="match-protagonist-name">${p.name}</h4>
          <span class="match-protagonist-role">${p.role}</span>
          <p class="match-protagonist-quote">${p.quote}</p>
        </div>
      `;
    });

    section.innerHTML = `
      <h3 class="match-protagonists-title">Protagonistas del partido</h3>
      <div class="match-protagonists-grid">
        ${gridHTML}
      </div>
    `;

    const divider = document.getElementById("quote-protagonists-divider");
    if (divider) {
      divider.parentNode.insertBefore(section, divider.nextSibling);
    } else {
      const main = document.querySelector(".main-content");
      if (main) main.appendChild(section);
    }
  }

  function createMiniHomenajeSection() {
    if (document.getElementById("match-homenaje-section")) return;

    const section = document.createElement("div");
    section.id = "match-homenaje-section";
    section.className = "match-homenaje-container";

    section.innerHTML = `
      <div class="match-homenaje-stars">
        <svg class="match-homenaje-star" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.62L12 2L9.19 8.62L2 9.24L7.45 13.97L5.82 21L12 17.27Z"/>
        </svg>
        <svg class="match-homenaje-star" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.62L12 2L9.19 8.62L2 9.24L7.45 13.97L5.82 21L12 17.27Z"/>
        </svg>
        <svg class="match-homenaje-star" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.62L12 2L9.19 8.62L2 9.24L7.45 13.97L5.82 21L12 17.27Z"/>
        </svg>
      </div>
      <h4 class="match-homenaje-title">Campeones del Mundo</h4>
      <p class="match-homenaje-desc">Una generación que volvió a enamorar al fútbol argentino.</p>
      <div style="font-size: 0.65rem; font-weight: 800; color: rgba(255,255,255,0.25); letter-spacing: 0.15em; text-transform: uppercase; margin-top: 15px;">90 Minutos • Un Solo Objetivo</div>
    `;

    // Insertar justo antes del footer
    const footer = document.querySelector("footer") || document.querySelector(".site-footer") || document.querySelector(".footer");
    if (footer) {
      footer.parentNode.insertBefore(section, footer);
    } else {
      const main = document.querySelector(".main-content");
      if (main) main.appendChild(section);
    }
  }


  // ==========================================================================
  // CONFETTI ANIMADO SIN LIBRERÍAS (CANVAS SUTIL)
  // ==========================================================================
  function startSutilConfetti() {
    if (document.getElementById("match-confetti-canvas")) return;

    const canvas = document.createElement("canvas");
    canvas.id = "match-confetti-canvas";
    canvas.className = "match-confetti-canvas";
    document.body.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    window.addEventListener("resize", () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    });

    const colors = [
      "#6EC6FF", // Celeste
      "#A7E2FF", // Celeste claro
      "#FFFFFF", // Blanco
      "#FFFFFF", // Blanco
      "#D4AF37"  // Dorado
    ];

    const particleCount = 45; // Muy sutil
    const particles = [];

    for (let i = 0; i < particleCount; i++) {
      let color = colors[Math.floor(Math.random() * (colors.length - 1))];
      if (Math.random() < 0.08) {
        color = "#D4AF37"; // 8% dorados
      }

      particles.push({
        x: Math.random() * width,
        y: Math.random() * height - height,
        r: Math.random() * 4 + 4,
        d: Math.random() * particleCount,
        color: color,
        tilt: Math.random() * 10 - 5,
        tiltAngleIncremental: Math.random() * 0.03 + 0.01,
        tiltAngle: 0,
        speed: Math.random() * 0.6 + 0.4
      });
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particleCount; i++) {
        const p = particles[i];
        p.tiltAngle += p.tiltAngleIncremental;
        p.y += p.speed;
        p.x += Math.sin(p.tiltAngle) * 0.3;
        p.tilt = Math.sin(p.tiltAngle - i / 3) * 6;

        ctx.beginPath();
        ctx.lineWidth = p.r;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
        ctx.stroke();

        if (p.y > height) {
          particles[i] = {
            x: Math.random() * width,
            y: -20,
            r: p.r,
            d: p.d,
            color: p.color,
            tilt: Math.random() * 10 - 5,
            tiltAngleIncremental: p.tiltAngleIncremental,
            tiltAngle: 0,
            speed: p.speed
          };
        }
      }

      confettiAnimationFrame = requestAnimationFrame(draw);
    }

    draw();
  }

  // Helper debounce
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Exportar al objeto window para manipulación desde consola si es necesario
  window.ARGENTINA_MATCH_MODE = ARGENTINA_MATCH_MODE;
  window.activateMatchMode = activateMatchMode;
  window.deactivateMatchMode = deactivateMatchMode;
})();

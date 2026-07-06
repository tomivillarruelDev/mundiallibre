/* live-scores.js - Dynamic metadata loading and ESPN score API tracker */

import { triggerGoalCelebration } from "./animations.js?v=112";

let prevHomeScore = null;
let prevAwayScore = null;
let activeLookupPromise = null;
let lookupTimer = null;
let activeAbortController = null;

// Throttling & DOM Caches
let lastSummaryFetchTime = 0;
let lastCachedMatchId = null;
let cachedHomeEvents = [];
let cachedAwayEvents = [];
let cachedHomeShootout = [];
let cachedAwayShootout = [];
let lastStatsCache = "";
let lastAgendaCache = "";
let lastMatchDetail = "";

let lastBracketFetchTime = 0;
let cachedBracketEvents = [];
let accordionInitialized = false;

/**
 * Updates the scoreboard match-timer badge with the exact value from the API
 * @param {string|null} timeText Time text from ESPN (e.g. "41'", "Entretiempo") or null to hide
 */
export function updateTimerBadge(timeText) {
  const badges = document.querySelectorAll(".match-timer-badge");
  badges.forEach((badgeEl) => {
    if (timeText) {
      badgeEl.textContent = timeText;
      badgeEl.style.display = "inline-flex";
    } else {
      badgeEl.style.display = "none";
    }
  });
}

/**
 * Updates DOM title, subtitle and description (preserving child tags safely)
 */
export function updateMetadata(title, subtitle, description) {
  if (title) {
    const titleEl = document.querySelector(".signal-title");
    if (titleEl) {
      // Safe DOM update: preserve the child badge span element if it exists
      if (
        titleEl.childNodes.length > 0 &&
        titleEl.childNodes[0].nodeType === 3
      ) {
        // 3 = Node.TEXT_NODE
        titleEl.childNodes[0].nodeValue = title + " ";
      } else {
        titleEl.innerHTML = `${title} <span class="match-timer-badge" style="display: none;"></span>`;
      }
    }
    document.title = `${title} | Mundial Libre`;
  }
  if (subtitle) {
    const textEl = document.querySelector(".signal-subtitle .subtitle-text");
    if (textEl) {
      textEl.textContent = subtitle;
    }
  }
  if (description) {
    const descEl = document.querySelector(".signal-desc");
    if (descEl) descEl.textContent = description;
  }
}

/**
 * Tries to fetch live games from ESPN API for Euro, Copa América and UCL
 * @param {string|null} urlTitle Override from URL parameter
 * @returns {Promise<boolean>} True if live game found and configured
 */
export async function detectLiveMatch(urlTitle) {
  // If the user specified a match in the URL parameters, do not overwrite it
  if (urlTitle) return true;

  // Abort any previous pending fetch
  if (activeAbortController) {
    activeAbortController.abort();
  }
  activeAbortController = new AbortController();
  const signal = activeAbortController.signal;

  const leagues = [
    "fifa.world",
    "conmebol.america",
    "uefa.euro",
    "uefa.champions",
    "arg.1",
    "esp.1",
    "eng.1",
  ];

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  
  const pad = (n) => String(n).padStart(2, "0");
  const getYYYYMMDD = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  
  const yesterdayStr = getYYYYMMDD(yesterday);
  const tomorrowStr = getYYYYMMDD(tomorrow);
  const datesParam = `dates=${yesterdayStr}-${tomorrowStr}`;

  let allPreviousMatches = [];
  let allUpcomingMatches = [];

  let activeLiveEvent = null;
  let activeLeague = null;
  let activeLeagueName = null;

  let successCount = 0;
  for (const league of leagues) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?lang=es&region=ar&${datesParam}&_t=${Date.now()}`;
      const res = await fetch(url, { signal });
      if (res.ok) {
        successCount++;
      } else {
        continue;
      }
      const data = await res.json();
      const events = data.events || [];

      // Loop events to find live match and collect other ones
      events.forEach((ev) => {
        const state = ev.status?.type?.state;
        
        // Check for live match (prioritize 'in' first, then 'pre' starting in <= 30 mins)
        if (!activeLiveEvent) {
          if (state === "in") {
            activeLiveEvent = ev;
            activeLeague = league;
            activeLeagueName = data.leagues?.[0]?.name || "";
          } else if (state === "pre") {
            const now = new Date();
            const matchDate = new Date(ev.date);
            const diffMinutes = (matchDate - now) / 60000;
            if (diffMinutes <= 30) {
              activeLiveEvent = ev;
              activeLeague = league;
              activeLeagueName = data.leagues?.[0]?.name || "";
            }
          }
        }

        // Collect agenda data
        if (state === "post") {
          allPreviousMatches.push(ev);
        } else if (state === "pre") {
          allUpcomingMatches.push(ev);
        }
      });
    } catch (e) {
      if (e.name === "AbortError") throw e;
      console.warn(`ESPN API fetch failed for ${league}:`, e);
    }
  }

  if (successCount === 0) {
    throw new Error("All leagues fetch failed (network offline)");
  }



  // Filter out active live event from upcoming list
  if (activeLiveEvent) {
    allUpcomingMatches = allUpcomingMatches.filter((ev) => ev.id !== activeLiveEvent.id);
  }

  // Sort previous by date desc (most recent first) and upcoming by date asc (soonest first)
  allPreviousMatches.sort((a, b) => new Date(b.date) - new Date(a.date));
  allUpcomingMatches.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Render Agenda UI
  updateAgendaUI(allPreviousMatches[0], allUpcomingMatches[0]);

  // If a live match was found, process it
  if (activeLiveEvent) {
    const comp = activeLiveEvent.competitions[0];
    const homeCompetitor = comp.competitors.find((c) => c.homeAway === "home");
    const awayCompetitor = comp.competitors.find((c) => c.homeAway === "away");

    const homeTeam = homeCompetitor?.team?.displayName;
    const awayTeam = awayCompetitor?.team?.displayName;

    const homeScore = homeCompetitor?.score ?? "0";
    const awayScore = awayCompetitor?.score ?? "0";

    const homeLogo = homeCompetitor?.team?.logo || "assets/logo.svg";
    const awayLogo = awayCompetitor?.team?.logo || "assets/logo.svg";

    const matchName = homeTeam && awayTeam ? `${homeTeam} vs ${awayTeam}` : activeLiveEvent.name;
    const leagueName = activeLeagueName || "Copa Mundial";
    let matchDetail = activeLiveEvent.status.type.detail;
    if (activeLiveEvent.status.type.state === "pre") {
      try {
        const dateObj = new Date(activeLiveEvent.date);
        const dayName = dateObj.toLocaleDateString('es-AR', { weekday: 'short', timeZone: 'America/Argentina/Buenos_Aires' });
        const dayNum = dateObj.toLocaleDateString('es-AR', { day: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' });
        const monthName = dateObj.toLocaleDateString('es-AR', { month: 'long', timeZone: 'America/Argentina/Buenos_Aires' });
        const timeStr = dateObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' }) + ' hs';
        
        const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1).replace('.', '');
        const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
        
        matchDetail = `${capitalizedDay}, ${dayNum} de ${capitalizedMonth} - ${timeStr}`;
      } catch (e) {
        matchDetail = "Programado";
      }
    }

    updateMetadata(
      matchName,
      leagueName,
      `Disfrutá el partido en vivo de la ${leagueName}.`,
    );

    // Update dynamic scoreboard widget
    const scoreContainer = document.querySelector(".live-scoreboard-container");
    const titleEl = document.querySelector(".signal-title");
    if (scoreContainer && titleEl) {
      titleEl.style.display = "block";
      scoreContainer.style.display = "inline-flex";

      const homeLogoEl = scoreContainer.querySelector(".home-logo");
      const awayLogoEl = scoreContainer.querySelector(".away-logo");
      if (homeLogoEl) homeLogoEl.src = homeLogo;
      if (awayLogoEl) awayLogoEl.src = awayLogo;

      const homeNameEl = scoreContainer.querySelector(".home-name");
      const awayNameEl = scoreContainer.querySelector(".away-name");
      if (homeNameEl) homeNameEl.textContent = homeTeam;
      if (awayNameEl) awayNameEl.textContent = awayTeam;

      const homeShootVal = homeCompetitor?.shootoutScore;
      const awayShootVal = awayCompetitor?.shootoutScore;
      const homeScoreText = (homeShootVal !== undefined && homeShootVal !== null)
        ? `${homeScore} (${homeShootVal})`
        : homeScore;
      const awayScoreText = (awayShootVal !== undefined && awayShootVal !== null)
        ? `${awayScore} (${awayShootVal})`
        : awayScore;

      const homeScoreEl = scoreContainer.querySelector(".home-score-val");
      const awayScoreEl = scoreContainer.querySelector(".away-score-val");
      if (homeScoreEl) homeScoreEl.textContent = homeScoreText;
      if (awayScoreEl) awayScoreEl.textContent = awayScoreText;
    }

    // Check if a goal was scored (only after initial load has established a baseline)
    const currentHomeInt = parseInt(homeScore, 10) || 0;
    const currentAwayInt = parseInt(awayScore, 10) || 0;

    let forceSummaryFetch = false;

    if (prevHomeScore !== null && prevAwayScore !== null) {
      if (currentHomeInt > prevHomeScore || currentAwayInt > prevAwayScore) {
        triggerGoalCelebration();
        forceSummaryFetch = true; // Force immediate update of stats below
      }
    }

    prevHomeScore = currentHomeInt;
    prevAwayScore = currentAwayInt;

    // Fetch detailed match summary for goals and cards (throttled to once every 15s)
    const homeId = homeCompetitor?.id;
    const awayId = awayCompetitor?.id;

    // Reset summary cache if match ID changed
    if (activeLiveEvent.id !== lastCachedMatchId) {
      lastCachedMatchId = activeLiveEvent.id;
      lastSummaryFetchTime = 0;
      lastMatchDetail = "";
      cachedHomeEvents = [];
      cachedAwayEvents = [];
      cachedHomeShootout = [];
      cachedAwayShootout = [];
    }

    // Force refetch if match detail/status changed (e.g. HT, ET, Pens, started)
    const currentMatchDetail = activeLiveEvent.status?.type?.detail || "";
    if (currentMatchDetail !== lastMatchDetail) {
      lastMatchDetail = currentMatchDetail;
      forceSummaryFetch = true;
    }

    const nowTime = Date.now();
    if (
      forceSummaryFetch ||
      nowTime - lastSummaryFetchTime >= 15000 ||
      (cachedHomeEvents.length === 0 && cachedAwayEvents.length === 0)
    ) {
      try {
        const summaryRes = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/${activeLeague}/summary?event=${activeLiveEvent.id}&lang=es&region=ar&_t=${Date.now()}`,
          { signal }
        );
        if (summaryRes.ok) {
          const summaryData = await summaryRes.json();
          const keyEvents = summaryData.keyEvents || [];
          
          let fetchedHome = [];
          let fetchedAway = [];
          let homeShootout = [];
          let awayShootout = [];

          // 1. Parse Shootout Kicks from the dedicated shootout key
          if (summaryData.shootout && Array.isArray(summaryData.shootout)) {
            summaryData.shootout.forEach((teamShootout) => {
              const isHome = String(teamShootout.id) === String(homeId);
              const shots = teamShootout.shots || [];
              const results = shots.map((s) => s.didScore === true);
              if (isHome) {
                homeShootout = results;
              } else {
                awayShootout = results;
              }
            });
          }

          // 2. Parse Key Events (Goals and Cards)
          keyEvents.forEach((ev) => {
            const type = ev.type?.type || "";
            const isShootout = ev.shootout === true;

            // Skip shootout kicks in keyEvents to avoid double-processing
            if (isShootout) return;

            if (type.includes("goal") || type.includes("card") || (type.includes("penalty") && type.includes("scored"))) {
              const isHome = String(ev.team?.id) === String(homeId);
              const item = {
                type: (type.includes("goal") || type.includes("penalty"))
                  ? "goal"
                  : type.includes("red")
                    ? "red-card"
                    : "yellow-card",
                time: ev.clock?.displayValue || "0'",
                player:
                  ev.participants?.[0]?.athlete?.displayName ||
                  ev.shortText?.split(" Gol")[0] ||
                  "Jugador",
              };
              if (isHome) fetchedHome.push(item);
              else fetchedAway.push(item);
            }
          });

          cachedHomeEvents = fetchedHome;
          cachedAwayEvents = fetchedAway;
          cachedHomeShootout = homeShootout;
          cachedAwayShootout = awayShootout;
          lastSummaryFetchTime = nowTime;
        }
      } catch (err) {
        if (err.name === "AbortError") throw err;
        console.warn("Failed to fetch detailed match summary:", err);
      }
    }

    // Render stats UI using cached or newly fetched events & shootouts
    updateStatsUI(
      cachedHomeEvents,
      cachedAwayEvents,
      homeLogo,
      awayLogo,
      homeTeam,
      awayTeam,
      cachedHomeShootout,
      cachedAwayShootout,
    );

    // Update the timer badge with the exact API detail
    updateTimerBadge(matchDetail);

    // Hide bracket when live match is active
    const bracketContainer = document.querySelector(".tournament-bracket-container");
    if (bracketContainer) bracketContainer.style.display = "none";

    return true;
  }

  // Hide the scoreboard container if no live match was found
  const scoreContainer = document.querySelector(".live-scoreboard-container");
  const titleEl = document.querySelector(".signal-title");
  if (scoreContainer && titleEl) {
    scoreContainer.style.display = "none";
    titleEl.style.display = "block";
  }

  const statsContainer = document.querySelector(".match-stats-container");
  if (statsContainer) statsContainer.style.display = "none";
  const divider = document.querySelector(".match-section-divider");
  if (divider) divider.style.display = "none";

  // Reset baseline scores when no live match is running
  prevHomeScore = null;
  prevAwayScore = null;

  // Hide the badge if no live match was found
  updateTimerBadge(null);

  // Load and render tournament bracket
  loadAndRenderBracket(signal).catch(() => {});

  return false;
}

/**
 * Orchestrates match metadata fallback loading hierarchy and schedules polling updates
 * @param {Object} activeConfig
 */
export function loadMatchMetadata(activeConfig) {
  // Default Fallbacks
  let defaultTitle = "Señal en Vivo";
  let defaultSubtitle = "Transmisión Oficial";
  let defaultDesc =
    "Disfrutá de la transmisión en alta definición y baja latencia. Los partidos y eventos en vivo se actualizarán automáticamente.";

  // Option A: Decrypted config parameters
  if (activeConfig) {
    if (activeConfig.title) defaultTitle = activeConfig.title;
    if (activeConfig.subtitle) defaultSubtitle = activeConfig.subtitle;
    if (activeConfig.description) defaultDesc = activeConfig.description;
  }

  // Option B: URL query parameter override (e.g. ?match=Argentina+vs+Brasil)
  const urlParams = new URLSearchParams(window.location.search);
  const urlTitle =
    urlParams.get("event") || urlParams.get("title") || urlParams.get("match");
  const urlSubtitle =
    urlParams.get("sub") ||
    urlParams.get("subtitle") ||
    urlParams.get("tournament");
  const urlDesc = urlParams.get("desc") || urlParams.get("description");

  const initialTitle = urlTitle || defaultTitle;
  const initialSubtitle = urlSubtitle || defaultSubtitle;
  const initialDesc = urlDesc || defaultDesc;

  updateMetadata(initialTitle, initialSubtitle, initialDesc);

  let currentPollInterval = 10000;
  let failureCount = 0;

  const performLookup = () => {
    if (activeLookupPromise) return;

    activeLookupPromise = detectLiveMatch(urlTitle)
      .then((liveFound) => {
        // Success: reset backoff
        failureCount = 0;
        currentPollInterval = 10000;

        if (!liveFound) {
          // Option D: Local match.json file override fallback
          fetch("match.json")
            .then((res) => {
              if (res.ok) return res.json();
              throw new Error("No match.json on server");
            })
            .then((data) => {
              const activeTitle = urlTitle || data.title || defaultTitle;
              const activeSubtitle =
                urlSubtitle || data.subtitle || defaultSubtitle;
              const activeDesc = urlDesc || data.description || defaultDesc;
              updateMetadata(activeTitle, activeSubtitle, activeDesc);
            })
            .catch(() => {
              // Safe fallback without prints
            });
        }
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        failureCount++;
        currentPollInterval = Math.min(10000 * Math.pow(2, failureCount), 60000);
        console.warn(`ESPN lookup failed. Retrying in ${currentPollInterval / 1000}s. Error:`, err);
      })
      .finally(() => {
        activeLookupPromise = null;
        if (document.visibilityState === "visible") {
          lookupTimer = window.setTimeout(performLookup, currentPollInterval);
        }
      });
  };

  performLookup();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      if (lookupTimer) window.clearTimeout(lookupTimer);
      performLookup();
    } else if (lookupTimer) {
      window.clearTimeout(lookupTimer);
    }
  });
}

/**
 * Renders the goal and card stats inside the .match-stats-container
 */
function updateStatsUI(
  homeEvents,
  awayEvents,
  homeLogo,
  awayLogo,
  homeTeam,
  awayTeam,
  homeShootout = [],
  awayShootout = [],
) {
  const statsContainer = document.querySelector(".match-stats-container");
  if (!statsContainer) return;

  const homeKeys = homeEvents.map(e => `${e.type}:${e.time}:${e.player}`).join(';');
  const awayKeys = awayEvents.map(e => `${e.type}:${e.time}:${e.player}`).join(';');
  const statsKey = `${homeKeys}|${awayKeys}|${homeLogo}|${awayLogo}|${homeTeam}|${awayTeam}|${homeShootout.join(',')}|${awayShootout.join(',')}`;
  
  if (statsKey === lastStatsCache) return;
  lastStatsCache = statsKey;

  // Update team logos and names in headers
  const homeLogoEl = statsContainer.querySelector(".home-stats-logo");
  const awayLogoEl = statsContainer.querySelector(".away-stats-logo");
  if (homeLogoEl) homeLogoEl.src = homeLogo;
  if (awayLogoEl) awayLogoEl.src = awayLogo;

  const homeNameEl = statsContainer.querySelector(".home-stats-name");
  const awayNameEl = statsContainer.querySelector(".away-stats-name");
  if (homeNameEl) homeNameEl.textContent = homeTeam;
  if (awayNameEl) awayNameEl.textContent = awayTeam;

  // SVGs
  const soccerBallSvg = `
      <span class="stats-icon-wrapper">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-primary);">
          <circle cx="12" cy="12" r="10"/>
          <path d="m12 2-1.5 4.5L7 8l1.5 4.5h7L17 8l-1.5-4.5L12 2Z"/>
          <path d="M10.5 6.5 7.5 5M7 8l-3.5-.5M8.5 12.5 6 15M15.5 12.5 18 15M17 8l3.5-.5M13.5 6.5 16.5 5"/>
        </svg>
      </span>`;

  const yellowCardSvg = `
      <span class="stats-icon-wrapper">
        <svg viewBox="0 0 24 24" width="12" height="16" fill="#FFE600" style="filter: drop-shadow(0 0 4px rgba(255,230,0,0.4));">
          <rect x="5" y="3" width="14" height="18" rx="2" ry="2"/>
        </svg>
      </span>`;

  const redCardSvg = `
      <span class="stats-icon-wrapper">
        <svg viewBox="0 0 24 24" width="12" height="16" fill="#FF3B30" style="filter: drop-shadow(0 0 4px rgba(255,59,48,0.4));">
          <rect x="5" y="3" width="14" height="18" rx="2" ry="2"/>
        </svg>
      </span>`;

  const renderList = (events, listEl) => {
    if (!listEl) return;
    listEl.innerHTML = "";

    if (events.length === 0) {
      listEl.innerHTML = `<div style="font-size: 13px; color: var(--text-secondary); font-style: italic; padding: 4px 0;">Sin goles ni tarjetas</div>`;
      return;
    }

    events.forEach((ev) => {
      let svg = "";
      if (ev.type === "goal") svg = soccerBallSvg;
      else if (ev.type === "red-card") svg = redCardSvg;
      else svg = yellowCardSvg;

      const item = document.createElement("div");
      item.className = "stats-item";
      item.innerHTML = `
                <span class="stats-item-time">${ev.time}</span>
                ${svg}
                <span class="stats-item-player">${ev.player}</span>
            `;
      listEl.appendChild(item);
    });
  };

  const homeListEl = statsContainer.querySelector(".home-stats-list");
  const awayListEl = statsContainer.querySelector(".away-stats-list");

  renderList(homeEvents, homeListEl);
  renderList(awayEvents, awayListEl);

  // Shootout rendering
  const renderShootout = (shootout, statsCol) => {
    const existingRow = statsCol.querySelector(".stats-shootout-row");
    if (existingRow) existingRow.remove();

    if (!shootout || shootout.length === 0) return;

    const row = document.createElement("div");
    row.className = "stats-shootout-row";

    const title = document.createElement("span");
    title.className = "stats-shootout-title";
    title.textContent = "Penales:";
    row.appendChild(title);

    const dotsContainer = document.createElement("div");
    dotsContainer.className = "stats-shootout-dots";

    shootout.forEach((scored) => {
      const dot = document.createElement("span");
      dot.className = `shootout-dot ${scored ? "score" : "miss"}`;
      dotsContainer.appendChild(dot);
    });

    row.appendChild(dotsContainer);
    statsCol.appendChild(row);
  };

  const homeCol = statsContainer.querySelector(".home-stats");
  const awayCol = statsContainer.querySelector(".away-stats");
  if (homeCol) renderShootout(homeShootout, homeCol);
  if (awayCol) renderShootout(awayShootout, awayCol);

  statsContainer.style.display = "flex";
  const divider = document.querySelector(".match-section-divider");
  if (divider) divider.style.display = "block";
}

/**
 * Renders the previous and upcoming match in the .matches-agenda-container
 */
function updateAgendaUI(prevMatch, nextMatch) {
  const container = document.querySelector(".matches-agenda-container");
  if (!container) return;

  const prevScore = prevMatch?.competitions?.[0]?.competitors?.map((c) => c.score).join(",") || "";
  const agendaKey = `${prevMatch?.id || ""}:${prevScore}|${nextMatch?.id || ""}:${nextMatch?.date || ""}`;
  if (agendaKey === lastAgendaCache) return;
  lastAgendaCache = agendaKey;

  const logoFallback = "assets/logo.svg";

  // 1. Render Previous Match
  const prevCard = container.querySelector(".prev-match-card");
  if (prevMatch && prevCard) {
    const comp = prevMatch.competitions?.[0];
    const home = comp?.competitors.find((c) => c.homeAway === "home");
    const away = comp?.competitors.find((c) => c.homeAway === "away");

    const homeLogo = prevCard.querySelector(".prev-home-logo");
    const homeName = prevCard.querySelector(".prev-home-name");
    const homeScore = prevCard.querySelector(".prev-home-score");
    const awayLogo = prevCard.querySelector(".prev-away-logo");
    const awayName = prevCard.querySelector(".prev-away-name");
    const awayScore = prevCard.querySelector(".prev-away-score");

     const homeShootVal = home?.shootoutScore;
     const awayShootVal = away?.shootoutScore;
     const homeScoreText = (homeShootVal !== undefined && homeShootVal !== null)
       ? `${home?.score ?? "-"} (${homeShootVal})`
       : home?.score ?? "-";
     const awayScoreText = (awayShootVal !== undefined && awayShootVal !== null)
       ? `${away?.score ?? "-"} (${awayShootVal})`
       : away?.score ?? "-";

     if (homeLogo) homeLogo.src = home?.team?.logo || logoFallback;
     if (homeName) homeName.textContent = home?.team?.displayName || "-";
     if (homeScore) homeScore.textContent = homeScoreText;
     if (awayLogo) awayLogo.src = away?.team?.logo || logoFallback;
     if (awayName) awayName.textContent = away?.team?.displayName || "-";
     if (awayScore) awayScore.textContent = awayScoreText;
    prevCard.style.display = "flex";
  } else if (prevCard) {
    prevCard.style.display = "none";
  }

  // 2. Render Next Match
  const nextCard = container.querySelector(".next-match-card");
  if (nextMatch && nextCard) {
    const comp = nextMatch.competitions?.[0];
    const home = comp?.competitors.find((c) => c.homeAway === "home");
    const away = comp?.competitors.find((c) => c.homeAway === "away");

    const homeLogo = nextCard.querySelector(".next-home-logo");
    const homeName = nextCard.querySelector(".next-home-name");
    const awayLogo = nextCard.querySelector(".next-away-logo");
    const awayName = nextCard.querySelector(".next-away-name");
    const timeVal = nextCard.querySelector(".agenda-time-val");

    if (homeLogo) homeLogo.src = home?.team?.logo || logoFallback;
    if (homeName) homeName.textContent = home?.team?.displayName || "-";
    if (awayLogo) awayLogo.src = away?.team?.logo || logoFallback;
    if (awayName) awayName.textContent = away?.team?.displayName || "-";

    if (timeVal) {
      const matchDate = new Date(nextMatch.date);
      const isToday = matchDate.toDateString() === new Date().toDateString();
      const timeString =
        matchDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) + " hs";
      const dayString = isToday
        ? ""
        : matchDate.toLocaleDateString([], { day: "numeric", month: "short" }) + " • ";
      timeVal.textContent = `${dayString}${timeString}`;
    }
    nextCard.style.display = "flex";
  } else if (nextCard) {
    nextCard.style.display = "none";
  }

  // Handle divider visibility
  const divider = container.querySelector(".agenda-divider");
  if (divider) {
    divider.style.display = prevMatch && nextMatch ? "block" : "none";
  }

  // If absolutely no matches are scheduled/finished, hide the whole container
  const shouldShow = prevMatch || nextMatch;
  const isCurrentlyHidden = container.style.display === "none" || !container.style.display;

  if (shouldShow) {
    if (isCurrentlyHidden) {
      container.style.display = "flex";
      if (typeof gsap !== "undefined" && !container.hasAttribute("data-animated")) {
        container.setAttribute("data-animated", "true");
        gsap.from(container, {
          y: 20,
          opacity: 0,
          duration: 0.6,
          ease: "power2.out"
        });
      }
    }
  } else {
    container.style.display = "none";
  }
}

const countryTranslations = {
  "Germany": "Alemania",
  "Paraguay": "Paraguay",
  "France": "Francia",
  "Sweden": "Suecia",
  "Canada": "Canadá",
  "South Africa": "Sudáfrica",
  "Netherlands": "Países Bajos",
  "Morocco": "Marruecos",
  "Spain": "España",
  "Austria": "Austria",
  "Portugal": "Portugal",
  "Croatia": "Croacia",
  "Bosnia-Herzegovina": "Bosnia",
  "Bosnia": "Bosnia",
  "United States": "Estados Unidos",
  "USA": "Estados Unidos",
  "Senegal": "Senegal",
  "Belgium": "Bélgica",
  "Brazil": "Brasil",
  "Japan": "Japón",
  "Ivory Coast": "Costa de Marfil",
  "Norway": "Noruega",
  "Mexico": "México",
  "Ecuador": "Ecuador",
  "Congo DR": "R.D. Congo",
  "DR Congo": "R.D. Congo",
  "England": "Inglaterra",
  "Algeria": "Argelia",
  "Switzerland": "Suiza",
  "Argentina": "Argentina",
  "Cape Verde": "Cabo Verde",
  "Egypt": "Egipto",
  "Australia": "Australia",
  "Ghana": "Ghana",
  "Colombia": "Colombia"
};

/**
 * Format ESPN placeholders or team names to a clean translated format
 */
function formatTeamName(name) {
  if (!name) return "-";
  
  // Clean up placeholders
  if (name.includes("Winner")) {
    const numMatch = name.match(/\d+/);
    if (numMatch) {
      return `Ganador ${numMatch[0]}`;
    }
    return name
      .replace("Round of 32", "16avos")
      .replace("Round of 16", "Octavos")
      .replace("Quarterfinal", "Cuartos")
      .replace("Semifinal", "Semi")
      .replace("Winner", "Ganador")
      .replace("at", "vs");
  }

  if (name.includes("Loser")) {
    const numMatch = name.match(/\d+/);
    if (numMatch) {
      return `Perdedor ${numMatch[0]}`;
    }
    return name
      .replace("Semifinal", "Semi")
      .replace("Loser", "Perdedor")
      .replace("at", "vs");
  }

  const trimmed = name.trim();
  if (countryTranslations[trimmed]) {
    return countryTranslations[trimmed];
  }

  let translated = trimmed;
  for (const [eng, esp] of Object.entries(countryTranslations)) {
    const reg = new RegExp(`\\b${eng}\\b`, "gi");
    translated = translated.replace(reg, esp);
  }

  return translated;
}

/**
 * Render a single match card node inside its slot
 */
function renderMatchNode(ev, slot, isFinal = false) {
  if (!slot) return;
  slot.innerHTML = "";

  const soccerBallFallback = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-opacity='0.15' stroke-width='1.5'><circle cx='12' cy='12' r='10'/><polygon points='12,10 15.5,12.5 14.2,16.5 9.8,16.5 8.5,12.5' fill='%23ffffff' fill-opacity='0.08'/><line x1='12' y1='10' x2='12' y2='2'/><line x1='15.5' y1='12.5' x2='21.5' y2='9.5'/><line x1='14.2' y1='16.5' x2='18' y2='21.3'/><line x1='9.8' y1='16.5' x2='6' y2='21.3'/><line x1='8.5' y1='12.5' x2='2.5' y2='9.5'/></svg>";
  const logoFallback = isFinal ? "assets/logo.svg" : soccerBallFallback;
  let homeName = "-";
  let awayName = "-";
  let homeLogo = logoFallback;
  let awayLogo = logoFallback;
  let homeScore = "";
  let awayScore = "";
  let isHomeWinner = false;
  let isAwayWinner = false;
  let isFinished = false;
  let statusDetail = "Programado";

  if (ev) {
    const comp = ev.competitions?.[0];
    const home = comp?.competitors?.find(c => c.homeAway === 'home');
    const away = comp?.competitors?.find(c => c.homeAway === 'away');

    homeName = formatTeamName(home?.team?.displayName);
    awayName = formatTeamName(away?.team?.displayName);
    homeLogo = home?.team?.logo || logoFallback;
    awayLogo = away?.team?.logo || logoFallback;

    isFinished = comp?.status?.type?.completed === true;
    const isLive = comp?.status?.type?.state === "in";

    if (isFinished || isLive) {
      homeScore = home?.score ?? "";
      awayScore = away?.score ?? "";
      const homeScoreInt = parseInt(homeScore, 10) || 0;
      const awayScoreInt = parseInt(awayScore, 10) || 0;
      if (isFinished) {
        if (homeScoreInt > awayScoreInt || home?.winner === true) {
          isHomeWinner = true;
        } else if (awayScoreInt > homeScoreInt || away?.winner === true) {
          isAwayWinner = true;
        }
      }
    }

    if (isLive) {
      statusDetail = comp?.status?.type?.detail || "En Vivo";
      if (statusDetail === "Halftime") statusDetail = "Entretiempo";
    } else if (isFinished) {
      const detail = comp?.status?.type?.detail || "Finalizado";
      if (detail === "FT" || detail === "Full Time") statusDetail = "Finalizado";
      else if (detail === "AET" || detail.includes("Extra")) statusDetail = "T. Extra";
      else if (detail === "Pen." || detail.includes("Pen")) statusDetail = "Penales";
      else statusDetail = "Finalizado";
    } else {
      if (ev.date) {
        try {
          const dateObj = new Date(ev.date);
          const dateStr = dateObj.toLocaleDateString('es-AR', {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
          });
          const timeStr = dateObj.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }) + ' hs';
          const capitalizedDate = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
          statusDetail = `${capitalizedDate} • ${timeStr}`;
        } catch (e) {
          statusDetail = "Programado";
        }
      } else {
        statusDetail = "Programado";
      }
    }
  }

  const cardClass = isFinal ? "final-match-card" : "bracket-match-node";

  slot.innerHTML = `
    <div class="${cardClass}">
      <div class="bracket-match-team ${isHomeWinner ? 'winner' : ''} ${isFinished && isAwayWinner ? 'loser' : ''}">
        <div class="bracket-team-info">
          <img class="bracket-flag" src="${homeLogo}" alt="${homeName}" />
          <span class="bracket-team-name">${homeName}</span>
        </div>
        <span class="bracket-team-score">${homeScore}</span>
      </div>
      <div class="bracket-match-team ${isAwayWinner ? 'winner' : ''} ${isFinished && isHomeWinner ? 'loser' : ''}">
        <div class="bracket-team-info">
          <img class="bracket-flag" src="${awayLogo}" alt="${awayName}" />
          <span class="bracket-team-name">${awayName}</span>
        </div>
        <span class="bracket-team-score">${awayScore}</span>
      </div>
      <div class="bracket-match-meta">${statusDetail}</div>
    </div>
  `;
}

/**
 * Render all events into the desktop tree view slots
 */
function renderBracketTree(events) {
  const slots = document.querySelectorAll(".bracket-match-slot");
  slots.forEach(slot => {
    const matchId = slot.getAttribute("data-match-id");
    const ev = events.find(e => e.id === matchId);
    renderMatchNode(ev, slot, false);
  });

  const finalSlot = document.querySelector(".final-match-slot");
  if (finalSlot) {
    const matchId = finalSlot.getAttribute("data-match-id");
    const ev = events.find(e => e.id === matchId);
    renderMatchNode(ev, finalSlot, true);
  }
}

/**
 * Set up accordion toggle event listeners on mobile screens
 */
function initBracketAccordion() {
  const container = document.querySelector(".tournament-bracket-container");
  if (!container) return;

  if (window.innerWidth <= 1024) {
    container.classList.add("collapsed");
  }

  const header = container.querySelector(".bracket-section-header");
  const overlay = container.querySelector(".bracket-expand-overlay");

  const toggleAccordion = () => {
    if (window.innerWidth > 1024) return;
    
    if (container.classList.contains("collapsed")) {
      container.classList.remove("collapsed");
    } else {
      container.classList.add("collapsed");
      if (header) {
        header.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  if (header) {
    header.style.cursor = "pointer";
    header.addEventListener("click", toggleAccordion);
  }
  if (overlay) {
    overlay.addEventListener("click", toggleAccordion);
  }
}

/**
 * Load events from ESPN for the date range of knockout phase and render the bracket
 */
async function loadAndRenderBracket(signal) {
  const container = document.querySelector(".tournament-bracket-container");
  if (!container) return;

  const isCurrentlyHidden = container.style.display === "none" || !container.style.display;
  if (isCurrentlyHidden) {
    container.style.display = "flex";
    if (typeof gsap !== "undefined" && !container.hasAttribute("data-animated")) {
      container.setAttribute("data-animated", "true");
      gsap.from(container, {
        y: 20,
        opacity: 0,
        duration: 0.6,
        ease: "power2.out"
      });
    }
  }

  if (!accordionInitialized) {
    initBracketAccordion();
    accordionInitialized = true;
  }

  const now = Date.now();
  if (now - lastBracketFetchTime > 300000 || cachedBracketEvents.length === 0) {
    try {
      const res = await fetch(
        "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=100&dates=20260627-20260719",
        { signal }
      );
      if (res.ok) {
        const data = await res.json();
        cachedBracketEvents = data.events || [];
        lastBracketFetchTime = now;
      }
    } catch (e) {
      if (e.name === "AbortError") throw e;
      console.warn("Failed to fetch bracket data from ESPN:", e);
    }
  }

  renderBracketTree(cachedBracketEvents);
}

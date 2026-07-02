/* live-scores.js - Dynamic metadata loading and ESPN score API tracker */

import { triggerGoalCelebration } from "./animations.js";

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
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  
  const pad = (n) => String(n).padStart(2, "0");
  const getYYYYMMDD = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  
  const todayStr = getYYYYMMDD(today);
  const tomorrowStr = getYYYYMMDD(tomorrow);
  const datesParam = `dates=${todayStr}-${tomorrowStr}`;

  let allPreviousMatches = [];
  let allUpcomingMatches = [];

  let activeLiveEvent = null;
  let activeLeague = null;
  let activeLeagueName = null;

  let successCount = 0;
  for (const league of leagues) {
    try {
      const res = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?lang=es&region=ar&${datesParam}`,
        { signal }
      );
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
    const matchDetail = activeLiveEvent.status.type.detail;

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

      const homeScoreEl = scoreContainer.querySelector(".home-score-val");
      const awayScoreEl = scoreContainer.querySelector(".away-score-val");
      if (homeScoreEl) homeScoreEl.textContent = homeScore;
      if (awayScoreEl) awayScoreEl.textContent = awayScore;
    }

    // Check if a goal was scored (only after initial load has established a baseline)
    const currentHomeInt = parseInt(homeScore, 10) || 0;
    const currentAwayInt = parseInt(awayScore, 10) || 0;

    if (prevHomeScore !== null && prevAwayScore !== null) {
      if (currentHomeInt > prevHomeScore || currentAwayInt > prevAwayScore) {
        triggerGoalCelebration();
      }
    }

    prevHomeScore = currentHomeInt;
    prevAwayScore = currentAwayInt;

    // Fetch detailed match summary for goals and cards (throttled to once every 30s)
    const homeId = homeCompetitor?.id;
    const awayId = awayCompetitor?.id;

    // Reset summary cache if match ID changed
    if (activeLiveEvent.id !== lastCachedMatchId) {
      lastCachedMatchId = activeLiveEvent.id;
      lastSummaryFetchTime = 0;
      cachedHomeEvents = [];
      cachedAwayEvents = [];
      cachedHomeShootout = [];
      cachedAwayShootout = [];
    }

    const nowTime = Date.now();
    if (
      nowTime - lastSummaryFetchTime >= 30000 ||
      (cachedHomeEvents.length === 0 && cachedAwayEvents.length === 0)
    ) {
      try {
        const summaryRes = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/${activeLeague}/summary?event=${activeLiveEvent.id}&lang=es&region=ar`,
          { signal }
        );
        if (summaryRes.ok) {
          const summaryData = await summaryRes.json();
          const keyEvents = summaryData.keyEvents || [];
          
          let fetchedHome = [];
          let fetchedAway = [];
          let homeShootout = [];
          let awayShootout = [];

          keyEvents.forEach((ev) => {
            const type = ev.type?.type || "";
            const isShootout = ev.shootout === true;

            if (isShootout) {
              const isHome = ev.team?.id === homeId;
              const scored =
                type.includes("goal") ||
                ev.text?.toLowerCase().includes("gol") ||
                ev.text?.toLowerCase().includes("convierte");
              if (isHome) homeShootout.push(scored);
              else awayShootout.push(scored);
            } else if (type.includes("goal") || type.includes("card")) {
              const isHome = ev.team?.id === homeId;
              const item = {
                type: type.includes("goal")
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

    if (homeLogo) homeLogo.src = home?.team?.logo || logoFallback;
    if (homeName) homeName.textContent = home?.team?.displayName || "-";
    if (homeScore) homeScore.textContent = home?.score ?? "-";
    if (awayLogo) awayLogo.src = away?.team?.logo || logoFallback;
    if (awayName) awayName.textContent = away?.team?.displayName || "-";
    if (awayScore) awayScore.textContent = away?.score ?? "-";
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
  container.style.display = prevMatch || nextMatch ? "flex" : "none";
}

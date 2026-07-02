/* live-scores.js - Dynamic metadata loading and ESPN score API tracker */

import { triggerGoalCelebration } from './animations.js';

let prevHomeScore = null;
let prevAwayScore = null;

/**
 * Updates the scoreboard match-timer badge with the exact value from the API
 * @param {string|null} timeText Time text from ESPN (e.g. "41'", "Entretiempo") or null to hide
 */
export function updateTimerBadge(timeText) {
    const badges = document.querySelectorAll(".match-timer-badge");
    badges.forEach(badgeEl => {
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
            if (titleEl.childNodes.length > 0 && titleEl.childNodes[0].nodeType === 3) { // 3 = Node.TEXT_NODE
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

    const leagues = ['fifa.world', 'conmebol.america', 'uefa.euro', 'uefa.champions', 'arg.1', 'esp.1', 'eng.1'];
    for (const league of leagues) {
        try {
            const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?lang=es&region=ar`);
            if (!res.ok) continue;
            const data = await res.json();
            
            // Prioritize live matches ('in') first, then fall back to upcoming matches ('pre' starting in <= 30 mins)
            const events = data.events || [];
            let liveEvent = events.find(ev => ev.status?.type?.state === 'in');
            if (!liveEvent) {
                const now = new Date();
                liveEvent = events.find(ev => {
                    if (ev.status?.type?.state === 'pre') {
                        const matchDate = new Date(ev.date);
                        const diffMinutes = (matchDate - now) / 60000;
                        return diffMinutes <= 30; // 30 minutes before kickoff
                    }
                    return false;
                });
            }

            if (liveEvent) {
                const comp = liveEvent.competitions[0];
                const homeCompetitor = comp.competitors.find(c => c.homeAway === 'home');
                const awayCompetitor = comp.competitors.find(c => c.homeAway === 'away');

                const homeTeam = homeCompetitor?.team?.displayName;
                const awayTeam = awayCompetitor?.team?.displayName;
                
                const homeScore = homeCompetitor?.score ?? "0";
                const awayScore = awayCompetitor?.score ?? "0";

                const homeLogo = homeCompetitor?.team?.logo || 'assets/logo.svg';
                const awayLogo = awayCompetitor?.team?.logo || 'assets/logo.svg';

                const matchName = homeTeam && awayTeam ? `${homeTeam} vs ${awayTeam}` : liveEvent.name;
                const leagueName = data.leagues[0].name;
                const matchDetail = liveEvent.status.type.detail;
                
                updateMetadata(
                    matchName, 
                    leagueName, 
                    `Disfrutá el partido en vivo de la ${leagueName}.`
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

                // Fetch detailed match summary for goals and cards
                const homeId = homeCompetitor?.id;
                const awayId = awayCompetitor?.id;
                
                let homeEvents = [];
                let awayEvents = [];
                
                try {
                    const summaryRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/summary?event=${liveEvent.id}&lang=es&region=ar`);
                    if (summaryRes.ok) {
                        const summaryData = await summaryRes.json();
                        const keyEvents = summaryData.keyEvents || [];
                        keyEvents.forEach(ev => {
                            const type = ev.type?.type || '';
                            if (type.includes('goal') || type.includes('card')) {
                                const isHome = ev.team?.id === homeId;
                                const item = {
                                    type: type.includes('goal') ? 'goal' : (type.includes('red') ? 'red-card' : 'yellow-card'),
                                    time: ev.clock?.displayValue || "0'",
                                    player: ev.participants?.[0]?.athlete?.displayName || ev.shortText?.split(' Gol')[0] || 'Jugador'
                                };
                                if (isHome) homeEvents.push(item);
                                else awayEvents.push(item);
                            }
                        });
                    }
                } catch (err) {
                    console.warn("Failed to fetch detailed match summary:", err);
                }
                

                // Render stats UI
                updateStatsUI(homeEvents, awayEvents, homeLogo, awayLogo, homeTeam, awayTeam);

                // Update the timer badge with the exact API detail
                updateTimerBadge(matchDetail);
                return true;
            }
        } catch (e) {
            console.warn(`ESPN API fetch failed for ${league}:`, e);
        }
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
    let defaultDesc = "Disfrutá de la transmisión en alta definición y baja latencia. Los partidos y eventos en vivo se actualizarán automáticamente.";

    // Option A: Decrypted config parameters
    if (activeConfig) {
        if (activeConfig.title) defaultTitle = activeConfig.title;
        if (activeConfig.subtitle) defaultSubtitle = activeConfig.subtitle;
        if (activeConfig.description) defaultDesc = activeConfig.description;
    }

    // Option B: URL query parameter override (e.g. ?match=Argentina+vs+Brasil)
    const urlParams = new URLSearchParams(window.location.search);
    const urlTitle = urlParams.get("event") || urlParams.get("title") || urlParams.get("match");
    const urlSubtitle = urlParams.get("sub") || urlParams.get("subtitle") || urlParams.get("tournament");
    const urlDesc = urlParams.get("desc") || urlParams.get("description");

    const initialTitle = urlTitle || defaultTitle;
    const initialSubtitle = urlSubtitle || defaultSubtitle;
    const initialDesc = urlDesc || defaultDesc;

    updateMetadata(initialTitle, initialSubtitle, initialDesc);

    // Initial check
    const performLookup = () => {
        detectLiveMatch(urlTitle).then(liveFound => {
            if (!liveFound) {
                // Option D: Local match.json file override fallback
                fetch("match.json")
                    .then(res => {
                        if (res.ok) return res.json();
                        throw new Error("No match.json on server");
                    })
                    .then(data => {
                        const activeTitle = urlTitle || data.title || defaultTitle;
                        const activeSubtitle = urlSubtitle || data.subtitle || defaultSubtitle;
                        const activeDesc = urlDesc || data.description || defaultDesc;
                        updateMetadata(activeTitle, activeSubtitle, activeDesc);
                    })
                    .catch(err => {
                        // Safe fallback without prints
                    });
            }
        });
    };

    performLookup();

    // Query ESPN scoreboard every 15 seconds for live updates (scores, minute timer sync)
    setInterval(performLookup, 15000);
}

/**
 * Renders the goal and card stats inside the .match-stats-container
 */
function updateStatsUI(homeEvents, awayEvents, homeLogo, awayLogo, homeTeam, awayTeam) {
    const statsContainer = document.querySelector(".match-stats-container");
    if (!statsContainer) return;
    
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
        
        events.forEach(ev => {
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
    
    statsContainer.style.display = "flex";
}

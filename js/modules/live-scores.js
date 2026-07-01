/* live-scores.js - Dynamic metadata loading and ESPN score API tracker */

/**
 * Updates the scoreboard match-timer badge with the exact value from the API
 * @param {string|null} timeText Time text from ESPN (e.g. "41'", "Entretiempo") or null to hide
 */
export function updateTimerBadge(timeText) {
    const badgeEl = document.querySelector(".match-timer-badge");
    if (!badgeEl) return;

    if (timeText) {
        badgeEl.textContent = timeText;
        badgeEl.style.display = "inline-flex";
    } else {
        badgeEl.style.display = "none";
    }
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
        const subtitleEl = document.querySelector(".signal-subtitle");
        if (subtitleEl) {
            subtitleEl.innerHTML = `${subtitle} <span class="dot">•</span> <span class="live">En vivo</span>`;
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
            
            // Find any match in progress ('in')
            const liveEvent = data.events && data.events.find(ev => ev.status?.type?.state === 'in');
            if (liveEvent) {
                const comp = liveEvent.competitions[0];
                const homeTeam = comp.competitors.find(c => c.homeAway === 'home')?.team?.displayName;
                const awayTeam = comp.competitors.find(c => c.homeAway === 'away')?.team?.displayName;
                
                const matchName = homeTeam && awayTeam ? `${homeTeam} vs ${awayTeam}` : liveEvent.name;
                const leagueName = data.leagues[0].name;
                const matchDetail = liveEvent.status.type.detail;
                
                updateMetadata(
                    matchName, 
                    leagueName, 
                    `Disfrutá el partido en vivo de la ${leagueName}.`
                );

                // Update the timer badge with the exact API detail
                updateTimerBadge(matchDetail);
                return true;
            }
        } catch (e) {
            console.warn(`ESPN API fetch failed for ${league}:`, e);
        }
    }
    
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
    let defaultSubtitle = "MundialLibre";
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

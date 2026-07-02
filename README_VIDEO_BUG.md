# Documentación: Bug de Oscurecimiento de Video en Chromium

Este documento explica la causa y la solución para un bug muy común en navegadores basados en Chromium (Google Chrome, Microsoft Edge, Opera, Brave) donde los elementos `<video>` se ven "opacos", oscuros o con los colores apagados al combinar ciertas propiedades avanzadas de CSS en el diseño del reproductor.

## 🐛 El Problema

El problema ocurre porque Chromium intenta optimizar el rendimiento utilizando **GPU Compositing** (Composición acelerada por Hardware) de una forma incorrecta cuando ciertas propiedades gráficas de CSS se superponen con un elemento `<video>` que también utiliza aceleración por hardware.

Específicamente, el video se oscurecerá si se cumple alguna de estas condiciones:

1. **`backdrop-filter` superpuesto**: Si agregas `backdrop-filter: blur(...)` a cualquier elemento que se posicione por encima del video (como un menú desplegable, un overlay, controles, un loader, o incluso un navbar fijo/sticky que interseque la capa del video).
2. **`box-shadow` gigante + `overflow: hidden`**: Si aplicas una sombra inmensa (`box-shadow` con un radio de desenfoque muy grande) directamente al contenedor principal que envuelve al video (`.player-wrapper`) y este mismo contenedor tiene esquinas recortadas (`overflow: hidden` + `border-radius`). 
3. **Propiedades que fuerzan nuevas capas gráficas**: Usar indiscriminadamente `isolation: isolate;`, `transform: translate3d(...)` o `will-change: transform` en el mismo contenedor del video.

Cuando Chromium intenta calcular la máscara de recorte y los desenfoques pesados al mismo tiempo que decodifica un video en tiempo real, activa un modo de renderizado de baja performance que altera el brillo y contraste del espacio de color del video, haciendo que todo se vea apagado.

## ✅ La Solución Definitiva (Best Practices)

Para evitar que el bug "vaya y vuelva" cuando modificamos el diseño, es fundamental seguir esta arquitectura CSS para reproductores web modernos:

### 1. NUNCA usar `backdrop-filter` sobre el reproductor
Evitá usar `backdrop-filter` (glassmorphism) en elementos interactivos que estén cerca del video (`.live-scoreboard-container`, menús de calidades, overlays de gol, o HUDs de pausa). 
**Solución:** Usá fondos semitransparentes sólidos (ej. `background: rgba(17, 17, 17, 0.85);`). 

### 2. Separar las sombras complejas en elementos independientes
Si querés darle un resplandor gigante al reproductor de video (Glow / Box-Shadow luminoso), **NO** se lo apliques al mismo contenedor (`.player-wrapper`) que tiene `overflow: hidden`.
**Solución:**
- Creá un `<div>` vacío independiente que se coloque exactamente detrás del reproductor usando `position: absolute` y `z-index` negativo o inferior (en este proyecto usamos `.player-glow-backdrop`).
- Aplicá la sombra pesada a este div vacío. Al no tener que procesar máscaras ni recortar esquinas, Chrome renderiza la sombra a la perfección sin interferir con el video.

### 3. Cuidado con las animaciones (`transition`)
No apliques animaciones globales (`transition: all ...`) al contenedor principal del video, ya que cualquier mínimo cambio en el hover forzará a la GPU a recalcular la composición completa de la capa de video. Animá únicamente los elementos superpuestos (como la opacidad de la barra de controles).

---
*Manteniendo separadas las capas de efectos (blur/sombras) de la capa estricta del video (overflow/reproducción), te asegurás de que el video mantenga su calidad HD y sus colores vivos en el 100% de los navegadores.*

---

# Documentación: Señal Alternativa (iframe) se carga siempre en iOS

**Estado:** ⚠️ Sin resolver — documentado para análisis futuro.  
**Fecha de análisis:** 2 de julio de 2026

## 🐛 El Problema

En dispositivos iOS (tanto Safari como Chrome, Firefox, Brave, etc.), el reproductor Shaka Player no puede reproducir el stream DASH + ClearKey DRM. Como resultado, se activa automáticamente el fallback al iframe con la **señal alternativa**, que tiene anuncios y no respeta el diseño de la web.

En **PC y Android con Chrome** funciona perfectamente porque Chrome real soporta DASH + ClearKey nativamente.

## 🔍 Causa Raíz

### ¿Por qué Chrome en iOS no es "Chrome real"?
Apple obliga a que **todos los navegadores en iOS** usen el motor **WebKit** (el mismo de Safari) por debajo. Chrome, Firefox, Brave, etc. en iOS son solo "skins" sobre WebKit. Esto significa que tienen las **mismas limitaciones** que Safari:
- ❌ **No soportan DASH nativamente** — solo soportan HLS (HTTP Live Streaming / `.m3u8`)
- ❌ **ClearKey DRM tiene soporte limitado/roto en WebKit**
- ❌ **MSE (Media Source Extensions)** tiene restricciones en iOS

Como resultado, `shaka.Player.isBrowserSupported()` devuelve `false` en iOS, o si devuelve `true`, el stream falla al intentar cargar el manifiesto DASH con ClearKey.

## 📍 Puntos de activación del Fallback en `player-shaka.js`

La función `triggerFallback()` se llama desde 4 puntos distintos en `initPlayer()`:

| Línea | Condición | Descripción |
|-------|-----------|-------------|
| ~66 | `!activeConfig` | La desencriptación de la configuración falló |
| ~96 | `shakaPlayer 'error' event` | Error de Shaka Player durante reproducción |
| ~103 | `video 'error' event` | Error del elemento `<video>` HTML5 |
| ~130 | `!shaka.Player.isBrowserSupported()` | **← Este se activa en iOS.** Navegador no soportado |

Cuando `triggerFallback()` se ejecuta:
1. Oculta el `<video>` y los controles custom
2. Muestra el `<iframe id="iframe-fallback">`
3. Carga `activeConfig.iframeUrl` dentro del iframe (señal alternativa con anuncios)

## ⚠️ Intento de fix revertido (2 julio 2026)

Se intentó eliminar `triggerFallback()` y reemplazarlo por un mensaje de error estilizado (`showPlaybackError()`), pero el cambio rompió la reproducción también en Android. **El cambio fue revertido.**

**Causa de la rotura en Android:** Al eliminar la función `triggerFallback` y la variable exportada `hasFallenBack`, otros módulos que las importaban fallaron. Además, la eliminación completa del flujo de fallback generó efectos secundarios. **Lección aprendida: no tocar las exportaciones ni eliminar funciones, solo modificar el comportamiento interno.**

## 🔬 Investigación de la infraestructura del stream (2 julio 2026)

### Configuración desencriptada del token
```json
{
  "type": "dash",
  "manifest": "https://prope66bd35h.airspace-cdn.cbsivideo.com/out/v1/eb04c8bf15a94f14ad1d952659d422b7/manifest.mpd",
  "keyId": "9afc53e82bb24c20a5835a84138f6c13",
  "key": "abdd52917474f2342ff04f0d4722123a",
  "iframeUrl": "https://latamvidzfy.org/dsports.php"
}
```

### Infraestructura del stream
- **CDN:** CBS/Paramount (`airspace-cdn.cbsivideo.com`) — CDN de DSports
- **Servicio:** AWS MediaPackage (genera endpoints DASH y HLS por separado con hashes diferentes)
- **DRM:** ClearKey + Widevine + PlayReady (triple protección en el manifiesto DASH)
- **Formato:** DASH live stream (`type="dynamic"`) con segmentos de video encriptados

### ¿Se puede obtener la URL HLS (.m3u8)?
**No directamente.** AWS MediaPackage genera endpoints separados para DASH y HLS, cada uno con un hash UUID diferente. No se puede derivar la URL HLS a partir de la URL DASH. Se intentaron variantes comunes (`manifest.m3u8`, `index.m3u8`, `master.m3u8`) y todas devolvieron 404.

Para obtener la URL HLS se necesitaría acceso al panel de AWS MediaPackage del proveedor del stream.

### Análisis del iframe de señal alternativa (`latamvidzfy.org/dsports.php`)
- **Reproductor:** Bitmovin Player v8 (comercial, soporta DASH y HLS automáticamente)
- **Anuncios:** Carga `acscdn.com/script/aclib.js` — **este es el script que genera los pop-ups/anuncios molestos al hacer click**
- **Código ofuscado:** Las URLs del stream están ofuscadas con JavaScript para ocultar las fuentes reales
- **Conclusión:** El iframe funciona en iOS porque Bitmovin negocia HLS automáticamente, pero viene con anuncios invasivos y sin el diseño de Mundial Libre

## 💡 Soluciones posibles (actualizado)

### ✅ Opción recomendada: Condicionar el fallback solo para iOS (SIN anuncios)
- **NO eliminar** `triggerFallback()` ni `hasFallenBack` — mantener las exportaciones intactas
- **Modificar solo `performSwitch()`** dentro de `triggerFallback()` para detectar iOS
- En iOS: mostrar un mensaje estilizado dentro del reproductor (📡 "Señal no disponible en este dispositivo")
- En PC/Android: mantener el comportamiento actual sin cambios
- **Cero anuncios** porque no se carga el iframe ni la página externa
- Detección de iOS:
```javascript
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) 
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
```
- **Riesgo:** Bajo. Solo se modifica el interior de una función existente, sin tocar exportaciones ni interfaces.

### Opción alternativa: Reproductor con HLS nativo para iOS
- Requiere conseguir la URL `.m3u8` del mismo stream de DSports (acceso al panel AWS MediaPackage del proveedor)
- Si se consigue, se puede usar HLS.js + el `<video>` nativo para reproducir en iOS con el mismo diseño
- **Beneficio:** Reproductor funcional en iOS con el diseño de Mundial Libre
- **Bloqueante:** No tenemos la URL HLS

### Opción descartada: Bitmovin Player
- Es el mismo reproductor que usa la señal alternativa
- Es un producto **pago** (licencia comercial)
- No resuelve el problema de anuncios si se sigue usando el iframe

## 📁 Archivos involucrados

- `js/modules/player-shaka.js` — Lógica de Shaka Player y fallback al iframe (`triggerFallback()`)
- `js/modules/security.js` — Desencriptación de configuración (manifest URL, keys, iframeUrl)
- `js/main.js` — Orquestación: pasa `iframeFallback` element a `initPlayer()`
- `index.html` — Contiene el `<iframe id="iframe-fallback">` (línea ~145)

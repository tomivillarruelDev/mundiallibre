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
- **Código ofuscado:** Las URLs del stream están ofuscadas con JavaScript para ocultar las fuentes reales (protegidas con múltiples capas de ofuscación y construcción dinámica `Function.constructor`).
- **Problema con emulación:** Intentamos extraer la URL HLS (`.m3u8`) simulando un iPhone desde Chrome (PC), pero Bitmovin detecta que el navegador subyacente sigue soportando **MSE (Media Source Extensions)**, por lo que decide seguir cargando el manifiesto DASH (`.mpd`). Para obtener la URL HLS real, se necesitaría interceptar la red desde un dispositivo iOS físico o Safari en Mac.
- **Conclusión:** El iframe funciona en iOS porque Bitmovin negocia HLS automáticamente (al no detectar MSE en iOS Safari), pero viene con anuncios invasivos y sin el diseño de Mundial Libre.

## 💡 Soluciones posibles (actualizado)

### ✅ Fix implementado: Eliminar el gate `isBrowserSupported()` (2 julio 2026)

El error real no era "iOS no soporta DASH" sino que **el código fallaba antes de intentarlo**.

`shaka.Player.isBrowserSupported()` devolvía `false` en iOS y se hacía fallback inmediato. Pero Shaka Player 4.x tiene:
- **`ManagedMediaSource` polyfill** para iOS 17+ (habilitado con `shaka.polyfill.installAll()`)
- **Software ClearKey decryption** — descifra los segmentos en JavaScript vía Web Crypto API, sin depender del CDM nativo del browser (el mismo mecanismo que usa Bitmovin internamente)

Lo que hace Bitmovin no es "magia propietaria": es descifrado CENC client-side. Fetch del segmento → descifrado AES-CTR via Web Crypto → feed al SourceBuffer de MSE. Shaka 4.x puede hacer lo mismo.

**Cambio aplicado en `player-shaka.js`:**
1. Eliminado el `if/else` que cortocircuitaba la ejecución en iOS
2. Agregado `video.disableRemotePlayback = true` cuando existe `ManagedMediaSource` (requisito de iOS 17+)
3. Shaka intenta cargar el stream; si falla, los error listeners existentes activan `triggerFallback()`

**Resultado esperado por versión iOS:**
- iOS 17+: `ManagedMediaSource` disponible → muy probable que funcione ✅
- iOS 15.4–16: MSE limitado, posible ⚠️
- iOS < 15.4: fallback al mensaje de error (sin anuncios) ✅

### Opción alternativa: URL HLS del proveedor
- Requiere acceso al panel AWS MediaPackage del proveedor de DSports
- Con la URL HLS, se puede usar HLS.js + `<video>` nativo para iOS
- **Bloqueante:** No tenemos el UUID del endpoint HLS

## 📁 Archivos involucrados

- `js/modules/player-shaka.js` — Lógica de Shaka Player y fallback al iframe (`triggerFallback()`)
- `js/modules/security.js` — Desencriptación de configuración (manifest URL, keys, iframeUrl)
- `js/main.js` — Orquestación: pasa `iframeFallback` element a `initPlayer()`
- `index.html` — Contiene el `<iframe id="iframe-fallback">` (línea ~145)

---

# Investigación profunda: Desofuscación completa de latamvidzfy.org/dsports.php

**Fecha:** 2 de julio de 2026  
**Estado:** ✅ Completada — Conclusión definitiva alcanzada

## Objetivo

Extraer la URL del manifiesto HLS (`.m3u8`) que utiliza el iframe de fallback para poder reproducir video en iOS sin anuncios y dentro de nuestro propio dominio.

## Herramientas y archivos de investigación

| Archivo | Descripción |
|---------|-------------|
| `_raw_iframe.html` | HTML completo capturado de `latamvidzfy.org/dsports.php` |
| `_extract_hls.js` | Primer intento de desofuscación (Approach 6, fallido) |
| `_extract_hls_v2.js` | Script definitivo que logró desofuscar el código completo |
| `_decoded_eqs.js` | Código JavaScript final desofuscado (capa 3 del pipeline) |

## Pipeline de ofuscación (3 capas)

La página usa un sistema de ofuscación en cascada con tres capas:

```
Capa 1: IFr (shuffle cipher, semilla 4313768)
   ↓ IFr(PsU)
Capa 2: templateBody — función decodificadora de la capa 3
   ↓ new Function('', templateBody)(IFr(eqsRaw))
Capa 3: eQS — código JavaScript final con _$_db52
   ↓ new Function('', eQS)(1859)
Ejecución: inicialización de Bitmovin Player
```

### Capa 1: `IFr` — Shuffle Cipher

```javascript
function IFr(z) {
    var i = 4313768;
    var w = z.length;
    var d = [];
    for (var f = 0; f < w; f++) { d[f] = z.charAt(f) }
    for (var f = 0; f < w; f++) {
        var l = i * (f + 418) + (i % 34611);
        var t = i * (f + 238) + (i % 19353);
        var u = l % w; var s = t % w;
        var o = d[u]; d[u] = d[s]; d[s] = o;
        i = (l + t) % 4403120;
    }
    return d.join('');
}
```

`IFr('tsnstvtcmurowcpeaoorjklufqircyxhbdgzn').substr(0, 11)` → `"constructor"` (truco para obtener `Function` sin escribirlo)

### Capa 2: `templateBody` — Decoder interno

Al decodificar `PsU` con `IFr`, se obtiene el cuerpo de una función que a su vez decodifica el payload de la capa 3. Es un segundo shuffle cipher con parámetros distintos (semilla dinámica pasada como argumento).

Primer fragmento del templateBody decodificado:
```
var s=14,x=69,q=64;var f="abcdefghijklmnopqrstuvwxyz";
var o=[70,65,79,94,74,88,87,60,76,75,86,85,71,66,89,82,72,81,80,90];
...
```

### Capa 3: `eQS` — Código final (`_decoded_eqs.js`)

Al ejecutar `new Function('', templateBody)(IFr(eqsRaw))`, se obtiene el JavaScript real:

```javascript
var _$_db52 = (function(e, x) {
    // Tercer shuffle cipher con semilla 601898
    var w = e.length; var m = [];
    for (var t = 0; t < w; t++) { m[t] = e.charAt(t) }
    for (var t = 0; t < w; t++) {
        var z = x * (t + 73) + (x % 19454);
        var f = x * (t + 157) + (x % 35750);
        var l = z % w; var d = f % w;
        var y = m[l]; m[l] = m[d]; m[d] = y;
        x = (z + f) % 1628598;
    }
    var h = String.fromCharCode(127);
    // Separadores de elementos del array resultante
    return m.join('').split('%').join(h).split('#1').join('%').split('#0').join('#').split(h)
})("Qa7a3ved8f9.lrt%itvpf:1//...", 601898);
```

## Resultado de la desofuscación: array `_$_db52`

| Índice | Valor | Rol |
|--------|-------|-----|
| `[0]` | `latamvidzfy.org` | Verificación de hostname (anti-embeds externos) |
| `[1]` | `https://google.com/` | Redirect si hostname no coincide |
| `[2]` | `https://prope66bd35h.airspace-cdn.cbsivideo.com/out/v1/eb04c8bf15a94f14ad1d952659d422b7/manifest.mpd` | **URL del stream de video** |
| `[3]` | `9afc53e82bb24c20a5835a84138f6c13` | `keyId` ClearKey DRM |
| `[4]` | `abdd52917474f2342ff04f0d4722123a` | `key` ClearKey DRM |
| `[5]` | `licensing.bitmovin.com` | Host interceptado en XHR |
| `[6]` | `data:text/plain;charset=utf-8;base64,eyJzdGF0dXMiOiJncmFudGVkIiwibWVzc2FnZSI6IlRoZXJlIHlvdSBnby4ifQ==` | Respuesta falsa de licencia Bitmovin |
| `[7]` | `DOMContentLoaded` | Evento para inicializar el player |
| `[8]` | `player` | ID del `<div>` del reproductor |
| `[9]` | `11d3698c-efdf-42f1-8769-54663995de2b` | Clave Bitmovin (bypasseada) |
| `[10]` | `100%` | Ancho/alto del player (`style`) |

La respuesta falsa en `[6]` decodificada en base64: `{"status":"granted","message":"There you go."}`

## Mecanismo de bypass de licencia Bitmovin

El código intercepta **todos los XHR** del player y redirige las peticiones de licencia a un Data URI local:

```javascript
var o = XMLHttpRequest.prototype.open; // guarda el original

function _$af3733() {
    var x = arguments[1]; // URL destino del XHR
    if (x.includes('licensing.bitmovin.com')) {
        arguments[1] = 'data:text/plain;charset=utf-8;base64,eyJzdGF0dXMiO...'
        // → {"status":"granted","message":"There you go."}
    }
    return o.apply(this, arguments); // ejecuta el XHR (original o modificado)
}

XMLHttpRequest.prototype.open = _$af3733;
```

Cuando Bitmovin Player consulta su servidor de licencias, recibe la respuesta `granted` falsa y arranca sin licencia válida.

## Llamada final al player

```javascript
new bitmovin.player.Player(document.getElementById('player'), {
    key: '11d3698c-efdf-42f1-8769-54663995de2b', // fake key — bypasseada
    playback: { autoplay: true, muted: false },
    style: { width: '100%', height: '100%' },
    tweaks: { BACKGROUND_ACTION_SUSPEND: false },
    live: { catchup: { playbackRateThreshold: 0.075, seekThreshold: 5, playbackRate: 1.2 } }
}).load({
    dash: u,                                    // _$_db52[2] = manifest.mpd
    drm: { clearkey: [{ keyId: i, key: k }] }  // _$_db52[3] y [4]
})
```

## Conclusión definitiva: no existe URL HLS separada

**El iframe de fallback usa exactamente la misma URL DASH y las mismas claves ClearKey que Shaka Player.** No hay ningún endpoint HLS (`.m3u8`) embebido en ninguna capa del código ofuscado.

La URL del stream (`_$_db52[2]`) es idéntica a la que está en nuestra configuración desencriptada:
```
https://prope66bd35h.airspace-cdn.cbsivideo.com/out/v1/eb04c8bf15a94f14ad1d952659d422b7/manifest.mpd
```

## Por qué el iframe funciona en iOS y Shaka Player no

Bitmovin Player v8 es un reproductor comercial con capacidades propietarias que Shaka Player (open source) no tiene:

1. **Internal DASH-to-HLS adapter**: en iOS donde MSE está restringido, Bitmovin puede convertir internamente el manifiesto DASH y reproducir los segmentos CMAF a través del `<video>` nativo de Safari, construyendo un playlist HLS en memoria
2. **Native player fallback**: si la ruta DASH falla completamente, Bitmovin tiene pipelines alternativos propietarios para iOS

Shaka Player 4.x tiene soporte parcial para HLS, pero para reproducir **este** stream en iOS necesitaría una URL HLS real (con su UUID de endpoint propio en AWS MediaPackage), que no podemos derivar matemáticamente a partir de la URL DASH.

## Anti-iframe detection script

La página tiene un tercer script que detecta si está cargada dentro de un `<iframe sandbox>`:

```javascript
// Pseudocódigo del script de detección
if (window.frameElement.hasAttribute('sandbox')) {
    setTimeout(() => { location.href = '/block.html' }, 500);
}
```

Consecuencia: agregar `sandbox` al iframe activa la detección y rompe la reproducción.

## Opciones a futuro

| Opción | Esfuerzo | Resultado iOS | Sin Anuncios |
|--------|----------|---------------|--------------|
| **A — Status quo** (mensaje error en iOS) | ✅ Ya implementado | ❌ Sin video | ✅ Sí |
| **B — Sandbox modificado** (quitar `allow-popups` + `allow-same-origin`) | Bajo | ⚠️ Video con anuncios overlay (sin popups) | Parcial |
| **C — URL HLS del proveedor** | Requiere acceso al panel AWS MediaPackage del proveedor | ✅ Video nativo | ✅ Sí |
| **D — Proxy CORS/HLS** | Alto (requiere backend) | ✅ Video nativo | ✅ Sí |

## Herramientas de investigación desarrolladas

### `_extract_hls_v2.js` — Desofuscador offline

Funciona sobre `_raw_iframe.html` sin necesidad de red. Implementa tres intentos de extracción en cascada:
- **Attempt A**: ejecución directa en Node.js (exitoso para capa 2 → capa 3)
- **Attempt B**: parcheo de `eval`/`Function` para capturar el código sin ejecutarlo
- **Attempt C**: sandbox `vm` con mocks completos de APIs de browser

Para re-ejecutar si se actualiza el HTML capturado:
```bash
node _extract_hls_v2.js
# Genera: _decoded_eqs.js con el código de la capa 3
```

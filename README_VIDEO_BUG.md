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

**Hipótesis inicial (incorrecta):** Bitmovin convierte DASH → HLS internamente.

**Conclusión real (confirmada):** Bitmovin hace **descifrado CENC por software** igual que lo que implementamos nosotros. No hay una URL HLS separada ni conversión de formato. Lo que hacía falta no era un endpoint HLS sino implementar el descifrado AES-CTR en JavaScript, bypasseando el CDM del browser.

## Anti-iframe detection script

La página tiene un tercer script que detecta si está cargada dentro de un `<iframe sandbox>`:

```javascript
// Pseudocódigo del script de detección
if (window.frameElement.hasAttribute('sandbox')) {
    setTimeout(() => { location.href = '/block.html' }, 500);
}
```

Consecuencia: agregar `sandbox` al iframe activa la detección y rompe la reproducción.

---

# Implementación: Software CENC AES-CTR para iOS

**Estado:** ✅ Resuelto y en producción  
**Fecha de implementación:** 2 de julio de 2026  
**Commit clave:** `112a39c`

## Causa raíz del problema

El stream usa el esquema de encriptación **CENC con AES-128-CTR** (indicado como `value="cenc"` en el manifiesto DASH). El CDM nativo de iOS Safari solo soporta **AES-128-CBC** (esquema `cbcs`). Resultado: el CDM falla silenciosamente, el video decodifica frames negros, sin audio.

```
Stream:   CENC AES-128-CTR  (value="cenc" en el manifiesto)
iOS CDM:  solo soporta cbcs AES-128-CBC
Resultado: pantalla negra + sin audio (no hay error explícito)
```

Esto es idéntico a lo que hace Bitmovin internamente en su SDK propietario: bypassear el CDM y descifrar con Web Crypto API.

## Solución: descifrado por software con Shaka response filters

Implementada en dos archivos nuevos/modificados:

### Arquitectura de la solución

```
DASH Manifest
    ↓ Shaka fetches
[Filter 1] Strip <ContentProtection> elements
    ↓ Shaka parses (no DRM setup)
Init Segment (.mp4 con encv/enca)
    ↓ Shaka fetches
[Filter 2] transformInitSegment():
    pssh → free   (elimina DRM init data)
    encv → avc1   (video: encrypted → clear sample entry)
    enca → mp4a   (audio: encrypted → clear sample entry)
    sinf → free   (elimina scheme info — ver Bug crítico #1)
    ↓ MSE acepta el stream como video claro (sin CDM)
Media Segments (.mp4 con moof+mdat encriptado)
    ↓ Shaka fetches
[Filter 2] decryptMediaSegment():
    Parsear moof→traf→senc (IVs + subsample info por sample)
    Parsear moof→traf→trun (tamaños por sample)
    Para cada sample: AES-CTR decrypt via crypto.subtle
    ↓ MSE recibe mdat descifrado
Video element decodifica y reproduce normalmente ✅
```

### Shaka Player 5.0.5 (requerido)

Se actualizó de Shaka 4.3.5 a 5.0.5. La versión 5 tiene el polyfill de `ManagedMediaSource` para iOS 17+ que es necesario para que MSE funcione.

Prerequisito adicional en `player-shaka.js`:
```javascript
if (window.ManagedMediaSource) {
    video.disableRemotePlayback = true; // requisito de iOS 17+ para ManagedMediaSource
}
```

## CENC AES-CTR: especificación del counter

```
Counter block (128 bits):
┌─────────────────────────┬──────────────────────────────────┐
│  IV (8 bytes, MSB)      │  Block counter (8 bytes, big-endian) │
└─────────────────────────┴──────────────────────────────────┘

Web Crypto: { name: 'AES-CTR', counter: Uint8Array(16), length: 64 }
  length: 64 → los 64 bits más a la derecha son el contador (bytes 8-15)
  Coincide exactamente con el spec CENC para IVs de 8 bytes.
```

Reglas del counter por sample:
- El counter **se resetea** al principio de cada sample (nuevo IV del senc box)
- El counter **NO se resetea** entre subsamples del mismo sample
- El counter avanza `ceil(encBytes / 16)` bloques por cada subsample encriptado

## Estructura de los segmentos fMP4 de AWS MediaPackage

### Init segment
```
ftyp (file type box)
moov
  trak (video)
    mdia → minf → stbl → stsd
      encv (video encrypted sample entry)
        [VisualSampleEntry: 6+2+70 = 78 bytes de campos fijos]
        avcC (AVC decoder config)
        sinf (scheme info — contiene tenc con IV size y KID)
  trak (audio)
    mdia → minf → stbl → stsd
      enca (audio encrypted sample entry)
        [AudioSampleEntry: 6+2+8+2+2+2+2+4 = 28 bytes de campos fijos]
        mp4a / esds (audio decoder config)
        sinf
  pssh (DRM init data para Widevine/PlayReady)
```

### Media segment (video, con subsample encryption)
```
moof
  traf
    tfhd (default sample info)
    trun (per-sample durations, sizes, flags)
    senc (encryption info: IV + subsample structure por sample)
      sample[i]:
        IV (8 bytes)
        subsample_count (2 bytes)
        subsample[j]:
          clearBytes (2 bytes) — bytes de NAL header sin encriptar
          encBytes   (4 bytes) — bytes de NAL body encriptados
mdat (datos reales, mix de clearBytes + encBytes intercalados)
```

### Media segment (audio, full-sample encryption)
```
moof
  traf
    tfhd
    trun (per-sample sizes)
    senc
      sample[i]:
        IV (8 bytes)
        (sin subsample structure — todo el sample está encriptado)
mdat (samples AAC encriptados contiguamente)
```

## Archivos implementados

### `js/modules/ios-cenc-decryptor.js` (nuevo)

| Función | Rol |
|---------|-----|
| `transformInitSegment(data)` | Parchea el init segment in-place para que MSE lo trate como stream claro |
| `decryptMediaSegment(data, cryptoKey)` | Descifra el mdat de cada media segment via Web Crypto AES-CTR |
| `buildCTRCounter(iv, blockCount)` | Construye el counter de 128 bits para AES-CTR según spec CENC |
| `parseSENC(b, box)` | Parsea el senc box: IVs y subsample structure por sample |
| `parseTRUN(b, box)` | Parsea el trun box: tamaños por sample para audio full-sample |
| `parseTFHD(b, box)` | Parsea el tfhd box: default_sample_size como fallback para audio |
| `createIOSDecryptor(keyHex)` | Factory: importa la AES key via Web Crypto y retorna `{transformInit, decryptMedia}` |

### `js/modules/player-shaka.js` (modificado)

- Rama iOS separada que registra dos response filters en el NetworkingEngine de Shaka
- Detección de init segment por tipo de box (`ftyp`/`moov`) en vez de URI — más confiable
- Sin `clearKeys` en la configuración — el CDM nunca se invoca

## Bugs encontrados y corregidos durante el debug

### Bug crítico #1: Offset incorrecto de sinf en encv (causa del black screen)

**Síntoma:** Video negro + sin audio. Player mostraba controles y el indicador LIVE, pero sin contenido.

**Causa:** En `transformInitSegment`, el search de `sinf` dentro de `encv` empezaba en `ep + 44` (offset incorrecto). `walk()` llegaba a esa posición dentro de los datos binarios de `VisualSampleEntry` (todos bytes en cero del campo `reserved`), leía `size = 0`, y cortaba inmediatamente sin encontrar `sinf`.

```
encv box layout:
  ep+0  ..7  : box header (size 4B + type 4B)
  ep+8  ..15 : SampleEntry (6B reserved + 2B data_reference_index)
  ep+16 ..85 : VisualSampleEntry fields (70 bytes)
               ← ep+44 apuntaba AQUÍ (en medio de los campos binarios)
  ep+86 ..   : inner boxes (avcC, sinf, ...)  ← CORRECTO

Código anterior: patchSinf(b2, ep + 8 + 36, ep + es)  ← ep + 44 (INCORRECTO)
Código corregido: patchSinf(b2, ep + 86, ep + es)      ← ep + 86 (CORRECTO)
```

**Consecuencia del bug:** `sinf` quedaba intacto dentro del box renombrado de `encv` a `avc1`. iOS ManagedMediaSource (a diferencia de Chrome/Firefox en desktop) sí inspecciona el `sinf` dentro de `avc1` y trata de invocar el CDM. Como no hay CDM configurado, el decode falla silenciosamente.

**Fix:**
```javascript
// ANTES (incorrecto):
// encv visual fields: 6 reserved + 2 data-ref-idx + 28 visual = 36 bytes after header
patchSinf(b2, ep + 8 + 36, ep + es);

// DESPUÉS (correcto):
// encv: box-hdr(8) + SampleEntry(6+2=8) + VisualSampleEntry(70) = 86 bytes before inner boxes
patchSinf(b2, ep + 86, ep + es);
```

Nota: el offset de `enca` (`ep + 36`) SÍ era correcto porque AudioSampleEntry tiene solo 8+2+2+2+2+4 = 20 bytes de campos, total 8+8+20 = 36.

### Bug #2: IV_SIZE hardcodeado a 8

**Causa:** El CENC spec permite IVs de 8 o 16 bytes. El código asumía siempre 8.

**Fix:** IV_SIZE se infiere del tamaño del senc box cuando no hay subsamples:
```javascript
// dataBytes = box.size - boxHdr(8) - fullboxHdr(4) - sampleCount(4)
const inferred = Math.floor((box.size - 16) / sampleCount); // 8 o 16
if (inferred === 16) IV_SIZE = 16;
```

Para este stream AWS MediaPackage confirmado: IV_SIZE = 8 (`senc geometry: box=2272B, 282 samples → IV_SIZE=8`).

### Bug #3: Sin fallback para default_sample_size en audio

**Causa:** Si `trun` no tiene el flag `sample_size_present` (0x200), `parseTRUN` devuelve todos los tamaños en 0, y el descifrado de audio se saltea completamente.

**Fix:** Se agrega `parseTFHD()` que extrae `default_sample_size` de `tfhd`, y se usa como fallback:
```javascript
const sampleSize = trunSizes[si] || tfhdDefaultSize;
```

### Bug #4: Detección de init segment por URI

**Causa:** El filtro original detectaba init segments chequeando si la URI incluía `_init.mp4`. Esto es frágil si AWS MediaPackage cambia el naming.

**Fix:** Detección por tipo del primer box MP4:
```javascript
const firstBox = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
const isInit = firstBox === 'ftyp' || firstBox === 'moov';
```

## Proceso de debug en iOS (sin DevTools)

Para diagnosticar en iOS sin acceso a consola, se agregó un **panel de debug visible en pantalla** (overlay verde en la parte superior del reproductor):

```javascript
// panel temporal — removido en producción tras confirmar fix
const dbgPanel = Object.assign(document.createElement('div'), {
    style: 'position:fixed;top:0;...color:#0f0;font:9px monospace;z-index:99999;'
});
window.__iosLog = (msg) => { /* append to panel */ };
```

El panel se inyectaba en el módulo `player-shaka.js` durante la rama iOS, y el módulo `ios-cenc-decryptor.js` escribía en él via `window.__iosLog`. Se removió en producción una vez confirmado el fix.

### Logs del debug que confirmaron el fix

```
20:16:03 init: encv→avc1, sinf patched at ep+86     ← sinf ahora encontrado
20:16:03 init: enca→mp4a, sinf patched at ep+36     ← audio también OK
20:16:04 senc geometry: box=2272B, 282 samples → IV_SIZE=8   ← IV_SIZE confirmado
20:16:04 senc: 282s | IV0=4000000000054fda | sub=false | trun[0]=321 | tfhdSz=0
20:16:08 senc: 360s | IV0=0000000000054fdb | sub=true  | trun[0]=170338
```

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

---

# Estabilidad del player en iOS: errores falsos de "Señal no disponible"

**Estado:** ✅ Resuelto y en producción  
**Fecha:** 2 de julio de 2026  
**Commits:** `e97d032`, `41474ca`, `3da5ab9`, `4087915`, `7d5239f`

## El problema

Después de que el stream iOS con descifrado CENC por software funcionó, aparecieron múltiples escenarios donde el mensaje de error "Señal no disponible en este dispositivo" se disparaba sin que el stream estuviera realmente muerto. Todos eran **falsos positivos**: eventos de error transitorios propios del ciclo de vida de iOS Safari + ManagedMediaSource.

## Escenarios identificados y sus causas

### 1. Rotación del dispositivo en fullscreen nativo

**Síntoma:** Al rotar el iPhone estando en pantalla completa (fullscreen nativo de iOS via `webkitEnterFullscreen()`), aparecía el error al terminar de rotar.

**Causa:** iOS Safari delega el control del video al sistema operativo durante el fullscreen nativo. Mientras el sistema rota la pantalla, el pipeline ManagedMediaSource recibe interrupciones que Shaka interpreta como errores CRITICAL. Estos errores son transitorios y el reproductor nativo los resuelve solo.

**Detección:** `video.webkitDisplayingFullscreen` es `true` mientras el video está en fullscreen nativo.

**Fix:** La función `suppressFallback()` retorna `true` (no hacer fallback) mientras `video.webkitDisplayingFullscreen` sea verdadero.

### 2. Salida del fullscreen nativo

**Síntoma:** Después de salir del fullscreen (tapping "Listo" o swipe down), aparecía el error en los siguientes segundos.

**Causa:** Al salir del fullscreen nativo, `webkitDisplayingFullscreen` pasa a `false` inmediatamente, pero ManagedMediaSource necesita 1-2 segundos para re-estabilizar su pipeline. Shaka puede disparar errores CRITICAL durante esa ventana de transición.

**Detección:** El evento `webkitendfullscreen` en el elemento `<video>` se dispara al salir del fullscreen nativo.

**Fix:** Al recibir `webkitendfullscreen`, se activa `postFullscreenGrace = true` durante 3 segundos.

### 3. Scroll (video sale del viewport)

**Síntoma:** Al scrollear hacia abajo para ver los marcadores o el scoreboard, el stream se cortaba y aparecía el error.

**Causa:** iOS Safari suspende o interrumpe el pipeline ManagedMediaSource cuando el elemento `<video>` sale del viewport durante el scroll. Shaka detecta la interrupción como un error CRITICAL.

**Detección:** Evento `scroll` en `window`.

**Fix:** Al recibir cualquier evento `scroll`, se activa `scrollGrace = true`. El flag se desactiva 2 segundos después del último evento scroll.

### 4. Cambio de app / bloqueo de pantalla

**Síntoma:** Al cambiar a otra app (o recibir una notificación que minimiza Safari) y volver, aparecía el error.

**Causa:** Cuando la pestaña pasa a `document.visibilityState = 'hidden'`, iOS suspende ManagedMediaSource. Al volver (`visibilityState = 'visible'`), el pipeline reanuda pero puede disparar errores CRITICAL durante la reanudación.

**Detección:** Evento `visibilitychange` en `document`.

**Fix:** Al detectar transición a `'visible'`, se activa `visibilityGrace = true` durante 3 segundos.

### 5. Click rápido al cargar la página

**Síntoma:** Al cargar la página y clickear play antes de que Shaka terminara de cargar el manifest, aparecía el error.

**Causa:** `setupUIControls` se registra antes que `initPlayer` corra (hay un `setTimeout` de 250ms en `main.js`). Si el usuario clickea el player container durante la carga, `video.play()` se invoca antes de que Shaka haya conectado su pipeline, lo que puede causar errores.

**Fix:** Se exporta la flag `shakaReady` desde `player-shaka.js`. Se setea a `true` solo después de que `shakaPlayer.load()` resuelve exitosamente. En `ui-controls.js`, `togglePlay()` retorna inmediatamente si `!shakaReady`.

### 6. Click rápido repetitivo (play/pause rápido)

**Síntoma:** Hacer tap rápidamente varias veces sobre el player disparaba el error.

**Causa:** El evento `MEDIA_ERR_ABORTED` (código 1 de `MediaError`) se dispara en el elemento `<video>` cuando se llama `play()` y luego `pause()` antes de que el frame anterior se reproduzca. Esto es normal e interno, no indica fallo del stream.

**Fix (doble):**
- El video error listener ignora `video.error.code === 1` (`MEDIA_ERR_ABORTED`).
- `togglePlay()` tiene un lock de 300ms: una vez ejecutado, ignora nuevos clicks durante 300ms.

### 7. Botón de fullscreen roto en iOS

**Síntoma:** El botón de fullscreen no hacía nada en iOS.

**Causa:** `playerContainer.requestFullscreen()` no existe en iOS Safari. La API estándar de fullscreen no funciona sobre elementos `<div>` en iOS; solo existe en el elemento `<video>` con la API propietaria de WebKit.

**Fix:** Para iOS, `toggleFullscreen()` llama directamente a `video.webkitEnterFullscreen()`.

### 8. Errores RECOVERABLE de Shaka tratados como fatales

**Síntoma:** Errores de red transitorios (timeout de un segmento, retry interno de Shaka) disparaban el fallback.

**Causa:** El listener del evento `'error'` de Shaka Player disparaba `triggerFallback()` ante cualquier error, sin discriminar la severidad. Shaka clasifica sus errores en `RECOVERABLE` (severidad 1, Shaka los reintenta solo) y `CRITICAL` (severidad 2, no hay recuperación posible).

**Fix:** Solo se llama a `triggerFallback()` cuando `event.detail.severity === 2`.

### 9. Seek no funcionaba en iOS (touch)

**Síntoma:** La barra de progreso no respondía al touch en iOS.

**Causa:** Los event listeners de seek estaban implementados solo con `mousedown`/`mousemove`/`mouseup`. En iOS no existen eventos de mouse; se usan eventos táctiles (`touchstart`/`touchmove`/`touchend`).

**Fix:** Se agregaron listeners táctiles paralelos a los de mouse, con `e.preventDefault()` para evitar scroll accidental mientras se arrastra la barra.

## Arquitectura final de `suppressFallback()`

```javascript
// player-shaka.js — dentro de initPlayer()

let postFullscreenGrace = false;
video.addEventListener('webkitendfullscreen', () => {
    postFullscreenGrace = true;
    setTimeout(() => { postFullscreenGrace = false; }, 3000);
});

let scrollGrace = false;
let scrollGraceTimer = null;
window.addEventListener('scroll', () => {
    scrollGrace = true;
    clearTimeout(scrollGraceTimer);
    scrollGraceTimer = setTimeout(() => { scrollGrace = false; }, 2000);
}, { passive: true });

let visibilityGrace = false;
let visibilityGraceTimer = null;
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        visibilityGrace = true;
        clearTimeout(visibilityGraceTimer);
        visibilityGraceTimer = setTimeout(() => { visibilityGrace = false; }, 3000);
    }
});

const suppressFallback = () =>
    !!video.webkitDisplayingFullscreen  // en fullscreen nativo iOS
    || postFullscreenGrace              // 3s tras salir de fullscreen
    || scrollGrace                      // 2s tras cualquier scroll
    || visibilityGrace;                 // 3s tras volver de background
```

## Tabla de decisión: cuándo se activa el fallback

| Error | ¿Se activa fallback? | Razón |
|---|---|---|
| Shaka RECOVERABLE (severity=1) | ❌ No | Shaka lo resuelve solo |
| Shaka CRITICAL en fullscreen nativo | ❌ No | `webkitDisplayingFullscreen = true` |
| Shaka CRITICAL al salir de fullscreen | ❌ No | `postFullscreenGrace` (3s) |
| Shaka CRITICAL al scrollear | ❌ No | `scrollGrace` (2s) |
| Shaka CRITICAL al volver de otra app | ❌ No | `visibilityGrace` (3s) |
| `MEDIA_ERR_ABORTED` (play/pause rápido) | ❌ No | Excluido explícitamente (code 1) |
| Click antes de que Shaka cargue | ❌ No | `!shakaReady` bloquea togglePlay |
| Stream genuinamente muerto | ✅ Sí | Error CRITICAL fuera de toda grace period |
| Config decryption fail | ✅ Sí | `instant=true`, error de arranque |
| `shakaPlayer.load()` rechaza | ✅ Sí | Manifiesto inalcanzable, error de arranque |

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `js/modules/player-shaka.js` | `suppressFallback()` con 4 grace periods; filtro por `severity === 2`; `shakaReady = true` post-load; `postFullscreenGrace` via `webkitendfullscreen` |
| `js/modules/ui-controls.js` | `togglePlay` gated con `shakaReady`; debounce 300ms; `webkitEnterFullscreen` para iOS; touch listeners para seek |

---

# Investigación: Loop de recargas y "Señal no disponible" persistente en iOS

**Estado:** ✅ Fix aplicado  
**Fecha:** 2 de julio de 2026

## El problema

Tras resolver los falsos positivos con `suppressFallback()`, el player seguía cortando durante uso normal (scroll, tocar controles, pantalla completa). Los logs del panel de debug mostraban un loop:

```
[video] stalled paused=false readyState=3
[video] emptied paused=false readyState=0       ← ManagedMediaSource destruido
[reload] emptied #1 — esperando fin de toque
[reload] shakaPlayer.load()...
[reload] OK — grace 5s
[video] error code=3                             ← MEDIA_ERR_DECODE inmediato
[shaka] code=3016 sev=2 suppress=true
[reload] emptied #2 — esperando fin de toque
[reload] shakaPlayer.load()...
[reload] OK — grace 5s
[video] error code=3                             ← loop
[reload] emptied #3...
[reload] max intentos alcanzado — fallback       ← "Señal no disponible"
```

## Causa raíz identificada

**`video.play()` llamado sobre `readyState=0`.** 

Después de `shakaPlayer.load()`, el pipeline de ManagedMediaSource necesita tiempo para bufferear los primeros frames. En ese período, `readyState` es todavía `0` (HAVE_NOTHING — sin source attached). Llamar `video.play()` sobre `readyState=0` en iOS dispara `MEDIA_ERR_DECODE` (code=3), que a su vez dispara un nuevo evento `emptied`, que activa de nuevo el listener de recarga.

```
shakaPlayer.load() → ok (pipeline iniciando, readyState=0)
video.play()        → MEDIA_ERR_DECODE code=3 (no hay frames todavía)
video 'error' code=3 → 'emptied' → reload #2 → play() → code=3 → loop
```

Con tres intentos de reload fallidos (por el limit `reloadAttempts >= 3`) el fallback se activaba.

## Evidencia del debug log que reveló la causa

En el log de la sesión de las 21:33, el `emptied` inicial (21:33:05) se resolvió a `readyState=4` **sin que nuestro listener disparara** — porque en ese momento `shakaReady` era `false` (Shaka todavía estaba en su propio `load()` inicial). Esto confirmó que Shaka tiene capacidad de auto-recuperarse en algunos escenarios, pero que nuestro listener de `emptied` estaba interfiriendo con esa recuperación al llamar `play()` prematuramente.

## Investigación de ManagedMediaSource

Se investigaron las siguientes fuentes:

### Arquitectura de ManagedMediaSource (Apple / Bitmovin)

ManagedMediaSource (iOS 17+) es un reemplazo de MediaSource con tres eventos adicionales:

| Evento | Significado |
|--------|-------------|
| `startstreaming` | iOS autoriza descargar datos de red |
| `endstreaming` | iOS pide frenar las descargas (batería/memoria) |
| `qualitychange` | iOS sugiere una calidad preferida |

Shaka Player 5.x registra estos eventos internamente:
```javascript
// Shaka lib/media/media_source_engine.js
this.eventManager_.listen(mediaSource, 'startstreaming', () => {
    this.streamingAllowed_ = true;
});
this.eventManager_.listen(mediaSource, 'endstreaming', () => {
    this.streamingAllowed_ = false;
});
```

La flag `streamingAllowed_` controla si Shaka continúa buffereando segmentos. Esto significa que iOS puede ordenarle a Shaka que pause las descargas sin destruir el pipeline.

### ¿Por qué se dispara `emptied` durante scroll?

Cuando iOS interrumpe ManagedMediaSource por scroll/background:
- Escenario leve: `endstreaming` → Shaka pausa descargas → `startstreaming` → Shaka reanuda. El stream se recupera solo.
- Escenario severo (más común): iOS destruye completamente la sesión de ManagedMediaSource → video dispara `emptied` → `readyState=0` → Shaka queda en estado de error sin source.

Nuestros logs siempre mostraban `readyState=0` tras `emptied`, lo que indica el escenario severo.

### ¿Por qué `retryStreaming()` no es suficiente?

`retryStreaming()` limpia el estado de error de Shaka y reanuda el buffering, pero **requiere que el MediaSource siga abierto**. Si `readyState=0` (HAVE_NOTHING), no hay source — `retryStreaming()` no puede re-adjuntar el pipeline. Se necesita un `shakaPlayer.load()` completo para reconstruirlo desde cero.

### ¿Por qué el video nativo de iOS no es una alternativa?

Investigado y descartado. El stream es DASH (`.mpd`) con CENC AES-128-CTR. iOS Safari:
- No soporta DASH nativamente (solo HLS)
- Su CDM nativo solo soporta AES-128-CBC (cbcs), no AES-128-CTR (cenc)
- No existe un endpoint HLS alternativo (confirmado por desofuscación del iframe)

La única vía es Shaka + descifrado por software, igual que hace Bitmovin en el iframe.

## Fix aplicado

Tres cambios coordinados en `player-shaka.js`:

### 1. `emptied` listener: `canplay` en lugar de `play()` inmediato

```javascript
// ANTES (causa del loop):
await shakaPlayer.load(activeConfig.manifest);
video.play().catch(() => {}); // ← play() sobre readyState=0 → code=3 → loop

// DESPUÉS (fix):
await shakaPlayer.load(activeConfig.manifest);
// 'canplay' solo dispara cuando readyState >= 3 (el browser tiene frames para reproducir)
video.addEventListener('canplay', () => { video.play().catch(() => {}); }, { once: true });
```

También se restableció el timing original de 300ms + polling `scrollGrace` (una versión intermedia usaba 8 segundos de espera, lo que producía 8s de pantalla negra sin mejorar la lógica — fue revertido).

### 2. Shaka error listener: no llamar `retryStreaming()` si ya hay un reload en curso

```javascript
shakaPlayer.addEventListener('error', (event) => {
    // ...
    if (reloadInProgress) return; // ← nuevo: evita dos mecanismos de recuperación en paralelo

    if (sup) {
        setTimeout(() => {
            if (!hasFallenBack && !reloadInProgress) shakaPlayer.retryStreaming();
        }, 800);
    } else {
        triggerFallback(...);
    }
});
```

Sin este check, el listener de `emptied` llamaba `load()` mientras simultáneamente el error listener llamaba `retryStreaming()` — dos mecanismos de recuperación conflictivos sobre la misma instancia de Shaka.

### 3. Video error listener: no llamar `play()` si `readyState=0`

```javascript
video.addEventListener('error', () => {
    // ...
    if (reloadInProgress) return; // ya lo está manejando el listener de 'emptied'

    if (suppressFallback()) {
        if (video.readyState > 0) {
            // Solo intentar play() si el pipeline tiene data
            setTimeout(() => {
                if (!hasFallenBack && video.paused) video.play().catch(() => {});
            }, 800);
        }
        // Si readyState=0: el listener de 'emptied' maneja el reload
    } else {
        triggerFallback(...);
    }
});
```

## Tabla actualizada de decisión

| Error | readyState | `suppressFallback()` | `reloadInProgress` | Acción |
|-------|-----------|---------------------|--------------------|--------|
| Shaka CRITICAL | 0 | — | false | `emptied` listener maneja el reload |
| Shaka CRITICAL | 0 | — | true | Ignorado (ya en proceso) |
| Shaka CRITICAL | >0 | true | false | `retryStreaming()` tras 800ms |
| Shaka CRITICAL | >0 | false | false | `triggerFallback()` |
| `video.error` code=3 | 0 | — | true | Ignorado (reload en proceso) |
| `video.error` code=3 | >0 | true | false | `play()` tras 800ms |
| `video.error` code=1 | — | — | — | Ignorado (MEDIA_ERR_ABORTED, play/pause rápido) |
| 3 reloads fallidos | — | — | — | `triggerFallback()` definitivo |

## Fuentes consultadas

- [Bitmovin — Apple's new Managed Media Source: Everything you need to know](https://bitmovin.com/blog/managed-media-source/)
- [Shaka Player GitHub — Issue #5271: Support through Managed MSE](https://github.com/shaka-project/shaka-player/issues/5271)
- [Shaka Player GitHub — PR #5683: feat: Use ManagedMediaSource when available](https://github.com/shaka-project/shaka-player/pull/5683)
- [Shaka Player source — lib/media/media_source_engine.js](https://shaka-project.github.io/shaka-player/docs/api/lib_media_media_source_engine.js.html) (evidencia de `startstreaming`/`endstreaming` handlers y `streamingAllowed_` flag)
- [hls.js GitHub — Issue #6197: ManagedMediaSource + disableRemotePlayback in Safari](https://github.com/video-dev/hls.js/issues/6197)
- [Apple Developer Forums — HtmlVideoElement Suspended on iOS Safari](https://developer.apple.com/forums/thread/739368)
- [W3C Media Source — Proposal: ManagedMediaSource API](https://github.com/w3c/media-source/issues/320)

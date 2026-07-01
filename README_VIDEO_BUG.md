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

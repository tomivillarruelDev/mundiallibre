// server.js - Servidor HTTP local ultra liviano (Sin dependencias externas)
// Necesario para evitar restricciones de seguridad del navegador (CORS, DRM, MSE) al usar file://

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    console.log(`[REQUEST] ${req.method} ${req.url}`);

    // Clean up URL paths to prevent directory traversal
    let safeUrl = req.url.split('?')[0];
    if (safeUrl === '/') safeUrl = '/index.html';

    const filePath = path.join(__dirname, safeUrl);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                if (safeUrl === '/match.json') {
                    res.writeHead(200, { 
                        'Content-Type': 'application/json; charset=utf-8',
                        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
                    });
                    res.end(JSON.stringify({}), 'utf-8');
                    return;
                }
                console.log(`[404] No encontrado: ${filePath}`);
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Error 404: Archivo no encontrado');
            } else {
                console.log(`[500] Error del servidor: ${error.code}`);
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end(`Error 500: Interno del servidor (${error.code})`);
            }
        } else {
            const headers = { 'Content-Type': contentType };

            // Cache-Control: espeja la config de vercel.json para consistencia local/prod
            if (ext === '.html' || safeUrl === '/') {
                headers['Cache-Control'] = 'no-store, no-cache, must-revalidate';
            } else if (safeUrl === '/match.json') {
                // Métricas en vivo del partido: nunca cachear
                headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, proxy-revalidate';
                headers['Pragma'] = 'no-cache';
            } else if (safeUrl === '/sitemap.xml') {
                headers['Cache-Control'] = 'public, max-age=3600';
            } else if (ext === '.json' || safeUrl === '/robots.txt') {
                // manifest.json, robots.txt: 1 día
                headers['Cache-Control'] = 'public, max-age=86400';
            } else if (['.css', '.js', '.webp', '.png', '.gif', '.svg'].includes(ext)) {
                // Assets versionados e imágenes: 1 año inmutable
                headers['Cache-Control'] = 'public, max-age=31536000, immutable';
            } else {
                headers['Cache-Control'] = 'public, max-age=86400';
            }

            res.writeHead(200, headers);
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log('================================================================');
    console.log('                 MundialLibre - Servidor Local                  ');
    console.log('================================================================');
    console.log(` Servidor corriendo exitosamente en el puerto: ${PORT}`);
    console.log(` Enlace de prueba: \x1b[36mhttp://localhost:${PORT}\x1b[0m`);
    console.log('================================================================');
    console.log(' Presiona Ctrl+C para detener el servidor.');
});

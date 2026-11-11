import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const preferredPort = Number(process.env.PORT || 5173);
const bindHost = process.env.HOST || '0.0.0.0';

const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp'
};

function resolveRequestPath(requestUrl) {
    const pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
    const requestedPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const resolvedPath = path.resolve(rootDirectory, requestedPath);
    if (resolvedPath !== rootDirectory && !resolvedPath.startsWith(`${rootDirectory}${path.sep}`)) {
        return null;
    }
    return resolvedPath;
}

const server = http.createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' });
        response.end('Method Not Allowed');
        return;
    }

    let filePath;
    try {
        filePath = resolveRequestPath(request.url || '/');
        if (!filePath) {
            response.writeHead(403);
            response.end('Forbidden');
            return;
        }

        const content = await readFile(filePath);
        const extension = path.extname(filePath).toLowerCase();
        response.writeHead(200, {
            'Content-Type': mimeTypes[extension] || 'application/octet-stream',
            'Cache-Control': 'no-cache'
        });
        if (request.method === 'HEAD') response.end();
        else response.end(content);
    } catch (error) {
        const status = error.code === 'ENOENT' ? 404 : 500;
        response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end(status === 404 ? 'Not Found' : 'Internal Server Error');
    }
});

function logServerUrls(port) {
    console.log(`JoeTech Store Manager running locally at http://127.0.0.1:${port}`);
    const networkUrls = Object.values(os.networkInterfaces())
        .flat()
        .filter(address => address && address.family === 'IPv4' && !address.internal)
        .map(address => `http://${address.address}:${port}`);

    if (networkUrls.length > 0) {
        console.log('Network access:');
        networkUrls.forEach(url => console.log(`  ${url}`));
    } else {
        console.log('No active LAN IPv4 address was found.');
    }
}

function startServer(port) {
    const handleError = (error) => {
        server.removeListener('error', handleError);
        if (error.code === 'EADDRINUSE' && !process.env.PORT) {
            const nextPort = port + 1;
            console.warn(`Port ${port} is already in use; trying port ${nextPort}.`);
            startServer(nextPort);
            return;
        }
        console.error(`Unable to start the server on port ${port}: ${error.message}`);
        process.exitCode = 1;
    };

    server.once('error', handleError);
    server.listen(port, bindHost, () => logServerUrls(port));
}

startServer(preferredPort);

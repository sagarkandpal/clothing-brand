import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import 'dotenv/config';

/**
 * Runs the same API handler that Netlify deploys (server/api.ts) inside the
 * Vite dev server, so `npm run dev` gives a working site + API on one port
 * without installing the Netlify CLI. Production uses netlify/functions/api.mts.
 */
function localApi(): Plugin {
  return {
    name: 'local-netlify-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const body = Buffer.concat(chunks);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
            else if (v !== undefined) headers.set(k, v);
          }
          const request = new Request(`http://${req.headers.host}${req.url}`, {
            method: req.method,
            headers,
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
          });
          const { handleApi } = await server.ssrLoadModule('/server/api.ts');
          const response: Response = await handleApi(request, { ip: req.socket.remoteAddress });
          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            if (key !== 'set-cookie') res.setHeader(key, value);
          });
          const cookies = response.headers.getSetCookie?.() ?? [];
          if (cookies.length) res.setHeader('set-cookie', cookies);
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          console.error(err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Local API error' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localApi()],
  server: { port: 5173 },
  build: { target: 'es2020', sourcemap: false },
});

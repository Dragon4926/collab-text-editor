import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * pdf.js loads a few files at runtime: WebAssembly image decoders (JPEG 2000
 * in scanned books, JBIG2 in faxes), the 14 standard fonts, CJK character
 * maps and a colour profile. They live in node_modules/pdfjs-dist; this
 * serves them at /pdfjs/<folder>/ in dev and copies them into the build.
 */
function pdfjsAssets(): Plugin {
  const root = fileURLToPath(new URL('./node_modules/pdfjs-dist/', import.meta.url));
  const folders = ['wasm', 'standard_fonts', 'cmaps', 'iccs'];
  const types: Record<string, string> = { '.wasm': 'application/wasm', '.mjs': 'text/javascript', '.js': 'text/javascript' };
  return {
    name: 'pdfjs-assets',
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const [folder, file] = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\//, '').split('/');
        if (!folders.includes(folder) || !file || file.includes('..')) return next();
        const path = join(root, folder, file);
        if (!existsSync(path)) return next();
        const ext = file.slice(file.lastIndexOf('.'));
        res.setHeader('Content-Type', types[ext] ?? 'application/octet-stream');
        res.end(readFileSync(path));
      });
    },
    generateBundle() {
      for (const folder of folders) {
        for (const file of readdirSync(join(root, folder))) {
          if (file.startsWith('LICENSE')) continue;
          this.emitFile({ type: 'asset', fileName: `pdfjs/${folder}/${file}`, source: readFileSync(join(root, folder, file)) });
        }
      }
    },
  };
}

/**
 * Content-Security-Policy for production builds.
 *
 * Lumen makes no network requests of its own — fonts are bundled, data
 * lives in IndexedDB — so the policy can be strict: scripts only from our
 * own origin, no plugins, no <base> hijacking, no form posts, and network
 * access limited to same-origin. Even if some pasted content slipped past
 * the editor's schema, the browser would refuse to run injected script or
 * send data anywhere.
 *
 *  - style-src needs 'unsafe-inline': TipTap injects a <style> tag.
 *  - img-src allows https: so images pasted from the web keep displaying.
 *  - 'wasm-unsafe-eval' lets pdf.js compile its WebAssembly image decoders
 *    (it does not allow eval of JavaScript); fonts embedded in PDFs are
 *    loaded from blob: URLs.
 *
 * It's added at build time only: Vite's dev server relies on inline
 * scripts for hot reloading, which this policy would (correctly) block.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob:",
  "font-src 'self' data: blob:",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const contentSecurityPolicy = (): Plugin => ({
  name: 'lumen-csp',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
});

export default defineConfig({
  plugins: [react(), pdfjsAssets(), contentSecurityPolicy()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});

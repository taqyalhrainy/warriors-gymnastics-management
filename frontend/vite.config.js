import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertParentDist, assertParentModuleIds } from './scripts/parent-build-guard.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));

const parentBuildPlugin = (outDir) => ({
  name: 'warriors-parent-build-isolation',
  transformIndexHtml: {
    order: 'pre',
    handler: (html) => html.replace('/src/pwa-bootstrap.js', '/src/parent-pwa-bootstrap.js')
  },
  generateBundle: (_options, bundle) => {
    const moduleIds = Object.values(bundle)
      .filter((entry) => entry.type === 'chunk')
      .flatMap((chunk) => Object.keys(chunk.modules));
    assertParentModuleIds(moduleIds);
  },
  closeBundle: () => {
    for (const file of ['admin-manifest.webmanifest', 'manifest.webmanifest', 'sw.js']) {
      const target = path.join(outDir, file);
      if (existsSync(target)) rmSync(target);
    }
    assertParentDist(outDir);
  }
});

export default defineConfig(({ mode }) => {
  const parentsOnly = mode === 'parents';
  const outDir = path.join(root, parentsOnly ? 'dist-parents' : 'dist');
  const alias = [{
    find: '@app-entry',
    replacement: path.join(root, 'src', parentsOnly ? 'ParentApp.jsx' : 'App.jsx')
  }];
  if (parentsOnly) {
    alias.push(
      {
        find: /^(?:\.\.?\/)+context\/AuthContext\.jsx$/,
        replacement: path.join(root, 'src/context/ParentAuthContext.jsx')
      },
      {
        find: /^(?:\.\.?\/)+components\/Sidebar\.jsx$/,
        replacement: path.join(root, 'src/components/ParentSidebar.jsx')
      }
    );
  }

  return {
    plugins: [react(), ...(parentsOnly ? [parentBuildPlugin(outDir)] : [])],
    resolve: { alias },
    build: {
      outDir,
      emptyOutDir: true
    },
    server: {
      port: 5173,
      strictPort: true,
      watch: {
        usePolling: true,
        interval: 250
      },
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
          secure: false,
          rewrite: (requestPath) => requestPath.replace(/^\/api/, '/api')
        }
      }
    }
  };
});

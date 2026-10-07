/**
 * Build Script for VS Code ACP Client Extension & Webview Cockpit
 * Uses esbuild to produce optimized dist/extension.js and dist/webview.js bundles.
 */

import * as esbuild from 'esbuild';
import * as fs from 'fs/promises';
import * as path from 'path';

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

async function build() {
  console.log(`[build] Starting build (${isProduction ? 'production' : 'development'})...`);

  // Ensure clean dist directory
  await fs.rm('dist', { recursive: true, force: true });
  await fs.mkdir('dist', { recursive: true });

  // 1. Build Extension Host Bundle
  console.log('[build] Bundling VS Code Extension host (dist/extension.js)...');
  const extensionCtx = await esbuild.context({
    entryPoints: ['src/vscode/extension.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    sourcemap: !isProduction,
    minify: isProduction,
    logLevel: 'info',
  });

  // 2. Build Webview SPA Client Bundle
  console.log('[build] Bundling Webview Cockpit SPA (dist/webview.js)...');
  const webviewEntry = (await fs.stat('src/webview/main.tsx').catch(() => null))
    ? 'src/webview/main.tsx'
    : 'src/webview/main.ts';

  const webviewCtx = await esbuild.context({
    entryPoints: [webviewEntry],
    bundle: true,
    platform: 'browser',
    target: 'es2022',
    format: 'iife',
    globalName: 'AcpWebview',
    outfile: 'dist/webview.js',
    jsx: 'automatic',
    jsxImportSource: 'preact',
    sourcemap: !isProduction,
    minify: isProduction,
    logLevel: 'info',
  });

  // Execute builds
  await Promise.all([extensionCtx.rebuild(), webviewCtx.rebuild()]);

  // 3. Copy/Bundle CSS and HTML assets
  const copyAssets = async () => {
    try {
      const hasModularCss = await fs.stat('src/webview/styles/index.css').catch(() => null);
      if (hasModularCss) {
        await esbuild.build({
          entryPoints: ['src/webview/styles/index.css'],
          bundle: true,
          outfile: 'dist/webview.css',
          loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file' },
          assetNames: 'fonts/[name]-[hash]',
          minify: isProduction,
        });
      } else {
        await fs.copyFile('src/webview/style.css', 'dist/webview.css');
      }
      try {
        await fs.copyFile('src/webview/index.html', 'dist/index.html');
      } catch {
        // optional
      }
      console.log('[build] Updated static webview assets in dist/');
    } catch (err) {
      console.error('[build] Error copying/bundling static assets:', err);
      throw err;
    }
  };
  await copyAssets();

  if (isWatch) {
    console.log('[build] Watching for file changes...');
    try {
      const { watch } = await import('fs');
      watch('src/webview/style.css', () => { copyAssets(); });
      try {
        watch('src/webview/styles', { recursive: true }, () => { copyAssets(); });
      } catch {}
    } catch {
      // ignore
    }
    await Promise.all([extensionCtx.watch(), webviewCtx.watch()]);
  } else {
    await Promise.all([extensionCtx.dispose(), webviewCtx.dispose()]);
    console.log('[build] Build completed successfully.');
  }
}

build().catch((err) => {
  console.error('[build] Build failed:', err);
  process.exit(1);
});

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
  const webviewCtx = await esbuild.context({
    entryPoints: ['src/webview/main.ts'],
    bundle: true,
    platform: 'browser',
    target: 'es2022',
    format: 'esm',
    outfile: 'dist/webview.js',
    sourcemap: !isProduction,
    minify: isProduction,
    logLevel: 'info',
  });

  // Execute builds
  await Promise.all([extensionCtx.rebuild(), webviewCtx.rebuild()]);

  // 3. Copy CSS and HTML assets
  console.log('[build] Copying static webview assets to dist/...');
  await fs.copyFile('src/webview/style.css', 'dist/webview.css');
  try {
    await fs.copyFile('src/webview/index.html', 'dist/index.html');
  } catch {
    // optional
  }

  if (isWatch) {
    console.log('[build] Watching for file changes...');
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

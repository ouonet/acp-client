#!/usr/bin/env node
/**
 * Cross-platform script to link or unlink the extension to/from VS Code, Cursor, or Antigravity IDE.
 * Works seamlessly across Windows (directory junctions), macOS, and Linux (symlinks).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const [action = 'link', targetIde = 'antigravity-ide'] = process.argv.slice(2);

const ideMap = {
  vscode: { name: 'VS Code', dirName: '.vscode' },
  cursor: { name: 'Cursor', dirName: '.cursor' },
  'antigravity-ide': { name: 'Antigravity IDE', dirName: '.antigravity-ide' },
};

const ideConfig = ideMap[targetIde] || {
  name: targetIde,
  dirName: targetIde.startsWith('.') ? targetIde : `.${targetIde}`,
};

const extensionsDir = path.join(os.homedir(), ideConfig.dirName, 'extensions');

const pkgPath = path.resolve(process.cwd(), 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const extTarget = `${pkg.publisher || 'ouonet'}.${pkg.name}-${pkg.version}`;
const extAlias = pkg.name;

function removeExistingLinks() {
  if (!fs.existsSync(extensionsDir)) {
    return;
  }
  try {
    const entries = fs.readdirSync(extensionsDir);
    for (const entry of entries) {
      const isTarget =
        entry === extAlias ||
        entry === extTarget ||
        entry.startsWith('undefined_publisher.acp-client-') ||
        (entry.includes('.acp-client-') && entry.startsWith(pkg.publisher || 'ouonet'));

      if (isTarget) {
        const fullPath = path.join(extensionsDir, entry);
        try {
          const stat = fs.lstatSync(fullPath);
          if (stat.isSymbolicLink()) {
            fs.unlinkSync(fullPath);
          } else {
            fs.rmSync(fullPath, { recursive: true, force: true });
          }
        } catch {
          try {
            fs.rmSync(fullPath, { recursive: true, force: true });
          } catch {
            // Ignore if already deleted
          }
        }
      }
    }
  } catch (err) {
    console.error(`[link-extension] Failed to clean up existing links:`, err);
  }
}

if (action === 'unlink') {
  removeExistingLinks();
  console.log(`Unlinked ${pkg.name} from ${extensionsDir}`);
  console.log(`⚠️  Important: In ${ideConfig.name}, run 'Developer: Reload Window' or restart ${ideConfig.name}.`);
} else if (action === 'link') {
  if (!fs.existsSync(extensionsDir)) {
    fs.mkdirSync(extensionsDir, { recursive: true });
  }
  removeExistingLinks();

  const projectDir = process.cwd();
  const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';

  const linkTarget = path.join(extensionsDir, extTarget);
  const linkAlias = path.join(extensionsDir, extAlias);

  fs.symlinkSync(projectDir, linkTarget, symlinkType);
  fs.symlinkSync(projectDir, linkAlias, symlinkType);

  console.log(`Linked to ${linkTarget}`);
  console.log(`Linked to ${linkAlias}`);
  console.log(`⚠️  Important: In ${ideConfig.name}, run 'Developer: Reload Window' (Cmd+Shift+P / Ctrl+Shift+P) or restart ${ideConfig.name} to activate!`);
} else {
  console.error(`Unknown action: "${action}". Usage: node scripts/link-extension.mjs [link|unlink] [vscode|cursor|antigravity-ide]`);
  process.exit(1);
}

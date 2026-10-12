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
const extId = `${pkg.publisher || 'ouonet'}.${pkg.name}`;

function cleanObsolete() {
  const obsoletePath = path.join(extensionsDir, '.obsolete');
  if (!fs.existsSync(obsoletePath)) {
    return;
  }
  try {
    const content = fs.readFileSync(obsoletePath, 'utf8');
    const obsolete = JSON.parse(content);
    let changed = false;
    for (const key of Object.keys(obsolete)) {
      if (
        key === extAlias ||
        key === extTarget ||
        key.startsWith(`${extId}-`) ||
        key.startsWith(`${pkg.name}-`)
      ) {
        delete obsolete[key];
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(obsoletePath, JSON.stringify(obsolete));
      console.log(`Cleaned up obsolete record for ${extId} in .obsolete`);
    }
  } catch (err) {
    console.error(`[link-extension] Failed to clean up .obsolete:`, err);
  }
}

function updateExtensionsJson(linkTarget) {
  const extensionsJsonPath = path.join(extensionsDir, 'extensions.json');
  try {
    let list = [];
    if (fs.existsSync(extensionsJsonPath)) {
      list = JSON.parse(fs.readFileSync(extensionsJsonPath, 'utf8'));
    }
    list = list.filter(
      (e) => !e.identifier || e.identifier.id.toLowerCase() !== extId.toLowerCase()
    );

    list.push({
      identifier: { id: extId },
      version: pkg.version,
      location: {
        $mid: 1,
        path: linkTarget,
        scheme: 'file',
      },
      relativeLocation: extTarget,
      metadata: {
        isApplicationScoped: false,
        isMachineScoped: false,
        isBuiltin: false,
        installedTimestamp: Date.now(),
        pinned: false,
        source: 'vsix',
        publisherDisplayName: pkg.publisher || 'ouonet',
        targetPlatform: 'undefined',
        updated: false,
        isPreReleaseVersion: false,
        hasPreReleaseVersion: false,
        preRelease: false,
      },
    });

    fs.writeFileSync(extensionsJsonPath, JSON.stringify(list, null, 2));
    console.log(`Registered ${extId}@${pkg.version} in extensions.json`);
  } catch (err) {
    console.error(`[link-extension] Failed to update extensions.json:`, err);
  }
}

function removeFromExtensionsJson() {
  const extensionsJsonPath = path.join(extensionsDir, 'extensions.json');
  if (!fs.existsSync(extensionsJsonPath)) {
    return;
  }
  try {
    let list = JSON.parse(fs.readFileSync(extensionsJsonPath, 'utf8'));
    const beforeCount = list.length;
    list = list.filter(
      (e) => !e.identifier || e.identifier.id.toLowerCase() !== extId.toLowerCase()
    );
    if (list.length !== beforeCount) {
      fs.writeFileSync(extensionsJsonPath, JSON.stringify(list, null, 2));
      console.log(`Unregistered ${extId} from extensions.json`);
    }
  } catch (err) {
    console.error(`[link-extension] Failed to unregister from extensions.json:`, err);
  }
}

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
  cleanObsolete();
  removeFromExtensionsJson();
  console.log(`Unlinked ${pkg.name} from ${extensionsDir}`);
  console.log(`⚠️  Important: In ${ideConfig.name}, run 'Developer: Reload Window' or restart ${ideConfig.name}.`);
} else if (action === 'link') {
  if (!fs.existsSync(extensionsDir)) {
    fs.mkdirSync(extensionsDir, { recursive: true });
  }
  removeExistingLinks();
  cleanObsolete();

  const projectDir = process.cwd();
  const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';

  const linkTarget = path.join(extensionsDir, extTarget);
  const linkAlias = path.join(extensionsDir, extAlias);

  fs.symlinkSync(projectDir, linkTarget, symlinkType);
  fs.symlinkSync(projectDir, linkAlias, symlinkType);

  updateExtensionsJson(linkTarget);

  console.log(`Linked to ${linkTarget}`);
  console.log(`Linked to ${linkAlias}`);
  console.log(`⚠️  Important: In ${ideConfig.name}, run 'Developer: Reload Window' (Cmd+Shift+P / Ctrl+Shift+P) or restart ${ideConfig.name} to activate!`);
} else {
  console.error(`Unknown action: "${action}". Usage: node scripts/link-extension.mjs [link|unlink] [vscode|cursor|antigravity-ide]`);
  process.exit(1);
}

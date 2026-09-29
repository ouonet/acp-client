/**
 * DiffViewerComponent: Visual unified diff viewer with additions/deletions,
 * syntax lines, Accept All and VS Code Diff Editor integration.
 */

import { ICONS } from './icons';

export interface DiffLine {
  type: 'add' | 'delete' | 'context' | 'hunk';
  oldLine?: number;
  newLine?: number;
  content: string;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface ParsedDiff {
  oldFileName?: string;
  newFileName?: string;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffViewerOptions {
  container: HTMLElement;
  filePath: string;
  diff: string;
  originalContent?: string;
  modifiedContent?: string;
  onApply?: (filePath: string, content: string) => void;
  onOpenDiff?: (filePath: string, original: string, modified: string) => void;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function parseUnifiedDiff(rawDiff: string): ParsedDiff {
  const lines = rawDiff.split('\n');
  let oldFileName: string | undefined;
  let newFileName: string | undefined;
  let additions = 0;
  let deletions = 0;
  const hunks: DiffHunk[] = [];

  let currentHunk: DiffHunk | null = null;
  let currentOldLine = 0;
  let currentNewLine = 0;

  for (const line of lines) {
    if (line.startsWith('--- ')) {
      oldFileName = line.slice(4).trim().replace(/^[ab]\//, '');
      continue;
    }
    if (line.startsWith('+++ ')) {
      newFileName = line.slice(4).trim().replace(/^[ab]\//, '');
      continue;
    }

    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch) {
      const oldStart = parseInt(hunkMatch[1], 10);
      const oldCount = hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1;
      const newStart = parseInt(hunkMatch[3], 10);
      const newCount = hunkMatch[4] ? parseInt(hunkMatch[4], 10) : 1;

      currentOldLine = oldStart;
      currentNewLine = newStart;

      currentHunk = {
        header: line,
        oldStart,
        oldCount,
        newStart,
        newCount,
        lines: [],
      };
      hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith('+')) {
      additions++;
      currentHunk.lines.push({
        type: 'add',
        newLine: currentNewLine++,
        content: line.slice(1),
      });
    } else if (line.startsWith('-')) {
      deletions++;
      currentHunk.lines.push({
        type: 'delete',
        oldLine: currentOldLine++,
        content: line.slice(1),
      });
    } else if (line.startsWith(' ') || line === '') {
      currentHunk.lines.push({
        type: 'context',
        oldLine: currentOldLine++,
        newLine: currentNewLine++,
        content: line.startsWith(' ') ? line.slice(1) : line,
      });
    }
  }

  return {
    oldFileName,
    newFileName,
    additions,
    deletions,
    hunks,
  };
}

export class DiffViewerComponent {
  private container: HTMLElement;
  private options: DiffViewerOptions;
  private parsedDiff: ParsedDiff;

  constructor(options: DiffViewerOptions) {
    this.container = options.container;
    this.options = options;
    this.parsedDiff = parseUnifiedDiff(options.diff);

    this.render();
  }

  private render(): void {
    const card = document.createElement('div');
    card.className = 'diff-card';

    card.innerHTML = `
      <div class="diff-header">
        <div class="diff-file-info">
          <span class="diff-file-icon">${ICONS.file}</span>
          <span class="diff-file-path">${escapeHtml(this.options.filePath)}</span>
          <span class="diff-stats">
            <span class="diff-add-stat">+${this.parsedDiff.additions}</span>
            <span class="diff-del-stat">-${this.parsedDiff.deletions}</span>
          </span>
        </div>
        <div class="diff-actions">
          <button class="btn-accept-diff" type="button" title="Accept and apply diff to file">${ICONS.check} <span>Accept All</span></button>
          <button class="btn-open-diff" type="button" title="Open VS Code native Diff Editor">${ICONS.diff} <span>Open in Diff Editor</span></button>
        </div>
      </div>
      <div class="diff-content-wrapper">
        <table class="diff-table">
          <tbody>
            ${this.renderHunksHtml()}
          </tbody>
        </table>
      </div>
    `;

    // Bind Accept button
    card.querySelector('.btn-accept-diff')?.addEventListener('click', () => {
      const contentToWrite = this.options.modifiedContent || this.reconstructModifiedContent();
      this.options.onApply?.(this.options.filePath, contentToWrite);
    });

    // Bind Open in Diff Editor button
    card.querySelector('.btn-open-diff')?.addEventListener('click', () => {
      this.options.onOpenDiff?.(
        this.options.filePath,
        this.options.originalContent || '',
        this.options.modifiedContent || this.reconstructModifiedContent()
      );
    });

    this.container.appendChild(card);
  }

  private renderHunksHtml(): string {
    let html = '';
    for (const hunk of this.parsedDiff.hunks) {
      html += `
        <tr class="diff-line hunk">
          <td class="line-num" colspan="2">...</td>
          <td class="line-prefix"></td>
          <td class="line-code">${escapeHtml(hunk.header)}</td>
        </tr>
      `;

      for (const line of hunk.lines) {
        const lineClass = line.type === 'add' ? 'added' : line.type === 'delete' ? 'deleted' : 'context';
        const prefix = line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' ';
        const oldNum = line.oldLine !== undefined ? line.oldLine : '';
        const newNum = line.newLine !== undefined ? line.newLine : '';

        html += `
          <tr class="diff-line ${lineClass}">
            <td class="line-num old">${oldNum}</td>
            <td class="line-num new">${newNum}</td>
            <td class="line-prefix">${prefix}</td>
            <td class="line-code"><code>${escapeHtml(line.content)}</code></td>
          </tr>
        `;
      }
    }
    return html;
  }

  private reconstructModifiedContent(): string {
    const lines: string[] = [];
    for (const hunk of this.parsedDiff.hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'add' || line.type === 'context') {
          lines.push(line.content);
        }
      }
    }
    return lines.join('\n');
  }
}

// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiffViewerComponent, parseUnifiedDiff } from '../../src/webview/components/diff-viewer';

describe('T1: DiffViewerComponent & Unified Diff Parser', () => {
  let container: HTMLElement;

  const sampleDiff = `--- a/src/core/process-manager.ts
+++ b/src/core/process-manager.ts
@@ -82,4 +82,5 @@
 const timeout = 5000;
-this.process.kill('SIGTERM');
+this.process.kill('SIGTERM');
+setTimeout(() => this.process.kill('SIGKILL'), timeout);
 return true;`;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(container);
  });

  describe('parseUnifiedDiff', () => {
    it('should parse hunk headers, additions, deletions, and context lines', () => {
      const parsed = parseUnifiedDiff(sampleDiff);

      expect(parsed.oldFileName).toBe('src/core/process-manager.ts');
      expect(parsed.newFileName).toBe('src/core/process-manager.ts');
      expect(parsed.additions).toBe(2);
      expect(parsed.deletions).toBe(1);

      const lines = parsed.hunks[0].lines;
      expect(lines).toContainEqual(expect.objectContaining({ type: 'delete', content: "this.process.kill('SIGTERM');" }));
      expect(lines).toContainEqual(expect.objectContaining({ type: 'add', content: "this.process.kill('SIGTERM');" }));
      expect(lines).toContainEqual(expect.objectContaining({ type: 'add', content: "setTimeout(() => this.process.kill('SIGKILL'), timeout);" }));
      expect(lines).toContainEqual(expect.objectContaining({ type: 'context', content: 'const timeout = 5000;' }));
    });
  });

  describe('DiffViewerComponent DOM Rendering & Actions', () => {
    it('should render file path, addition/deletion badges, and diff rows', () => {
      new DiffViewerComponent({
        container,
        filePath: 'src/core/process-manager.ts',
        diff: sampleDiff,
      });

      expect(container.textContent).toContain('src/core/process-manager.ts');
      expect(container.querySelector('.diff-stats')?.textContent).toContain('+2');
      expect(container.querySelector('.diff-stats')?.textContent).toContain('-1');

      const addedLines = container.querySelectorAll('.diff-line.added');
      const deletedLines = container.querySelectorAll('.diff-line.deleted');
      expect(addedLines.length).toBe(2);
      expect(deletedLines.length).toBe(1);
    });

    it('should trigger onApply when Accept All button is clicked', () => {
      const onApply = vi.fn();
      new DiffViewerComponent({
        container,
        filePath: 'src/core/process-manager.ts',
        diff: sampleDiff,
        modifiedContent: 'const timeout = 5000;\nthis.process.kill("SIGTERM");\nsetTimeout(() => this.process.kill("SIGKILL"), timeout);\nreturn true;',
        onApply,
      });

      const acceptBtn = container.querySelector('.btn-accept-diff') as HTMLButtonElement;
      expect(acceptBtn).not.toBeNull();
      acceptBtn.click();

      expect(onApply).toHaveBeenCalledWith(
        'src/core/process-manager.ts',
        expect.stringContaining('SIGKILL')
      );
    });

    it('should trigger onOpenDiff when Open in Diff Editor button is clicked', () => {
      const onOpenDiff = vi.fn();
      new DiffViewerComponent({
        container,
        filePath: 'src/core/process-manager.ts',
        diff: sampleDiff,
        originalContent: 'original text',
        modifiedContent: 'modified text',
        onOpenDiff,
      });

      const openDiffBtn = container.querySelector('.btn-open-diff') as HTMLButtonElement;
      expect(openDiffBtn).not.toBeNull();
      openDiffBtn.click();

      expect(onOpenDiff).toHaveBeenCalledWith(
        'src/core/process-manager.ts',
        'original text',
        'modified text'
      );
    });
  });
});

/**
 * Collapsible Thinking Block Component
 * Displays chain-of-thought tokens in a clean expandable card.
 */

export interface ThinkingBlockOptions {
  container: HTMLElement;
  thinking: string;
  durationSeconds?: number;
  initiallyExpanded?: boolean;
}

export class ThinkingBlockComponent {
  private readonly container: HTMLElement;
  private readonly thinking: string;
  private readonly durationSeconds: number;
  private expanded: boolean;
  private element?: HTMLElement;

  constructor(options: ThinkingBlockOptions) {
    this.container = options.container;
    this.thinking = options.thinking;
    this.durationSeconds = options.durationSeconds ?? 0;
    this.expanded = options.initiallyExpanded ?? false;
    this.render();
  }

  private render(): void {
    const card = document.createElement('div');
    card.className = `thinking-card ${this.expanded ? 'expanded' : ''}`;

    const durationLabel = this.durationSeconds > 0 ? `${this.durationSeconds.toFixed(1)}s` : 'done';

    card.innerHTML = `
      <div class="thinking-header">
        <span><span class="thinking-toggle-icon">${this.expanded ? '▾' : '▸'}</span> Thinking (${durationLabel})</span>
      </div>
      <div class="thinking-body">${this.escapeHtml(this.thinking)}</div>
    `;

    const header = card.querySelector('.thinking-header') as HTMLElement;
    header.addEventListener('click', () => {
      this.toggle();
    });

    this.element = card;
    this.container.appendChild(card);
  }

  public toggle(): void {
    this.expanded = !this.expanded;
    if (this.element) {
      if (this.expanded) {
        this.element.classList.add('expanded');
      } else {
        this.element.classList.remove('expanded');
      }

      const icon = this.element.querySelector('.thinking-toggle-icon');
      if (icon) {
        icon.textContent = this.expanded ? '▾' : '▸';
      }
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

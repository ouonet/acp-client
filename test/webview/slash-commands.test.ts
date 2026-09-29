// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InputBoxComponent } from '../../src/webview/components/input-box';

describe('T4: Slash Commands Menu in InputBox', () => {
  let container: HTMLElement;
  let onSendMock: ReturnType<typeof vi.fn>;
  let onClearMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(container);
    onSendMock = vi.fn();
    onClearMock = vi.fn();
  });

  it('should show slash command popup when user types / at the beginning of prompt', () => {
    new InputBoxComponent({
      container,
      onSend: onSendMock,
      onCancel: vi.fn(),
      onClear: onClearMock,
    });

    const textarea = container.querySelector('textarea.prompt-input') as HTMLTextAreaElement;
    textarea.value = '/';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    const popup = container.querySelector('.slash-commands-popup') as HTMLElement;
    expect(popup).not.toBeNull();
    expect(popup.style.display).not.toBe('none');

    const items = popup.querySelectorAll('.slash-item');
    expect(items.length).toBeGreaterThanOrEqual(4);
    expect(popup.textContent).toContain('/tdd');
    expect(popup.textContent).toContain('/review');
    expect(popup.textContent).toContain('/clear');
  });

  it('should filter slash commands by typed query', () => {
    new InputBoxComponent({
      container,
      onSend: onSendMock,
      onCancel: vi.fn(),
    });

    const textarea = container.querySelector('textarea.prompt-input') as HTMLTextAreaElement;
    textarea.value = '/td';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    const popup = container.querySelector('.slash-commands-popup') as HTMLElement;
    const items = popup.querySelectorAll('.slash-item');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('/tdd');
  });

  it('should select command and fill textarea on item click or Enter key', () => {
    new InputBoxComponent({
      container,
      onSend: onSendMock,
      onCancel: vi.fn(),
    });

    const textarea = container.querySelector('textarea.prompt-input') as HTMLTextAreaElement;
    textarea.value = '/rev';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    const popup = container.querySelector('.slash-commands-popup') as HTMLElement;
    const item = popup.querySelector('.slash-item') as HTMLElement;
    item.click();

    expect(textarea.value).toBe('/review ');
    expect(popup.style.display).toBe('none');
  });

  it('should trigger onClear when /clear command is executed', () => {
    new InputBoxComponent({
      container,
      onSend: onSendMock,
      onCancel: vi.fn(),
      onClear: onClearMock,
    });

    const textarea = container.querySelector('textarea.prompt-input') as HTMLTextAreaElement;
    textarea.value = '/clear';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    const popup = container.querySelector('.slash-commands-popup') as HTMLElement;
    const clearItem = Array.from(popup.querySelectorAll('.slash-item')).find((el) =>
      el.textContent?.includes('/clear')
    ) as HTMLElement;

    clearItem.click();
    expect(onClearMock).toHaveBeenCalled();
    expect(textarea.value).toBe('');
  });
});

// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  InputBoxComponent,
  type InputBoxOptions,
  type AttachmentItem,
} from '../../src/webview/components/input-box';

describe('T5: InputBoxComponent (Ergonomics, Dynamic Toggle, History, Multimodal)', () => {
  let container: HTMLElement;
  let onSendMock: ReturnType<typeof vi.fn>;
  let onCancelMock: ReturnType<typeof vi.fn>;
  let onModelChangeMock: ReturnType<typeof vi.fn>;
  let onThinkingLevelChangeMock: ReturnType<typeof vi.fn>;

  const defaultProps: InputBoxOptions = {
    container: null as any,
    sessionId: 'session-123',
    history: ['first prompt', 'second prompt', 'third prompt'],
    models: ['claude-3-7-sonnet', 'claude-3-5-sonnet', 'gpt-4o'],
    currentModel: 'claude-3-7-sonnet',
    thinkingLevel: 'high',
    status: 'idle',
    onSend: (data) => onSendMock(data),
    onCancel: (id) => onCancelMock(id),
    onModelChange: (model) => onModelChangeMock(model),
    onThinkingLevelChange: (lvl) => onThinkingLevelChangeMock(lvl),
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(container);
    defaultProps.container = container;

    onSendMock = vi.fn();
    onCancelMock = vi.fn();
    onModelChangeMock = vi.fn();
    onThinkingLevelChangeMock = vi.fn();
  });

  describe('Dynamic Send / Stop Toggle Button', () => {
    it('should render Send button when status is idle', () => {
      new InputBoxComponent(defaultProps);
      const button = container.querySelector('.btn-toggle-action') as HTMLButtonElement;

      expect(button).not.toBeNull();
      expect(button.classList.contains('send')).toBe(true);
      expect(button.classList.contains('stop')).toBe(false);
      expect(button.textContent).toContain('Send');
    });

    it('should call onSend with text and clear input on button click or Enter key', () => {
      new InputBoxComponent(defaultProps);
      const textarea = container.querySelector('textarea.prompt-input') as HTMLTextAreaElement;
      const button = container.querySelector('.btn-toggle-action') as HTMLButtonElement;

      textarea.value = 'Hello world';
      button.click();

      expect(onSendMock).toHaveBeenCalledTimes(1);
      expect(onSendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-123',
          text: 'Hello world',
          model: 'claude-3-7-sonnet',
          thinkingLevel: 'high',
        })
      );
      expect(textarea.value).toBe('');

      // Test Enter key sends prompt
      textarea.value = 'Second message';
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(onSendMock).toHaveBeenCalledTimes(2);
      expect(onSendMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          text: 'Second message',
        })
      );
      expect(textarea.value).toBe('');
    });

    it('should NOT call onSend if Shift+Enter is pressed or input is empty', () => {
      new InputBoxComponent(defaultProps);
      const textarea = container.querySelector('textarea.prompt-input') as HTMLTextAreaElement;
      const button = container.querySelector('.btn-toggle-action') as HTMLButtonElement;

      // Empty input click
      textarea.value = '   ';
      button.click();
      expect(onSendMock).not.toHaveBeenCalled();

      // Shift + Enter should not send
      textarea.value = 'Multi\nline';
      textarea.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })
      );
      expect(onSendMock).not.toHaveBeenCalled();
    });

    it('should switch to Stop button when status is streaming or waiting_approval and dispatch onCancel', () => {
      const inputBox = new InputBoxComponent(defaultProps);
      const button = container.querySelector('.btn-toggle-action') as HTMLButtonElement;

      // Switch to streaming
      inputBox.setStatus('streaming');
      expect(button.classList.contains('stop')).toBe(true);
      expect(button.classList.contains('send')).toBe(false);
      expect(button.textContent).toContain('Stop');

      // Click button should trigger onCancel
      button.click();
      expect(onCancelMock).toHaveBeenCalledWith('session-123');
      expect(onSendMock).not.toHaveBeenCalled();

      // Switch to waiting_approval
      inputBox.setStatus('waiting_approval');
      expect(button.classList.contains('stop')).toBe(true);

      // Return to idle
      inputBox.setStatus('idle');
      expect(button.classList.contains('send')).toBe(true);
      expect(button.classList.contains('stop')).toBe(false);
    });
  });

  describe('Keyboard History Recall (↑ / ↓)', () => {
    it('should cycle backwards on ArrowUp and restore draft on ArrowDown', () => {
      new InputBoxComponent(defaultProps);
      const textarea = container.querySelector('textarea.prompt-input') as HTMLTextAreaElement;

      textarea.value = 'my WIP draft';

      // First ArrowUp recalls the most recent prompt ('third prompt')
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(textarea.value).toBe('third prompt');

      // Second ArrowUp recalls 'second prompt'
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(textarea.value).toBe('second prompt');

      // Third ArrowUp recalls 'first prompt'
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(textarea.value).toBe('first prompt');

      // Fourth ArrowUp stays at earliest item
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(textarea.value).toBe('first prompt');

      // ArrowDown moves forward towards newer items
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(textarea.value).toBe('second prompt');

      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(textarea.value).toBe('third prompt');

      // ArrowDown past the newest item restores the WIP draft
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(textarea.value).toBe('my WIP draft');
    });

    it('should update history dynamically when setHistory is called', () => {
      const inputBox = new InputBoxComponent({
        ...defaultProps,
        history: [],
      });
      const textarea = container.querySelector('textarea.prompt-input') as HTMLTextAreaElement;

      inputBox.setHistory(['newly recorded prompt']);
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(textarea.value).toBe('newly recorded prompt');
    });
  });

  describe('Model & Thinking Level Selector', () => {
    it('should render model and thinking level dropdowns and trigger callbacks', () => {
      new InputBoxComponent(defaultProps);
      const modelSelect = container.querySelector('select.model-select') as HTMLSelectElement;
      const thinkingSelect = container.querySelector('select.thinking-select') as HTMLSelectElement;

      expect(modelSelect).not.toBeNull();
      expect(modelSelect.value).toBe('claude-3-7-sonnet');
      expect(thinkingSelect).not.toBeNull();
      expect(thinkingSelect.value).toBe('high');

      // Change model
      modelSelect.value = 'gpt-4o';
      modelSelect.dispatchEvent(new Event('change', { bubbles: true }));
      expect(onModelChangeMock).toHaveBeenCalledWith('gpt-4o');

      // Change thinking level
      thinkingSelect.value = 'medium';
      thinkingSelect.dispatchEvent(new Event('change', { bubbles: true }));
      expect(onThinkingLevelChangeMock).toHaveBeenCalledWith('medium');
    });

    it('should disable dropdowns and show placeholder when no agent models provided', () => {
      const box = new InputBoxComponent({
        container,
        onSend: vi.fn(),
        onCancel: vi.fn(),
      });

      const modelSelect = container.querySelector('select.model-select') as HTMLSelectElement;
      const thinkingSelect = container.querySelector('select.thinking-select') as HTMLSelectElement;

      expect(modelSelect.disabled).toBe(true);
      expect(modelSelect.textContent).toContain('No Model');
      expect(thinkingSelect.disabled).toBe(true);
      expect(thinkingSelect.textContent).toContain('Thinking: --');

      // Now set model dynamically when agent connects
      box.setModel('gemini-2.0-flash');
      expect(modelSelect.disabled).toBe(false);
      expect(modelSelect.value).toBe('gemini-2.0-flash');
      expect(thinkingSelect.disabled).toBe(false);
    });
  });

  describe('Multimodal Attachments', () => {
    it('should add image attachment and remove it when remove button is clicked', () => {
      const inputBox = new InputBoxComponent(defaultProps);
      const previewArea = container.querySelector('.attachment-previews') as HTMLElement;

      const mockAttachment: AttachmentItem = {
        id: 'att-1',
        type: 'image',
        mimeType: 'image/png',
        data: 'base64imagedata==',
        name: 'screenshot.png',
      };

      inputBox.addAttachment(mockAttachment);
      expect(previewArea.children.length).toBe(1);
      expect(previewArea.textContent).toContain('screenshot.png');

      // Remove attachment
      const removeBtn = previewArea.querySelector('.remove-attachment') as HTMLElement;
      removeBtn.click();
      expect(previewArea.children.length).toBe(0);
    });

    it('should include attachments in onSend and clear them afterwards', () => {
      const inputBox = new InputBoxComponent(defaultProps);
      const textarea = container.querySelector('textarea.prompt-input') as HTMLTextAreaElement;
      const button = container.querySelector('.btn-toggle-action') as HTMLButtonElement;

      const mockAttachment: AttachmentItem = {
        id: 'att-2',
        type: 'image',
        mimeType: 'image/jpeg',
        data: 'data:image/jpeg;base64,...',
        name: 'diagram.jpg',
      };

      inputBox.addAttachment(mockAttachment);
      textarea.value = 'Analyze this diagram';
      button.click();

      expect(onSendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Analyze this diagram',
          attachments: [mockAttachment],
        })
      );

      const previewArea = container.querySelector('.attachment-previews') as HTMLElement;
      expect(previewArea.children.length).toBe(0);
    });
  });
});

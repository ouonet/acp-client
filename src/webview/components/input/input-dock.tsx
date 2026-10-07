import { useState } from "preact/hooks";
import { useAppStore } from "../../state/store-context";
import { useAction } from "../../state/action-context";
import { PromptTextarea } from "./prompt-textarea";
import { filterSlashItems, SlashPopup } from "./slash-popup";
import { ModelPicker } from "./model-picker";
import { AttachmentChips } from "./attachment-chips";
import { AttachmentButton } from "./attachment-button";
import { clipboardImageFiles } from "./clipboard-images";
import { readImageAttachment } from "./read-image-attachment";
import { ICONS } from "../icons";
import type { ContentBlock } from "../../../core/types/session";

export function InputDock() {
  const [state, dispatch] = useAppStore();
  const sendAction = useAction();
  const [slashNav, setSlashNav] = useState<{ query: string; index: number } | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  const { activeSession } = state.session;
  const isStreaming = activeSession?.status === "streaming";
  const isWaitingApproval = activeSession?.status === "waiting_approval";
  const sessionId = activeSession?.id;
  const connection = state.agent.connections?.find(
    (c) => c.agentId === activeSession?.agentId,
  );
  const target = connection
    ? {
        agentId: activeSession?.agentId,
        generation: connection.generation,
        runtimeRevision: activeSession?.runtimeRevision,
      }
    : {};
  const detached = activeSession?.attached === false;
  const lifecyclePending = !!(
    activeSession && state.agent.lifecyclePending?.[activeSession.agentId]
  );

  const {
    draft,
    attachments,
    selectedModel,
    modelConfigId,
    thinkingConfigId,
    configPending,
    configError,
    availableModels,
    thinkingLevel,
    availableThinkingLevels,
    availableCommands,
    submitError,
  } = state.input;
  const { skills } = state.agent;
  const showSlash = draft.startsWith("/") && !draft.includes(" ");
  const slashItems = filterSlashItems(draft, availableCommands, skills);
  // Escape hides the menu until the draft text changes.
  const slashDismissed = dismissedFor === draft;
  const slashIndex =
    slashItems.length === 0
      ? 0
      : (((slashNav?.query === draft ? slashNav.index : 0) % slashItems.length) +
          slashItems.length) %
        slashItems.length;
  const slashOpen = showSlash && !slashDismissed && slashItems.length > 0;

  const handleSubmit = () => {
    if (
      !sessionId ||
      isStreaming ||
      isWaitingApproval ||
      detached ||
      lifecyclePending ||
      state.input.isSubmitting ||
      configPending
    )
      return;
    const trimmed = draft.trim();
    if (!trimmed && attachments.length === 0) return;

    let prompt: string | ContentBlock[] = trimmed;
    if (attachments.length > 0) {
      const blocks: ContentBlock[] = [];
      if (trimmed) blocks.push({ type: "text", text: trimmed });
      for (const att of attachments) {
        blocks.push({ type: "image", data: att.data, mimeType: att.mimeType });
      }
      prompt = blocks;
    }

    const requestId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    dispatch({ type: "PROMPT_STARTED", payload: { requestId, sessionId } });
    sendAction({
      type: "SEND_PROMPT",
      payload: {
        requestId,
        sessionId,
        ...target,
        prompt,
      },
    });
  };

  const sendConfig = (configId: string | undefined, value: string) => {
    if (!sessionId || !configId || configPending || detached || lifecyclePending) return;
    const requestId = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID() : `config-${Date.now()}-${Math.random()}`;
    dispatch({ type: "CONFIG_CHANGE_STARTED", payload: { requestId, sessionId } });
    sendAction({ type: "SET_CONFIG_OPTION", payload: { sessionId, ...target, requestId, configId, value } });
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (slashOpen && !e.isComposing) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const delta = e.key === "ArrowDown" ? 1 : -1;
        setSlashNav({
          query: draft,
          index: (slashIndex + delta + slashItems.length) % slashItems.length,
        });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const selected = slashItems[slashIndex];
        if (selected) {
          dispatch({ type: "SET_DRAFT", payload: `/${selected.name} ` });
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDismissedFor(draft);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      if (draft.includes("\n")) return;
      e.preventDefault();
      dispatch({
        type: "HISTORY_NAV",
        payload: e.key === "ArrowUp" ? "up" : "down",
      });
    }
  };

  const handlePaste = (event: ClipboardEvent) => {
    const files = clipboardImageFiles(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    for (const file of files) {
      void readImageAttachment(file).then((item) =>
        dispatch({ type: "ADD_ATTACHMENT", payload: item }),
      );
    }
  };

  return (
    <footer className="input-dock">
      {slashOpen && (
        <SlashPopup
          query={draft}
          commands={availableCommands}
          skills={skills}
          activeIndex={slashIndex}
          onSelect={(name) =>
            dispatch({ type: "SET_DRAFT", payload: `/${name} ` })
          }
        />
      )}
      {(submitError || configError) && <div className="input-submit-error" role="alert">{submitError || configError}</div>}
      <div className="input-card">
        <AttachmentChips
          attachments={attachments}
          onRemove={(id) =>
            dispatch({ type: "REMOVE_ATTACHMENT", payload: id })
          }
        />
        <div className="input-box-wrapper input-dock-body">
          <PromptTextarea
            value={draft}
            onChange={(text) => dispatch({ type: "SET_DRAFT", payload: text })}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={!sessionId || detached || lifecyclePending}
          />
        </div>
        <div className="input-toolbar input-dock-footer">
          <AttachmentButton
            onAttach={(item) =>
              dispatch({ type: "ADD_ATTACHMENT", payload: item })
            }
          />
          <ModelPicker
            selectedModel={selectedModel}
            availableModels={availableModels}
            thinkingLevel={thinkingLevel}
            availableThinkingLevels={availableThinkingLevels}
            disabled={!sessionId || detached || lifecyclePending || !!configPending}
            onModelChange={(model) => sendConfig(modelConfigId, model)}
            onThinkingLevelChange={(level) => sendConfig(thinkingConfigId, level)}
          />
          <div className="toolbar-right input-actions-right">
            {isStreaming ? (
              <button
                type="button"
                className="btn-toggle-action stop"
                onClick={() =>
                  sessionId &&
                  sendAction({
                    type: "CANCEL_PROMPT",
                    payload: { sessionId, ...target },
                  })
                }
                title="Stop Generation"
              >
                <span
                  className="btn-icon-svg"
                  dangerouslySetInnerHTML={{ __html: ICONS.stop }}
                />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="button"
                className="btn-toggle-action send"
                onClick={handleSubmit}
                disabled={
                  !sessionId ||
                  detached ||
                  lifecyclePending ||
                  state.input.isSubmitting ||
                  !!configPending ||
                  isWaitingApproval ||
                  (!draft.trim() && attachments.length === 0)
                }
                title="Send Prompt (Enter)"
                dangerouslySetInnerHTML={{ __html: ICONS.send }}
              />
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}

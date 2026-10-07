import { useEffect, useRef, useState } from "preact/hooks";
import { HeaderBar } from "./header/header-bar";
import { ChatView } from "./chat/chat-view";
import { InputDock } from "./input/input-dock";
import { ConfigDrawer } from "./drawers/config-drawer";
import { HistoryDrawer } from "./drawers/history-drawer";
import { ActionProvider, type ActionSender } from "../state/action-context";
import { useAppStore } from "../state/store-context";

export function App({ onAction }: { onAction: ActionSender }) {
  const [state] = useAppStore();
  const [configOpen, setConfigOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const wasEmpty = useRef(false);
  const connections = state.agent.connections;
  const configCount = state.agent.agentConfigs.length;

  useEffect(() => {
    if (!Array.isArray(connections)) return;
    const empty = configCount === 0;
    if (empty && !wasEmpty.current) {
      setHistoryOpen(false);
      setConfigOpen(true);
    }
    wasEmpty.current = empty;
  }, [connections, configCount]);

  const handleActionIntercept: ActionSender = (action) => {
    if (action.type === "TOGGLE_CONFIG") {
      setHistoryOpen(false);
      setConfigOpen((prev) => !prev);
      return;
    }
    if (action.type === "TOGGLE_HISTORY") {
      setConfigOpen(false);
      setHistoryOpen((prev) => !prev);
      return;
    }
    onAction(action);
  };

  return (
    <ActionProvider onAction={handleActionIntercept}>
      <div className="acp-app">
        <HeaderBar />
        <div className="main-content">
          <ChatView />
        </div>
        {state.session.activeSession && <InputDock />}
        <ConfigDrawer open={configOpen} onClose={() => setConfigOpen(false)} />
        <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} />
      </div>
    </ActionProvider>
  );
}

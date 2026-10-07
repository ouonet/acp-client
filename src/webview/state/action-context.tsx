import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { ComponentChildren } from "preact";
import type { WebviewAction } from "../../shared/ipc-protocol";

export type ActionSender = (action: WebviewAction | { type: string; payload?: any }) => void;

const ActionContext = createContext<ActionSender>(() => {});

export function ActionProvider({
  onAction,
  children,
}: {
  onAction: ActionSender;
  children: ComponentChildren;
}) {
  return <ActionContext.Provider value={onAction}>{children}</ActionContext.Provider>;
}

export function useAction(): ActionSender {
  return useContext(ActionContext);
}

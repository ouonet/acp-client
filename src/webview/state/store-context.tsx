import { createContext } from "preact";
import { useContext, useEffect, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { AppStore, globalStore } from "./app-store";
import type { WebviewAppState } from "./types";

const StoreContext = createContext<AppStore>(globalStore);

export function StoreProvider({
  store = globalStore,
  children,
}: {
  store?: AppStore;
  children: ComponentChildren;
}) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useAppStore(): [WebviewAppState, AppStore["dispatch"]] {
  const store = useContext(StoreContext);
  const [state, setState] = useState<WebviewAppState>(store.getState());

  useEffect(() => {
    const unsubscribe = store.subscribe(setState);
    // READY can receive a snapshot before passive effects subscribe.
    setState(store.getState());
    return unsubscribe;
  }, [store]);

  return [state, store.dispatch.bind(store)];
}

export function useSessionState() {
  const [state] = useAppStore();
  return state.session;
}

export function useAgentState() {
  const [state] = useAppStore();
  return state.agent;
}

export function useInputState() {
  const [state] = useAppStore();
  return state.input;
}

import { useEffect, useState } from "preact/hooks";
import { useAppStore } from "./store-context";
import { useAction } from "./action-context";
import { makeDraft, serializeDraft, validateDraft, type ConfigDraft } from "./config-draft";
import { requestId } from "../utils/request-id";
export function useConfigDrafts() {
  const [state] = useAppStore();
  const send = useAction();
  const [selected, select] = useState<string>();
  const [drafts, setDrafts] = useState<Record<string, ConfigDraft>>({});
  const { agentConfigs, configRevisions, configResults, connectionResult } = state.agent;
  useEffect(() => {
    setDrafts(previous => {
      const next = { ...previous };
      for (const config of agentConfigs) {
        const old = next[config.id];
        if (!old) next[config.id] = makeDraft(config, configRevisions?.[config.id]);
        else if (!old.dirty && !old.save && old.baseRevision <= (configRevisions?.[config.id] || 0) && JSON.stringify(old.config) !== JSON.stringify(config)) next[config.id] = { ...makeDraft(config, configRevisions?.[config.id]), revision: old.revision + 1, cwdRevision: old.cwdRevision + 1, test: old.test };
      }
      return next;
    });
    if (!selected && agentConfigs[0]) select(agentConfigs[0].id);
  }, [agentConfigs, configRevisions]);
  const mutate = (id: string, fn: (draft: ConfigDraft) => ConfigDraft) => setDrafts(previous => previous[id] ? { ...previous, [id]: fn(previous[id]) } : previous);
  useEffect(() => {
    if (!configResults) return;
    setDrafts(previous => {
      const next = { ...previous };
      for (const [id, old] of Object.entries(previous)) {
        let d = old;
        const saved = old.save && configResults[old.save.id];
        if (saved && saved.configId === id) d = { ...d, save: undefined, error: saved.success ? undefined : saved.error || "Save failed", notice: saved.success ? "Saved" : undefined, baseRevision: saved.success ? saved.configRevision ?? d.baseRevision : d.baseRevision, dirty: saved.success && old.save?.revision === old.revision ? false : d.dirty };
        const picked = old.picker && configResults[old.picker.id];
        if (picked && picked.configId === id) {
          d = { ...d, picker: undefined };
          if (picked.success && picked.cwd !== undefined && old.picker?.revision === old.cwdRevision) d = { ...d, config: { ...d.config, cwd: picked.cwd }, revision: d.revision + 1, cwdRevision: d.cwdRevision + 1, dirty: true, result: undefined };
          if (!picked.success) d = { ...d, error: picked.error };
        }
        const deleted = old.deletion && configResults[old.deletion];
        if (deleted && deleted.configId === id) {
          if (deleted.success) { delete next[id]; if (selected === id) select(agentConfigs.find(c => c.id !== id)?.id); continue; }
          d = { ...d, deletion: undefined, error: deleted.error || "Delete failed" };
        }
        next[id] = d;
      }
      return next;
    });
  }, [configResults]);
  useEffect(() => {
    if (!connectionResult?.requestId || !connectionResult.configId) return;
    mutate(connectionResult.configId, d => {
      if (d.test?.id !== connectionResult.requestId) return d;
      return { ...d, test: undefined, result: d.test?.revision === d.revision ? connectionResult : undefined };
    });
  }, [connectionResult]);
  const draft = selected ? drafts[selected] : undefined;
  const update = (change: Partial<ConfigDraft>, fields?: Partial<ConfigDraft["config"]>) => {
    if (!selected) return;
    mutate(selected, d => ({ ...d, ...change, config: fields ? { ...d.config, ...fields } : d.config, revision: d.revision + 1, cwdRevision: fields && "cwd" in fields ? d.cwdRevision + 1 : d.cwdRevision, dirty: true, error: undefined, notice: undefined, result: undefined }));
  };
  const add = () => {
    const id = `agent-${requestId()}`;
    setDrafts(previous => ({ ...previous, [id]: { ...makeDraft({ id, name: "", command: "", args: [], env: {}, transport: "stdio", enabled: true }), dirty: true } }));
    select(id);
  };
  const submit = (operation: "save" | "test") => {
    if (!draft || !selected || draft[operation]) return;
    const error = validateDraft(draft);
    if (error) { mutate(selected, d => ({ ...d, error })); return; }
    const id = requestId(); mutate(selected, d => ({ ...d, [operation]: { id, revision: d.revision }, error: undefined, notice: undefined, result: undefined }));
    send({ type: operation === "save" ? "SAVE_AGENT_CONFIG" : "TEST_AGENT_CONNECTION", payload: { config: serializeDraft(draft), requestId: id, draftRevision: draft.revision, configRevision: draft.baseRevision } });
  };
  const pick = () => {
    if (!draft || !selected) return;
    const id = requestId(); mutate(selected, d => ({ ...d, picker: { id, revision: d.cwdRevision } }));
    send({ type: "PICK_AGENT_DIRECTORY", payload: { configId: selected, requestId: id, draftRevision: draft.revision, cwdRevision: draft.cwdRevision } });
  };
  const cancel = () => {
    if (!draft?.test || !selected) return;
    send({ type: "CANCEL_AGENT_TEST", payload: { configId: selected, requestId: requestId(), testRequestId: draft.test.id } });
    mutate(selected, d => ({ ...d, test: undefined, result: { cancelled: true } }));
  };
  const remove = () => {
    if (!draft || !selected || state.agent.connections?.some(c => c.agentId === selected)) return;
    if (!agentConfigs.some(c => c.id === selected)) { setDrafts(previous => { const next = { ...previous }; delete next[selected]; return next; }); select(agentConfigs[0]?.id); return; }
    const id = requestId(); mutate(selected, d => ({ ...d, deletion: id }));
    send({ type: "DELETE_AGENT_CONFIG", payload: { agentId: selected, requestId: id, configRevision: draft.baseRevision } });
  };
  return { draft, drafts, selected, select, update, add, submit, pick, cancel, remove, connected: state.agent.connections?.some(c => c.agentId === selected) };
}

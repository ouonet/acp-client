import { ModalDrawer } from "./modal-drawer";
import { useConfigDrafts } from "../../state/use-config-drafts";
import { ConfigForm } from "./config-form";
export function ConfigDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const form = useConfigDrafts();
  const { draft, drafts, selected, select, add, submit, pick, cancel, remove, update, connected } = form;
  if (!open) return null;
  return <ModalDrawer label="Agent Configurations" className="config-drawer lifecycle-config" onClose={onClose}>
      <div className="drawer-header"><h2>Agent Configurations</h2><button type="button" className="btn-close" aria-label="Close Config" onClick={onClose}>×</button></div>
      <div className="config-selector"><select className="form-control" aria-label="Configuration to edit" value={selected || ""} onChange={e => select(e.currentTarget.value)}>
        {!selected && <option value="">Create an Agent</option>}{Object.entries(drafts).map(([id, d]) => <option key={id} value={id}>{d.config.name || "New Agent"}{d.dirty ? " *" : ""}</option>)}
      </select><button type="button" onClick={add}>Add Agent</button></div>
      <div className="drawer-body config-body">
        {draft ? <>
          <ConfigForm draft={draft} update={update} pick={pick} />
          {connected && <p className="launch-config-notice">The connected Agent keeps its launch configuration. Saved changes apply after reconnect.</p>}
          {draft.error && <p role="alert" className="inline-error">{draft.error}</p>}
          {draft.notice && <p role="status">{draft.notice}{draft.dirty ? " · Newer edits remain unsaved" : ""}</p>}
          {draft.test && <p role="status">Testing connection…</p>}
          {draft.result && <section aria-label="Connection test result" role={draft.result.success ? "status" : "alert"}>
            <h3>{draft.result.cancelled ? "Test cancelled" : draft.result.success ? "Connection successful" : "Connection failed"}</h3>
            {draft.result.error && <p>{draft.result.error}</p>}
            {draft.result.durationMs !== undefined && <p>Duration: {draft.result.durationMs} ms</p>}
            {draft.result.protocolVersion !== undefined && <p>Protocol: {draft.result.protocolVersion}</p>}
            {draft.result.capabilities && <details><summary>Reported capabilities</summary><pre>{JSON.stringify(draft.result.capabilities, null, 2)}</pre></details>}
          </section>}
        </> : <p>Add an Agent to configure its executable, arguments and environment.</p>}
      </div>
      <footer className="config-form-actions">
        <button type="button" aria-label="Delete Agent" disabled={!draft || connected || !!draft.deletion} title={connected ? "Disconnect this Agent before deleting its configuration" : "Delete configuration"} onClick={remove}>Delete</button>
        {draft?.test ? <button type="button" onClick={cancel}>Cancel Test</button> : <button type="button" disabled={!draft} onClick={() => submit("test")}>Test Connection</button>}
        <button type="button" className="btn-primary" disabled={!draft || !!draft.save} onClick={() => submit("save")}>{draft?.save ? "Saving…" : "Save"}</button>
      </footer>
  </ModalDrawer>;
}

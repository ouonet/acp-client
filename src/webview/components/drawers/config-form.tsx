import type { ConfigDraft } from "../../state/config-draft";
export function ConfigForm({ draft, update, pick }: { draft: ConfigDraft; update: (change: Partial<ConfigDraft>, fields?: Partial<ConfigDraft["config"]>) => void; pick: () => void }) {
  const text = (label: string, value: string, onInput: (value: string) => void) => <label className="form-label">{label}<input className="form-control" aria-label={label} value={value} onInput={e => onInput(e.currentTarget.value)} /></label>;
  return <div className="agent-edit-form">
    {text("Agent Name", draft.config.name, name => update({}, { name }))}
    {text("Execution Command", draft.config.command, command => update({}, { command }))}
    {text("Arguments", draft.argsText, argsText => update({ argsText }))}
    <p className="field-help">Use quotes around arguments containing spaces. The executable runs directly.</p>
    <div className="directory-field">{text("Working Directory", draft.config.cwd || "", cwd => update({}, { cwd }))}<button type="button" disabled={!!draft.picker} onClick={pick}>Browse…</button></div>
    <fieldset><legend>Environment variables</legend>
      {draft.envRows.map((row, index) => <div key={index} className="environment-row">
        <input aria-label={`Environment key ${index + 1}`} placeholder="KEY" className="form-control" value={row.key} onInput={e => update({ envRows: draft.envRows.map((r, i) => i === index ? { ...r, key: e.currentTarget.value } : r) })} />
        <input aria-label={`Environment value ${index + 1}`} type="password" placeholder="Value" className="form-control" value={row.value} onInput={e => update({ envRows: draft.envRows.map((r, i) => i === index ? { ...r, value: e.currentTarget.value } : r) })} />
        <button type="button" aria-label={`Remove environment variable ${index + 1}`} onClick={() => update({ envRows: draft.envRows.filter((_, i) => i !== index) })}>×</button>
      </div>)}
      <button type="button" onClick={() => update({ envRows: [...draft.envRows, { key: "", value: "" }] })}>Add variable</button>
      <p className="field-help">Values are masked here and stored in the Agent configuration.</p>
    </fieldset>
    <label className="checkbox-label"><input type="checkbox" aria-label="Enabled" checked={draft.config.enabled} onChange={e => update({}, { enabled: e.currentTarget.checked })} />Enabled for future connections</label>
    <p>Transport: {draft.config.transport === "stdio" ? "Standard input/output (stdio)" : "WebSocket — unsupported"}</p>
  </div>;
}

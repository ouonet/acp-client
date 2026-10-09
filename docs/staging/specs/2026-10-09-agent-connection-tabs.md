# Agent connection tabs

## Decisions

contract: A measured connection has one interactive surface. It is a strip tab or an overflow menu row. The off-flow measurer is not a second surface.

contract: A strip tab uses VS Code editor-tab chrome on the tab only. `.agent-header` background stays as it is. The tab sets `border-radius: 0`, a `1px` top border, `--vscode-tab-inactiveBackground`, and `--vscode-tab-inactiveForeground`. The selected tab uses `--vscode-tab-activeBackground`, `--vscode-tab-activeForeground`, and `border-top-color: var(--vscode-tab-activeBorderTop, var(--vscode-focusBorder))`. Hover on an unselected tab uses `--vscode-tab-hoverBackground` and `--vscode-tab-hoverForeground`.

contract: The strip disconnect control is inside `[role="tab"]`, at the inline end. The tab always reserves it with `padding-inline-end: 22px`. The control is `position: absolute` and `16px` square, so showing it does not change the tab width. `.agent-tab .agent-tab-close` is `opacity: 0` and `pointer-events: none`. `.agent-tab:hover` and `.agent-tab:focus-within` reveal it. Menu disconnect controls stay visible and do not use those rules.

contract: `packAgentTabs(widths: readonly number[], containerWidth: number, menuWidth: number, gap: number)` in `src/webview/utils/pack-agent-tabs.ts` returns `{ visible: number[]; overflow: number[] }`. Indexes follow `widths`. `visible` is a prefix and `overflow` is the suffix. For `n = 0`, both arrays are empty. Otherwise `total = sum(widths) + gap * (n - 1)`. When `total <= containerWidth`, `visible` is every index and `menuWidth` is not used. When `total > containerWidth`, `budget = containerWidth - menuWidth` and the prefix grows while `used + delta <= budget`, where `delta` is `width` for the first accepted tab and `gap + width` after that. The first failure ends the prefix. `budget <= 0` yields an empty prefix.

contract: The component calls the packer only when `containerWidth > 0` and every width is `> 0`. Otherwise it renders every connection as a strip tab and omits the menu. A measured pack whose prefix is empty renders no strip tab, lists every connection in the menu, and still shows the menu control.

contract: The budget element wraps the tablist and `.agent-overflow`. Its `clientWidth` is `containerWidth`. `gap` is `4`. `menuWidth` is `32` (`28px` control plus the `4px` gap in front of it). Each width is the `offsetWidth` of `[data-measure-agent="<id>"]` and includes the reserved close slot, status dot, label, and badge. The strip tab is that node. An overflowed connection keeps the node off-flow (`position: absolute`, not `display: none`, `aria-hidden="true"`, no `role="tab"`).

contract: Packing does not move the selected agent. Connection order stays stable. A selected strip tab has `aria-selected="true"` and is absent from the menu. When the selected agent is in the menu, that row has `aria-selected="true"` and every strip tab has `aria-selected="false"`.

contract: The roving tab stop is the selected strip tab, or the first strip tab when the selection is in the menu. That tab has `tabIndex={0}`; other strip tabs have `tabIndex={-1}`. Its disconnect control has `tabIndex={0}`; the others have `tabIndex={-1}`.

contract: ArrowLeft and ArrowRight move one strip tab and stop at the ends. Home and End move to the first and last strip tab. The move selects that agent and focuses its tab. The same keys do nothing when the event target is a disconnect control. Click, Enter, and Space on a strip tab send `SELECT_AGENT`. Moving focus onto the roving tab without one of those activations does not send it. A strip with no tabs has no tab stop.

contract: A menu row has a select button labeled `${name} · ${status}` and a disconnect button labeled `Disconnect ${name}`. The select button sends `SELECT_AGENT`. Either disconnect control sends `DISCONNECT_AGENT` and does not send `SELECT_AGENT`. Both disconnect controls are disabled while `agent.lifecyclePending[agentId]` is set.

contract: `SELECT_AGENT` stays a local selection and adds no error UI. Disconnect errors keep the existing header alert.

failure: When focus is inside a strip tab that this layout drops from the strip, focus moves to the overflow summary.

scope: `src/webview/components/header/header-bar.tsx`, `src/webview/styles/lifecycle.css`, `src/webview/utils/pack-agent-tabs.ts`, `test/webview/lifecycle-interaction-regressions.test.tsx`, and `test/webview/pack-agent-tabs.test.ts`.

scope: Config-panel `.agent-tabs-bar`, the connection-information dialog, the connect menu, and Agent Settings stay as they are. Middle-click close, tab shrinking, and pinning the active tab are out.

test: `packAgentTabs` returns empty arrays for `[]`. `[80]` at container `100`, menu `32`, gap `4` is visible. `[80]` at container `70` overflows. `[100, 100, 100]` at container `308` is all visible. The same widths at container `307` return visible `[0, 1]` and overflow `[2]`. `[100, 100]` at container `120` overflows both. `[10, 10]` at container `20` overflows both because the budget is negative.

test: Header tests mock `offsetWidth` on `[data-measure-agent]` and `clientWidth` on the budget element. Two fitting tabs omit `.agent-overflow`. A wider suffix appears once in the menu and selecting it sends `SELECT_AGENT`. A single tab wider than the strip is not a `[role="tab"]` and appears once in the menu. A budget that fits no tab renders no `[role="tab"]` and lists every connection. Width `0` renders every connection as a `[role="tab"]` and omits the menu.

test: With the selected agent in the suffix, that menu row has `aria-selected="true"`, every strip tab has `aria-selected="false"`, and the first strip tab is the only `tabIndex={0}` tab. A selected strip tab has `aria-selected="true"` and is absent from the menu.

test: The disconnect control is inside `[role="tab"]`. Activating it sends `DISCONNECT_AGENT` and does not send `SELECT_AGENT`. `agent.lifecyclePending[agentId]` disables that control in the strip and in the menu. ArrowRight focuses and selects the next tab. ArrowRight on the last tab and ArrowLeft on the first tab do not change selection. Home and End select the ends. ArrowRight from the disconnect control does not move. An empty strip has no `[role="tab"]`.

test: Dropping the focused tab from the strip moves `document.activeElement` to the overflow summary.

test: `lifecycle.css` contains the inactive, active, hover, and top-border tokens above, `border-radius: 0`, `padding-inline-end: 22px`, and the close control's absolute box plus the hover and focus-within reveal.

convention: Preact function components and TypeScript. The packer is pure: no DOM and no `vscode` import. Actions stay `SELECT_AGENT` and `DISCONNECT_AGENT`. Tab chrome stays in `lifecycle.css` and uses VS Code theme tokens. Tests use Vitest and happy-dom. Checks are `npm test`, `npm run lint`, and `npm run build`.

## Working notes

- Today the close control is a sibling after the tab. `.agent-overflow` opens only when `connections.length > 1` and the strip `scrollWidth` exceeds `clientWidth`, then repeats every connection. Both behaviors change.
- `:focus-within` is the keyboard counterpart of hover. The menu disconnect control stays visible because that row has no hover-only slot.
- Arrow keys stop at the ends. The current wrap behavior goes away so the strip matches editor tabs.
- Unmeasured `offsetWidth` is `0` in happy-dom and on a hidden first frame. The guard keeps the strip until real pixels exist, which stops a false all-in-menu collapse.
- Review: triggers 1 and 3 fired. `spec-compliance` returned conflicts on tab-versus-row wording, all-fit versus all-in-menu, and arrow focus versus select, plus missing tests for keyboard ends, pending disable, the close slot, the unmeasured guard, and focus restore. Those are fixed above. `consistency` failed before it reported (`reqwest` stream error). The coordinator applied that charter in the same pass: all-fit runs before the menu budget, the measurer is not an interactive surface, and menu disconnect visibility is excluded from the strip hover rule.

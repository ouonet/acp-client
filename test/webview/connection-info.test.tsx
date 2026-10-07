// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { AppStore } from "../../src/webview/state/app-store";
import { StoreProvider } from "../../src/webview/state/store-context";
import { ConnectionInfo } from "../../src/webview/components/header/connection-info";

let root: HTMLElement;
let store: AppStore;
beforeEach(() => {
  root = document.createElement("div"); document.body.append(root);
  store = new AppStore();
});
afterEach(() => { render(null, root); root.remove(); });
async function mount(capabilities?: any, clientCapabilities?: any) {
  store.dispatch({ type: "APPLY_SNAPSHOT", payload: {
    agentConfigs: [], sessions: [], connections: [{
      agentId: "a", status: "running", generation: 1, initialized: true,
      capabilities, clientCapabilities,
    }],
  } });
  await act(() => render(<StoreProvider store={store}><ConnectionInfo agentId="a" onClose={() => {}} onReconnect={() => {}} /></StoreProvider>, root));
}
function group(label: string) {
  return Array.from(root.querySelectorAll("section")).find(section => section.querySelector("h4")?.textContent === label)!;
}
describe("Connection capability information", () => {
  it("includes loadSession alongside the advertised lifecycle methods", async () => {
    const caps = { loadSession: true, sessionCapabilities: { list: {}, delete: {}, fork: {}, resume: {}, close: {} } };
    await mount(caps);
    expect(JSON.parse(group("Session and history").querySelector("pre")!.textContent!)).toEqual({ loadSession: true, ...caps.sessionCapabilities });
    expect(JSON.parse(root.querySelector("details pre")!.textContent!)).toEqual(caps);
  });
  it("distinguishes baseline prompt support from optional content declarations", async () => {
    await mount({ loadSession: true });
    expect(group("Prompt content").textContent).toContain("Text and resource links");
    expect(group("Prompt content").textContent).toContain("Not reported");
  });
  it("shows the actual offered filesystem capabilities", async () => {
    const offered = { fs: { readTextFile: true, writeTextFile: false }, terminal: false };
    await mount({}, offered);
    expect(root.textContent).toContain("Read text files: offered");
    expect(root.textContent).toContain("Write text files: not offered");
    expect(root.textContent).toContain("Terminal: not offered");
    expect(JSON.parse(root.querySelector('[data-client-capabilities]')!.textContent!)).toEqual(offered);
  });
  it("does not invent capabilities when the handshake snapshot is missing", async () => {
    await mount();
    expect(group("Session and history").textContent).toContain("Not reported");
    expect(root.textContent).toContain("Client capabilities unavailable");
    expect(root.textContent).not.toContain("Filesystem: read and write text files");
  });
});

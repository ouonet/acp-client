// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpInspectorComponent } from "../../src/webview/components/mcp-inspector";
import type { McpServerConfig, McpToolInfo } from "../../src/core/types/config";

describe("T3: McpInspectorComponent & Tool Schema Explorer", () => {
  let container: HTMLElement;

  const sampleServers: McpServerConfig[] = [
    {
      id: "srv-github",
      name: "github",
      command: "npx -y @modelcontextprotocol/server-github",
      args: [],
      transport: "stdio",
      enabled: true,
    },
    {
      id: "srv-postgres",
      name: "postgres",
      command: "",
      args: [],
      transport: "sse",
      url: "http://localhost:8080",
      enabled: true,
    },
  ];

  const sampleTools: McpToolInfo[] = [
    {
      serverId: "srv-github",
      serverName: "github",
      name: "create_issue",
      description: "Create a new issue in a specified GitHub repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          title: { type: "string" },
        },
        required: ["owner", "repo", "title"],
      },
      enabled: true,
    },
    {
      serverId: "srv-github",
      serverName: "github",
      name: "search_repositories",
      description: "Search public and private GitHub repositories",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "number" },
        },
      },
      enabled: false,
    },
  ];

  beforeEach(() => {
    container = document.createElement("div");
    document.body.innerHTML = "";
    document.body.appendChild(container);
  });

  it("should render server chips, tools list with parameters schema and checkboxes", () => {
    new McpInspectorComponent({
      container,
      servers: sampleServers,
      tools: sampleTools,
    });

    expect(container.textContent).toContain("MCP Server & Tool Inspector");
    expect(container.textContent).toContain("github");
    expect(container.textContent).toContain("postgres");

    const toolCards = container.querySelectorAll(".mcp-tool-card");
    expect(toolCards.length).toBe(2);

    expect(toolCards[0].textContent).toContain("create_issue");
    expect(toolCards[0].textContent).toContain("owner (string)");
    expect(toolCards[0].textContent).toContain("repo (string)");

    const checkboxes =
      container.querySelectorAll<HTMLInputElement>(".mcp-tool-toggle");
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[1].checked).toBe(false);
  });

  it("should trigger onToggleTool when tool checkbox state changes", () => {
    const onToggleTool = vi.fn();
    new McpInspectorComponent({
      container,
      servers: sampleServers,
      tools: sampleTools,
      onToggleTool,
    });

    const checkbox =
      container.querySelectorAll<HTMLInputElement>(".mcp-tool-toggle")[0];
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onToggleTool).toHaveBeenCalledWith(
      "srv-github",
      "create_issue",
      false,
    );
  });

  it("should trigger onTestTool when Test Tool Call button is clicked", () => {
    const onTestTool = vi.fn();
    new McpInspectorComponent({
      container,
      servers: sampleServers,
      tools: sampleTools,
      onTestTool,
    });

    const testBtn = container.querySelector(
      ".btn-test-mcp-tool",
    ) as HTMLButtonElement;
    expect(testBtn).not.toBeNull();
    testBtn.click();

    expect(onTestTool).toHaveBeenCalledWith(
      "srv-github",
      "create_issue",
      expect.anything(),
    );
  });

  it("should trigger onClose when close button is clicked", () => {
    const onClose = vi.fn();
    new McpInspectorComponent({
      container,
      servers: sampleServers,
      tools: sampleTools,
      onClose,
    });

    const closeBtn = container.querySelector(
      ".drawer-close-btn",
    ) as HTMLElement;
    closeBtn.click();

    expect(onClose).toHaveBeenCalled();
  });
});

/**
 * McpInspectorComponent: Visual MCP server and tool schema inspector drawer
 */

import type { McpServerConfig, McpToolInfo } from "../../core/types/config";
import { ICONS } from "./icons";

export interface McpInspectorOptions {
  container: HTMLElement;
  servers: McpServerConfig[];
  tools: McpToolInfo[];
  onToggleTool?: (serverId: string, toolName: string, enabled: boolean) => void;
  onToggleServer?: (serverId: string, enabled: boolean) => void;
  onTestTool?: (serverId: string, toolName: string, params: any) => void;
  onClose?: () => void;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export class McpInspectorComponent {
  private container: HTMLElement;
  private options: McpInspectorOptions;
  private servers: McpServerConfig[];
  private tools: McpToolInfo[];
  private activeServerId?: string;

  constructor(options: McpInspectorOptions) {
    this.container = options.container;
    this.options = options;
    this.servers = [...options.servers];
    this.tools = [...options.tools];
    this.activeServerId = options.servers[0]?.id;

    this.render();
  }

  public setServersAndTools(
    servers: McpServerConfig[],
    tools: McpToolInfo[],
  ): void {
    this.servers = [...servers];
    this.tools = [...tools];
    this.render();
  }

  private formatParams(schema: any): string {
    if (!schema || !schema.properties) return "None";
    return Object.entries(schema.properties)
      .map(([k, v]: [string, any]) => `${k} (${v.type || "any"})`)
      .join(", ");
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="drawer-header">
        <div class="drawer-title" style="display: flex; align-items: center; gap: 8px;">
          ${ICONS.plug}
          <span>MCP Server & Tool Inspector</span>
        </div>
        <button class="drawer-close-btn" type="button" title="Close Drawer">${ICONS.close}</button>
      </div>
      <div class="drawer-body">
        <div class="mcp-servers-bar">
          ${this.servers
            .map(
              (s) => `
            <div class="mcp-server-chip ${s.id === this.activeServerId ? "active" : ""}" data-server-id="${s.id}">
              <span class="status-indicator">●</span>
              <span class="server-name">${escapeHtml(s.name)}</span>
              <span class="server-transport">(${s.transport})</span>
            </div>
          `,
            )
            .join("")}
        </div>

        <div class="mcp-tools-header">
          <span>Available Tools (${this.tools.length})</span>
        </div>

        <div class="mcp-tools-list">
          ${this.tools
            .map(
              (t) => `
            <div class="mcp-tool-card" data-server-id="${t.serverId}" data-tool-name="${t.name}">
              <div class="mcp-tool-header">
                <label class="mcp-tool-toggle-label">
                  <input
                    type="checkbox"
                    class="mcp-tool-toggle"
                    data-server-id="${t.serverId}"
                    data-tool-name="${t.name}"
                    ${t.enabled ? "checked" : ""}
                  />
                  <strong class="tool-name">${escapeHtml(t.name)}</strong>
                </label>
                <button class="btn-test-mcp-tool" type="button" title="Test tool call" style="display: flex; align-items: center; gap: 4px;">${ICONS.bolt} <span>Test Tool Call</span></button>
              </div>
              <div class="mcp-tool-desc">${escapeHtml(t.description || "No description provided")}</div>
              <div class="mcp-tool-params">
                <span class="params-label">Parameters:</span>
                <span class="params-val">${escapeHtml(this.formatParams(t.inputSchema))}</span>
              </div>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents(): void {
    this.container
      .querySelector(".drawer-close-btn")
      ?.addEventListener("click", () => {
        this.options.onClose?.();
      });

    const checkboxes =
      this.container.querySelectorAll<HTMLInputElement>(".mcp-tool-toggle");
    checkboxes.forEach((cb) => {
      cb.addEventListener("change", () => {
        const sId = cb.getAttribute("data-server-id") || "";
        const tName = cb.getAttribute("data-tool-name") || "";
        this.options.onToggleTool?.(sId, tName, cb.checked);
      });
    });

    const testBtns = this.container.querySelectorAll(".btn-test-mcp-tool");
    testBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = btn.closest(".mcp-tool-card");
        const sId = card?.getAttribute("data-server-id") || "";
        const tName = card?.getAttribute("data-tool-name") || "";
        this.options.onTestTool?.(sId, tName, {});
      });
    });
  }
}

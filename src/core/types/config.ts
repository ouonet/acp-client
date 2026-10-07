/**
 * Agent Configuration & Tool/Skill Definitions
 */

export interface AgentConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
  transport: "stdio" | "websocket";
  websocketUrl?: string;
  enabled: boolean;
  isPreset?: boolean;
  models?: string[];
  defaultModel?: string;
  supportsThinking?: boolean;
  mcpServerIds?: string[];
  autoApprove?: string[];
}

export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  transport: "stdio" | "sse" | "websocket";
  url?: string;
  enabled: boolean;
}

export interface McpToolInfo {
  serverId: string;
  serverName: string;
  name: string;
  description?: string;
  inputSchema: any;
  enabled: boolean;
}

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  path: string;
  scope: "workspace" | "global";
  triggers?: string[];
  content: string;
}

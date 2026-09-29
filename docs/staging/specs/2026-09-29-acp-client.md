# Spec: VS Code ACP Client Extension

milestone: M1 (see docs/ROADMAP.md)

## Decisions

### Architecture
- Decoupled 3-layer architecture:
  - `src/core/`: Headless ACP client engine (zero VS Code API dependencies, pure Node.js/TypeScript). Contains `ProcessManager`, `SessionHub`, `StorageManager`, and Protocol Transports.
  - `src/webview/`: Frontend SPA (React + Tailwind/VS Code theme CSS). Handles multi-session tabs, fine-grained markdown & thinking streaming, tool approval cards, visual configuration UI, and input history navigation.
  - `src/extension/`: VS Code extension host bridge. Registers Webview providers, commands, status bar items, and native `vscode.chat.createChatParticipant` integration.
- Stdio transport uses `@agentclientprotocol/sdk` JSON-RPC 2.0 framing with line/chunk buffering and process supervision.

### Contracts

#### 1. Agent Configuration (`src/core/types/config.ts`)
```typescript
interface AgentConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
  transport: 'stdio' | 'websocket';
  websocketUrl?: string;
  enabled: boolean;
  isPreset?: boolean;
  models?: string[]; // 支持的模型清单
  defaultModel?: string;
  supportsThinking?: boolean; // 是否支持思维链/推理级别调节
  mcpServerIds?: string[]; // 关联挂载的 MCP 服务器列表
}

interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  transport: 'stdio' | 'sse' | 'websocket';
  url?: string;
  enabled: boolean;
}

interface McpToolInfo {
  serverId: string;
  serverName: string;
  name: string;
  description?: string;
  inputSchema: any;
  enabled: boolean;
}

interface SkillInfo {
  id: string;
  name: string;
  description: string;
  path: string;
  scope: 'workspace' | 'global';
  triggers?: string[];
  content: string;
}
```

#### 2. Process Manager (`src/core/process/process-manager.ts`)
```typescript
type ProcessStatus = 'stopped' | 'starting' | 'running' | 'restarting' | 'error';

interface ProcessStatusEvent {
  agentId: string;
  status: ProcessStatus;
  pid?: number;
  error?: string;
}

interface IProcessManager {
  start(agentConfig: AgentConfig): Promise<AgentProcess>;
  stop(agentId: string, force?: boolean): Promise<void>;
  restart(agentId: string): Promise<AgentProcess>;
  getStatus(agentId: string): ProcessStatus;
  getProcess(agentId: string): AgentProcess | undefined;
  onStatusChange(listener: (event: ProcessStatusEvent) => void): Disposable;
  dispose(): Promise<void>;
}
```

#### 3. Session & Session Hub (`src/core/session/session.ts`, `src/core/session/session-hub.ts`)
```typescript
type SessionStatus = 'idle' | 'streaming' | 'waiting_approval' | 'error';
type ThinkingLevel = 'off' | 'low' | 'medium' | 'high';

interface PromptOptions {
  contextFiles?: string[];
  systemPrompt?: string;
  model?: string; // 指定本轮模型
  thinkingLevel?: ThinkingLevel; // 思考等级
  thinkingBudgetTokens?: number; // 思考预算 Token 上限
  activeSkills?: string[]; // 显式激活或自动触发的 Skill 列表
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string; uri?: string }
  | { type: 'audio'; data: string; mimeType: string }
  | { type: 'resource'; resource: { uri: string; text?: string; blob?: string; mimeType?: string } }
  | { type: 'resource_link'; uri: string; name?: string; mimeType?: string };

interface MessageChunk {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | ContentBlock[];
  thinking?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    input: any;
    output?: any;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'denied';
  }>;
}

interface ForkSessionOptions {
  upToMessageIndex?: number;
  newAgentId?: string;
  newModel?: string;
  title?: string;
}

interface SessionData {
  id: string;
  agentId: string;
  title: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  createdAt: number;
  updatedAt: number;
  status: SessionStatus;
  messages: MessageChunk[];
  parentSessionId?: string;
  forkedFromMessageIndex?: number;
}

interface SessionSummary {
  id: string;
  agentId: string;
  title: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  createdAt: number;
  updatedAt: number;
  status: SessionStatus;
  messageCount: number;
  parentSessionId?: string;
}

interface SessionEvent {
  type: 'chunk' | 'thinking' | 'tool_call' | 'tool_result' | 'permission_request' | 'status_change' | 'error';
  sessionId: string;
  payload: any;
}

interface ISession {
  readonly id: string;
  readonly agentId: string;
  title: string;
  readonly createdAt: number;
  status: SessionStatus;
  parentSessionId?: string;
  forkedFromMessageIndex?: number;
  prompt(text: string, options?: PromptOptions): Promise<void>;
  cancel(): Promise<void>;
  respondPermission(requestId: string, decision: 'allow' | 'deny', options?: any): Promise<void>;
  onEvent(listener: (event: SessionEvent) => void): Disposable;
  serialize(): SessionData;
}

interface ISessionHub {
  createSession(agentId: string, title?: string): Promise<ISession>;
  forkSession(sourceSessionId: string, options?: ForkSessionOptions): Promise<ISession>;
  getSession(sessionId: string): ISession | undefined;
  listSessions(): SessionSummary[];
  deleteSession(sessionId: string): Promise<void>;
  setActiveSession(sessionId: string): void;
  getActiveSession(): ISession | undefined;
  onSessionListChange(listener: (sessions: SessionSummary[]) => void): Disposable;
  onActiveSessionChange(listener: (session: ISession | undefined) => void): Disposable;
}
```

#### 4. Storage & History (`src/core/storage/storage-manager.ts`)
```typescript
interface IStorageManager {
  saveSession(sessionData: SessionData): Promise<void>;
  loadSession(sessionId: string): Promise<SessionData | null>;
  listSavedSessions(): Promise<SessionSummary[]>;
  deleteSavedSession(sessionId: string): Promise<void>;
  recordInputHistory(prompt: string): Promise<void>;
  getInputHistory(): Promise<string[]>;
  saveAgentConfigs(configs: AgentConfig[]): Promise<void>;
  getAgentConfigs(): Promise<AgentConfig[]>;
}
```

### Use Cases (UC)

- **UC-01: Agent 视觉化配置与健康探测 (Visual Agent Configuration & Health Probe)**
  - 开发者打开“Agent Settings”页面，可视化添加或修改 Agent 参数（名称、启动命令、启动参数、环境变量键值对、工作目录、Stdio/WebSocket 传输方式）。
  - 点击 `[Test Connection / Ping]`，后台尝试拉起进程并发送 ACP `initialize` 请求；如果成功，展示协议版本、支持的工具列表与健康状态绿点（●）；如果失败，弹出包含退出码、stderr 诊断日志的错误面板。

- **UC-02: 多 Session 并行创建与独立调度 (Multi-Session Concurrent Hub)**
  - 开发者通过顶部 Tab 或快捷键新建 Session，可为不同 Session 指定不同的 Agent（例如 Session 1 使用 Claude Code 编写业务，Session 2 使用 Codex 分析架构）。
  - 多个 Session 彼此隔离并发运行：当 Session 1 正在流式输出或等待工具权限审批时，切换到 Session 2 可以正常输入与提问，后台 Session 1 状态与输出流不中断、不丢失。

- **UC-03: 流式交互与精细消息渲染 (Fine-Grained Stream & Thinking Blocks)**
  - Agent 流式返回时，支持折叠式思维链卡片：`[▾ Thinking (耗时 4.2s)]`，展开后可阅读详细思考推演过程，收起后保持对话流整洁。
  - 响应中的代码块支持完整的 VS Code 主题语法高亮、行号展示、一键复制代码、一键写入光标位置或新建文件。
  - 普通文本支持 GFM Markdown（表格、任务列表、公式）。

- **UC-04: 工具执行与安全权限拦截 (Tool Call & Permission Gate)**
  - 当 Agent 尝试调用危险操作（如终端执行 `npm test`、文件重写 `fs/writeFile`）时，UI 渲染专用的“工具审批卡片”。
  - 卡片清晰展示调用的工具名称、参数详情及影响路径；
  - 提供三级操作按钮：`[Allow Once]`（本次允许）、`[Always Allow in Session]`（本会话免询问）和 `[Reject]`（拒绝并向 Agent 回传拒绝原因）。

- **UC-05: 交互式代码 Diff 审查与写入 (Interactive Diff Review)**
  - 当 Agent 提出修改现有文件时，在聊天区直接呈现紧凑的行级 Diff 视图（绿色新增、红色删除），支持行内对比或分栏对比。
  - 用户可点击 `[Accept All]` 直接写入本地磁盘，点击 `[Open in VS Code Diff Editor]` 调出原生双列对比编辑器进行二次手动微调。

- **UC-06: 输入框历史回溯与快捷操作 (Input History Ring Buffer & Ergonomics)**
  - **动态二合一按钮（Send/Stop Toggle）**：`Send` 与 `Stop` 按钮复用同一个控件位置以极大节省输入栏横向空间。空闲就绪时呈现为发送按钮 `[⏎ Send]`（有文本时激活）；当会话处于流式生成（`streaming`）或工具等待中时，按钮平滑转换为停止按钮 `[⏹ Stop]`，点击立即派发 `session/cancel` 终止任务。
  - **输入历史回溯**：输入框支持类似 Bash/Zsh 终端的快捷键盘回溯：光标在输入框首行或空白时按 `↑`（Up 键）自动回显上一条提交过的 Prompt，按 `↓`（Down 键）向下翻阅。
  - 连续相同 Prompt 自动去重，持久化存储上限 100 条。
  - 支持快捷 Slash 指令输入（例如 `/clear` 清空当前会话显示、`/agent` 快捷切换当前 Agent）。

- **UC-07: 完整的会话历史管理与恢复 (Session History & Persistence)**
  - 侧边栏/顶部点击“History”按钮唤出会话抽屉，按时间分组展示所有历史会话（Today, Yesterday, Earlier），显示标题、最后更新时间、消息条数、绑定 Agent。
  - 支持关键字模糊检索、一键重命名、导出 Markdown 以及删除历史。
  - 点击任意历史会话立即恢复完整上下文（包括历史 Tool Call 卡片与输出）。

- **UC-08: Agent 进程全生命周期监控与崩溃自愈 (Process Supervisor & Diagnostics)**
  - 顶栏常驻 Agent 状态指示灯（● Running, PID 32411 / ⚪ Stopped / 🔴 Error）。
  - 点击指示灯弹出进程操作菜单：`[Restart Process]`、`[Stop Process]`、`[View Raw Logs]`。
  - 若子进程异常崩溃退出，UI 自动弹出自愈卡片（包含 Crash 堆栈），已接收的消息不受破坏，并提供一键 `[Restart & Resume Session]`。

- **UC-09: 会话 Fork 与多路线探索 (Session Fork & Branching)**
  - 开发者在对话过程中，若想尝试不同的技术路线（如“方案 A：直接改核心” vs “方案 B：增加适配层”），或换用另一个 Agent 重新探讨，可在任意一条助手消息悬浮菜单中点击 `[🔀 Fork from here]`，或在会话 Tab 右键/顶栏点击 `[🔀 Fork Session]`。
  - 系统以当前截断点为基准深拷贝会话消息历史，分配全新的独立 `sessionId`（记录 `parentSessionId` 与分叉索引），并在新的 Tab 打开。
  - 新分支的后续提问、工具执行与状态变更与原会话完全隔离，互不干扰，历史抽屉中清晰展现分支从属关系树。

- **UC-10: 多模态交互支持 (Multimodal Content Blocks: Image, Audio, Resources)**
  - **用户输入多模态**：支持直接在输入框粘贴截图（`Cmd+V` / `Ctrl+V`）、拖拽本地图片文件或点击附件按钮上传。客户端自动转为 Base64 编码的 `image` ContentBlock 并附带 `mimeType` 发送给 Agent；
  - **Agent 输出多模态**：当 Agent 生成图片（如架构图、页面预览截图）或音频结果时，Webview 聊天流原生渲染 Lightbox 图片预览（支持放大、下载、复制）与轻量音频播放控件；
  - **协商降级**：客户端在 `initialize` 时宣告 `image`/`audio` 能力，若连接的 Agent 声明不支持多模态，输入框自动禁用图片发送并给予友好提示。

- **UC-11: 模型切换与思考级别/预算调节 (Model Picker & Thinking Level/Budget Control)**
  - **模型选择器（Model Picker）**：输入框底部常驻下拉选择器，展示当前 Agent 支持的模型列表（如 `claude-3-7-sonnet`, `claude-3-5-sonnet`, `gpt-4o`, `o3-mini`, `gemini-2.5-pro`），支持按会话或按单轮 Prompt 自由切换；
  - **思考级别/预算（Thinking Level & Budget）**：针对具备推理/思维链能力的新一代模型（如 Claude 3.7 Thinking / o1 / o3），提供直观的档位切换（`Off 关闭`、`Low 轻度`、`Medium 中度`、`High 深度`），或支持自定义 Token Budget（如 1024 ~ 64000）；
  - **动态感知**：当连接的 Agent 不支持思考特性时，该选项自动置灰隐藏，保持界面极简。

- **UC-12: MCP 服务器与工具可视化透视 (MCP Servers & Tools Inspector)**
  - **聊天驾驶舱快捷透视**：在输入框上方的上下文胶囊栏常驻 MCP 状态胶囊 `[ 🔌 3 MCP (12 Tools) ▾ ]`，点击展开浮层卡片，实时查看当前为 Agent 挂载的 MCP 服务器与可用工具清单，支持快速勾选禁用/启用某个工具；
  - **独立管理与测试中心**：在配置中心提供专门的 MCP 面板，展示全局已注册的 MCP Servers（支持 stdio、SSE、WebSocket 传输）、运行 PID、心跳延迟与健康状态，提供参数测试运行（Test Tool Call）与查看底层 Schema 功能；
  - **聊天流精准归因**：当 Agent 触发 MCP 工具调用时，Tool Call 卡片上明确带有 `[ 🔌 MCP: <serverName>/<toolName> ]` 标识，点击可展开完整的调用入参与输出响应。

- **UC-13: 技能体系支持 (Skill Discovery, Slash Invocation & MCP Bridge)**
  - **双层发现机制**：客户端自动扫描工作区根目录（如 `.agents/skills/`、`.skills/`）与全局用户配置目录中的技能定义（读取 `SKILL.md` 的 YAML frontmatter: `name`, `description`, `triggers`）；
  - **Slash 快捷调起（`/` 自动补全）**：在输入框输入 `/` 时弹出技能选择菜单（如 `/tdd`、`/review`、`/design`），选中后该技能指令作为上下文（Context Directive）注入当前会话；
  - **MCP 桥接自主调用（Agent-Facing）**：通过客户端内置的 MCP Server 暴露 `builtin-skills` 工具集（`skills_list`, `skills_read`），支持智能体在遇到专门场景时自主决定阅读并按 Skill 规范执行。

### UI Wireframes (UI 线框图)

#### 线框图 1：主交互侧边栏 / 独立编辑区面板 (Main Chat & Multi-Session Cockpit)
```text
+-------------------------------------------------------------------------+
| [● Claude Code v1.2] [▾] | PID: 49120 | [🔀 Fork] [⏱ History] [⚙ Settings] |
+-------------------------------------------------------------------------+
| [ Tab 1: Refactor Auth ✕ ] [ Tab 2: Auth-Fork(Zustand) ✕ ] [ + New ]   |
+-------------------------------------------------------------------------+
|                                                                         |
| (User) 18:20                                                            |
| 请帮我把 src/core/process-manager.ts 增加僵尸进程超时兜底逻辑           |
|                                                                         |
|-------------------------------------------------------------------------|
| (Assistant) 18:20                     [📋 Copy] [🔀 Fork from here] [🔄] |
| [▾ Thinking: 正在分析 ProcessManager.stop() 的信号分发机制... (3.1s)]    |
|   1. 优先发送 SIGTERM 优雅退出                                          |
|   2. 启动 5000ms 定时器                                                 |
|   3. 超时未退出则发送 SIGKILL                                           |
|                                                                         |
| 我将为你修改 ProcessManager，以下是修改计划与 Diff：                    |
|                                                                         |
| [ ⚙ Tool Call: fs/writeFile ]------------------------------------------ |
| | Target: src/core/process/process-manager.ts                           |
| | Status: Waiting User Approval                                         |
| |                                                                       |
| | @@ -82,6 +82,12 @@                                                    |
| | -   this.process.kill('SIGTERM');                                     |
| | +   this.process.kill('SIGTERM');                                     |
| | +   const killTimer = setTimeout(() => {                              |
| | +     if (this.status !== 'stopped') this.process.kill('SIGKILL');    |
| | +   }, 5000);                                                         |
| |                                                                       |
| | [ ✓ Accept All ]   [ ✕ Reject ]   [ 🔍 Open in VS Code Diff Editor ]  |
| +-----------------------------------------------------------------------+
|                                                                         |
+-------------------------------------------------------------------------+
| [ Context: 📄 process-manager.ts ✕ ] [ 🔌 3 MCP (12 Tools) ▾ ] [ 📎 Attach ] |
| +---------------------------------------------------------------------+ |
| | 输入你的需求... (支持 ↑/↓ 回溯历史输入，支持 / 触发快捷命令)         | |
| |                                                                     | |
| +---------------------------------------------------------------------+ |
| [ 🤖 claude-3-7-sonnet ▾ ] [ 🧠 Thinking: High ▾ ]         [ ⏎ Send ] |
| (注: Send/Stop为二合一动态切换按钮; 模型与思考级别可按会话或按轮次自由调节) |
+-------------------------------------------------------------------------+
```

#### 线框图 2：可视化 Agent 配置中心 (Visual Agent Settings Panel)
```text
+-------------------------------------------------------------------------+
| ACP Agent Configuration Center                                          |
+-------------------------------------------------------------------------+
| Available Agents:                                                       |
|  [● Claude Code (Default)]  [● Codex CLI]  [⚪ Custom Go Agent]  [+ Add]  |
|-------------------------------------------------------------------------|
| Agent Details: [ Claude Code ]                                          |
|                                                                         |
| Agent Name:      [ Claude Code Official CLI                           ] |
| Transport:       (●) Stdio JSON-RPC        ( ) WebSocket Remote         |
| Command:         [ npx                                                ] |
| Arguments:       [ @agentclientprotocol/claude-agent-acp, --verbose   ] |
| Working Dir:     [ ${workspaceFolder}                                 ] |
|                                                                         |
| Environment Variables:                                                  |
|   +--------------------------+----------------------------+-----------+ |
|   | Key                      | Value                      | Actions   | |
|   +--------------------------+----------------------------+-----------+ |
|   | ANTHROPIC_API_KEY        | sk-ant-api03-************  | [🗑 Delete] | |
|   | ACP_LOG_LEVEL            | debug                      | [🗑 Delete] | |
|   +--------------------------+----------------------------+-----------+ |
|   [ + Add Environment Variable ]                                        |
|                                                                         |
| Capabilities & Permissions:                                             |
|   [✓] Auto-allow file read (fs/readFile)                                |
|   [ ] Auto-allow file write (Requires prompt confirmation)              |
|   [ ] Auto-allow terminal execution (Requires prompt confirmation)      |
|                                                                         |
| Action & Diagnostics:                                                   |
|   [ ⚡ Test Connection (Ping) ]  [ 💾 Save Changes ]  [ 🗑 Delete Agent ] |
|                                                                         |
| Diagnostic Output:                                                      |
|   [✓] Process spawned successfully (PID: 51204)                         |
|   [✓] ACP Handshake 'initialize' response received in 84ms              |
|   [✓] Agent capabilities: [tools, prompt_streaming, thinking]           |
+-------------------------------------------------------------------------+
```

#### 线框图 3：历史会话管理抽屉 (Session History Drawer)
```text
+-------------------------------------------------------------------------+
| Session History                                            [ ✕ Close ]  |
+-------------------------------------------------------------------------+
| [ 🔍 Search past sessions...                                          ] |
+-------------------------------------------------------------------------+
| Today                                                                   |
|   ● Refactor Auth Module                                                |
|     Claude Code · 14 msgs · 18:15 · "已优化 JWT 过期刷新机制"    [🔀] [🗑] |
|     └── 🔀 Branch: Auth with Zustand (Forked at msg #8)                 |
|         Codex CLI · 4 msgs · 18:25 · "尝试对比 Zustand 方案"    [🔀] [🗑] |
|   ● Fix Memory Leak in Event Bus                                        |
|     Codex CLI · 6 msgs · 15:30 · "排查出未注销的 Disposable"     [🔀] [🗑] |
|                                                                         |
| Yesterday                                                               |
|   ○ Initialize VS Code ACP Client Project                               |
|     Claude Code · 22 msgs · Sep 28 · "完成架构草案与目录脚手架"  [🔀] [🗑] |
|                                                                         |
| Earlier                                                                 |
|   ○ Demo ACP Protocol Test Harness                                      |
|     Custom Agent · 8 msgs · Sep 25 · "通过 PassThrough 模拟 Stdio" [🔀] [🗑] |
+-------------------------------------------------------------------------+
| [ 📥 Export All History as JSON/MD ]      [ 🗑 Clear All History ]       |
+-------------------------------------------------------------------------+
```

#### 线框图 4：可视化 MCP 服务器与工具透视面板 (Visual MCP Inspector Panel)
```text
+-------------------------------------------------------------------------+
| MCP Server & Tool Inspector                                [ ✕ Close ]  |
+-------------------------------------------------------------------------+
| Configured Servers:                                                     |
|  ● [github] (stdio, PID: 53120)    ● [postgres] (sse:8080)    [+ Add]  |
+-------------------------------------------------------------------------+
| Server: [ github ] (Connected · 14ms latency)              [ Restart 🔄 ]|
| Command: npx -y @modelcontextprotocol/server-github                     |
|                                                                         |
| Exposed Tools (Available to ACP Agent):                                 |
|  [✓] create_issue                                                       |
|      Description: Create a new issue in a specified GitHub repository   |
|      Parameters:  owner (string), repo (string), title (string)         |
|      [ ⚡ Test Tool Call ]                                               |
|                                                                         |
|  [✓] search_repositories                                                |
|      Description: Search public and private GitHub repositories         |
|      Parameters:  query (string), limit (number)                        |
|      [ ⚡ Test Tool Call ]                                               |
|                                                                         |
|  [ ] push_files (Disabled by User)                                      |
|      Description: Commit and push file updates directly                 |
+-------------------------------------------------------------------------+
```

### Invariants
- invariant: An Agent process crash or restart never crashes the extension host or corrupts in-memory / persisted session history.
- invariant: Forking a session deep-clones message history up to the designated index, allocates a new unique `sessionId`, links `parentSessionId`, resets status to `idle`, and mutations in the forked branch never alter the parent session.
- invariant: When ProcessStatus transitions to 'error' or 'stopped', any attached session in 'streaming' or 'waiting_approval' status immediately transitions to 'error', preserving received chunks and rejecting pending tool calls with a descriptive cancellation error.
- invariant: Multiple sessions run independently in parallel; a pending permission request or stream in Session A does not block prompt dispatch, cancellation, or streaming in Session B.
- invariant: Stdio transport handles arbitrary TCP/pipe chunk fragmentation and newline framing without message loss or invalid JSON parsing.
- invariant: Child process shutdown issues SIGTERM first, automatically escalating to SIGKILL after a 5000ms grace period to guarantee no zombie processes remain.
- invariant: `IProcessManager.dispose()` terminates all spawned child processes and clears timers, bound to VS Code extension `deactivate()` lifecycle.
- invariant: Storage persistence uses atomic write semantics (writing to a sibling `.tmp` file and renaming) to prevent corruption if the editor is killed during serialization.
- invariant: Input prompt history maintains a persistent ring buffer of at most 100 entries, filtering out duplicate consecutive submissions and empty strings.
- invariant: Webview closure or reloading is non-destructive; background sessions continue executing and streaming, and re-attaching queries the current state snapshot.

### Failure Modes
- failure: Agent executable command does not exist in PATH or `cwd` is unreadable -> Process status transitions to `'error'` with stderr output captured; Session notifies user with actionable setup instructions.
- failure: Agent process crashes mid-stream -> Session state transitions to `'error'`, partial streamed chunks and thinking blocks are preserved, and user is offered a one-click "Restart Agent & Retry" button.
- failure: Agent sends unknown or malformed JSON-RPC protocol method -> Logged to ACP output channel, method rejected with JSON-RPC error response, connection remains open.
- failure: Storage disk write fails -> In-memory state remains intact; warning notification dispatched.

### Conventions
- convention: Strict adherence to Clean Architecture as defined in `AGENTS.md` (Ports & Adapters, zero framework dependencies in `src/core/`, functional core / imperative shell).
- convention: Strict TypeScript (`strict: true`, `noImplicitAny: true`, `exactOptionalPropertyTypes: true`).
- convention: Core logic in `src/core/` has ZERO VS Code runtime dependencies, allowing 100% headless testing in Node.js via Vitest.
- convention: Test pattern uses Vitest with mock Stdio streams (`PassThrough`) and Mock Adapters to simulate agent protocol behaviors without Electron.
- convention: Error handling pattern uses custom typed error classes (`ProcessError`, `ProtocolError`, `SessionError`).
- convention: Linting and formatting via ESLint + Prettier.

### Tests
- test: `test/core/process-manager.test.ts` -> Proves starting, stopping, restarting, error recovery, and zombie cleanup for child processes.
- test: `test/core/session-hub.test.ts` -> Proves creating multiple concurrent sessions, session forking (deep-cloning context, parentSessionId linkage, state isolation), independent event dispatching, cancellation, and active session switching.
- test: `test/core/storage-manager.test.ts` -> Proves session state serialization/deserialization, input history ring-buffer deduplication and bounds.
- test: `test/core/protocol-transport.test.ts` -> Proves newline JSON-RPC framing over fragmented stdio chunks and error handling.

### Deferred
- deferred: Remote TCP/WebSocket transport authentication tokens encryption in OS keychain (deferred to M3).
- deferred: Distributed multi-agent swarms / agent-to-agent delegation (deferred to future milestone).

---

## Working notes

### Core Problem & Gap Analysis
Existing open source ACP implementations suffer from:
1. Process lifecycle: directly running child_process inside UI handlers without crash supervision, resulting in orphaned processes on VS Code window reload.
2. Single-session lock-in: global state assuming only one conversation at a time.
3. Poor rendering: treating all agent output as raw text or standard un-collapsible markdown, masking reasoning traces and tool invocations.
4. Input memory: pressing Up/Down arrow does nothing in the input box, frustrating developers accustomed to terminal and Claude Code ergonomics.
5. Configuration friction: requiring users to hand-craft JSON settings without validation or test-run probes.

### Solution Matrix for M1-M3
- M1 isolates the engine so that process management and multi-session states are bulletproof and mathematically testable.
- M2 delivers the visual configuration UI and high-craft chat experience.
- M3 integrates diffs and VS Code native ecosystem hooks.

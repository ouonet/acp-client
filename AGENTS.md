# Project Rules: Clean Architecture & Engineering Principles

本项目是一套高标准、生产级、遵守 Zed 规范的 **VS Code ACP (Agent Client Protocol) 客户端扩展**。
为了彻底杜绝开源同类产品中常见的“脆弱、僵尸进程、状态错乱、不可单测”等半成品缺陷，本项目将以下架构与工程准则定为**最高准则（Highest Principles）**，所有代码编写与重构必须无条件遵守。

---

## 准则一：严格的依赖倒置（The Dependency Rule）

1. **核心内核零依赖（Zero Framework Dependencies in Core）**：
   - `src/core/` 是纯净的领域与用例调度引擎（Pure TypeScript / Node.js）。
   - **绝对禁止在 `src/core/` 中直接或间接 `import * from 'vscode'` 或任何前端 UI 库（React/Tailwind 等）**。
2. **依赖方向只能单向由外向内**：
   - 框架与驱动层（VS Code 插件宿主、Webview 界面）依赖适配器；
   - 适配器依赖核心端口（Ports）；
   - 内层实体与用例引擎对外部环境（VS Code API、具体的操作系统进程实现）完全无感知。

---

## 准则二：六边形架构与端口解耦（Ports & Adapters）

1. **所有外部 I/O 必须面向抽象端口（Ports）编程**：
   - 传输层：`ITransportPort`（Stdio / WebSocket / Mock）
   - 进程托管层：`IProcessPort`（ChildProcess / Mock）
   - 工作区能力：`IWorkspacePort`（文件读写、Diff 编辑、终端执行）
   - 持久化层：`IStoragePort`（全局配置、会话记录、Prompt 历史）
2. **可测性至上（100% Headless Unit Testing）**：
   - 核心领域逻辑与 Session 状态调度必须能在无 VS Code Electron 宿主的环境下（通过 Vitest + Mock Adapters）在毫秒级内完成自动化测试验证。

---

## 准则三：显式有限状态机（Strict State Machines）

1. **禁止隐式或非法复合状态**：
   - `ProcessStatus`（`stopped | starting | running | restarting | error`）与 `SessionStatus`（`idle | streaming | waiting_approval | error`）必须由显式状态机驱动；
   - 状态转移有明确的前置条件检查，禁止在 `streaming` 状态下注入新 Prompt，禁止在非 `waiting_approval` 状态下执行权限审批。
2. **崩溃级联保障（Failure Cascades）**：
   - 当底层 Agent 进程发生崩溃或意外断开时，所有挂载的活动 Session 必须受控地流转到 `error` 状态并释放挂起的 Promise，绝不允许状态悬挂或内存泄漏。

---

## 准则四：不可变数据与独立隔离（Immutability & Forking）

1. **消息历史单向追加（Append-Only History）**：
   - 会话中的消息流与工具调用记录为不可变数组，任何变更均产生新的引用或结构化快照。
2. **会话 Fork 绝对物理隔离**：
   - Fork 会话时必须深拷贝（Deep Clone）截断点之前的所有历史记录；
   - 新分支分配全新独立 `sessionId` 与溯源关系；新会话后续的所有问答、工具执行与修改绝对不得反向污染父会话。

---

## 准则五：函数式核心，命令式外壳（Functional Core, Imperative Shell）

1. **纯计算与解析无副作用（Pure Functions）**：
   - JSON-RPC 消息拆包、分块拼接、Markdown 增量流式解析、Thinking 标签提取、Diff 计算、Prompt 历史去重与截断，全部必须实现为**无外部副作用的纯函数**。
2. **副作用集中管理（Isolated Side Effects）**：
   - 进程信号分发（`SIGTERM/SIGKILL`）、磁盘 I/O、VS Code 弹窗和 IPC 消息统一收敛到外围适配器，禁止随地调用系统 API。

---

## 准则六：安全与健壮性铁律（Safety & Reliability）

1. **零僵尸进程兜底（Zombie-Free Lifecycle）**：
   - 进程退出必须采用 `SIGTERM -> 5000ms 超时 -> SIGKILL` 强制回收的闭环保障；
   - `IProcessManager.dispose()` 必须与 VS Code 扩展的 `deactivate()` 完全绑定，确保编辑器关闭时无任何悬挂后台进程。
2. **原子化持久化（Atomic Persistence）**：
   - 所有写入磁盘的持久化数据（会话记录、Prompt 历史、Agent 配置）必须先写入 `.tmp` 临时文件，校验成功后原子重命名（Atomic Rename），杜绝突发掉电或编辑器被强杀导致的数据损坏。
3. **单向数据流 IPC（Unidirectional Data Flow）**：
   - Webview 与 Extension 之间严格通过结构化 Action（UI 发出意图）与 Event/State Snapshot（Core 广播状态）通信，禁止相互直接操控对方内部组件。

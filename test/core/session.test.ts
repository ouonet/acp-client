import { describe, it, expect, vi } from "vitest";
import { Session } from "../../src/core/session/session";
import type { AcpClientAdapter } from "../../src/core/protocol/acp-client-adapter";

describe("T3: Session Domain Model & Strict FSM", () => {
  it("should update model and call adapter.setConfigOption when setConfigOption is called", async () => {
    const mockAdapter = {
      onSessionUpdate: vi.fn().mockReturnValue({ dispose: () => {} }),
      setConfigOption: vi.fn().mockResolvedValue({
        configOptions: [
          { id: "model", currentValue: "codex.openai:gpt-5.6-sol" },
        ],
      }),
      prompt: vi.fn().mockResolvedValue({ stopReason: "end_turn" }),
      cancel: vi.fn().mockResolvedValue(undefined),
    } as unknown as AcpClientAdapter;

    const session = new Session({
      id: "sess-1",
      agentId: "agent-1",
      model: "opencode:default",
      thinkingLevel: "medium",
      adapter: mockAdapter,
    });

    await session.setConfigOption("model", "codex.openai:gpt-5.6-sol");

    expect(session.model).toBe("codex.openai:gpt-5.6-sol");
    expect(mockAdapter.setConfigOption).toHaveBeenCalledWith(
      "sess-1",
      "model",
      "codex.openai:gpt-5.6-sol",
    );
  });

  it("should allow prompting from error status and recover to idle", async () => {
    const mockAdapter = {
      onSessionUpdate: vi.fn().mockReturnValue({ dispose: () => {} }),
      setConfigOption: vi.fn().mockResolvedValue({}),
      prompt: vi
        .fn()
        .mockRejectedValueOnce(new Error("403 Forbidden"))
        .mockResolvedValueOnce({ stopReason: "end_turn" }),
      cancel: vi.fn().mockResolvedValue(undefined),
    } as unknown as AcpClientAdapter;

    const session = new Session({
      id: "sess-1",
      agentId: "agent-1",
      adapter: mockAdapter,
    });

    // First prompt fails
    await expect(session.prompt("Hello fail")).rejects.toThrow("403 Forbidden");
    expect(session.status).toBe("error");

    // System error message should be in history
    const lastMsg = session.messages[session.messages.length - 1];
    expect(lastMsg.role).toBe("system");
    expect(lastMsg.content).toContain("403 Forbidden");

    // Second prompt should NOT be blocked by error status and should succeed
    await expect(session.prompt("Hello retry")).resolves.toBeUndefined();
    expect(session.status).toBe("idle");
  });

  it("uses explicit prompt options for legacy sessions without advertised config", async () => {
    const mockAdapter = {
      onSessionUpdate: vi.fn().mockReturnValue({ dispose: () => {} }),
      setConfigOption: vi.fn().mockResolvedValue({}),
      prompt: vi.fn().mockResolvedValue({ stopReason: "end_turn" }),
      cancel: vi.fn().mockResolvedValue(undefined),
    } as unknown as AcpClientAdapter;

    const session = new Session({
      id: "sess-1",
      agentId: "agent-1",
      model: "old-model",
      thinkingLevel: "low",
      adapter: mockAdapter,
    });

    await session.prompt("Hello with new model", {
      model: "grok:grok-4.6",
      thinkingLevel: "high",
    });

    expect(mockAdapter.setConfigOption).toHaveBeenCalledWith("sess-1", "model", "grok:grok-4.6");
    expect(mockAdapter.setConfigOption).toHaveBeenCalledWith("sess-1", "thought_level", "high");
  });

  it("should reconstruct conversation history when receiving replay updates", () => {
    let updateCallback: ((event: any) => void) | undefined;
    const mockAdapter = {
      onSessionUpdate: vi.fn((cb) => {
        updateCallback = cb;
        return { dispose: () => {} };
      }),
      setConfigOption: vi.fn().mockResolvedValue({}),
      prompt: vi.fn(),
      cancel: vi.fn(),
    } as unknown as AcpClientAdapter;

    const session = new Session({
      id: "sess-replay",
      agentId: "agent-1",
      adapter: mockAdapter,
    });

    // 1. User message chunk
    updateCallback!({
      sessionId: "sess-replay",
      update: {
        sessionUpdate: "user_message_chunk",
        content: "What is 2+2?",
      },
    });

    // 2. Agent thought chunk
    updateCallback!({
      sessionId: "sess-replay",
      update: {
        sessionUpdate: "agent_thought_chunk",
        content: "Calculating 2+2...",
      },
    });

    // 3. Agent response chunk
    updateCallback!({
      sessionId: "sess-replay",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: "4",
      },
    });

    expect(session.messages).toHaveLength(2);
    expect(session.messages[0]).toEqual({
      role: "user",
      content: "What is 2+2?",
    });
    expect(session.messages[1].role).toBe("assistant");
    expect(session.messages[1].thinking).toBe("Calculating 2+2...");
    expect(session.messages[1].content).toBe("4");
  });

  it("preserves successive thinking turns and an empty thinking boundary", () => {
    let updateCallback: ((event: any) => void) | undefined;
    const adapter = {
      onSessionUpdate: vi.fn((callback) => {
        updateCallback = callback;
        return { dispose: () => {} };
      }),
    } as unknown as AcpClientAdapter;
    const session = new Session({
      id: "multi-turn",
      agentId: "agent-1",
      adapter,
    });
    const events: Array<{ type: string; payload: any }> = [];
    session.onEvent((event) => events.push(event));
    const send = (update: any) =>
      updateCallback!({ sessionId: session.id, update });

    send({ sessionUpdate: "agent_thought_chunk", content: "First " });
    send({ sessionUpdate: "agent_thought_chunk", content: "reason" });
    send({
      sessionUpdate: "tool_call",
      toolCallId: "tool-1",
      title: "read_file",
    });
    send({
      sessionUpdate: "tool_call",
      toolCallId: "tool-2",
      title: "list_dir",
    });
    send({
      sessionUpdate: "agent_thought_chunk",
      content: { type: "text", text: "" },
    });
    send({
      sessionUpdate: "tool_call",
      toolCallId: "tool-3",
      title: "read_file",
    });
    send({ sessionUpdate: "agent_thought_chunk", content: "Third reason" });
    send({ sessionUpdate: "agent_message_chunk", content: "Final answer" });

    const assistant = session.serialize().messages[0];
    expect(
      assistant.turns?.map((turn) => ({
        thinking: turn.thinking,
        tools: turn.toolCalls.map((tool) => tool.id),
      })),
    ).toEqual([
      { thinking: "First reason", tools: ["tool-1", "tool-2"] },
      { thinking: "", tools: ["tool-3"] },
      { thinking: "Third reason", tools: [] },
    ]);
    expect(assistant.content).toBe("Final answer");
    expect(
      events
        .filter((event) => event.type === "thinking")
        .map((event) => event.payload.turnIndex),
    ).toEqual([1, 1, 2, 3]);
    expect(
      events
        .filter((event) => event.type === "tool_call")
        .map((event) => event.payload.turnIndex),
    ).toEqual([1, 1, 2]);
  });

  it("records ACP tool details and closes timing at the final answer", () => {
    let updateCallback: ((event: any) => void) | undefined;
    const adapter = {
      onSessionUpdate: vi.fn((callback) => {
        updateCallback = callback;
        return { dispose: () => {} };
      }),
    } as unknown as AcpClientAdapter;
    const session = new Session({ id: "timed", agentId: "agent-1", adapter });
    const send = (update: any) =>
      updateCallback!({ sessionId: session.id, update });
    send({ sessionUpdate: "agent_thought_chunk", content: "Checking" });
    send({
      sessionUpdate: "tool_call",
      toolCallId: "read-1",
      name: "read_file",
      title: "Read file",
      rawInput: { path: "a.ts" },
      status: "in_progress",
    });
    send({
      sessionUpdate: "tool_call_update",
      toolCallId: "read-1",
      rawOutput: { content: "hello" },
      status: "completed",
    });
    send({
      sessionUpdate: "tool_call_update",
      toolCallId: "read-1",
      rawInput: { path: "a.ts" },
    });
    send({ sessionUpdate: "agent_message_chunk", content: "Done" });
    const assistant = session.serialize().messages[0];
    expect(assistant.turns?.[0].toolCalls[0]).toMatchObject({
      name: "read_file",
      input: { path: "a.ts" },
      output: { content: "hello" },
      status: "completed",
    });
    expect(assistant.startedAt).toEqual(expect.any(Number));
    expect(assistant.completedAt).toEqual(expect.any(Number));
    expect(assistant.turns?.[0].startedAt).toEqual(expect.any(Number));
    expect(assistant.turns?.[0].completedAt).toEqual(expect.any(Number));
    expect(assistant.turns?.[0].toolCalls[0].completedAt).toEqual(
      expect.any(Number),
    );
  });

  it("updates a tool in an earlier turn after a later turn starts", () => {
    let updateCallback: ((event: any) => void) | undefined;
    const adapter = {
      onSessionUpdate: vi.fn((callback) => {
        updateCallback = callback;
        return { dispose: () => {} };
      }),
    } as unknown as AcpClientAdapter;
    const session = new Session({
      id: "late-tool-result",
      agentId: "agent-1",
      adapter,
    });
    const send = (update: any) =>
      updateCallback!({ sessionId: session.id, update });

    send({ sessionUpdate: "agent_thought_chunk", content: "First" });
    send({
      sessionUpdate: "tool_call",
      toolCallId: "old-tool",
      title: "read_file",
    });
    send({ sessionUpdate: "agent_thought_chunk", content: "Second" });
    send({
      sessionUpdate: "tool_call_update",
      toolCallId: "old-tool",
      status: "completed",
      output: "result",
    });

    const assistant = session.serialize().messages[0];
    expect(assistant.turns?.[0].toolCalls[0]).toMatchObject({
      status: "completed",
      output: "result",
    });
  });

  it("should update availableCommands and emit event when receiving available_commands_update", async () => {
    let updateCallback: ((event: any) => void) | undefined;
    const adapter = {
      onSessionUpdate: vi.fn((callback) => {
        updateCallback = callback;
        return { dispose: () => {} };
      }),
    } as unknown as AcpClientAdapter;

    const onSave = vi.fn().mockResolvedValue(undefined);
    const session = new Session({
      id: "cmds-sess",
      agentId: "agent-1",
      adapter,
    });

    const receivedEvents: any[] = [];
    session.onEvent((ev) => receivedEvents.push(ev));

    updateCallback!({
      sessionId: "cmds-sess",
      update: {
        sessionUpdate: "available_commands_update",
        available_commands: [
          { name: "help", description: "List commands" },
          {
            name: "model",
            description: "Switch model",
            input: { hint: "<model_id>" },
          },
          { name: "compact", description: "Compress context" },
        ],
      },
    });

    expect(session.availableCommands).toEqual([
      { name: "help", description: "List commands" },
      {
        name: "model",
        description: "Switch model",
        input: { hint: "<model_id>" },
      },
      { name: "compact", description: "Compress context" },
    ]);

    expect(receivedEvents).toContainEqual({
      agentId: 'agent-1',
      runtimeRevision: 1,
      type: "available_commands_update",
      sessionId: "cmds-sess",
      payload: {
        availableCommands: session.availableCommands,
      },
    });

    expect(session.serialize().availableCommands).toEqual(
      session.availableCommands,
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it("should process compaction_update and compaction_summary_chunk session updates", async () => {
    let updateCallback: ((event: any) => void) | undefined;
    const mockAdapter = {
      onSessionUpdate: vi.fn().mockImplementation((cb) => {
        updateCallback = cb;
        return { dispose: () => {} };
      }),
    } as unknown as AcpClientAdapter;

    const session = new Session({
      id: "compact-sess",
      agentId: "agent-1",
      adapter: mockAdapter,
    });

    const receivedEvents: any[] = [];
    session.onEvent((ev) => receivedEvents.push(ev));

    // 1. compaction_update in_progress
    updateCallback!({
      sessionId: "compact-sess",
      update: {
        sessionUpdate: "compaction_update",
        compactionId: "cmp-1",
        status: "in_progress",
      },
    });

    expect((session as any).compactions).toHaveLength(1);
    expect((session as any).compactions[0].status).toBe("in_progress");
    expect(receivedEvents).toContainEqual(
      expect.objectContaining({
        type: "compaction",
        sessionId: "compact-sess",
        payload: expect.objectContaining({
          compactionId: "cmp-1",
          status: "in_progress",
        }),
      }),
    );

    // 2. compaction_summary_chunk
    updateCallback!({
      sessionId: "compact-sess",
      update: {
        sessionUpdate: "compaction_summary_chunk",
        compactionId: "cmp-1",
        content: { type: "text", text: "Summary of earlier turns." },
      },
    });

    expect((session as any).compactions[0].summary).toBe("Summary of earlier turns.");

    // 3. compaction_update completed
    updateCallback!({
      sessionId: "compact-sess",
      update: {
        sessionUpdate: "compaction_update",
        compactionId: "cmp-1",
        status: "completed",
      },
    });

    expect((session as any).compactions[0].status).toBe("completed");
    expect((session as any).compactions[0].completedAt).toBeDefined();

    const serialized = session.serialize();
    expect(serialized.compactions).toHaveLength(1);
    expect(serialized.compactions![0].status).toBe("completed");
  });
});

describe("Agent-confirmed model configuration", () => {
  it("uses the advertised config IDs and replaces levels only after acknowledgment", async () => {
    let resolve!: (value: unknown) => void;
    const adapter = {
      onSessionUpdate: vi.fn().mockReturnValue({ dispose: () => {} }),
      setConfigOption: vi.fn().mockImplementation(() => new Promise((r) => { resolve = r; })),
    } as unknown as AcpClientAdapter;
    const session = new Session({ id: "s", agentId: "a", adapter, configOptions: [
      { id: "engine", category: "model", currentValue: "old", options: [{ value: "old" }, { value: "new" }] },
      { id: "reason", category: "thought_level", currentValue: "deep", options: [{ value: "deep" }] },
    ] });
    const pending = session.setConfigOption("model", "new");
    expect(adapter.setConfigOption).toHaveBeenCalledWith("s", "engine", "new");
    expect(session.model).toBe("old");
    expect(session.availableThinkingLevels).toEqual(["deep"]);
    resolve({ configOptions: [
      { id: "engine", category: "model", currentValue: "new", options: [{ value: "new" }] },
      { id: "reason", category: "thought_level", currentValue: "ultra", options: [{ value: "ultra" }] },
    ] });
    await pending;
    expect(session.serialize()).toMatchObject({ model: "new", thinkingLevel: "ultra", availableModels: ["new"], availableThinkingLevels: ["ultra"], modelConfigId: "engine", thinkingConfigId: "reason" });
  });

  it("keeps confirmed configuration after failed switch and clears options on a full update", async () => {
    let notify!: (event: any) => void;
    const adapter = {
      onSessionUpdate: vi.fn((listener) => { notify = listener; return { dispose: () => {} }; }),
      setConfigOption: vi.fn().mockRejectedValue(new Error("agent refused")),
    } as unknown as AcpClientAdapter;
    const session = new Session({ id: "s", agentId: "a", adapter, configOptions: [
      { id: "engine", category: "model", currentValue: "old", options: [{ value: "old" }, { value: "new" }] },
      { id: "reason", category: "thought_level", currentValue: "deep", options: [{ value: "deep" }] },
    ] });
    await expect(session.setConfigOption("model", "new")).rejects.toThrow("agent refused");
    expect(session.model).toBe("old");
    notify({ sessionId: "s", update: { sessionUpdate: "config_option_update", configOptions: [
      { id: "engine", category: "model", currentValue: "new", options: [{ value: "new" }] },
    ] } });
    expect(session.serialize()).toMatchObject({ model: "new", availableThinkingLevels: [] });
    expect(session.thinkingLevel).toBeUndefined();
  });
});

describe("configuration update ordering", () => {
  it("does not replace a newer agent notification with an older request response", async () => {
    let notify!: (event: any) => void;
    let resolve!: (response: any) => void;
    const adapter = {
      onSessionUpdate: vi.fn((cb) => { notify = cb; return { dispose: () => {} }; }),
      setConfigOption: vi.fn().mockImplementation(() => new Promise((r) => { resolve = r; })),
    } as unknown as AcpClientAdapter;
    const config = (model: string) => [{ id: "engine", category: "model", currentValue: model, options: [{ value: model }] }];
    const session = new Session({ id: "s", agentId: "a", adapter, configOptions: config("old") });
    const pending = session.setConfigOption("engine", "new");
    notify({ sessionId: "s", update: { sessionUpdate: "config_option_update", configOptions: config("latest") } });
    resolve({ configOptions: config("new") });
    await pending;
    expect(session.model).toBe("latest");
  });
});

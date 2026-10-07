import { describe, it, expect } from "vitest";
import {
  ProcessError,
  ProtocolError,
  SessionError,
  StorageError,
} from "../../src/core/errors";
import type {
  ContentBlock,
  MessageChunk,
  SessionData,
} from "../../src/core/types/session";

describe("T2: Core Domain Types and Errors", () => {
  it("should instantiate domain errors with correct properties and inheritance", () => {
    const processErr = new ProcessError(
      "agent-1",
      "Process exited unexpectedly with code 1",
      1,
    );
    expect(processErr).toBeInstanceOf(Error);
    expect(processErr).toBeInstanceOf(ProcessError);
    expect(processErr.agentId).toBe("agent-1");
    expect(processErr.exitCode).toBe(1);
    expect(processErr.name).toBe("ProcessError");

    const protocolErr = new ProtocolError(-32600, "Invalid Request", {
      extra: "detail",
    });
    expect(protocolErr).toBeInstanceOf(Error);
    expect(protocolErr).toBeInstanceOf(ProtocolError);
    expect(protocolErr.code).toBe(-32600);
    expect(protocolErr.data).toEqual({ extra: "detail" });
    expect(protocolErr.name).toBe("ProtocolError");

    const sessionErr = new SessionError(
      "sess-100",
      "Session is currently streaming",
    );
    expect(sessionErr).toBeInstanceOf(SessionError);
    expect(sessionErr.sessionId).toBe("sess-100");

    const storageErr = new StorageError(
      "Atomic rename failed",
      "/path/to/file.tmp",
    );
    expect(storageErr).toBeInstanceOf(StorageError);
    expect(storageErr.filePath).toBe("/path/to/file.tmp");
  });

  it("should validate type compatibility for SessionData and MessageChunk", () => {
    const textBlock: ContentBlock = { type: "text", text: "Hello ACP" };
    const imageBlock: ContentBlock = {
      type: "image",
      data: "base64data",
      mimeType: "image/png",
    };

    const message: MessageChunk = {
      role: "user",
      content: [textBlock, imageBlock],
    };

    const session: SessionData = {
      id: "session-1",
      agentId: "agent-claude",
      title: "Test Session",
      model: "claude-3-7-sonnet",
      thinkingLevel: "high",
      status: "idle",
      messages: [message],
      createdAt: 1000,
      updatedAt: 1000,
    };

    expect(session.id).toBe("session-1");
    expect(session.status).toBe("idle");
    expect(session.messages).toHaveLength(1);
  });
});

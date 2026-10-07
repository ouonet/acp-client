import { expect, it } from "vitest";
import { reconcileHistory } from "../../src/webview/state/stream-messages";

it("keeps a shorter snapshot when later messages were removed", () => {
  const current = [
    { role: "user" as const, content: "First" },
    { role: "assistant" as const, content: "Reply one", completedAt: 2 },
    { role: "assistant" as const, content: "Reply two", completedAt: 3 },
  ];
  const incoming = current.slice(0, 2);
  expect(reconcileHistory(current, incoming).map((message) => message.content)).toEqual(["First", "Reply one"]);
});

it("keeps one assistant that started after the snapshot was taken", () => {
  const current = [
    { role: "user" as const, content: "First" },
    { role: "assistant" as const, content: "", startedAt: 9 },
  ];
  const incoming = [current[0]];
  expect(reconcileHistory(current, incoming)).toHaveLength(2);
});

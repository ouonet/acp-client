// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { productionEntryFixture } from "./production-entry-fixture";

const app = productionEntryFixture();

async function attachImage(name = "new.png") {
  const upload = app
    .root()
    .querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(upload, "files", {
    value: [new File(["image"], name, { type: "image/png" })],
    configurable: true,
  });
  upload.dispatchEvent(new Event("change", { bubbles: true }));
  await vi.waitFor(() => expect(app.root().textContent).toContain(name));
}

describe("shipped Preact prompt contract", () => {
  it.each(["click", "Enter"] as const)(
    "sends once via %s and clears on acceptance",
    async (mode) => {
      await app.fill("Original");
      const request = await app.submit(mode);
      expect(request.payload).toMatchObject({
        sessionId: "s1",
        prompt: "Original",
      });
      expect(request.payload.requestId).toEqual(expect.any(String));
      await app.key("Enter");
      expect(
        app.actions.filter((action) => action.type === "SEND_PROMPT"),
      ).toHaveLength(1);
      await app.result(request, "accepted");
      expect(app.input().value).toBe("");
    },
  );

  it("does not send while IME composition is active", async () => {
    await app.fill("中文输入");
    await app.key("Enter", true);
    expect(app.actions).toEqual([]);
    expect(app.input().value).toBe("中文输入");
  });

  it("retains unaccepted input after rejection and ignores stale acceptance", async () => {
    await app.fill("Original");
    const request = await app.submit();
    await app.result(request, "accepted", "unrelated");
    expect(app.input().value).toBe("Original");
    await app.result(request, "rejected");
    expect(app.input().value).toBe("Original");
  });

  it("preserves edits made before acceptance", async () => {
    await app.fill("Original");
    const request = await app.submit();
    await app.fill("New draft");
    await app.result(request, "accepted");
    await app.result(request, "completed");
    expect(app.input().value).toBe("New draft");
  });

  it("preserves identical text newly typed after acceptance", async () => {
    await app.fill("Original");
    const request = await app.submit();
    await app.result(request, "accepted");
    await app.fill("Original");
    await app.result(request, "completed");
    expect(app.input().value).toBe("Original");
  });

  it("preserves an identical prompt recalled from input history after acceptance", async () => {
    await app.fill("Original");
    const request = await app.submit();
    await app.result(request, "accepted");
    await app.key("ArrowUp");
    expect(app.input().value).toBe("Original");
    await app.result(request, "completed");
    expect(app.input().value).toBe("Original");
  });

  it("preserves the entire draft when attachments change before acceptance", async () => {
    await app.fill("Original");
    await attachImage("submitted.png");
    const request = await app.submit();
    await attachImage();
    await app.result(request, "accepted");
    expect(app.input().value).toBe("Original");
    expect(app.root().textContent).toContain("submitted.png");
    expect(app.root().textContent).toContain("new.png");
    await app.result(request, "completed");
    expect(app.input().value).toBe("Original");
    expect(app.root().textContent).toContain("new.png");
  });

  it("preserves attachments added after acceptance", async () => {
    await app.fill("Original");
    const request = await app.submit();
    await app.result(request, "accepted");
    await attachImage();
    await app.result(request, "completed");
    expect(app.root().textContent).toContain("new.png");
  });
});

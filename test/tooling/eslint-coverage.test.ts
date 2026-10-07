import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint();

// Exercise ESLint's public API so matching globs alone cannot hide ignored TSX.
describe("TypeScript lint coverage", () => {
  it.each([
    "src/webview/components/input/input-dock.tsx",
    "test/webview/preact-input-regressions.test.tsx",
  ])("checks TypeScript rules for %s", async (filePath) => {
    const [result] = await eslint.lintText(
      "const unusedCoverageSentinel = 1; export const view = <div />;",
      { filePath },
    );

    expect(result.messages.some((message) => message.fatal)).toBe(false);
    expect(result.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "@typescript-eslint/no-unused-vars",
          message: expect.stringContaining("unusedCoverageSentinel"),
        }),
      ]),
    );
    expect(
      result.messages.some((message) => /ignored/i.test(message.message)),
    ).toBe(false);
  });
});

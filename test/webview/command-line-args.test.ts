import { describe, it, expect } from "vitest";
import {
  parseCommandLineArgs,
  formatCommandLineArgs,
} from "../../src/webview/utils/command-line-args";

describe("command-line-args: tokenizer and formatter", () => {
  describe("parseCommandLineArgs", () => {
    it("should return empty array for empty or whitespace-only input", () => {
      expect(parseCommandLineArgs("")).toEqual([]);
      expect(parseCommandLineArgs("   ")).toEqual([]);
    });

    it("should parse simple space-separated arguments", () => {
      const input =
        "run --directory /Users/neo/workbench/test/ai/harness/aharness aharness acp serve";
      expect(parseCommandLineArgs(input)).toEqual([
        "run",
        "--directory",
        "/Users/neo/workbench/test/ai/harness/aharness",
        "aharness",
        "acp",
        "serve",
      ]);
    });

    it("should handle double quotes containing spaces", () => {
      const input = 'run --dir "/path with spaces/test" --name "my agent"';
      expect(parseCommandLineArgs(input)).toEqual([
        "run",
        "--dir",
        "/path with spaces/test",
        "--name",
        "my agent",
      ]);
    });

    it("should handle single quotes containing spaces", () => {
      const input = "run --dir '/path with spaces/test' --flag";
      expect(parseCommandLineArgs(input)).toEqual([
        "run",
        "--dir",
        "/path with spaces/test",
        "--flag",
      ]);
    });

    it("should handle escape characters", () => {
      const input = "run --msg hello\\ world --flag";
      expect(parseCommandLineArgs(input)).toEqual([
        "run",
        "--msg",
        "hello world",
        "--flag",
      ]);
    });

    it("should tolerate legacy delimiter commas between arguments", () => {
      const input = "run, --directory, /path/to/harness, aharness, acp, serve";
      expect(parseCommandLineArgs(input)).toEqual([
        "run",
        "--directory",
        "/path/to/harness",
        "aharness",
        "acp",
        "serve",
      ]);
    });

    it("should preserve commas inside flags or paths", () => {
      const input = "--include=ts,js,tsx --tags=a,b";
      expect(parseCommandLineArgs(input)).toEqual([
        "--include=ts,js,tsx",
        "--tags=a,b",
      ]);
    });
  });

  describe("formatCommandLineArgs", () => {
    it("should format arguments into a space-separated string", () => {
      const args = [
        "run",
        "--directory",
        "/Users/neo/workbench/test/ai/harness/aharness",
        "aharness",
        "acp",
        "serve",
      ];
      expect(formatCommandLineArgs(args)).toBe(
        "run --directory /Users/neo/workbench/test/ai/harness/aharness aharness acp serve",
      );
    });

    it("should wrap arguments containing spaces in double quotes", () => {
      const args = ["run", "--dir", "/path with spaces", "--name", "my agent"];
      expect(formatCommandLineArgs(args)).toBe(
        'run --dir "/path with spaces" --name "my agent"',
      );
    });

    it("should escape existing double quotes inside quoted arguments", () => {
      const args = ["--greeting", 'hello "world"'];
      expect(formatCommandLineArgs(args)).toBe(
        '--greeting "hello \\"world\\""',
      );
    });
  });
});

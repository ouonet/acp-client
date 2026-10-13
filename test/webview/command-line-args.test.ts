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

    it("should preserve backslashes in an unquoted Windows path", () => {
      const input =
        "run --directory C:\\Users\\neo\\workbench\\project\\me\\quant\\aharness aharness acp serve";
      expect(parseCommandLineArgs(input)).toEqual([
        "run",
        "--directory",
        "C:\\Users\\neo\\workbench\\project\\me\\quant\\aharness",
        "aharness",
        "acp",
        "serve",
      ]);
    });

    it("should preserve backslashes in quoted Windows paths with spaces", () => {
      expect(
        parseCommandLineArgs('run --directory "C:\\My Docs\\aharness" aharness'),
      ).toEqual(["run", "--directory", "C:\\My Docs\\aharness", "aharness"]);
    });

    it("should preserve UNC paths and a trailing Windows separator", () => {
      expect(parseCommandLineArgs("run \\\\server\\share\\aharness flag")).toEqual([
        "run",
        "\\\\server\\share\\aharness",
        "flag",
      ]);
      expect(parseCommandLineArgs("run C:\\aharness\\")).toEqual([
        "run",
        "C:\\aharness\\",
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

    it("should round-trip Windows paths without changing separators", () => {
      const args = [
        "run",
        "--directory",
        "C:\\Users\\neo\\workbench\\project\\me\\quant\\aharness",
        "aharness",
        "acp",
        "serve",
      ];
      expect(parseCommandLineArgs(formatCommandLineArgs(args))).toEqual(args);
    });

    it("should round-trip a quoted Windows path with a trailing separator", () => {
      const args = ["run", "--dir", "C:\\My Docs\\"];
      const formatted = formatCommandLineArgs(args);
      expect(formatted).toBe('run --dir "C:\\My Docs\\\\"');
      expect(parseCommandLineArgs(formatted)).toEqual(args);
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

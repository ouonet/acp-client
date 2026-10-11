import { describe, it, expect } from "vitest";
import packageJson from "../package.json";
import { VERSION } from "../src/index";
import { CLIENT_VERSION } from "../src/version";

describe("ACP Client Core Scaffolding", () => {
  it("should run headless tests in Node.js environment", () => {
    expect(true).toBe(true);
  });

  it("reports the package version", () => {
    expect(CLIENT_VERSION).toBe(packageJson.version);
    expect(VERSION).toBe(packageJson.version);
  });
});

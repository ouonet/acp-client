import { describe, expect, it } from "vitest";
import { permissionDecision } from "../../src/shared/permission-decision";

describe("permissionDecision", () => {
  it("maps ACP reject kinds to deny and allow_always to a remembered allow", () => {
    expect(permissionDecision("reject_once")).toBe("deny");
    expect(permissionDecision("reject_always")).toBe("deny");
    expect(permissionDecision("deny")).toBe("deny");
    expect(permissionDecision("allow_always")).toBe("always_allow_session");
    expect(permissionDecision("always")).toBe("always_allow_session");
    expect(permissionDecision("always_allow_session")).toBe("always_allow_session");
    expect(permissionDecision("allow_once")).toBe("allow");
  });
});

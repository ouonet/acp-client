export type PermissionDecision = "allow" | "deny" | "always_allow_session";

/** Map an ACP option kind onto the decision this client sends back. */
export function permissionDecision(kind: string | undefined): PermissionDecision {
  if (kind === "deny" || kind === "reject_once" || kind === "reject_always") return "deny";
  if (kind === "allow_always" || kind === "always" || kind === "always_allow_session") return "always_allow_session";
  return "allow";
}

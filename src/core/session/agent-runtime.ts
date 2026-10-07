import type { Disposable } from "../ports";
import type { AcpClientAdapter } from "../protocol/acp-client-adapter";
import type { AgentConnectionSummary } from "../types/session";
import { SessionError } from "../errors";
import type { Session } from "./session";

export interface AgentRuntime {
  summary: AgentConnectionSummary;
  adapter?: AcpClientAdapter;
  connection?: Promise<void>;
  disconnect?: Promise<void>;
  cleanup?: Promise<void>;
  session?: Session;
  staging?: Session;
  revision: number;
  queue: Promise<unknown>;
  pending: Set<(error: Error) => void>;
  closeSubscription?: Disposable;
}

export function runtime(agentId: string, generation: number): AgentRuntime {
  return {
    summary: { agentId, generation, status: "starting", initialized: false },
    revision: 0,
    queue: Promise.resolve(),
    pending: new Set(),
  };
}

export function preempt(entry: AgentRuntime, reason: string): void {
  entry.revision++;
  for (const reject of entry.pending) {
    reject(new SessionError(entry.summary.agentId, reason));
  }
  entry.pending.clear();
  entry.staging?.dispose();
  entry.staging = undefined;
}

export async function deadline<T>(work: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Operation timed out after ${milliseconds}ms`)), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function guarded<T>(entry: AgentRuntime, work: Promise<T>, valid: () => boolean): Promise<T> {
  let reject!: (error: Error) => void;
  const cancelled = new Promise<never>((_, callback) => {
    reject = callback;
    entry.pending.add(callback);
  });
  try {
    const result = await deadline(Promise.race([work, cancelled]), 10000);
    if (!valid()) throw new SessionError(entry.summary.agentId, "Stale Agent operation");
    return result;
  } finally {
    entry.pending.delete(reject);
  }
}

export function serial<T>(entry: AgentRuntime, work: () => Promise<T>): Promise<T> {
  const revision = entry.revision;
  const result = entry.queue.catch(() => {}).then(() => {
    if (entry.revision !== revision) {
      throw new SessionError(entry.summary.agentId, "Session closed before operation");
    }
    return work();
  });
  entry.queue = result.catch(() => {});
  return result;
}

export function assertReplaceable(entry: AgentRuntime): void {
  if (entry.session?.status === "streaming" || entry.session?.status === "waiting_approval") {
    throw new SessionError(entry.session.id, "Cannot replace a busy Session");
  }
}

export function releaseCurrent(entry: AgentRuntime): void {
  assertReplaceable(entry);
  entry.session?.detach("Session runtime replaced");
  entry.revision++;
}

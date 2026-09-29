/**
 * ProcessManager: Supervision & Zombie-Free Lifecycle Manager for ACP Agents
 */

import { spawn, type ChildProcess } from 'node:child_process';
import type { IProcessPort, ProcessStatus, ProcessStatusEvent, Disposable } from '../ports';
import type { AgentConfig } from '../types/config';
import { ProcessError } from '../errors';

interface ManagedProcess {
  config: AgentConfig;
  child: ChildProcess;
  status: ProcessStatus;
  intentionalStop: boolean;
  exitPromise: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  resolveExit: (val: { code: number | null; signal: NodeJS.Signals | null }) => void;
  killTimeout?: NodeJS.Timeout;
}

export class ProcessManager implements IProcessPort {
  private readonly managed = new Map<string, ManagedProcess>();
  private readonly listeners = new Set<(event: ProcessStatusEvent) => void>();
  private readonly gracePeriodMs: number;
  private isDisposed = false;

  constructor(gracePeriodMs = 5000) {
    this.gracePeriodMs = gracePeriodMs;
  }

  private setStatus(agentId: string, status: ProcessStatus, pid?: number, error?: string): void {
    const entry = this.managed.get(agentId);
    if (entry) {
      entry.status = status;
    }
    const event: ProcessStatusEvent = {
      agentId,
      status,
      pid: pid ?? entry?.child.pid,
      error,
    };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Prevent listener error from disrupting process manager
      }
    }
  }

  getStatus(agentId: string): ProcessStatus {
    return this.managed.get(agentId)?.status ?? 'stopped';
  }

  onStatusChange(listener: (event: ProcessStatusEvent) => void): Disposable {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  async start(
    config: AgentConfig
  ): Promise<{
    pid: number;
    stdin: NodeJS.WritableStream;
    stdout: NodeJS.ReadableStream;
    stderr: NodeJS.ReadableStream;
  }> {
    if (this.isDisposed) {
      throw new ProcessError(config.id, 'ProcessManager has been disposed');
    }

    // Stop existing process for this agent if running
    if (this.managed.has(config.id)) {
      await this.stop(config.id, true);
    }

    this.setStatus(config.id, 'starting');

    return new Promise((resolve, reject) => {
      let child: ChildProcess;
      try {
        child = spawn(config.command, config.args, {
          env: { ...process.env, ...config.env },
          cwd: config.cwd || process.cwd(),
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err: any) {
        this.setStatus(config.id, 'error', undefined, err?.message);
        return reject(new ProcessError(config.id, err?.message || 'Failed to spawn process'));
      }

      let resolveExit!: (val: { code: number | null; signal: NodeJS.Signals | null }) => void;
      const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
        (res) => {
          resolveExit = res;
        }
      );

      const managedEntry: ManagedProcess = {
        config,
        child,
        status: 'starting',
        intentionalStop: false,
        exitPromise,
        resolveExit,
      };

      this.managed.set(config.id, managedEntry);

      let hasSpawned = false;

      child.once('spawn', () => {
        hasSpawned = true;
        managedEntry.status = 'running';
        this.setStatus(config.id, 'running', child.pid);
        resolve({
          pid: child.pid!,
          stdin: child.stdin!,
          stdout: child.stdout!,
          stderr: child.stderr!,
        });
      });

      child.once('error', (err: any) => {
        managedEntry.status = 'error';
        this.setStatus(config.id, 'error', undefined, err.message);
        if (!hasSpawned) {
          resolveExit({ code: null, signal: null });
          reject(new ProcessError(config.id, `Failed to spawn: ${err.message}`));
        }
      });

      child.once('exit', (code, signal) => {
        if (managedEntry.killTimeout) {
          clearTimeout(managedEntry.killTimeout);
          managedEntry.killTimeout = undefined;
        }

        resolveExit({ code, signal });

        if (!managedEntry.intentionalStop) {
          managedEntry.status = 'error';
          this.setStatus(
            config.id,
            'error',
            child.pid,
            `Process exited unexpectedly with code ${code ?? 'null'}, signal ${signal ?? 'none'}`
          );
        } else {
          managedEntry.status = 'stopped';
          this.setStatus(config.id, 'stopped', child.pid);
        }
      });
    });
  }

  async stop(agentId: string, force = false): Promise<void> {
    const entry = this.managed.get(agentId);
    if (!entry || entry.status === 'stopped') {
      return;
    }

    entry.intentionalStop = true;
    const { child } = entry;

    // If the process never spawned (e.g. invalid command), clean up immediately
    if (!child.pid) {
      entry.status = 'stopped';
      this.managed.delete(agentId);
      return;
    }

    if (force) {
      try {
        child.kill('SIGKILL');
      } catch {
        // Ignore if already dead
      }
      await entry.exitPromise;
      this.managed.delete(agentId);
      return;
    }

    try {
      // 1. Try graceful SIGTERM
      child.kill('SIGTERM');

      // 2. Schedule SIGKILL timeout
      entry.killTimeout = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // Ignore
        }
      }, this.gracePeriodMs);

      // 3. Await process exit
      await entry.exitPromise;
    } catch {
      // Ignore errors on process kill
    } finally {
      if (entry.killTimeout) {
        clearTimeout(entry.killTimeout);
        entry.killTimeout = undefined;
      }
      this.managed.delete(agentId);
    }
  }

  async restart(agentId: string): Promise<{ pid: number }> {
    const entry = this.managed.get(agentId);
    if (!entry) {
      throw new ProcessError(agentId, 'Cannot restart unknown agent');
    }

    const { config } = entry;
    this.setStatus(agentId, 'restarting');
    await this.stop(agentId, true);
    const proc = await this.start(config);
    return { pid: proc.pid };
  }

  async dispose(): Promise<void> {
    this.isDisposed = true;
    const stopPromises = Array.from(this.managed.keys()).map((id) => this.stop(id, true));
    await Promise.allSettled(stopPromises);
    this.listeners.clear();
    this.managed.clear();
  }
}

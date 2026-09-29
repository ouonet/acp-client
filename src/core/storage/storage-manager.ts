/**
 * StorageManager: Production-grade Atomic Persistence & Ring Buffer
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { IStoragePort } from '../ports';
import type { SessionData, SessionSummary } from '../types/session';
import type { AgentConfig } from '../types/config';
import { StorageError } from '../errors';

export class StorageManager implements IStoragePort {
  private readonly rootDir: string;
  private readonly sessionsDir: string;
  private readonly historyFile: string;
  private readonly configsFile: string;
  private readonly maxHistoryEntries: number;

  constructor(rootDir: string, maxHistoryEntries = 100) {
    this.rootDir = rootDir;
    this.sessionsDir = path.join(rootDir, 'sessions');
    this.historyFile = path.join(rootDir, 'history.json');
    this.configsFile = path.join(rootDir, 'agents.json');
    this.maxHistoryEntries = maxHistoryEntries;
  }

  private async ensureDir(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
  }

  /**
   * Atomic file write using temporary sibling file and rename
   */
  private async writeAtomic(filePath: string, data: string): Promise<void> {
    const dir = path.dirname(filePath);
    await this.ensureDir(dir);

    const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    try {
      await fs.writeFile(tmpPath, data, 'utf-8');
      await fs.rename(tmpPath, filePath);
    } catch (err: any) {
      // Clean up orphaned .tmp file if possible
      try {
        await fs.unlink(tmpPath);
      } catch {
        // Ignore unlink error
      }
      throw new StorageError(err?.message || 'Atomic write failed', filePath);
    }
  }

  async saveSession(sessionData: SessionData): Promise<void> {
    const filePath = path.join(this.sessionsDir, `${sessionData.id}.json`);
    const json = JSON.stringify(sessionData, null, 2);
    await this.writeAtomic(filePath, json);
  }

  async loadSession(sessionId: string): Promise<SessionData | null> {
    const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as SessionData;
    } catch {
      return null;
    }
  }

  async listSavedSessions(): Promise<SessionSummary[]> {
    try {
      await this.ensureDir(this.sessionsDir);
      const files = await fs.readdir(this.sessionsDir);
      const summaries: SessionSummary[] = [];

      for (const file of files) {
        if (!file.endsWith('.json') || file.endsWith('.tmp')) {
          continue;
        }

        const filePath = path.join(this.sessionsDir, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const data = JSON.parse(content) as SessionData;
          if (data && data.id) {
            summaries.push({
              id: data.id,
              agentId: data.agentId,
              title: data.title,
              model: data.model,
              thinkingLevel: data.thinkingLevel,
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
              status: data.status,
              messageCount: Array.isArray(data.messages) ? data.messages.length : 0,
              parentSessionId: data.parentSessionId,
            });
          }
        } catch {
          // Skip corrupted or unreadable session files
        }
      }

      // Order by updatedAt desc
      return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  }

  async deleteSavedSession(sessionId: string): Promise<void> {
    const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
    try {
      await fs.unlink(filePath);
    } catch {
      // Ignore if file doesn't exist
    }
  }

  async recordInputHistory(prompt: string): Promise<void> {
    const trimmed = prompt.trim();
    if (!trimmed) {
      return;
    }

    const current = await this.getInputHistory();
    // Deduplicate consecutive identical prompt
    if (current.length > 0 && current[current.length - 1] === trimmed) {
      return;
    }

    current.push(trimmed);

    // Enforce ring buffer capacity limit
    const bounded =
      current.length > this.maxHistoryEntries
        ? current.slice(current.length - this.maxHistoryEntries)
        : current;

    await this.writeAtomic(this.historyFile, JSON.stringify(bounded, null, 2));
  }

  async getInputHistory(): Promise<string[]> {
    try {
      const content = await fs.readFile(this.historyFile, 'utf-8');
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async saveAgentConfigs(configs: AgentConfig[]): Promise<void> {
    await this.writeAtomic(this.configsFile, JSON.stringify(configs, null, 2));
  }

  async getAgentConfigs(): Promise<AgentConfig[]> {
    try {
      const content = await fs.readFile(this.configsFile, 'utf-8');
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}

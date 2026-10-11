/** Atomic persistence for Agent configurations and separate prompt input history. */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { IStoragePort } from '../ports';
import type { AgentConfig } from '../types/config';
import { StorageError } from '../errors';

export class StorageManager implements IStoragePort {
  private readonly historyFile: string;
  private readonly configsFile: string;
  private historyUpdates: Promise<void> = Promise.resolve();
  constructor(rootDir: string, private readonly maxHistoryEntries = 100) {
    this.historyFile = path.join(rootDir, 'history.json');
    this.configsFile = path.join(rootDir, 'agents.json');
  }
  private async writeAtomic(filePath: string, data: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    try {
      JSON.parse(data);
      await fs.writeFile(tmpPath, data, 'utf-8');
      await fs.rename(tmpPath, filePath);
    } catch (err: any) {
      await fs.unlink(tmpPath).catch(() => {});
      throw new StorageError(err?.message || 'Atomic write failed', filePath);
    }
  }
  async recordInputHistory(prompt: string): Promise<void> {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    const update = this.historyUpdates.then(async () => {
      const current = await this.getInputHistory();
      if (current[current.length - 1] === trimmed) return;
      const next = [...current, trimmed].slice(-this.maxHistoryEntries);
      await this.writeAtomic(this.historyFile, JSON.stringify(next, null, 2));
    });
    this.historyUpdates = update.catch(() => {});
    return update;
  }
  async getInputHistory(): Promise<string[]> {
    const parsed = await this.readJson(this.historyFile);
    if (parsed === undefined) return [];
    if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== 'string')) {
      throw new StorageError('Prompt history must be an array of strings', this.historyFile);
    }
    return parsed;
  }
  async saveAgentConfigs(configs: AgentConfig[]): Promise<void> {
    await this.writeAtomic(this.configsFile, JSON.stringify(configs, null, 2));
  }
  async getAgentConfigs(): Promise<AgentConfig[]> {
    const parsed = await this.readJson(this.configsFile);
    if (parsed === undefined) return [];
    if (!Array.isArray(parsed)) throw new StorageError('Agent configuration must be an array', this.configsFile);
    return parsed;
  }
  private async readJson(filePath: string): Promise<unknown> {
    try {
      return JSON.parse(await fs.readFile(filePath, 'utf-8'));
    } catch (err: any) {
      if (err?.code === 'ENOENT') return undefined;
      throw new StorageError(err?.message || 'Unreadable storage file', filePath);
    }
  }
}

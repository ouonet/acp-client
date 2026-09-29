import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { StorageManager } from '../../src/core/storage/storage-manager';
import type { SessionData } from '../../src/core/types/session';
import type { AgentConfig } from '../../src/core/types/config';

describe('T3: StorageManager (Atomic Persistence & Ring Buffer)', () => {
  let testDir: string;
  let storage: StorageManager;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'acp-storage-test-'));
    storage = new StorageManager(testDir);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should save and load session data atomically', async () => {
    const session: SessionData = {
      id: 'sess-abc',
      agentId: 'agent-1',
      title: 'Initial Title',
      model: 'claude-3-7-sonnet',
      thinkingLevel: 'medium',
      createdAt: 1000,
      updatedAt: 1000,
      status: 'idle',
      messages: [{ role: 'user', content: 'Hello' }],
    };

    await storage.saveSession(session);

    const loaded = await storage.loadSession('sess-abc');
    expect(loaded).toEqual(session);

    // Verify file exists on disk and no dangling .tmp files remain
    const files = await fs.readdir(path.join(testDir, 'sessions'));
    expect(files).toContain('sess-abc.json');
    expect(files.some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it('should list saved session summaries ordered by updatedAt desc', async () => {
    const sess1: SessionData = {
      id: 'sess-1',
      agentId: 'agent-1',
      title: 'Older Session',
      createdAt: 1000,
      updatedAt: 1000,
      status: 'idle',
      messages: [{ role: 'user', content: 'msg1' }],
    };
    const sess2: SessionData = {
      id: 'sess-2',
      agentId: 'agent-2',
      title: 'Newer Session',
      createdAt: 2000,
      updatedAt: 2000,
      status: 'idle',
      messages: [{ role: 'user', content: 'msg2' }, { role: 'assistant', content: 'resp2' }],
    };

    await storage.saveSession(sess1);
    await storage.saveSession(sess2);

    const summaries = await storage.listSavedSessions();
    expect(summaries).toHaveLength(2);
    expect(summaries[0].id).toBe('sess-2');
    expect(summaries[0].messageCount).toBe(2);
    expect(summaries[1].id).toBe('sess-1');
    expect(summaries[1].messageCount).toBe(1);
  });

  it('should delete saved session', async () => {
    const session: SessionData = {
      id: 'sess-to-delete',
      agentId: 'agent-1',
      title: 'To Delete',
      createdAt: 1000,
      updatedAt: 1000,
      status: 'idle',
      messages: [],
    };

    await storage.saveSession(session);
    expect(await storage.loadSession('sess-to-delete')).not.toBeNull();

    await storage.deleteSavedSession('sess-to-delete');
    expect(await storage.loadSession('sess-to-delete')).toBeNull();
  });

  it('should manage input history with ring buffer bounds and deduplication', async () => {
    // Record entries
    await storage.recordInputHistory('first prompt');
    await storage.recordInputHistory('first prompt'); // Duplicate consecutive -> ignored
    await storage.recordInputHistory('  '); // Empty/whitespace -> ignored
    await storage.recordInputHistory('second prompt');

    const history = await storage.getInputHistory();
    expect(history).toEqual(['first prompt', 'second prompt']);

    // Test ring buffer cap (limit = 100)
    for (let i = 0; i < 110; i++) {
      await storage.recordInputHistory(`prompt-${i}`);
    }

    const cappedHistory = await storage.getInputHistory();
    expect(cappedHistory).toHaveLength(100);
    // Oldest entries shifted out
    expect(cappedHistory[0]).toBe('prompt-10');
    expect(cappedHistory[99]).toBe('prompt-109');
  });

  it('should save and get agent configurations', async () => {
    const configs: AgentConfig[] = [
      {
        id: 'agent-claude',
        name: 'Claude Code',
        command: 'npx',
        args: ['@agentclientprotocol/claude-agent-acp'],
        env: { KEY: 'val' },
        transport: 'stdio',
        enabled: true,
      },
    ];

    await storage.saveAgentConfigs(configs);
    const loaded = await storage.getAgentConfigs();
    expect(loaded).toEqual(configs);
  });

  it('should handle corrupted JSON gracefully without crashing', async () => {
    const sessionDir = path.join(testDir, 'sessions');
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.writeFile(path.join(sessionDir, 'corrupted.json'), 'INVALID JSON {{{{');

    const loaded = await storage.loadSession('corrupted');
    expect(loaded).toBeNull();

    const summaries = await storage.listSavedSessions();
    expect(summaries).toHaveLength(0);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Session } from '../../src/core/session/session';
import type { IAcpClientPort } from '../../src/core/ports';

describe('T2: Three-Tier Permission Policy Gate & Session Whitelisting', () => {
  let mockAdapter: IAcpClientPort;
  let session: Session;

  beforeEach(() => {
    mockAdapter = {
      initialize: vi.fn().mockResolvedValue({ protocolVersion: 1 }),
      createSession: vi.fn().mockResolvedValue({ sessionId: 'sess-1' }),
      prompt: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
      onSessionUpdate: vi.fn().mockReturnValue({ dispose: () => {} }),
      isConnected: vi.fn().mockReturnValue(true),
      close: vi.fn().mockResolvedValue(undefined),
    };

    session = new Session({
      id: 'sess-1',
      agentId: 'agent-1',
      adapter: mockAdapter,
    });
  });

  it('should transition to waiting_approval on initial tool approval request', async () => {
    const promise = session.requestApproval('req-1', 'fs/writeFile', [
      { optionId: 'opt-allow', name: 'Allow Once', kind: 'allow_once' },
      { optionId: 'opt-always', name: 'Always Allow in Session', kind: 'allow_always' },
      { optionId: 'opt-deny', name: 'Deny', kind: 'deny' },
    ]);

    expect(session.status).toBe('waiting_approval');

    await session.respondPermission('req-1', 'allow');
    const result = await promise;

    expect(result.outcome.outcome).toBe('selected');
    expect(session.status).toBe('streaming');
  });

  it('should whitelist tool on always_allow_session and auto-approve subsequent requests', async () => {
    // 1. First request -> user selects always_allow_session
    const firstPromise = session.requestApproval('req-1', 'fs/writeFile', [
      { optionId: 'opt-allow', name: 'Allow Once', kind: 'allow_once' },
      { optionId: 'opt-always', name: 'Always Allow in Session', kind: 'allow_always' },
    ]);

    expect(session.status).toBe('waiting_approval');
    await session.respondPermission('req-1', 'always_allow_session', { optionId: 'opt-always' });
    const firstResult = await firstPromise;
    expect(firstResult.outcome.outcome).toBe('selected');

    // 2. Second request for same tool -> auto approves without waiting_approval
    const secondPromise = session.requestApproval('req-2', 'fs/writeFile', [
      { optionId: 'opt-allow', name: 'Allow Once', kind: 'allow_once' },
    ]);

    // Should NOT enter waiting_approval
    expect(session.status).not.toBe('waiting_approval');
    const secondResult = await secondPromise;
    expect(secondResult.outcome.outcome).toBe('selected');
  });

  it('should return cancelled outcome with reason when decision is deny', async () => {
    const promise = session.requestApproval('req-3', 'terminal/execute', [
      { optionId: 'opt-deny', name: 'Deny', kind: 'deny' },
    ]);

    await session.respondPermission('req-3', 'deny', { reason: 'Unauthorized command' });
    const result = await promise;

    expect(result.outcome.outcome).toBe('cancelled');
    expect(result.outcome.reason).toBe('Unauthorized command');
  });
});

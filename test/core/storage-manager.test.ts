import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { StorageManager } from '../../src/core/storage/storage-manager';
import type { AgentConfig } from '../../src/core/types/config';

describe('StorageManager: configuration and prompt input history', () => {
 let testDir: string;
 let storage: StorageManager;
 beforeEach(async()=>{testDir=await fs.mkdtemp(path.join(os.tmpdir(),'acp-storage-test-'));storage=new StorageManager(testDir)});
 afterEach(async()=>{await fs.rm(testDir,{recursive:true,force:true})});
 it('exposes no chat persistence or tombstone APIs and leaves legacy files untouched',async()=>{
  await fs.mkdir(path.join(testDir,'sessions'));
  await fs.writeFile(path.join(testDir,'sessions','old.json'),'legacy conversation');
  await fs.writeFile(path.join(testDir,'deleted-sessions.json'),'["remote"]');
  for(const method of ['saveSession','loadSession','listSavedSessions','deleteSavedSession','getDeletedSessionIds'])expect(method in storage).toBe(false);
  expect(await storage.getAgentConfigs()).toEqual([]);
  expect(await storage.getInputHistory()).toEqual([]);
  expect(await fs.readFile(path.join(testDir,'sessions','old.json'),'utf8')).toBe('legacy conversation');
 });
 it('bounds input history and deduplicates consecutive inputs',async()=>{
  await storage.recordInputHistory('first prompt');await storage.recordInputHistory('first prompt');await storage.recordInputHistory('  ');await storage.recordInputHistory('second prompt');
  expect(await storage.getInputHistory()).toEqual(['first prompt','second prompt']);
  for(let i=0;i<110;i++)await storage.recordInputHistory(`prompt-${i}`);
  const history=await storage.getInputHistory();expect(history).toHaveLength(100);expect(history[0]).toBe('prompt-10');expect(history[99]).toBe('prompt-109');
  expect((await fs.readdir(testDir)).some(file=>file.endsWith('.tmp'))).toBe(false);
 });
 it('serializes concurrent input updates',async()=>{await Promise.all(['one','two','two','three'].map(text=>storage.recordInputHistory(text)));expect(await storage.getInputHistory()).toEqual(['one','two','three'])});
 it('saves Agent configurations atomically',async()=>{
  const configs:AgentConfig[]=[{id:'agent-claude',name:'Claude Code',command:'npx',args:['@agentclientprotocol/claude-agent-acp'],env:{KEY:'val'},transport:'stdio',enabled:true}];
  await storage.saveAgentConfigs(configs);expect(await storage.getAgentConfigs()).toEqual(configs);expect(await fs.readdir(testDir)).toEqual(['agents.json']);
 });
 it('handles corrupted configuration and input history JSON',async()=>{await fs.writeFile(path.join(testDir,'agents.json'),'INVALID JSON');await fs.writeFile(path.join(testDir,'history.json'),'INVALID JSON');expect(await storage.getAgentConfigs()).toEqual([]);expect(await storage.getInputHistory()).toEqual([])});
});

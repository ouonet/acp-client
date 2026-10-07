import { describe, it, expect, vi } from 'vitest';
import { SessionHub } from '../../src/core/session/session-hub';
function setup() {
 const listeners = new Set<any>();
 const adapters = new Map<string, any>();
 const processManager = {getStatus:()=> 'running',onStatusChange:(f:any)=>{listeners.add(f);return {dispose:()=>listeners.delete(f)}},stop:vi.fn(async()=>{})} as any;
 const factory=vi.fn(async(id:string)=>{const updates=new Set<any>();const closed=new Set<any>();const capabilities:any={loadSession:true,sessionCapabilities:{list:{},delete:{},close:{}}};const adapter={capabilities,newSession:vi.fn(async()=>({sessionId:'same'})),loadSession:vi.fn(async(s:string)=>{for(const f of updates)f({sessionId:s,update:{sessionUpdate:'agent_message_chunk',content:'replay'}});return {}}),onSessionUpdate:(f:any)=>{updates.add(f);return {dispose:()=>updates.delete(f)}},onClose:(f:any)=>{closed.add(f);return {dispose:()=>closed.delete(f)}},getAgentCapabilities:()=>capabilities,listSessionPage:vi.fn(async()=>({sessions:[{sessionId:'remote',updatedAt:'2026-10-04T00:00:00Z'}],nextCursor:'next'})),prompt:vi.fn(async()=>({})),cancel:vi.fn(async()=>{}),closeSession:vi.fn(async()=>{}),deleteSession:vi.fn(async()=>true),close:vi.fn(async()=>{}),emit:(s:string)=>{for(const f of updates)f({sessionId:s,update:{sessionUpdate:'agent_message_chunk',content:'late'}})}};adapters.set(id,adapter);return adapter as any});
 const hub = new SessionHub({processManager,adapterFactory:factory});
 return {hub,factory,adapters,processManager,listeners};
}
describe('Agent runtime ownership',()=>{
 it('publishes the actual client handshake capabilities in the connection snapshot',async()=>{
  const {hub,factory}=setup();
  const make=factory.getMockImplementation()!;
  const offered={fs:{readTextFile:true,writeTextFile:false},terminal:false};
  factory.mockImplementationOnce(async(id:string)=>({...await make(id),getClientCapabilities:()=>offered}));
  await hub.connectAgent('a');
  expect(hub.getConnection('a')?.clientCapabilities).toEqual(offered);
  await hub.dispose();
 });
 it('reaps a late handshake adapter and fences retries during failed-connect cleanup',async()=>{
  vi.useFakeTimers();
  try {
   const {hub,factory,processManager}=setup(); let finish!: (adapter:any)=>void; let reaped!: ()=>void;
   factory.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));
   processManager.stop.mockImplementationOnce(()=>new Promise<void>(resolve=>{reaped=resolve}));
   const connecting=hub.connectAgent('a');const rejected=expect(connecting).rejects.toThrow(/timed out/);
   await vi.advanceTimersByTimeAsync(10000);await rejected;
   expect(processManager.stop).toHaveBeenCalledWith('a');
   await expect(hub.connectAgent('a')).rejects.toThrow(/cleaning|disconnecting/);
   const close=vi.fn(async()=>{}); finish({close});await vi.advanceTimersByTimeAsync(0);
   expect(close).toHaveBeenCalledOnce();expect(hub.getConnection('a')).toMatchObject({status:'error',initialized:false});
   reaped();await vi.advanceTimersByTimeAsync(0);await hub.connectAgent('a');expect(factory).toHaveBeenCalledTimes(2);await hub.dispose();
  } finally {vi.useRealTimers()}
 });
 it('loads historical sessions in the working directory reported by their Agent',async()=>{
  const {hub,adapters}=setup();await hub.connectAgent('a');const adapter=adapters.get('a');
  adapter.listSessionPage.mockResolvedValueOnce({sessions:[{sessionId:'remote',cwd:'/agent/original-workspace'}]});
  await hub.listAgentSessionPage('a');const session=await hub.restoreSession('remote','a','/current/workspace');
  expect(adapter.loadSession).toHaveBeenCalledWith('remote','/agent/original-workspace',[]);expect(session?.cwd).toBe('/agent/original-workspace');await hub.dispose();
 });
 it('qualifies overlapping IDs and preserves each Agent selection',async()=>{const {hub}=setup();const a=await hub.createSession('a');const b=await hub.createSession('b');expect(hub.listSessions()).toHaveLength(2);expect(hub.getSession('same','a')).toBe(a);expect(hub.getSession('same','b')).toBe(b);expect(()=>hub.getSession('same')).toThrow(/ambiguous/i);hub.setActiveAgent('a');expect(hub.getActiveSession()).toBe(a);await hub.disconnectAgent('b');expect(hub.getActiveSession()).toBe(a);await hub.dispose()});
 it('deduplicates a pending connect and preempts a hung handshake',async()=>{const {hub,factory}=setup();let resolve:any;factory.mockImplementationOnce(()=>new Promise(r=>{resolve=r}));const p=hub.connectAgent('a');const rejected=expect(p).rejects.toThrow(/disconnect/i);const q=hub.connectAgent('a');const rejected2=expect(q).rejects.toThrow(/disconnect/i);expect(factory).toHaveBeenCalledTimes(1);await hub.disconnectAgent('a');await rejected;await rejected2;resolve({close:vi.fn(async()=>{})});await Promise.resolve();expect(hub.listConnections()).toEqual([])});
 it('does not publish partial load replay and keeps failed replacement detached',async()=>{const {hub,adapters}=setup();const prior=await hub.createSession('a');const adapter=adapters.get('a');let finish:any;adapter.loadSession.mockImplementationOnce(async(s:string)=>{adapter.emit(s);await new Promise((_,reject)=>{finish=reject})});const p=hub.restoreSession('remote','a');const rejected=expect(p).rejects.toThrow('bad replay');await vi.waitFor(()=>expect(finish).toBeDefined());expect(hub.getActiveSession()).toBe(prior);expect(hub.getSession('remote','a')).toBeUndefined();finish(new Error('bad replay'));await rejected;expect(prior.serialize()).toMatchObject({attached:false,status:'error'});await hub.dispose()});
 it('remote history carries no inferred state and preserves pagination',async()=>{const {hub}=setup();await hub.connectAgent('a');const page=await hub.listAgentSessionPage('a');expect(page.nextCursor).toBe('next');expect(page.sessions[0].status).toBeUndefined();expect(hub.listSessions()).toEqual([]);await hub.dispose()});
 it('closing preempts hung creation and fences its late result',async()=>{const {hub,adapters}=setup();await hub.connectAgent('a');let finish:any;adapters.get('a').newSession.mockImplementationOnce(()=>new Promise(r=>{finish=r}));const p=hub.createSession('a');const rejected=expect(p).rejects.toThrow(/closed/i);await vi.waitFor(()=>expect(finish).toBeDefined());await hub.closeSession('same','a');await rejected;finish({sessionId:'same'});await Promise.resolve();expect(hub.listSessions()).toEqual([]);await hub.dispose()});
 it('close immediately settles a prompt waiting on model synchronization',async()=>{const {hub,adapters}=setup();const session=await hub.createSession('a');const adapter=adapters.get('a');adapter.setConfigOption=vi.fn(()=>new Promise(()=>{}));const p=session.prompt('question',{model:'model-b'});const rejected=expect(p).rejects.toThrow(/closed|detached/i);await hub.closeSession(session.id,'a');await rejected;expect(adapter.prompt).not.toHaveBeenCalled();expect(session.status).toBe('error');await hub.dispose()});
 it('late cancel completion cannot restore a closed runtime to idle',async()=>{const {hub,adapters}=setup();const session=await hub.createSession('a');const adapter=adapters.get('a');let finish:any;adapter.prompt.mockImplementationOnce(()=>new Promise(()=>{}));adapter.cancel.mockImplementationOnce(()=>new Promise(r=>{finish=r}));const p=session.prompt('question');const rejected=expect(p).rejects.toThrow();const cancel=session.cancel();await hub.closeSession(session.id,'a');finish();await cancel;await rejected;expect(session.status).toBe('error');await hub.dispose()});
 it('background history and delete preserve selected Agent',async()=>{const {hub}=setup();await hub.createSession('a');await hub.createSession('b');hub.setActiveAgent('b');await hub.listAgentSessionPage('a');expect(hub.getActiveAgentId()).toBe('b');await hub.deleteSession('same','a');expect(hub.getActiveAgentId()).toBe('b');await hub.dispose()});
 it('loading and creating a background runtime do not steal a later selection',async()=>{const {hub,adapters}=setup();await hub.createSession('a');await hub.createSession('b');let finish:any;adapters.get('a').loadSession.mockImplementationOnce(()=>new Promise(r=>{finish=r}));const p=hub.restoreSession('remote','a');await vi.waitFor(()=>expect(finish).toBeDefined());hub.setActiveAgent('b');finish({});await p;expect(hub.getActiveAgentId()).toBe('b');await hub.dispose()});
 it('refuses false or missing lifecycle capabilities without issuing RPCs',async()=>{const {hub,adapters}=setup();const session=await hub.createSession('a');const adapter=adapters.get('a');adapter.capabilities.sessionCapabilities={list:false,delete:false,close:false};const current=adapter;await expect(hub.listAgentSessionPage('a')).rejects.toThrow(/support/);await expect(hub.deleteSession(session.id,'a')).rejects.toThrow(/support/);expect(current.listSessionPage).not.toHaveBeenCalled();expect(current.deleteSession).not.toHaveBeenCalled();await hub.dispose()});
 it('keeps a failed connection visible when process stop fails',async()=>{const {hub,processManager}=setup();await hub.createSession('a');processManager.stop.mockRejectedValueOnce(new Error('cannot reap'));await expect(hub.disconnectAgent('a')).rejects.toThrow('cannot reap');expect(hub.getConnection('a')).toMatchObject({status:'error',initialized:false,error:'cannot reap'});await hub.disconnectAgent('a');expect(hub.listConnections()).toEqual([])});
});

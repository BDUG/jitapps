import type {ModelRequest, ModelResponse, ToolDefinition, AgentEvent, ToolResult} from './contracts';
export * from './contracts';
export type Snapshot = {format:string; tenant:string; id:string; revision:number; goal:string; status:string; step:number; events:AgentEvent[]; permissions:{edits:boolean;commands:boolean}; usage:Usage; pending:unknown; usedCallIds:string[]; invalid:number};
export type Usage = {modelCalls:number;toolCalls:number;elapsedMs:number};
export type ToolContext = {sessionId:string;callId:string;step:number;context:unknown[];signal?:AbortSignal;delegationDepth?:number};
export type Tool = ToolDefinition & {execute:(args:Record<string,unknown>,context:ToolContext)=>unknown|Promise<unknown>;available?:(context:unknown[],state:Snapshot)=>boolean|Promise<boolean>};
export interface SessionStore {
  acquire(tenant:string,id:string,owner:string):boolean|Promise<boolean>;
  release(tenant:string,id:string,owner:string):void|Promise<void>;
  load(tenant:string,id:string):Snapshot|null|Promise<Snapshot|null>;
  save(tenant:string,id:string,state:Snapshot,revision:number):number|Promise<number>;
}
export type Options = {model:(request:ModelRequest,signal?:AbortSignal)=>ModelResponse|string|AsyncIterable<string>|Promise<ModelResponse|string|AsyncIterable<string>>;tools?:Tool[];contextProviders?:Array<(state:Snapshot,signal?:AbortSignal)=>unknown|Promise<unknown>>;policy?:{authorize?:(action:NonNullable<ModelResponse['action']>,state:Snapshot)=>boolean|Promise<boolean>;complete?:(response:ModelResponse,state:Snapshot)=>boolean|Promise<boolean>;preflight?:(state:Snapshot)=>boolean|Promise<boolean>};sessionStore?:SessionStore;onEvent?:(event:AgentEvent)=>void|Promise<void>;budgets?:Partial<Usage & {sessionBytes:number;responseBytes:number}>;tenant?:string;requiredCapabilities?:string[]};
export type RunOptions = {allowEdits?:boolean;allowCommands?:boolean;signal?:AbortSignal};
export type Result = {status:'complete'|'waiting'|'paused';sessionId:string;usage?:Usage;summary?:string;reason?:string;question?:string;pending?:unknown};
export interface CoreAgent {
  run(goal:string,options?:RunOptions):Promise<Result>;
  resume(id:string,options?:RunOptions & {answer?:string}):Promise<Result>;
  resolvePending(id:string,result:ToolResult):Promise<void>;
  snapshot():Snapshot|null;
  preflight():{ok:boolean;issues:string[];capabilities:Record<string,unknown>};
  capabilities():Record<string,unknown>;
}
export function createAgent(options:Options):CoreAgent;
export function capabilities():Record<string,unknown>;
export function replay(snapshot:Snapshot,options?:{tools?:Record<string,Tool['execute']>;onEvent?:Options['onEvent']}):Promise<{result:Result;snapshot:Snapshot}>;
export class MemorySessionStore implements SessionStore {
  acquire(tenant:string,id:string,owner:string):Promise<boolean>;
  release(tenant:string,id:string,owner:string):Promise<void>;
  load(tenant:string,id:string):Promise<Snapshot|null>;
  save(tenant:string,id:string,state:Snapshot,revision:number):Promise<number>;
}

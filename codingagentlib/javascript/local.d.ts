import { ToolDefinition } from './core';

export const SCRIPT_TOOL_NAMES: readonly string[];
export const PROGRAM_TOOL_NAMES: readonly string[];

export interface LocalRuntimeOptions {
  workspace: string;
  commands?: string[];
  python?: string;
  pythonPath?: string;
  env?: Record<string, string | undefined>;
  exclusiveWorkspace?: boolean;
  toolLibrary?: string | null;
}

export interface CoreToolsOptions {
  sessionId?: string | null;
  allowEdits?: boolean;
  allowCommands?: boolean;
  names?: string[] | null;
  includeBrowser?: boolean;
}

export class LocalRuntime {
  constructor(options?: LocalRuntimeOptions);
  dispatch(params: Record<string, unknown>): Promise<any>;
  pythonEnv(action?: string, params?: Record<string, unknown>): Promise<any>;
  scriptLibrary(action?: string, params?: Record<string, unknown>): Promise<any>;
  toolLibrary(action?: string, params?: Record<string, unknown>): Promise<any>;
  agentMemory(action?: string, params?: Record<string, unknown>): Promise<any>;
  memorySuite(action?: string, params?: Record<string, unknown>): Promise<any>;
  coreTools(options?: CoreToolsOptions): Promise<ToolDefinition[]>;
  scriptTools(options?: CoreToolsOptions): Promise<ToolDefinition[]>;
  programTools(options?: CoreToolsOptions): Promise<ToolDefinition[]>;
  run(options?: Record<string, unknown>): Promise<any>;
  close(): Promise<void>;
}

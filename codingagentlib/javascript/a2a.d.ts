import type { Tool } from './core';

export interface AgentCardSkill {
  id?: string;
  name?: string;
  description?: string;
  tags?: string[];
}

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    stateTransitionHistory: boolean;
  };
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: Array<{ id: string; name: string; description: string; tags: string[] }>;
}

export function agentCard(options?: {
  name?: string;
  description?: string;
  url?: string;
  version?: string;
  skills?: AgentCardSkill[];
  streaming?: boolean;
}): AgentCard;

export class A2AServer {
  card: AgentCard;
  constructor(options?: {
    card?: AgentCard;
    handler?: (goal: string, params: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown>>;
  });
  handle(frame: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export class A2AClient {
  endpoint: string;
  constructor(options: {
    endpoint: string;
    fetch?: typeof globalThis.fetch;
    headers?: Record<string, string>;
  });
  call(method: string, params?: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<unknown>;
  sendTask(goal: string, options?: { taskId?: string; sessionId?: string; metadata?: Record<string, unknown>; signal?: AbortSignal }): Promise<unknown>;
  getTask(taskId: string, options?: { signal?: AbortSignal }): Promise<unknown>;
  cancelTask(taskId: string, options?: { signal?: AbortSignal }): Promise<unknown>;
}

export function a2aDelegationTool(
  client: A2AServer | A2AClient,
  options?: { name?: string; description?: string }
): Tool;

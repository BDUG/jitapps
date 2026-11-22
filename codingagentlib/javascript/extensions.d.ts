import type { Tool } from './core';
import type { McpTransport } from './mcp-transports';

export function mcpTools(options: {
  transport: McpTransport;
  trust?: (tool: { name: string; description?: string; inputSchema?: Record<string, unknown> }) => boolean;
  prefix?: string;
}): Promise<Tool[]>;

export function exposeMcp(options: {
  tools: Tool[];
  serverInfo?: { name: string; version: string };
}): { handle(frame: Record<string, unknown>): Promise<Record<string, unknown>> };

export function delegationTool(options: Record<string, unknown>): Tool;

export function capabilities(): Record<string, unknown>;

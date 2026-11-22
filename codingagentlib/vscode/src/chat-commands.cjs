'use strict';

const SLASH_COMMANDS = [
  { name: 'goal', usage: '/goal <task>', description: 'Run autonomous goal mode in Build with full 500-step budget and verification.' },
  { name: 'plan', usage: '/plan <task>', description: 'Run in read-only Plan mode to inspect code and produce a plan.' },
  { name: 'build', usage: '/build <task>', description: 'Run in Build mode with approved edit/command permissions.' },
  { name: 'review', usage: '/review [scope]', description: 'Activate reviewer persona in read-only mode to inspect changes and diagnostics.' },
  { name: 'status', usage: '/status', description: 'Show current session, model, permissions, and allowed commands.' },
  { name: 'new', usage: '/new', description: 'Start a fresh chat session.' },
  { name: 'snapshots', usage: '/snapshots [label]', description: 'List saved workspace snapshots, or create one with a label.' },
  { name: 'changes', usage: '/changes', description: 'Show changed workspace files in the current session.' },
  { name: 'export', usage: '/export', description: 'Export the current session result ZIP.' },
  { name: 'settings', usage: '/settings', description: 'Open RabbitHole settings.' },
  { name: 'skills', usage: '/skills [query]', description: 'List workspace skills (.agents/skills, .extension/skills) or filter by query.' },
  { name: 'agents', usage: '/agents [name] [task]', description: 'List agent personas or run a task with a specific persona.' },
  { name: 'tools', usage: '/tools', description: 'Show available native tools, permissions, and executable allowlist.' },
  { name: 'memory', usage: '/memory [query]', description: 'Search project memory notes and show matches.' },
  { name: 'help', usage: '/help', description: 'Show supported / commands and @ mentions.' },
];

const BUILTIN_MENTIONS = [
  { token: '@selection', description: 'Attach current editor selection' },
  { token: '@problems', description: 'Attach current editor diagnostics summary' },
  { token: '@changes', description: 'Attach current workspace changed files summary' },
  { token: '@workspace', description: 'Include workspace overview context' },
  { token: '@file:', description: 'Attach a workspace file or text page (e.g. @file:src/app.js#page=2)' },
  { token: '@skill:', description: 'Apply a workspace skill (e.g. @skill:sdd-spec-and-report)' },
  { token: '@agent:', description: 'Activate an agent persona (e.g. @agent:reviewer)' },
  { token: '@memory:', description: 'Search and attach project memory (e.g. @memory:auth)' },
];

function parseChatInput(rawText) {
  const text = String(rawText || '').trim();
  let command = null;
  let prompt = text;

  const slashMatch = /^\/([a-z][a-z0-9_-]*)(?:\s+([\s\S]*))?$/i.exec(text);
  if (slashMatch) {
    command = slashMatch[1].toLowerCase();
    prompt = (slashMatch[2] || '').trim();
  }

  const mentions = [];
  // Keep page selectors intact: the reference resolver validates them before I/O.
  const mentionRegex = /(^|\s)@([a-zA-Z0-9_./:#=-]+)/g;
  let m;
  while ((m = mentionRegex.exec(prompt)) !== null) {
    const token = m[2];
    const lower = token.toLowerCase();
    if (lower === 'selection') {
      mentions.push({ kind: 'selection', raw: '@' + token });
    } else if (lower === 'problems' || lower === 'diagnostics') {
      mentions.push({ kind: 'problems', raw: '@' + token });
    } else if (lower === 'changes') {
      mentions.push({ kind: 'changes', raw: '@' + token });
    } else if (lower === 'workspace') {
      mentions.push({ kind: 'workspace', raw: '@' + token });
    } else if (lower.startsWith('skill:')) {
      const name = token.slice(6).trim();
      if (name) mentions.push({ kind: 'skill', name, raw: '@' + token });
    } else if (lower.startsWith('agent:')) {
      const name = token.slice(6).trim();
      if (name) mentions.push({ kind: 'agent', name, raw: '@' + token });
    } else if (lower.startsWith('memory:')) {
      const query = token.slice(7).trim();
      if (query) mentions.push({ kind: 'memory', query, raw: '@' + token });
    } else if (lower.startsWith('file:')) {
      const filePath = token.slice(5).trim();
      if (filePath) mentions.push({ kind: 'file', path: filePath, raw: '@' + token });
    } else if (token.includes('/') || /\.[a-zA-Z0-9]{1,10}$/.test(token)) {
      mentions.push({ kind: 'file', path: token, raw: '@' + token });
    }
  }

  return { command, prompt, mentions };
}

function formatHelpText() {
  const lines = ['Supported slash commands:'];
  for (const cmd of SLASH_COMMANDS) {
    lines.push(`  ${cmd.usage} — ${cmd.description}`);
  }
  lines.push('', 'Supported @ mentions:');
  for (const item of BUILTIN_MENTIONS) {
    lines.push(`  ${item.token} — ${item.description}`);
  }
  return lines.join('\n');
}

const GOAL_MODE_INSTRUCTIONS = [
  'Autonomous Goal Mode active (500-step budget):',
  '1. Inspect the relevant code, tests, and repository instructions before making edits.',
  '2. Decompose multi-step work into an explicit task list (`tasks`) and complete each item systematically.',
  '3. Verify all changes with real tests/checks within approved permissions; report only directly observed results.',
  '4. Continue autonomously until the goal and verification are complete; use `ask` only when genuinely blocked or a user decision is required.',
].join('\n');

const PLAN_MODE_INSTRUCTIONS = [
  'Read-only Plan Mode active:',
  '1. Inspect the relevant files and architecture without modifying files or running commands.',
  '2. Produce a concrete, file-referenced implementation plan with explicit verification steps and open questions.',
].join('\n');

const REVIEW_MODE_INSTRUCTIONS = [
  'Read-only Code Review Mode active:',
  '1. Inspect changed files, callers, and diagnostics without modifying files or running mutating commands.',
  '2. Trace concrete code paths and report prioritized findings with file/line references and suggested fixes.',
].join('\n');

module.exports = {
  SLASH_COMMANDS,
  BUILTIN_MENTIONS,
  GOAL_MODE_INSTRUCTIONS,
  PLAN_MODE_INSTRUCTIONS,
  REVIEW_MODE_INSTRUCTIONS,
  parseChatInput,
  formatHelpText,
};

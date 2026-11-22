'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

const MAX_SKILL_BYTES = 64 * 1024;
const MAX_SKILLS = 50;
const MAX_AGENTS = 30;

const BUILTIN_AGENTS = [
  {
    name: 'planner',
    source: 'builtin',
    description: 'Read-only architecture and task-decomposition planner.',
    instructions: 'Inspect workspace structure, symbols, and constraints before proposing a dependency-ordered plan. Never claim unverified edits or command results.',
  },
  {
    name: 'implementer',
    source: 'builtin',
    description: 'Focused code implementer and verifier.',
    instructions: 'Read target files before editing, use apply_edits or replace_text for minimal diffs, and verify changes with real tests or checks.',
  },
  {
    name: 'reviewer',
    source: 'builtin',
    description: 'Code reviewer checking correctness, edge cases, and regressions.',
    instructions: 'Inspect diffs, diagnostics, and test coverage for correctness, security boundaries, and missing edge cases without making unapproved edits.',
  },
  {
    name: 'security_auditor',
    source: 'builtin',
    description: 'Security auditor checking path traversal, injection, secrets, and permissions.',
    instructions: 'Audit code and commands for path escapes, untrusted input execution, credential leaks, and missing authorization checks.',
  },
];

const DESTRUCTIVE_PATTERNS = [
  { name: 'root_wipe', regex: /(?:^|\s|;|&|\|)rm\s+-[^\n]*r[^\n]*f[^\n]*\s+(?:\/|~|\$HOME)(?:\s|$)/i },
  { name: 'filesystem_format', regex: /(?:^|\s|;|&|\|)(?:mkfs(?:\.[a-z0-9]+)?|wipefs)\s+/i },
  { name: 'raw_disk_write', regex: /(?:^|\s|;|&|\|)dd\s+[^\n]*of=\/dev\//i },
  { name: 'fork_bomb', regex: /:\(\)\s*\{\s*:\|:&\s*\}\s*;/ },
  { name: 'git_force_push', regex: /(?:^|\s|;|&|\|)git\s+push\b[^\n]*(?:--force|-f)(?:\s|$)/i },
  { name: 'git_hard_reset', regex: /(?:^|\s|;|&|\|)git\s+reset\s+--hard\b/i },
  { name: 'chmod_root_777', regex: /(?:^|\s|;|&|\|)chmod\s+-R\s+777\s+\/(?:\s|$)/i },
];

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi,
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
];

function redactSecrets(text) {
  if (typeof text !== 'string' || !text) return text;
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}

function parseFrontmatter(raw) {
  const text = String(raw || '');
  if (!text.startsWith('---')) {
    return { meta: {}, body: text.trim() };
  }
  const end = text.indexOf('\n---', 3);
  if (end < 0) {
    return { meta: {}, body: text.trim() };
  }
  const header = text.slice(3, end).trim();
  const body = text.slice(end + 4).trim();
  const meta = {};
  for (const line of header.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    meta[key] = val;
  }
  return { meta, body };
}

async function safeReadBounded(workspaceRoot, filePath) {
  const realRoot = await fs.realpath(workspaceRoot);
  const realFile = await fs.realpath(filePath);
  if (realFile !== realRoot && !realFile.startsWith(realRoot + path.sep)) {
    return null;
  }
  const stat = await fs.lstat(realFile);
  if (!stat.isFile() || stat.size > MAX_SKILL_BYTES) {
    return null;
  }
  return fs.readFile(realFile, 'utf8');
}

async function discoverSkills(workspaceRoot) {
  if (!workspaceRoot) return [];
  const roots = [
    path.join(workspaceRoot, '.agents', 'skills'),
    path.join(workspaceRoot, '.extension', 'skills'),
  ];
  const seen = new Set();
  const skills = [];
  for (const dir of roots) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (skills.length >= MAX_SKILLS) break;
      const skillFile = path.join(dir, entry.name, 'SKILL.md');
      try {
        const raw = await safeReadBounded(workspaceRoot, skillFile);
        if (!raw) continue;
        const { meta, body } = parseFrontmatter(raw);
        const name = (meta.name || entry.name).trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        skills.push({
          name,
          description: meta.description || '',
          path: path.relative(workspaceRoot, skillFile).replace(/\\/g, '/'),
          body: body.slice(0, 4000),
        });
      } catch {
        continue;
      }
    }
  }
  return skills;
}

async function discoverAgents(workspaceRoot) {
  const byName = new Map(BUILTIN_AGENTS.map(a => [a.name, { ...a }]));
  if (workspaceRoot) {
    const roots = [
      path.join(workspaceRoot, '.agents', 'agents'),
      path.join(workspaceRoot, '.extension', 'agents'),
    ];
    for (const dir of roots) {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.name.endsWith('.md')) continue;
        if (byName.size >= MAX_AGENTS) break;
        const agentFile = path.join(dir, entry.name);
        try {
          const raw = await safeReadBounded(workspaceRoot, agentFile);
          if (!raw) continue;
          const { meta, body } = parseFrontmatter(raw);
          const name = (meta.name || entry.name.replace(/\.md$/i, '')).trim();
          if (!name) continue;
          byName.set(name, {
            name,
            source: path.relative(workspaceRoot, agentFile).replace(/\\/g, '/'),
            description: meta.description || '',
            instructions: body.slice(0, 4000),
          });
        } catch {
          continue;
        }
      }
    }
  }
  return [...byName.values()];
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter(w => w.length >= 3);
}

function matchSkills(skills, goal, { explicitNames = [], limit = 4 } = {}) {
  const explicit = new Set(explicitNames.map(s => String(s).toLowerCase()));
  const goalTokens = new Set(tokenize(goal));
  const scored = [];
  for (const skill of skills || []) {
    const nameLow = skill.name.toLowerCase();
    if (explicit.has(nameLow)) {
      scored.push({ skill, score: 1000, explicit: true });
      continue;
    }
    const haystack = tokenize(`${skill.name} ${skill.description}`);
    let overlap = 0;
    for (const tok of haystack) {
      if (goalTokens.has(tok)) overlap += 1;
    }
    if (overlap > 0) {
      scored.push({ skill, score: overlap, explicit: false });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.skill);
}

function selectAgent(agents, { requestedName = null, executionMode = 'build', goal = '' } = {}) {
  const list = agents && agents.length ? agents : BUILTIN_AGENTS;
  if (requestedName) {
    const found = list.find(a => a.name.toLowerCase() === String(requestedName).toLowerCase());
    if (found) return found;
  }
  if (executionMode === 'plan') {
    return list.find(a => a.name === 'planner') || list[0];
  }
  const low = String(goal || '').toLowerCase();
  if (/\b(security|audit|vulnerab|secret|injection|xss|csrf)\b/.test(low)) {
    return list.find(a => a.name === 'security_auditor') || list[0];
  }
  if (/\b(review|inspect|check diff)\b/.test(low)) {
    return list.find(a => a.name === 'reviewer') || list[0];
  }
  return list.find(a => a.name === 'implementer') || list[0];
}

function checkDestructiveAction(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  if (!['run_command', 'run_script'].includes(candidate.tool)) return null;
  const args = candidate.args || {};
  const cmdParts = [];
  if (typeof args.command === 'string') cmdParts.push(args.command);
  if (Array.isArray(args.args)) cmdParts.push(args.args.map(String).join(' '));
  if (typeof args.script === 'string') cmdParts.push(args.script);
  if (typeof args.code === 'string') cmdParts.push(args.code);
  const combined = cmdParts.join(' ');
  for (const rule of DESTRUCTIVE_PATTERNS) {
    if (rule.regex.test(combined)) {
      return {
        blocked: true,
        rule: rule.name,
        tool: candidate.tool,
        message: `Guardrail blocked potentially destructive ${candidate.tool} proposal (${rule.name}). Review and use a safer scoped command.`,
      };
    }
  }
  return null;
}

module.exports = {
  BUILTIN_AGENTS,
  discoverSkills,
  discoverAgents,
  matchSkills,
  selectAgent,
  checkDestructiveAction,
  redactSecrets,
};

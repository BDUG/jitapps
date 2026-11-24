'use strict';

const CATEGORIES = ['memory', 'skills', 'agents', 'tools', 'workflows'];

function emptyOverrides() {
  return {
    disabled: { memory: [], skills: [], agents: [], tools: [], workflows: [] },
    edited: { memory: {}, skills: {}, agents: {}, workflows: {} },
    activeAgent: null,
  };
}

function normalizeOverrides(raw) {
  const base = emptyOverrides();
  if (!raw || typeof raw !== 'object') return base;
  for (const cat of CATEGORIES) {
    if (Array.isArray(raw.disabled?.[cat])) {
      base.disabled[cat] = [...new Set(raw.disabled[cat].map(String).filter(Boolean))];
    }
    if (cat !== 'tools' && raw.edited?.[cat] && typeof raw.edited[cat] === 'object') {
      base.edited[cat] = { ...raw.edited[cat] };
    }
  }
  if (typeof raw.activeAgent === 'string' && raw.activeAgent.trim()) {
    base.activeAgent = raw.activeAgent.trim();
  }
  return base;
}

function storageKey(workspacePath, sessionId) {
  return 'resource-overrides:' + (workspacePath || 'global') + ':' + (sessionId || 'default');
}

function getOverrides(context, workspacePath, sessionId) {
  const raw = context?.workspaceState?.get(storageKey(workspacePath, sessionId));
  return normalizeOverrides(raw);
}

async function setOverrides(context, workspacePath, sessionId, next) {
  const normalized = normalizeOverrides(next);
  if (context?.workspaceState) {
    await context.workspaceState.update(storageKey(workspacePath, sessionId), normalized);
  }
  return normalized;
}

async function toggleDisabled(context, workspacePath, sessionId, category, id) {
  if (!CATEGORIES.includes(category)) throw Error('Unsupported browser category: ' + category);
  if (typeof id !== 'string' || !id.trim()) throw Error('Invalid resource id');
  const cur = getOverrides(context, workspacePath, sessionId);
  const list = cur.disabled[category];
  const idx = list.indexOf(id);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(id);
  return setOverrides(context, workspacePath, sessionId, cur);
}

async function saveEdit(context, workspacePath, sessionId, category, id, data) {
  if (!['memory', 'skills', 'agents', 'workflows'].includes(category)) {
    throw Error('Editing is not supported for category: ' + category);
  }
  if (typeof id !== 'string' || !id.trim()) throw Error('Invalid resource id');
  const cur = getOverrides(context, workspacePath, sessionId);
  if (data === null) {
    delete cur.edited[category][id];
  } else {
    cur.edited[category][id] = { ...data, updatedAt: new Date().toISOString() };
  }
  return setOverrides(context, workspacePath, sessionId, cur);
}

async function selectActiveAgent(context, workspacePath, sessionId, name) {
  const cur = getOverrides(context, workspacePath, sessionId);
  cur.activeAgent = cur.activeAgent === name ? null : (name || null);
  return setOverrides(context, workspacePath, sessionId, cur);
}

function applySkills(skills, overrides) {
  const ov = normalizeOverrides(overrides);
  const disabled = new Set(ov.disabled.skills);
  return (skills || [])
    .filter((s) => !disabled.has(s.name))
    .map((s) => {
      const ed = ov.edited.skills[s.name];
      return ed ? { ...s, description: ed.description ?? s.description, body: ed.body ?? s.body, edited: true } : s;
    });
}

function applyAgents(agents, overrides) {
  const ov = normalizeOverrides(overrides);
  const disabled = new Set(ov.disabled.agents);
  const filtered = (agents || [])
    .filter((a) => !disabled.has(a.name))
    .map((a) => {
      const ed = ov.edited.agents[a.name];
      return ed ? { ...a, description: ed.description ?? a.description, instructions: ed.instructions ?? a.instructions, edited: true } : a;
    });
  return filtered.length ? filtered : agents || [];
}

function applyTools(tools, overrides) {
  const ov = normalizeOverrides(overrides);
  const disabled = new Set(ov.disabled.tools);
  if (!disabled.size) return tools || [];
  return (tools || []).filter((t) => !disabled.has(typeof t === 'string' ? t : t.name));
}

function applyMemory(notes, overrides) {
  const ov = normalizeOverrides(overrides);
  const disabled = new Set(ov.disabled.memory);
  return (notes || [])
    .filter((n) => !disabled.has(n.id))
    .map((n) => {
      const ed = ov.edited.memory[n.id];
      return ed ? { ...n, title: ed.title ?? n.title, text: ed.text ?? n.text, edited: true } : n;
    });
}

function buildCatalog({ memoryNotes = [], sessionMemory = [], skills = [], nativeSkills = [], agents = [], tools = [], workflows = [], overrides = null } = {}) {
  const ov = normalizeOverrides(overrides);
  const dis = {
    memory: new Set(ov.disabled.memory),
    skills: new Set(ov.disabled.skills),
    agents: new Set(ov.disabled.agents),
    tools: new Set(ov.disabled.tools),
    workflows: new Set(ov.disabled.workflows),
  };

  const memory = [
    ...memoryNotes.map((n) => {
      const ed = ov.edited.memory[n.id];
      return {
        id: n.id,
        category: 'memory',
        source: 'project-memory',
        title: ed?.title ?? n.title ?? n.id,
        description: n.category || 'note',
        content: ed?.text ?? n.text ?? '',
        disabled: dis.memory.has(n.id),
        edited: Boolean(ed),
        editable: true,
      };
    }),
    ...sessionMemory.map((m) => {
      const id = String(m.id || m.key || '');
      const ed = ov.edited.memory[id];
      return {
        id,
        category: 'memory',
        source: 'session-memory',
        title: ed?.title ?? m.title ?? id,
        description: m.collection || 'session',
        content: ed?.text ?? m.text ?? m.preview ?? '',
        disabled: dis.memory.has(id),
        edited: Boolean(ed),
        editable: true,
      };
    }),
  ];

  const seenSkills = new Set();
  const skillItems = [];
  for (const s of [...skills, ...nativeSkills]) {
    const id = String(s.name || s.id || '');
    if (!id || seenSkills.has(id)) continue;
    seenSkills.add(id);
    const ed = ov.edited.skills[id];
    skillItems.push({
      id,
      category: 'skills',
      source: s.path ? 'workspace' : 'native',
      title: id,
      description: ed?.description ?? s.description ?? '',
      content: ed?.body ?? s.body ?? s.content ?? '',
      disabled: dis.skills.has(id),
      edited: Boolean(ed),
      editable: true,
    });
  }

  const agentItems = (agents || []).map((a) => {
    const ed = ov.edited.agents[a.name];
    return {
      id: a.name,
      category: 'agents',
      source: a.source || 'builtin',
      title: a.name,
      description: ed?.description ?? a.description ?? '',
      content: ed?.instructions ?? a.instructions ?? '',
      disabled: dis.agents.has(a.name),
      edited: Boolean(ed),
      active: ov.activeAgent === a.name,
      editable: true,
    };
  });

  const toolItems = (tools || []).map((t) => {
    const id = typeof t === 'string' ? t : t.name;
    return {
      id,
      category: 'tools',
      source: 'native',
      title: id,
      description: typeof t === 'string' ? '' : (t.description || ''),
      content: typeof t === 'string' ? '' : JSON.stringify(t.parameters || t.arguments || {}, null, 2),
      disabled: dis.tools.has(id),
      edited: false,
      editable: false,
    };
  });

  const workflowItems = (workflows || []).map((w) => {
    const id = String(w.id || w.name || '');
    const ed = ov.edited.workflows[id];
    return {
      id,
      category: 'workflows',
      source: 'native',
      title: w.name || id,
      description: ed?.description ?? w.description ?? '',
      content: ed?.content ?? JSON.stringify(w, null, 2),
      disabled: dis.workflows.has(id),
      edited: Boolean(ed),
      editable: true,
    };
  });

  return {
    memory,
    skills: skillItems,
    agents: agentItems,
    tools: toolItems,
    workflows: workflowItems,
    activeAgent: ov.activeAgent,
  };
}

module.exports = {
  CATEGORIES,
  emptyOverrides,
  normalizeOverrides,
  getOverrides,
  setOverrides,
  toggleDisabled,
  saveEdit,
  selectActiveAgent,
  applySkills,
  applyAgents,
  applyTools,
  applyMemory,
  buildCatalog,
};

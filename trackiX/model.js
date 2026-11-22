(function (root) {
  'use strict';
  const STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'done'];
  const STATUS_LABELS = {
    backlog: 'Backlog',
    todo: 'To Do',
    in_progress: 'In Progress',
    in_review: 'In Review',
    done: 'Done',
  };
  const TYPES = ['epic', 'story', 'task', 'bug', 'subtask'];
  const PRIORITIES = ['lowest', 'low', 'medium', 'high', 'highest'];

  const schema = {
    type: 'object',
    required: ['kind', 'version', 'name', 'projectKey', 'sprints', 'issues'],
    properties: {
      kind: { const: 'trackix-project' },
      version: { type: 'integer', minimum: 1 },
      name: { type: 'string', minLength: 1, maxLength: 160 },
      projectKey: { type: 'string', minLength: 2, maxLength: 12 },
      nextNumber: { type: 'integer', minimum: 1 },
      activeId: { type: ['string', 'null'] },
      sprints: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'name', 'state'],
          properties: {
            id: { type: 'string', minLength: 1 },
            name: { type: 'string', minLength: 1, maxLength: 120 },
            goal: { type: 'string', maxLength: 500 },
            state: { enum: ['active', 'planned', 'closed'] },
          },
        },
      },
      issues: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'key', 'type', 'summary', 'status', 'priority'],
          properties: {
            id: { type: 'string', minLength: 1 },
            key: { type: 'string', minLength: 2, maxLength: 24 },
            type: { enum: TYPES },
            summary: { type: 'string', minLength: 1, maxLength: 240 },
            description: { type: 'string', maxLength: 8000 },
            status: { enum: STATUSES },
            priority: { enum: PRIORITIES },
            assignee: { type: 'string', maxLength: 120 },
            reporter: { type: 'string', maxLength: 120 },
            sprintId: { type: ['string', 'null'] },
            parentKey: { type: ['string', 'null'] },
            points: { type: ['number', 'null'], minimum: 0, maximum: 100 },
            labels: { type: 'array', items: { type: 'string', maxLength: 40 } },
            blockedBy: { type: 'array', items: { type: 'string', maxLength: 24 } },
            comments: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'author', 'text'],
                properties: {
                  id: { type: 'string' },
                  author: { type: 'string', maxLength: 120 },
                  text: { type: 'string', maxLength: 4000 },
                  createdAt: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  };

  function createDefault() {
    return {
      kind: 'trackix-project',
      version: 1,
      name: 'Core Platform Board',
      projectKey: 'TRK',
      nextNumber: 5,
      activeId: 'iss-1',
      sprints: [
        { id: 'spr-1', name: 'Sprint 14', goal: 'Ship auth hardening and board triage', state: 'active' },
        { id: 'spr-2', name: 'Sprint 15', goal: 'Telemetry export & audit filters', state: 'planned' },
      ],
      issues: [
        {
          id: 'iss-1',
          key: 'TRK-1',
          type: 'epic',
          summary: 'Authentication & Workspace Isolation',
          description: 'End-to-end token validation and workspace boundary enforcement.',
          status: 'in_progress',
          priority: 'highest',
          assignee: 'Alice',
          reporter: 'Dirk',
          sprintId: 'spr-1',
          parentKey: null,
          points: 8,
          labels: ['security', 'core'],
          blockedBy: [],
          comments: [],
        },
        {
          id: 'iss-2',
          key: 'TRK-2',
          type: 'story',
          summary: 'Add rate-limit headers to API gateway',
          description: 'Return Retry-After and X-RateLimit-Remaining on 429 responses.',
          status: 'todo',
          priority: 'high',
          assignee: 'Bob',
          reporter: 'Alice',
          sprintId: 'spr-1',
          parentKey: 'TRK-1',
          points: 3,
          labels: ['api'],
          blockedBy: [],
          comments: [],
        },
        {
          id: 'iss-3',
          key: 'TRK-3',
          type: 'bug',
          summary: 'Fix stale cache key on project rename',
          description: 'Renaming a board leaves an orphaned entry in local storage.',
          status: 'in_review',
          priority: 'high',
          assignee: 'Alice',
          reporter: 'Bob',
          sprintId: 'spr-1',
          parentKey: 'TRK-1',
          points: 2,
          labels: ['bug'],
          blockedBy: [],
          comments: [],
        },
        {
          id: 'iss-4',
          key: 'TRK-4',
          type: 'task',
          summary: 'Document OTLP trace export schema',
          description: 'Add examples for span attributes and resource metadata.',
          status: 'backlog',
          priority: 'medium',
          assignee: '',
          reporter: 'Dirk',
          sprintId: 'spr-2',
          parentKey: null,
          points: 2,
          labels: ['docs'],
          blockedBy: ['TRK-2'],
          comments: [],
        },
      ],
    };
  }

  function validate(candidate) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw Error('Expected a trackiX project object.');
    }
    const name = String(candidate.name || '').trim();
    if (!name || name.length > 160) throw Error('Project name must be 1–160 characters.');
    const projectKey = String(candidate.projectKey || 'TRK').trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9]{1,11}$/.test(projectKey)) {
      throw Error('Project key must be 2–12 uppercase alphanumeric characters starting with a letter.');
    }
    if (!Array.isArray(candidate.sprints)) throw Error('sprints must be an array.');
    if (!Array.isArray(candidate.issues)) throw Error('issues must be an array.');

    const sprintIds = new Set();
    const sprints = candidate.sprints.map((s, idx) => {
      if (!s || typeof s !== 'object') throw Error('Invalid sprint entry.');
      const id = String(s.id || `spr-${idx + 1}`).trim();
      const sName = String(s.name || '').trim();
      if (!id || !sName) throw Error('Each sprint needs an id and name.');
      if (sprintIds.has(id)) throw Error(`Duplicate sprint id: ${id}`);
      sprintIds.add(id);
      const state = ['active', 'planned', 'closed'].includes(s.state) ? s.state : 'planned';
      return { id, name: sName.slice(0, 120), goal: String(s.goal || '').slice(0, 500), state };
    });

    const issueIds = new Set();
    const issueKeys = new Set();
    let maxNum = 0;
    const issues = candidate.issues.map((raw, idx) => {
      if (!raw || typeof raw !== 'object') throw Error('Invalid issue entry.');
      const id = String(raw.id || `iss-${idx + 1}`).trim();
      const key = String(raw.key || `${projectKey}-${idx + 1}`).trim().toUpperCase();
      const summary = String(raw.summary || '').trim();
      if (!id || !key || !summary) throw Error('Each issue requires id, key, and summary.');
      if (issueIds.has(id)) throw Error(`Duplicate issue id: ${id}`);
      if (issueKeys.has(key)) throw Error(`Duplicate issue key: ${key}`);
      issueIds.add(id);
      issueKeys.add(key);
      const numMatch = /-(\d+)$/.exec(key);
      if (numMatch) maxNum = Math.max(maxNum, Number(numMatch[1]));
      const type = TYPES.includes(raw.type) ? raw.type : 'task';
      const status = STATUSES.includes(raw.status) ? raw.status : 'backlog';
      const priority = PRIORITIES.includes(raw.priority) ? raw.priority : 'medium';
      const sprintId = raw.sprintId && sprintIds.has(String(raw.sprintId)) ? String(raw.sprintId) : null;
      const points = raw.points === null || raw.points === undefined || raw.points === ''
        ? null
        : (Number.isFinite(Number(raw.points)) && Number(raw.points) >= 0 && Number(raw.points) <= 100 ? Number(raw.points) : null);
      const labels = Array.isArray(raw.labels)
        ? [...new Set(raw.labels.map(l => String(l || '').trim()).filter(Boolean).slice(0, 20))]
        : [];
      const blockedBy = Array.isArray(raw.blockedBy)
        ? [...new Set(raw.blockedBy.map(b => String(b || '').trim().toUpperCase()).filter(b => b && b !== key))]
        : [];
      const comments = Array.isArray(raw.comments)
        ? raw.comments.filter(c => c && typeof c === 'object' && String(c.text || '').trim()).map((c, ci) => ({
            id: String(c.id || `cmt-${ci + 1}`),
            author: String(c.author || 'User').slice(0, 120),
            text: String(c.text).slice(0, 4000),
            createdAt: String(c.createdAt || ''),
          }))
        : [];
      return {
        id,
        key,
        type,
        summary: summary.slice(0, 240),
        description: String(raw.description || '').slice(0, 8000),
        status,
        priority,
        assignee: String(raw.assignee || '').trim().slice(0, 120),
        reporter: String(raw.reporter || '').trim().slice(0, 120),
        sprintId,
        parentKey: raw.parentKey ? String(raw.parentKey).trim().toUpperCase() : null,
        points,
        labels,
        blockedBy,
        comments,
      };
    });

    const activeId = candidate.activeId && issueIds.has(String(candidate.activeId))
      ? String(candidate.activeId)
      : (issues[0]?.id || null);
    const nextNumber = Math.max(Number.isInteger(candidate.nextNumber) ? candidate.nextNumber : 1, maxNum + 1);
    return { kind: 'trackix-project', version: 1, name, projectKey, nextNumber, activeId, sprints, issues };
  }

  function metrics(doc) {
    const counts = Object.fromEntries(STATUSES.map(s => [s, 0]));
    let totalPoints = 0;
    let donePoints = 0;
    let blocked = 0;
    for (const iss of doc.issues || []) {
      counts[iss.status] = (counts[iss.status] || 0) + 1;
      const pts = Number(iss.points) || 0;
      totalPoints += pts;
      if (iss.status === 'done') donePoints += pts;
      if ((iss.blockedBy || []).length) blocked += 1;
    }
    return { total: (doc.issues || []).length, counts, totalPoints, donePoints, blocked };
  }

  function toCsv(doc) {
    const esc = v => {
      let s = String(v ?? '');
      if (/^(?:\s*[=+@-]|[\t\r])/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const header = ['Key', 'Type', 'Summary', 'Status', 'Priority', 'Assignee', 'Points', 'Sprint', 'Labels', 'BlockedBy'];
    const sprintName = new Map((doc.sprints || []).map(s => [s.id, s.name]));
    const rows = (doc.issues || []).map(i => [
      i.key, i.type, i.summary, i.status, i.priority, i.assignee, i.points ?? '',
      sprintName.get(i.sprintId) || '', (i.labels || []).join('; '), (i.blockedBy || []).join('; '),
    ]);
    return [header, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
  }

  const api = { STATUSES, STATUS_LABELS, TYPES, PRIORITIES, schema, createDefault, validate, metrics, toCsv };
  root.Trackix = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);

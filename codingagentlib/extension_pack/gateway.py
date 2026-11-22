"""Policy-as-code hooks around public host tool callbacks and completion policy."""
import hashlib
import json
import re

from .audit import redact


class Gateway:
    def __init__(self, store, *, rules, verification, audit, interactive=False,
                 headless_policy='deny', approve=None, secrets=(), retry_threshold=3):
        if headless_policy not in ('deny', 'allow_allowlisted') or retry_threshold < 1:
            raise ValueError('Invalid escalation/headless policy')
        self.store, self.rules, self.verification, self.audit = store, rules, verification, audit
        self.interactive, self.headless_policy, self.approve = interactive, headless_policy, approve
        self.secrets, self.retry_threshold = secrets, retry_threshold
        with store.lock:
            store.db.executescript('''
                CREATE TABLE IF NOT EXISTS extension_escalations(session TEXT PRIMARY KEY, body TEXT);
                CREATE TABLE IF NOT EXISTS extension_failures(session TEXT, signature TEXT, count INTEGER,
                    PRIMARY KEY(session,signature));
                CREATE TABLE IF NOT EXISTS extension_approvals(session TEXT, signature TEXT,
                    PRIMARY KEY(session,signature));
            ''')

    @staticmethod
    def signature(action):
        return hashlib.sha256(json.dumps(action, sort_keys=True).encode()).hexdigest()

    def escalate(self, session, reason, **details):
        value = redact(dict(type='ask-for-help', reason=reason, **details), self.secrets)
        with self.store.lock:
            self.store.db.execute('INSERT OR REPLACE INTO extension_escalations VALUES(?,?)',
                                  (session, json.dumps(value)))
        self.audit('governance.escalation', dict(sessionId=session, **value))

    def pending(self, session):
        with self.store.lock:
            row = self.store.db.execute('SELECT body FROM extension_escalations WHERE session=?', (session,)).fetchone()
        return json.loads(row[0]) if row else None

    def approve_pending(self, session, signature):
        """Trusted operator API. Not a model tool; exact action approval is single-use."""
        pending = self.pending(session)
        if not isinstance(signature, str) or not pending or pending.get('actionSignature') != signature:
            raise ValueError('Approval does not match the pending action')
        with self.store.lock:
            self.store.db.execute('INSERT OR IGNORE INTO extension_approvals VALUES(?,?)', (session, signature))
            self.store.db.execute('DELETE FROM extension_escalations WHERE session=?', (session,))
        self.audit('governance.approved', dict(sessionId=session, actionSignature=signature))

    def resolve_escalation(self, session, resolution):
        """Trusted operator acknowledgement; approvals still require exact signatures."""
        pending = self.pending(session)
        if not pending or pending['reason'] == 'approval_required':
            raise ValueError('No non-approval escalation to resolve')
        if not isinstance(resolution, str) or not resolution.strip():
            raise ValueError('Operator resolution is required')
        if pending['reason'] == 'verification_required' and not self.verification.ready(session):
            raise PermissionError('Verification requirements remain unmet')
        with self.store.lock:
            self.store.db.execute('DELETE FROM extension_escalations WHERE session=?', (session,))
            self.store.db.execute('DELETE FROM extension_failures WHERE session=?', (session,))
        self.audit('governance.resolved', dict(sessionId=session, reason=pending['reason'],
                                               resolution=redact(resolution, self.secrets)))

    def authorize(self, action, state, *, permission='read'):
        session, name = state['id'], action['tool']
        signature = self.signature(dict(tool=name, args=action['args']))
        forbidden = name in self.rules.get('denyTools', ())
        if name in self.rules.get('shellTools', ('run_command', 'shell', 'terminal')):
            # Secure default: no raw shell string, pipelines, destructive verbs or
            # executable arguments unless the exact action receives approval.
            forbidden = forbidden or any(re.search(pattern, json.dumps(action['args']))
                                         for pattern in self.rules.get('destructivePatterns', ()))
        completion = name in self.rules.get('completionTools', ('create_pr', 'complete_task'))
        missing = self.verification.missing(session) if completion else []
        gated = forbidden or permission != 'read' and name not in self.rules.get('allowWrites', ())
        decision = 'deny' if forbidden or missing else 'allow'
        if gated and not forbidden and not missing:
            with self.store.lock:
                approved = self.store.db.execute('DELETE FROM extension_approvals WHERE session=? AND signature=?',
                                                  (session, signature)).rowcount == 1
            allowlisted = name in self.rules.get('approvalAllowlist', ())
            approved = approved or (self.headless_policy == 'allow_allowlisted' and allowlisted)
            if self.interactive and not approved and callable(self.approve):
                approved = self.approve(dict(sessionId=session, action=redact(action, self.secrets))) is True
            decision = 'allow' if approved else 'approval_required'
        self.audit('policy.decision', dict(sessionId=session, tool=name, decision=decision,
                                           actionSignature=signature, missing=missing))
        if decision == 'approval_required':
            self.escalate(session, 'approval_required', actionSignature=signature,
                          tool=name, arguments=redact(action['args'], self.secrets))
        return decision == 'allow'

    def complete(self, response, state):
        missing = self.verification.missing(state['id'])
        decision = not missing and not self.pending(state['id'])
        self.audit('policy.completion', dict(sessionId=state['id'], allowed=decision, missing=missing))
        if missing:
            self.escalate(state['id'], 'verification_required', missing=missing)
        return decision

    def wrap_tool(self, tool):
        handler = tool['execute']
        def execute(args, context):
            try:
                value = handler(args, context)
                # Redact BEFORE the host persists or emits the result to its model.
                with self.store.lock:
                    signature = self.signature(dict(tool=tool['name'], args=args))
                    self.store.db.execute('DELETE FROM extension_failures WHERE session=? AND signature=?',
                                          (context['sessionId'], signature))
                return redact(value, self.secrets)
            except Exception as error:
                message = redact(str(error), self.secrets)
                self.on_error(context['sessionId'], tool['name'], message, arguments=args)
                raise RuntimeError(message) from None
        return {**tool, 'execute': execute}

    def on_error(self, session, tool, message, *, arguments=None):
        signature = self.signature(dict(tool=tool, args=arguments) if arguments is not None else
                                   dict(tool=tool, error=message))
        with self.store.lock:
            self.store.db.execute('INSERT INTO extension_failures VALUES(?,?,1) ON CONFLICT(session,signature) '
                                  'DO UPDATE SET count=count+1', (session, signature))
            count = self.store.db.execute('SELECT count FROM extension_failures WHERE session=? AND signature=?',
                                          (session, signature)).fetchone()[0]
        self.audit('policy.error', dict(sessionId=session, tool=tool, error=message, retries=count))
        if count >= self.retry_threshold:
            self.escalate(session, 'retry_threshold', tool=tool, retries=count, signature=signature)

    def model(self, model):
        def callback(request):
            pending = self.pending(request['sessionId'])
            if pending:
                return dict(sessionId=request['sessionId'], step=request['step'], status='ask', action=None,
                            plan='Pause for operator help', question=json.dumps(pending))
            try:
                return model(request)
            except Exception as error:
                self.on_error(request['sessionId'], 'model', redact(str(error), self.secrets))
                raise
        return callback

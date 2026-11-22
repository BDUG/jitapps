"""Bounded model callbacks with persistent per-job reservations, not a new loop."""
from dataclasses import dataclass
import json
import math


@dataclass(frozen=True)
class Tier:
    model: object
    max_output_tokens: int
    input_micro_usd_per_token: int = 0
    output_micro_usd_per_token: int = 0


class Routing:
    def __init__(self, store, *, tiers, token_cap, cost_cap_micro_usd, audit,
                 warning_ratio=.8, classify=None, tokenizer=None):
        if not tiers or any(not isinstance(t, Tier) or not callable(t.model) or
                            type(t.max_output_tokens) is not int or t.max_output_tokens < 1 or
                            any(type(price) is not int or price < 0 for price in
                                (t.input_micro_usd_per_token, t.output_micro_usd_per_token))
                            for t in tiers.values()):
            raise ValueError('Bounded model tiers are required')
        if (type(token_cap) is not int or type(cost_cap_micro_usd) is not int or
                token_cap < 1 or cost_cap_micro_usd < 0 or not 0 < warning_ratio < 1):
            raise ValueError('Invalid cost/token ceiling')
        self.store, self.tiers, self.audit = store, tiers, audit
        self.token_cap, self.cost_cap = token_cap, cost_cap_micro_usd
        self.warning_ratio, self.classify = warning_ratio, classify or self._classify
        self.tokenizer = tokenizer or (lambda text: len(text.encode('utf-8')))
        with store.lock:
            store.db.execute('CREATE TABLE IF NOT EXISTS extension_usage(session TEXT PRIMARY KEY, tokens INTEGER, cost INTEGER)')

    @staticmethod
    def _classify(request):
        # Routine routing requires explicit host task metadata, not arbitrary model text.
        metadata = request.get('taskMetadata', {})
        for context in request.get('context', []):
            if isinstance(context, dict) and isinstance(context.get('taskMetadata'), dict):
                metadata = context['taskMetadata']
                break
        return 'fast' if metadata.get('routine') is True else 'reasoning'

    def job(self, session):
        seen = set()
        with self.store.lock:
            while session not in seen:
                seen.add(session)
                row = self.store.db.execute('SELECT parent FROM extension_lineage WHERE child=?', (session,)).fetchone()
                if not row:
                    return session
                session = row[0]
        raise ValueError('Invalid checkpoint lineage')

    def usage(self, session):
        session = self.job(session)
        with self.store.lock:
            row = self.store.db.execute('SELECT tokens,cost FROM extension_usage WHERE session=?', (session,)).fetchone()
        return dict(tokens=row[0], microUsd=row[1]) if row else dict(tokens=0, microUsd=0)

    def call(self, request):
        route = self.classify(request)
        if route not in self.tiers:
            raise ValueError('No configured model for tier: ' + route)
        tier, session = self.tiers[route], self.job(request['sessionId'])
        input_tokens = self.tokenizer(json.dumps(request, ensure_ascii=False))
        if type(input_tokens) is not int or input_tokens < 0:
            raise ValueError('Tokenizer must return a nonnegative integer')
        tokens = input_tokens + tier.max_output_tokens
        cost = input_tokens * tier.input_micro_usd_per_token + tier.max_output_tokens * tier.output_micro_usd_per_token
        with self.store.lock:
            self.store.db.execute('BEGIN IMMEDIATE')
            try:
                row = self.store.db.execute('SELECT tokens,cost FROM extension_usage WHERE session=?', (session,)).fetchone() or (0, 0)
                allowed = row[0] + tokens <= self.token_cap and row[1] + cost <= self.cost_cap
                if allowed:
                    self.store.db.execute('INSERT OR REPLACE INTO extension_usage VALUES(?,?,?)',
                                          (session, row[0] + tokens, row[1] + cost))
                self.store.db.execute('COMMIT')
            except BaseException:
                self.store.db.execute('ROLLBACK')
                raise
        self.audit('routing.reservation', dict(sessionId=request['sessionId'], jobId=session, tier=route, tokens=tokens,
                                                costMicroUsd=cost, allowed=allowed))
        if not allowed:
            return dict(sessionId=session, step=request['step'], status='ask', action=None,
                        plan='Pause before exceeding the job budget',
                        question='ask-for-help: token or monetary budget exhausted; increase the approved ceiling to continue.')
        usage = self.usage(session)
        if usage['tokens'] >= self.token_cap * self.warning_ratio or self.cost_cap and usage['microUsd'] >= self.cost_cap * self.warning_ratio:
            self.audit('budget.warning', dict(sessionId=request['sessionId'], jobId=session, **usage))
        # Host callback owns provider streaming/auth and must bind the declared
        # output ceiling to its provider request. Do not buffer/reimplement it here.
        return tier.model(request)

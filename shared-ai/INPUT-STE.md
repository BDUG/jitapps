# Optional ASD-STE100-style input conversion

Enable **Convert input to ASD-STE100 style** beside the chat input or below the coding-agent goal. Chat and coding-agent preferences are independent and saved per app in this browser. The option is off by default.

The configured relay/provider makes an additional request to rewrite the submitted text into clear, controlled technical English. The prompt requests short sentences, active voice, imperative instructions, consistent terminology, and preservation of meaning, conditions, negation and scope. Non-English prose can be translated into English. This is AI-assisted **ASD-STE100-style writing**, not certified compliance with the complete standard or its approved vocabulary.

Code blocks, inline code, quoted text, paths, URLs, recognizable technical identifiers, switches and numeric values are masked before the rewrite. The converter checks that every protected token occurs exactly once, in order, before restoring the original bytes. An invalid response receives one repair attempt. Provider failures, invalid conversions and cancellation stop submission; the main request is not sent. The original draft remains available.

The original input remains authoritative. Chat requests carry both strings in `inputConversion`, and use the converted string as their task. The coding agent retains the original goal and records each converted input as a user follow-up with the original/rewrite metadata. These events survive history compression and session reload, and are included in downloaded run logs. A system instruction tells the main model to preserve the original constraints and ask about ambiguity. Native validation, proposal review and runtime permissions still apply.

Open **Latest input conversion** beside the option to inspect the original and the rewrite. Chat request downloads also include both. App content, attachments, code, schemas, earlier conversation messages and model outputs are not translated. Only newly submitted user text is converted, including queued chat answers and agent resume/live follow-ups. Conversion runs once for each submitted input, not once per planning step; it does not consume the coding-agent step budget. Resuming without new instructions does not invoke conversion.

Conversion uses the same relay URL, active provider, cancellation signal and shared request/result paging as chat. It sends only masked input plus rewrite instructions, not the app document, attachments or conversation. It requires no extra service or provider configuration. One conversion normally adds one provider call; a format repair adds a second call. Paging can add its own provider calls. The document and selection are captured when Send is clicked, before conversion starts.

Verification:

- `node shared-ai/input-ste-test.cjs`
- `BASE_URL=http://127.0.0.1:8031 node shared-ai/input-ste-browser-test.cjs`
- `node shared-agent/input-ste-browser-test.cjs`

The browser checks mock model responses and use real local agent sessions. They do not certify language-standard compliance or test a paid provider.

# PC sharing and colabriX collaboration

The suite uses [magic-wormhole](https://magic-wormhole.readthedocs.io/en/latest/) to pair two PCs with a single-use code and establish an encrypted, bidirectional dilated stream. Both PCs run their own suite Python server. No Google account, OAuth client or cloud document is involved. This application uses its own protocol/application ID; pair two suite instances, rather than the stock `wormhole send` command.

## Install on both PCs

Use Python 3.10 or newer. From the repository root:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r server/requirements-wormhole.txt
.venv/bin/python server/server.py
```

On Windows use `.venv\Scripts\python.exe`. The pinned requirement includes the `dilate` extra for Noise-encrypted bulk transport. Other suite features can still run without this optional dependency; sharing displays installation instructions when it is unavailable. Restart the server after installing it. Browser UI actions require the server's own localhost origin.

Default networking uses the upstream mailbox relay `relay.magic-wormhole.io:4000` and transit fallback `transit.magic-wormhole.io:4001`, plus direct TCP connections where possible. Both PCs must be online for pairing/delivery. The mailbox exchanges encrypted setup messages; file/change payloads use dilation, not an unbounded mailbox message stream. Firewalls must permit these connections. Deployment administrators may set `SUITE_WORMHOLE_RELAY_URL` and `SUITE_WORMHOLE_TRANSIT_RELAY` before starting the server to use their own compatible relays. Browser clients cannot change relay destinations.

## Files in either direction

1. Choose **Share between PCs** from the suite toolbar.
2. On one PC choose **Create code**. On the other enter that code and choose **Join**. Share the code privately with the intended person.
3. Once connected, either PC may select files. Each file appears in its durable **Out queue**. **Delivered** means the receiving server has committed the item to its private **In queue** and acknowledged it.
4. Choose **Save file** on the receiving PC. Nothing is executed or opened automatically. Downloads retain the inbox copy. Use **Remove from inbox** only after saving what you need.

Files are limited to **8 MiB each**, with **64 MiB / 256 unprocessed items per pairing**. Names cannot contain directories or control characters. SHA-256 checks accompany payloads. Pairing history allows reopening old inboxes. Reconnect a saved pairing with a new code to retry unacknowledged outgoing items. A disconnect, process exit or server restart does not delete the queues. Local storage under `.suite-wormhole/queues.sqlite3` beside the private provider configuration contains the transferred data; it is excluded from HTTP file serving and agent workspace scans. Treat that local directory as private and back it up if its contents matter.

## colabriX: master-led joint editing

**Work together** is colabriX's collaboration workflow. A normal local board stays local until pairing is explicitly started.

- **Master · share this document** creates the code and owns the authoritative board and revision sequence.
- **Participant · join the master** enters the code. Joining explicitly asks before replacing the participant's current board with the first validated master snapshot; export a backup first.
- Participant changes are debounced into field-register proposals in its outqueue. The master merges valid proposals with its current board, increments its revision and queues a snapshot back. The participant receives the snapshot while retaining local edits still in flight.
- The existing Lamport field registers, deletion tombstones and actor tie-breaks handle concurrent edits. The master is the sole publisher of numbered snapshots. Only matching board IDs and valid proposal/snapshot roles are accepted. A malformed incoming change is retained and reported instead of silently applied or discarded.
- **In queue** distinguishes received changes from **processed** changes; an outqueue delivery acknowledgement alone is not confirmation of a master commit. The numbered returned snapshot carries the authoritative result.

Use one colabriX tab per local pairing. This version supports **one master and one participant per document**, not a multi-peer room. Keep the master browser open for proposals to be merged. Shared board envelopes retain the existing 900,000-character limit; reduce large embedded images or share a file if a board exceeds it. Changes remain in local drafts and durable queues while disconnected. Browser drafts are committed before outgoing changes are queued or incoming changes are marked processed; a failed local save leaves the incoming queue item available for retry. **Create / reconnect** generates a fresh code for the same pairing; enter it again on the participant. Do not change boards while a pairing is active; disconnect and create a new pairing for a different board. Existing local drafts, JSON recovery files and project ZIPs remain usable.

## Validation

Standard backend queue tests: `python3 -m unittest server.wormhole_share_test`. They cover durable storage, receipts, idempotence, handshake roles, checksums, path rejection, quota atomicity and local-origin/private-file protection.

For real encrypted integration testing, install the optional development relay package in a test environment and start an isolated mailbox:

```sh
python -m pip install magic-wormhole-mailbox-server==0.7.0
mkdir -p /tmp/tlal-wormhole-test
# Keep this running in a separate terminal.
twist --log-level=warn wormhole-mailbox \
  --port tcp:8040:interface=127.0.0.1 \
  --channel-db /tmp/tlal-wormhole-test/relay.sqlite
```

Run `python scripts/verify-wormhole.py --relay ws://127.0.0.1:8040/v1 --transit tcp:127.0.0.1:8041`. It uses the real library and direct local encrypted channels to check transfers in both directions and queue recovery after a sender restart. No transit relay is needed for this direct-local test.

For browser tests, start two server instances on ports 8032/8033 with separate `--config` directories and the same local relay environment variables. Run `node colabriX/wormhole-browser-test.cjs` and `node shared-suite/wormhole-browser-test.cjs`. Override addresses with `BASE_URL_A` and `BASE_URL_B`. These tests exercise actual encryption and backend processes, master/participant changes, offline queues/reconnect, downloads and explicit inbox removal. Successful local tests do not establish connectivity across a public network or NAT.

# LING2150 5C Worker — deployment draft

This service rewrites only the selected Human turn with preceding context. It does not answer a question or send the student's rewrite/reflections to AI. The frontend is `docs/week_5/5C_explicit_query_rewriting.html`, using the existing course `docs/style.css`.

## Current status

Local unit/integration tests and Wrangler dry-run pass. Cloudflare was not logged in, so this is **not deployed or validated with real inference**. No claim of classroom throughput or guaranteed free capacity is made. The production frontend intentionally has an empty endpoint and displays an unavailable message; QA fixtures are outside this repository.

## Deploy after account access is available

1. Use a Cloudflare account on the Free plan. Do not enable paid usage to make a test succeed. Install dependencies with pnpm and run `pnpm test`.
2. Authenticate Wrangler using `pnpm exec wrangler login`; choose the authorized account. Confirm Workers AI and SQLite Durable Objects are available on that account's Free plan.
3. Run `pnpm exec wrangler secret put SESSION_SECRET` and enter a securely generated random secret (at least 32 bytes). Never put it in frontend files or Git.
4. Deploy with `ENABLED` still `false`: `pnpm exec wrangler deploy`. Check the reported URL and account, then change `ENABLED` to `true` and redeploy for controlled testing.
5. Run `MODEL_API=https://YOUR-WORKER.workers.dev node scripts/live-check.mjs 1`, then `6` for all six quality cases. Inspect the output, not just HTTP status. Check preservation of referents, ambiguity, negation, intent, and standalone utterances. Test additional long and adversarial examples manually. This is Llama with a rewrite prompt, not Paula's Granite aLoRA adapter.
6. Inspect actual Workers AI usage before increasing traffic. The configured 360 requests/day is an application ceiling, **not** a calculation that 360 calls fit the free neuron allocation. Failed model calls also consume this ceiling. Other apps may share the account's AI quota.
7. Run the live probe with the intended class size (up to 60). This deliberately uses separate sessions from one machine/IP. Then run a rehearsal with actual student laptops and campus Wi-Fi. Record success rate and p95 latency. Suggested release target: no failures, p95 under 5 seconds; this is a target, not a measured result. If free capacity cannot meet it, do not describe this configuration as classroom-ready.
8. Set `docs/week_5/5c/config.js` `apiBase` to the verified HTTPS Worker URL. `ALLOWED_ORIGINS` must include exactly `https://uga-ling2150.github.io`. Repeat browser interaction and paid axe Pro scans after deployment. Add the verified applet link to the course index, then publish the frontend to the course's normal GitHub Pages branch.

## Operational limits

Students receive an automatic signed session without accounts or API keys. CORS restricts browser origins but is not authentication against arbitrary HTTP clients. Sessions can be renewed; the global Durable Object budget is the actual shared application ceiling. No per-IP blocking is used, to avoid penalizing a classroom sharing one Wi-Fi egress. Caps: 24 calls/session, 360/day UTC, 240/minute, 60 in flight. These are configurable operational defaults, not measured service limits. A single global coordinator stores counters and active leases, not conversation text.

Frontend requests time out at 30 seconds, backend at 25 seconds. Timeouts cannot guarantee cancellation of Cloudflare inference. No automatic retry storm; work remains in the browser tab. Set `ENABLED` to `false` and redeploy to pause service. Disable inference rather than upgrade billing if free quota is insufficient. Inspect AI usage in the dashboard during rehearsal and class.

## Testing

`pnpm test`: mocked AI and storage exercise validation, session signatures, caps, concurrency admission and error handling. The 60-session test verifies our admission logic only; it is not an AI throughput test. `pnpm exec wrangler deploy --dry-run` checks bundling/bindings only. `scripts/live-check.mjs` uses a real deployed service and saves real outputs/latencies in `live-results.json` (gitignored).

# LING2150 5C Worker — deployment and operations

This service rewrites only the selected Human turn with preceding context. It does not answer a question or send the student's rewrite/reflections to AI. The frontend is `docs/week_5/5C_explicit_query_rewriting.html`, using the existing course `docs/style.css`.

## Current status (2026-09-11)

Deployed on the user's verified Cloudflare **Free** plan at https://ling2150-query-rewrite.ling2150-query-rewrite.workers.dev. The frontend is configured to use this endpoint. OAuth authorization was explicitly approved by the user; the session signing secret is stored in Cloudflare, never in Git or the frontend.

Eleven local tests pass. Real endpoint tests: 60 unique conversations / 60 separate sessions succeeded, p95 693 ms, maximum 742 ms (measured from one test computer; excludes initial session creation). This is not a campus Wi-Fi classroom rehearsal or a performance guarantee. Eight additional content probes succeeded after separating the target Human turn from history; some rewrites still omit context or leave ambiguity implicit. Students must evaluate model output rather than treat it as an answer key.

Paid axe DevTools Pro scans cover the initial page and real comparison results, including expanded Background; advanced rules and Best Practices are enabled. Keyboard checks cover skip-link focus, required-answer errors, model reveal, and reflection progression. Automated scans are not full WCAG certification.

## Redeploy or install on another account

1. Use a Cloudflare account on the Free plan. Do not enable paid usage to make a test succeed. Install dependencies with pnpm and run `pnpm test`.
2. Authenticate Wrangler using `pnpm exec wrangler login`; choose the authorized account. Confirm Workers AI and SQLite Durable Objects are available on that account's Free plan.
3. Run `pnpm exec wrangler secret put SESSION_SECRET` and enter a securely generated random secret (at least 32 bytes). Never put it in frontend files or Git.
4. For a new account, set `ENABLED` to `false` and deploy: `pnpm exec wrangler deploy`. Check the reported URL and account, then set `ENABLED` to `true` and redeploy for controlled testing.
5. Run `MODEL_API=https://YOUR-WORKER.workers.dev node scripts/live-check.mjs 1`, then `6` for all six quality cases. Inspect the output, not just HTTP status. Check preservation of referents, ambiguity, negation, intent, and standalone utterances. Test additional long and adversarial examples manually. This is Llama with a rewrite prompt, not Paula's Granite aLoRA adapter.
6. Inspect actual Workers AI usage before increasing traffic. The configured 360 requests/day is an application ceiling, **not** a calculation that 360 calls fit the free neuron allocation. Failed model calls also consume this ceiling. Other apps may share the account's AI quota.
7. Run the live probe with the intended class size (up to 60). This deliberately uses separate sessions from one machine/IP. Then run a rehearsal with actual student laptops and campus Wi-Fi. Record success rate and p95 latency. Suggested release target: no failures, p95 under 5 seconds; this is a target, not a measured result. If free capacity cannot meet it, do not describe this configuration as classroom-ready.
8. Set `docs/week_5/5c/config.js` `apiBase` to the verified HTTPS Worker URL. `ALLOWED_ORIGINS` must include exactly `https://uga-ling2150.github.io`. Repeat browser interaction and paid axe Pro scans after deployment. Add the verified applet link to the course index, then publish the frontend to the course's normal GitHub Pages branch.

## Operational limits

Students receive an automatic signed session without accounts or API keys. CORS restricts browser origins but is not authentication against arbitrary HTTP clients. Sessions can be renewed; the global Durable Object budget is the actual shared application ceiling. No per-IP blocking is used, to avoid penalizing a classroom sharing one Wi-Fi egress. Caps: 24 calls/session, 360/day UTC, 240/minute, 60 in flight. These are configurable operational defaults, not measured service limits. A single global coordinator stores counters and active leases, not conversation text.

Frontend requests time out at 30 seconds, backend at 25 seconds. Timeouts cannot guarantee cancellation of Cloudflare inference. No automatic retry storm; work remains in the browser tab. Set `ENABLED` to `false` and redeploy to pause service. Disable inference rather than upgrade billing if free quota is insufficient. Inspect AI usage in the dashboard during rehearsal and class.

## Testing

`pnpm test`: mocked AI and storage exercise validation, session signatures, caps, concurrency admission and error handling. The 60-session test verifies our admission logic only; it is not an AI throughput test. `pnpm exec wrangler deploy --dry-run` checks bundling/bindings only. `scripts/live-check.mjs` uses a real deployed service and saves real outputs/latencies in `live-results.json` (gitignored).

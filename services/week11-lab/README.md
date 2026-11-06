# Week 11 model service

Shared, API-only Cloudflare Worker for Activity 11A (editable system prompts), 11B (temperature, top-k and top-p) and 12A (editable system personas, sent in `persona` mode like 11A's system prompts, and user personas, sent as part of the prompt). Static course pages remain in `docs/week_11/`. The worker forwards only the bounded prompt, optional system prompt and sampling parameters; annotations and reflection notes are never included in the API payload.

The earlier 2026-10-17 permission for possible costs is superseded by the owner’s 2026-11-06 requirement: all model use must incur zero charges. On 2026-11-06 the dashboard showed Workers Free ($0, Current plan), and this Worker uses a direct Workers AI binding with no Gateway options in its inference call. The owner accepted quota-limited usage with a daily stop. This local migration selects IBM Granite 4.0 H Micro within the Free allocation; the shared Worker was subsequently deployed and verified on November 6, 2026. See the [zero-cost requirement and migration checklist](../../CLOUDFLARE_HANDOVER.md#zero-cost-requirement-and-model-retirement-2026-11-06). Do not select a billable replacement or deploy on the basis of the earlier cost permission. The service is deployed at https://ling2150-week11-lab.ling2150-query-rewrite.workers.dev. Four initial real-model checks succeeded (two personas and two sampling conditions). Browser-local simulation and authored practice examples remain available without the service. The frontend uses this endpoint by default; instructor settings can override it.

## Validation

Run `npm test` in this directory. The suite covers probability transformations, exact quote offsets, input validation, session enforcement, parameter forwarding, quota enforcement and capacity release after provider failure. The request-admission and session code reuse the existing 7B architecture in a separate worker and Durable Object namespace.

Local migration validation (2026-11-06): all 9 service tests and 7 browser sampling tests passed using Node. Model configuration and fallback agree; relative documentation links and `git diff --check` passed. The full repository/service test command subsequently passed 51 tests. Wrangler dry run and deployment passed using existing credentials and bindings; version `d9461a1e-b7d1-49c3-85be-2f27e606927d` reports Granite. Five short live requests succeeded for tutor/critic personas, top-k 1/50 and system/user personas, with model/settings metadata checked. This confirms working requests, not internal sampling implementation or validated persona effects. Both GitHub accessibility workflows passed after updating Playwright to 1.64.1 for Ubuntu 26.04.

## Free-plan operation

Keep Workers Free: 10,000 Neurons per account per day, resetting at 00:00 UTC; requests fail when exhausted. This is quota-limited free use, not an unlimited free model. Do not add paid Gateway credits or upgrade the account. Other applets share the allowance. Recheck the plan and binding before deployment. Granite documents `top_k` 1–50, `temperature` and `top_p`; the existing Worker forwards these unchanged. Offline tests verify forwarding only; live model behavior and persona quality still need an authorized classroom smoke test.

## Deployment after approval

1. Install the locked dependencies with pnpm.
2. Run `wrangler deploy --dry-run` and inspect bindings.
3. With the account owner's approval, deploy using `wrangler deploy`.
4. Create a fresh random session secret through `wrangler secret put SESSION_SECRET` using stdin. Never commit it or copy it into a page.
5. Verify `/api/health`, then make bounded test calls for both modes.
6. Set the deployed origin as the default endpoint in `docs/week_11/11a/live.js` (`DEFAULT`) so students need not configure it. Instructor connection settings can override it for testing.
7. Repeat browser checks using the real service, then publish the static pages through the normal course review process.

Defaults: no app-level daily or per-session cumulative request cap (DAILY_REQUEST_LIMIT=0 and SESSION_REQUEST_LIMIT=0). The account owner requested removing those extra limits on 2026-10-17. Transient capacity protection remains: 120 requests per minute, 30 concurrent requests and 1,024 maximum output tokens per request. Positive daily/session values can optionally re-enable a cap. The health endpoint reports effective limits; zero means unlimited for daily/session only. A comparison in 11A uses two requests. Quotas bound requests, not currency or provider neuron consumption; they are not a monetary spending cap. Existing provider quotas and account billing still apply. Set `ENABLED=false` to pause inference. No billing configuration is changed by this code.

The default model is `@cf/ibm-granite/granite-4.0-h-micro`. Its current availability and parameter support must be verified during deployment. The [official model schema](https://developers.cloudflare.com/workers-ai/models/granite-4.0-h-micro/) documents temperature, top-k and top-p. Top-q is supported as nucleus cumulative mass, following [NAACL 2025 Appendix F](https://aclanthology.org/2025.naacl-long.469/). Repository review found no earlier course-specific top-q implementation. This is an explicit implementation choice for instructor review, not a claim about the author’s intended notation. Choose either top-p or top-q; sending both is rejected. The provider receives top_p, and response metadata records the requested notation.

## Classroom content decisions

The two 11A starter personas and authored examples are discussion material, not asserted identities or validated effects. Students should support interpretations with language evidence and repeat conditions. The 11B toy model documents its own transformation order; hosted inference may differ. All displayed outputs record their actual source and request settings.

The output budget was raised from 200 to 1,024 tokens at the owner’s request on 2026-10-17. The fixed 100-word system instruction was removed; the prompt controls length with concise replies as the default. The response validation ceiling is 12,000 characters to accommodate longer bounded output.

Long-output timing: inference waits up to 90 seconds, browser requests up to 105 seconds, and capacity leases expire after 120 seconds. These replace the short 25/30/35-second timings used for 200-token replies.

## Maintainer handoff

Account migration, connection checks and troubleshooting are maintained in the shared [Cloudflare guide for LING2150](../../CLOUDFLARE_HANDOVER.md), including the shared 11A/11B service.

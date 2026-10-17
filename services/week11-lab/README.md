# Week 11 model service

Shared, API-only Cloudflare Worker for Activity 11A (editable system prompts) and 11B (temperature, top-k and top-p). Static course pages remain in `docs/week_11/`. The worker forwards only the bounded prompt, optional system prompt and sampling parameters; annotations and reflection notes are never included in the API payload.

The account owner explicitly approved cloud resource use and possible costs on 2026-10-17. The service is deployed at https://ling2150-week11-lab.ling2150-query-rewrite.workers.dev. Four initial real-model checks succeeded (two personas and two sampling conditions). Browser-local simulation and authored practice examples remain available without the service. The frontend uses this endpoint by default; instructor settings can override it.

## Validation

Run `npm test` in this directory. The suite covers probability transformations, exact quote offsets, input validation, session enforcement, parameter forwarding, quota enforcement and capacity release after provider failure. The request-admission and session code reuse the existing 7B architecture in a separate worker and Durable Object namespace.

## Deployment after approval

1. Install the locked dependencies with pnpm.
2. Run `wrangler deploy --dry-run` and inspect bindings.
3. With the account owner's approval, deploy using `wrangler deploy`.
4. Create a fresh random session secret through `wrangler secret put SESSION_SECRET` using stdin. Never commit it or copy it into a page.
5. Verify `/api/health`, then make bounded test calls for both modes.
6. Set the deployed origin as the default endpoint in `docs/week_11/common.mjs` so students need not configure it. Instructor connection settings can override it for testing.
7. Repeat browser checks using the real service, then publish the static pages through the normal course review process.

Defaults: no app-level daily or per-session cumulative request cap (DAILY_REQUEST_LIMIT=0 and SESSION_REQUEST_LIMIT=0). The account owner requested removing those extra limits on 2026-10-17. Transient capacity protection remains: 120 requests per minute, 30 concurrent requests and 200 maximum output tokens per request. Positive daily/session values can optionally re-enable a cap. The health endpoint reports effective limits; zero means unlimited for daily/session only. A comparison in 11A uses two requests. Quotas bound requests, not currency or provider neuron consumption; they are not a monetary spending cap. Existing provider quotas and account billing still apply. Set `ENABLED=false` to pause inference. No billing configuration is changed by this code.

The default model is `@cf/meta/llama-3.1-8b-instruct-fp8`. Its current availability and parameter support must be verified during deployment. The [official model schema](https://developers.cloudflare.com/workers-ai/models/llama-3.1-8b-instruct-fp8/) documents temperature, top-k and top-p. Top-q is supported as nucleus cumulative mass, following [NAACL 2025 Appendix F](https://aclanthology.org/2025.naacl-long.469/). Repository review found no earlier course-specific top-q implementation. This is an explicit implementation choice for instructor review, not a claim about the author’s intended notation. Choose either top-p or top-q; sending both is rejected. The provider receives top_p, and response metadata records the requested notation.

## Classroom content decisions

The two 11A starter personas and authored examples are discussion material, not asserted identities or validated effects. Students should support interpretations with language evidence and repeat conditions. The 11B toy model documents its own transformation order; hosted inference may differ. All displayed outputs record their actual source and request settings.

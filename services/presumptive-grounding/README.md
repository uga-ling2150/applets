# Activity 7B model service

The course page is `docs/week_7/7B_presumptive_grounding.html`. Its CSS and JavaScript are in `docs/week_7/7b/`. GitHub Pages serves the frontend; the independent Cloudflare Worker performs inference. Both strategies use the same model with different instructions.

Run `npm test` and `npm run build` in this directory. The build produces a standalone `public/index.html` from the course sources, also used by the Worker mirror. Run `npx wrangler deploy` to update the already configured service. GitHub Pages publishes through the course's existing main/docs configuration; it does not redeploy this Worker.

For a new Cloudflare account, authorize Wrangler and set `SESSION_SECRET` with `wrangler secret put SESSION_SECRET` (random, at least 32 bytes). Never commit secrets. Update the public API URL in `docs/week_7/7b/applet.js` after deployment. The current endpoint is https://ling2150-7b-grounding.ling2150-query-rewrite.workers.dev.

The free account has provider quotas shared with other activities. The 1,200 daily application request ceiling is not a guarantee that all calls fit the provider allowance. Do not enable billing automatically. Set `ENABLED=false` to pause inference; offline discussion remains available. The service stores counters and temporary request leases, not transcripts. Public sessions and global limits bound usage; CORS supports GitHub Pages and downloaded HTML. Students' private notes and reflections are not sent to the model.

Verification: nine unit tests; 60 sessions, 360 live requests across three rounds, all successful, maximum 1.538 s from one test computer. Campus-network performance remains unverified. Prompted strategies are tendencies, including possible unnecessary clarification. Initial-state axe Pro found zero automatic issues after fixes; expanded-state results were not verified.

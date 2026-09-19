# Activity 7A: Backchannel Locations

Static course page: `docs/week_7/7A_backchannel_locations.html`; assets under `docs/week_7/7a/`. No backend, accounts or model downloads. Browser localStorage is best-effort; JSON export/import supports merging up to 60 participants for the exact clip version. No transcript or participant data is transmitted by the activity.

Run `node --test services/backchannel-locations/tests/core.test.cjs` from the repository root. Build a standalone HTML with embedded audio/CSS/JS using `python3 services/backchannel-locations/scripts/build.py <output.html>`. Bootstrap for that build is vendored under `services/presumptive-grounding/vendor/`.

Recordings are continuous AMI headset excerpts under CC BY 4.0; see `docs/week_7/7a/ATTRIBUTION.txt`. Timed transcripts and signal checks are complete, but human listening confirmation of sound quality and microphone bleed is still outstanding. Do not represent the recordings as validated experimental stimuli. Marker times include listener and device latency. The 15-second practice reuses the opening of the selected clip and therefore gives prior exposure to that opening.

JSON imports are bounded and validated before replacing existing results. Duplicate IDs are skipped; conflicting IDs reject the import. Zero-marker completed rounds remain in the denominator. The cluster table counts each participant at most once per one-second interval. No scoring or ground-truth backchannel labels are supplied.

Verification (2026-09-19): six validation/aggregation tests passed. Real Chrome playback confirmed keyboard marking, pause protection, practice exclusion, reload/resume, a completed marked round and a completed zero-marker round, correct comparison denominator, clip isolation, JSON download with reflection, and duplicate import rejection. A 320 px viewport had no horizontal overflow. Signed-in axe DevTools Pro 4.136.1 / axe-core 4.13.0, WCAG 2.1 AA and best practices enabled, reported zero automatic issues in the playback and expanded comparison/transcript states. This does not constitute full manual accessibility certification. Direct file:// execution and real classroom use have not been verified.

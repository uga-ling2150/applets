# Activity 12A: AI Sycophancy

Published page: https://uga-ling2150.github.io/applets/week_12/12A_ai_sycophancy.html

Students predict face-preserving language, inspect lexical clues, explain a phrase in context, and compare a rewrite. Three authored examples include both questionable agreement and appropriate emotional support. Students may edit the context and response, disagree with the clues, and export their observations. Work stays in the page; reflection notes use the shared separate download.

## Evidence and data

Concepts follow the ELEPHANT paper linked in the task. The supplied `kayaulai/syco-feats` CSV exports are pinned to revision `a0c5697ccba084ef4cceb6485d150b0023d26acd` in `weights.json`, with per-file SHA-256 hashes. Each of four lists has 1,004 rows: 969 lexical coefficients, four categorical predictors, and 31 punctuation/whitespace rows. All lexical signs, values and zeros are retained. The 35 non-text rows are audited separately and never treated as words.

The training code in `nb/6_svd_gram_presence.qmd` defines the model exported as `6c_lasso_any.csv` using `framing & validation & indirectness`. Accordingly the student label is **All three (combined)**: AND, not OR. It is an independently trained model, not an average of the three models. Ryan can review this interpretation against the original source code.

These are count-model coefficients, not TF-IDF coefficients. No IDF scaling, intercept, probability, scoring threshold, or moral-judgment model is invented. The shared highlighter uses simplified case/accent/punctuation normalization with `lemmatize: false`, which does not reproduce spaCy tokenization exactly, especially for contractions. These implementation details are documented here; the page keeps only a short guide to reading highlights. Highlight density and counts are not measures of response quality.

Rebuild from the four original CSV files:

```sh
python3 utils/build_sycophancy_weights.py --source-dir /path/to/3_6_analyses
node --test tests/12a-highlighter.test.mjs
```

The page follows root `conventions.md` and `docs/helpers/conventions.md`, using the shared `docs/highlighter.js`, `.hl-*` styles, stage rack, feedback card and reflection component. The helper demo now resolves its documented shared script path. Other applets' page-specific logic and styles are unchanged.

## Review against recurring meeting feedback (26 October 2026)

The development-related sections of the twelve meeting-note documents dated 12 August–21 October were reviewed. The August 26 original and August 28 update are two versions of the same meeting. Activity-specific requests for other applets are not automatically requirements for 12A.

| Recurring guidance | Application to 12A |
| --- | --- |
| August 12 / September 16: guide students to reasoning; do not reveal an answer first | Predict before revealing; accept disagreement with the lexical clues; no correctness score. |
| September 2 / October 21: explain enough for a first-time user, while reducing unnecessary scrolling | Retain visible definitions, add one sentence explaining why prediction comes first, shorten repeated colour instructions. |
| September 9 / September 30: require real exchange rather than splitting the work | One partner predicts, the other questions the contextual interpretation; swap roles for another example. |
| October 7: connect a specific language form to the interpretation | Observations quote a phrase and explain its function; students can cite unhighlighted language too. |
| October 21: put related annotations next to the source and constrain long content | Adapt that layout advice to 12A: saved observations sit directly below the original response, above the compact entry form, in a bounded scroll area. |
| September 2 / October 21: make comparisons easy to inspect | Original and rewritten responses appear together using the same selected model and colour scale; narrow screens stack them. |
| August 26 onward: test controls and dynamic accessibility, not just appearance | Validate empty/invalid fields in place, announce errors and focus the field; retain real button handlers, shared styling, notes and feedback. |
| September 23 onward: reuse conventions and keep maintenance practical | Page-local changes only; source coefficients and shared matching logic are unchanged. |

The annotation-layout and comparison changes are adaptations of previous feedback, not claims that Ryan specified those exact controls for 12A. Technical model provenance remains in this README and weights.json. No server, Cloudflare service, account or paid inference is needed.


## Link and material audit (26 October 2026)

Reopened the Freedcamp task, applet planning sheet, OneDrive Week 12 deck, paper, source repository and student feedback links. The task still has the original paper link and no additional comments; the planning-sheet entry is still the face-preserving-language highlighter. Source revision remains `a0c5697ccba084ef4cceb6485d150b0023d26acd`.

The Week 12 PowerPoint contains 52 slides; its standard PDF export contains 40 non-hidden slides. The relevant visible sections discuss alignment, empathy, facework, politeness and social sycophancy. The applet now explicitly distinguishes coefficient signs from positive/negative politeness. It does not treat the supplied three dimensions as an exhaustive taxonomy.

The upstream research repository is private. The student-facing source card therefore links to the existing public course weight export at a pinned course commit, while retaining Ryan's credit. Upstream access is still required to rebuild from the original CSVs. This changes no repository permissions and publishes no additional research files.

The GitHub feedback form opens with the correct activity title and live URL prefilled; no issue was submitted. The Kaltura tutorial opens with its video player, the paper PDF is readable, and the UGA header link resolves. Course index, helper and static-asset loading are checked separately in the browser.

## Student-facing copy review (26 October 2026)

The optional guide now explains how to read highlights in four sentences. File names, source revisions, row counts, conversion details, normalization and model implementation belong in this document and the weight audit, rather than the student workflow. Repeated classifier/probability disclaimers and negative formulations were removed from introductory copy, status messages and exported work metadata. The coefficient-sign versus politeness distinction remains concise beside the legend. Shared reflection privacy/download wording and actionable input/load errors remain unchanged.

Repeated words receive repeated highlights; these occurrences are not independent evidence. This visualization uses lexical associations, rather than the paper's LLM evaluator or calibrated response-level predictions. Author-created examples are separate from the paper and benchmark. The shared matcher retains lexical coefficient signs and zeros, excludes the audited metadata/punctuation features, ignores case/accents/punctuation and does not lemmatize. The conversion adds no IDF multiplier, intercept or decision threshold. Model dimensions, coefficients, examples, matching, controls and download structure are otherwise unchanged.

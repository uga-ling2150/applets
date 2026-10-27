# Activity 12A: AI Sycophancy

Published page: https://uga-ling2150.github.io/applets/week_12/12A_ai_sycophancy.html

Students predict face-preserving language, inspect lexical clues, explain a phrase in context, and compare a rewrite. Three authored examples include both questionable agreement and appropriate emotional support. Students may edit the context and response, disagree with the clues, and export their observations. Work stays in the page; reflection notes use the shared separate download.

## Evidence and data

Concepts follow the ELEPHANT paper linked in the task. The supplied `kayaulai/syco-feats` CSV exports are pinned to revision `a0c5697ccba084ef4cceb6485d150b0023d26acd` in `weights.json`, with per-file SHA-256 hashes. Each of four lists has 1,004 rows: 969 lexical coefficients, four categorical predictors, and 31 punctuation/whitespace rows. All lexical signs, values and zeros are retained. The 35 non-text rows are audited separately and never treated as words.

The training code in `nb/6_svd_gram_presence.qmd` defines the model exported as `6c_lasso_any.csv` using `framing & validation & indirectness`. Accordingly the student label is **All three (combined)**: AND, not OR. It is an independently trained model, not an average of the three models. Ryan can review this interpretation against the original source code.

These are count-model coefficients, not TF-IDF coefficients. No IDF scaling, intercept, probability, scoring threshold, or moral-judgment model is invented. The shared highlighter uses simplified case/accent/punctuation normalization with `lemmatize: false`, which does not reproduce spaCy tokenization exactly, especially for contractions. These limitations are available in the collapsed teaching-tool explanation. Highlight density and counts are not measures of response quality.

Rebuild from the four original CSV files:

```sh
python3 utils/build_sycophancy_weights.py --source-dir /path/to/3_6_analyses
node --test tests/12a-highlighter.test.mjs
```

The page follows root `conventions.md` and `docs/helpers/conventions.md`, using the shared `docs/highlighter.js`, `.hl-*` styles, stage rack, feedback card and reflection component. The helper demo now resolves its documented shared script path. Other applets' page-specific logic and styles are unchanged.

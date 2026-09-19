# LING2150 Applets — conventions

Static HTML/CSS/JS teaching applets for a linguistics course, deployed via GitHub Pages
from `docs/`. Each week's activities live in `docs/week_N/`. Shared look-and-feel lives in
`docs/style.css`, which every applet page loads.

This file exists so a new applet page starts consistent with the rest of the site instead
of drifting. It was written after reconciling `docs/week_5/5C_explicit_query_rewriting.html`
against the established pattern (`docs/week_3/3F_rlhf_rewards.html`,
`docs/week_4/4B_chatbot_metrics.html`, `docs/week_2/3_coref.html`), and later updated after a
full-site audit found and fixed drift across every other applet page.

See `docs/template/applet_template.html` for a walkthrough build that demonstrates every rule
in this file on a fake (non-real) applet — use it as a starting point for a new page.

## Page shell

Every applet's `<head>` loads, in this order:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,400;0,700;0,800;1,400&family=Merriweather+Sans:wght@400;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
<link rel="stylesheet" href="../style.css">
<link rel="stylesheet" href="<slug>/applet.css">  <!-- only if the page needs page-specific CSS -->
```

Load Bootstrap even if a given applet doesn't use its components directly. `style.css`
assumes Bootstrap's reboot is present (heading sizes, form-control resets, etc.), and
several applets *do* use Bootstrap grid/utility classes — loading it everywhere keeps every
page's baseline typography and spacing identical. `<!DOCTYPE html>` is uppercase site-wide.

Use the exact Google Fonts URL above — copy it, don't invent your own subset. `style.css`
sets `body`/`h1`/`h2`/`h3` to `"Merriweather", "Georgia", serif` and several widget classes
(`.stage-title`, `.mic-label`, `.hero-text .eyebrow`, etc.) to `"Merriweather Sans"` or
`"IBM Plex Mono"`. A page that loads a different font family (Space Grotesk, Oswald, ...)
instead of, or in addition to, this set doesn't get a parse error — it just silently falls
back to a generic serif/sans font for text that's supposed to be in the site's brand font,
so the page's header and headings end up looking subtly different from every other applet.
This was the single most common deviation found in the first full-site audit: check any new
page's rendered header against another applet's side by side, not just its markup.

## Header

```html
<header class="page-header">
  <h1><a href="https://linguistics.uga.edu/">University of Georgia</a></h1>
  <h2><a href="../index.html">Quantitative Linguistics Webapps</a></h2>
</header>
```

Always `<h1>`/`<h2>` with real anchor tags — never `<p>`. `style.css`'s `.page-header h1`/
`.page-header h2` rules are what give the two lines their distinct size/weight/color; a page
that reinvents this in its own CSS (even to produce a similar look) will drift out of sync
with the rest of the site the next time `style.css` changes. Don't add a page-local override
here.

## Activity title vs. applet title

Every page has two distinct headings, not one:

1. **Activity title** — the formal, catalog-style name, first thing inside `.lesson-container`:
   ```html
   <section class="lesson-container" aria-labelledby="activity-title">
     <h3 id="activity-title" class="h3 mb-4">Activity 5C: Explicature and Query Rewriting</h3>
   ```
2. **Applet title** — the specific/branded name of the interactive tool itself, in a `.hero`
   block at the top of the interactive area:
   ```html
   <section class="app-wrapper" aria-labelledby="conversation-title">
     <div class="hero">
       <div class="hero-text">
         <h2 id="applet-title">Conversational <span>query rewriter</span></h2>
         <p>One-line tagline.</p>
       </div>
     </div>
   ```

`.hero`, `.hero-text h2`, `.hero-text h2 span`, and `.hero-text p` are all defined in
`style.css` — don't redefine them locally unless a page genuinely needs a different clamp()
range for its title.

Every `id="X"` an `aria-labelledby` points at must actually exist on the page. This is the
single easiest thing to break when restyling a heading (e.g. swapping a custom `id`-based
rule for a Bootstrap utility class and forgetting to keep the `id`) — after any heading
change, grep for `aria-labelledby="..."` and confirm each target `id` still exists.

### `<title>` and the hero

- The browser `<title>` is exactly the **activity title** (the `<h3 id="activity-title">` text, e.g.
  `Activity 7B: Presumptive Grounding`), not the applet's branded name and not a "— LING2150" or
  "Lab" variant. That's what shows in tabs, history and bookmarks, so it should match the catalog.
- Don't add a `.eyebrow` line above the hero title unless it tells the student something the title
  doesn't (a series or week). One that only restates the topic ("NLP Research ...") is noise; leave it out.

## Lesson-container body

```html
<h4 class="uga-accent">Learning Objectives</h4>
<ul>
  <li><strong>Verb</strong> the rest of the sentence.</li>
</ul>

<h4 class="uga-accent">Background</h4>
<p>...</p>

<h4 class="uga-accent">Instructions</h4>
<ol>
  <li>...</li>
</ol>
```

- `.uga-accent` (red, bold) is defined once in `style.css` — never redeclare it per page.
- Learning Objectives list items lead with a bold verb (`<strong>Describe</strong> ...`,
  `<strong>Identify</strong> ...`) — this is a real site-wide convention, not decoration.
- Background/Instructions are plain, always-visible content — not a collapsible `<details>`.
  Collapsing this section makes one page behave differently from every other applet for no
  functional reason.
- Don't put `class="small"` (or any other font-shrinking class) on the Learning Objectives,
  Instructions, or Reflection & Discussion Guide lists, or on the row/div wrapping them. These
  are the same substantive, always-visible course content as the Background paragraph next to
  them and should read at the same size — a smaller size on the list items alone (while
  Background stays full-size) reads as an unintentional accident, not a deliberate choice, and
  was the second most common deviation found in the first full-site audit.

## Reflection & Discussion Guide

At the end of the page, outside the interactive area:

```html
<section class="reflection-container" aria-labelledby="reflection-title">
  <h3 id="reflection-title" class="uga-accent mb-3">Reflection &amp; Discussion Guide</h3>
  <ol>
    <li>...</li>
  </ol>
```

Plain list, no colored callout box. `.discussion-box` (defined in `style.css`) is the right
choice for a discussion prompt *inline*, attached to a specific step of a multi-step applet —
see 3F's per-stage discussion boxes — but the final wrap-up section at the bottom of the page
is always presented as a plain list across every applet that has one.

### "Write down your thoughts" (reflection notes)

If students can type notes in response to the guide, use the one shared component, exactly as
written (5C, 7A and 7B all do; it is also live in the template):

```html
<div class="reflection-notes field">
  <label for="reflection">Write down your thoughts</label>
  <textarea id="reflection" rows="5" maxlength="4000"></textarea>
  <div class="btn-row">
    <button class="btn-uga" type="button" data-download-notes>Download my notes</button>
    <span class="field-hint" role="status" data-download-status></span>
  </div>
  <p class="field-hint">Your notes stay in this browser and are not submitted to your instructor. Download them before you close this page.</p>
</div>
```

plus `<script src="../reflection-notes.js" defer></script>` in the page.

- Sits inside `.reflection-container`, after the `<ol>`. The label is always "Write down your
  thoughts". **No extra prompt or hint**: students are answering the numbered questions above it.
- The note underneath is word-for-word identical on every applet.
- There is always a "Download my notes" button of its own. It is handled by the shared
  `docs/reflection-notes.js` and saves the guide's questions plus the notes as a `.txt` file. Never fold
  the notes into an applet's other download (7A used to bury them in its results JSON, which was
  confusing and unlike every other page).
- If the applet also lets students export their *work* (chat transcripts, rewrites, marker data),
  that is a separate "Download my work" button in the applet card, not in this box.
- Keep the textarea's own `id` if the applet's JS reads it; the shared script doesn't need one.

## CSS discipline for page-specific `<slug>/applet.css`

`style.css` already provides: the card look for `.lesson-container` / `.app-wrapper` /
`.reflection-container` (padding, max-width, border, box-shadow, font-size), `.page-header`,
`.hero` / `.hero-text`, `.uga-accent`, global `h1,h2,h3` weight/transform/spacing, and these
reusable widgets (all shown working in `docs/template/applet_template.html`):

| Widget | Classes |
| --- | --- |
| Buttons | `.btn-uga` / `.btn-uga-dark` / `.btn-uga-outline` / `.btn-reset`, grouped in `.btn-row` |
| Form fields | `.field`, `.field-hint`, `.field-optional`, `.error-text` |
| Chat | `.chat-log`, `.chat-turn` (`.human` / `.ai`), `.chat-compose`, `.chat-status`, `.thinking-dots` |
| Editable numbered list | `.turn-row` / `.turn-stamp` / `.turn-body` |
| Stage rack | `.rack` / `.stage` / `.stage-num` / `.stage-body` / `.stage-title` / `.stage-sub` / `.stage-content` |
| Callouts | `.discussion-box` (per-step prompt), `.glossary-box` (optional `<details>`) |
| Reflection notes | `.reflection-notes` |
| End-of-page cards | `.applet-feedback-card`, `.source-card` |
| Accessibility | `.skip-link` (plus Bootstrap's `.visually-hidden`) |

A page's own CSS file should contain **only** what's genuinely specific to that page's own
interactive widgets (a comparison grid, coreference-chain color coding, a domain-specific data
table, ...) — not reimplementations or near-duplicates of anything above. Before adding a new
widget pattern to a page-local `<style>` block, check whether it's actually a reusable
primitive that belongs in `style.css` instead (as `.discussion-box`, `.turn-row`, the chat
components and the skip link all turned out to be) rather than something genuinely one-page-
specific. Specifically, don't write page-local rules for bare `label`, `input`, `select`,
`textarea`, `button`, `details` or `:focus-visible`: they leak into everything on the page, and
they are how 5C, 7A and 7B each ended up with a slightly different form look (7A and 7B have
since been cleaned up; 5C's `applet.css` still has them).

Before finishing a CSS edit, check for dead/duplicate rules:

```sh
grep -oE '\.[a-zA-Z][a-zA-Z0-9_-]*' docs/week_N/<slug>/applet.css | sort -u
# then grep the HTML/JS for each class name to confirm it's still used
```

Things that have gone stale in practice: a rule left behind after its only usage was
removed from the HTML, a rule that duplicates something `style.css` already defines byte-for-
byte, a page-local override of `.lesson-container`/`.app-wrapper` font-size or padding that
just makes that one page's cards look different from every other page's for no reason.

## Punctuation: no middle dot

Don't use the middle dot (`·`, `&middot;`, `\u00b7`) as a separator anywhere: not in labels
("1. You"), captions, counters, statuses, receipts or prose. Use whatever fits the meaning: a
period after a number ("1. You"), a comma ("7/16 turns, 282/4,500 characters"), parentheses for a
role or qualifier ("Alex (Describer)", "Turn 3 (reflected)"), a colon ("Head 2: Tracks the subject"),
or a dash. The single exception is the deliberately faded system-state line that students needn't
read (the `.statusbar` text in 1_five_stage_pipeline and 3_coref, "Stage 2 · intent + slot extracted").

## Keep the student path short

An applet's main card should hold only what a student needs to do the activity. Anything that is
only for the instructor (sign-in, results, collection management) or only for a fallback mode
(offline group tools: combining exports, downloading data, clearing saved work) goes in **one
collapsed `<details class="glossary-box">` card each**, below the applet, and stays available
but closed, so a student whose neighbour can't reach the live service can still open it (7A's
offline card is hidden only for teachers, and opens by itself if the live service can't be reached). Aim for: read, do the task, look at the result. Status text and hints
that students don't need to read should be short and faded, not full paragraphs.

## Fonts: sans for content, mono only for small technical labels

`style.css` body/headings are Merriweather (serif). Everything a student has to *read or
operate* inside an app card (paragraphs in a rack stage, form labels, inputs, buttons, hints,
chat text, table cells of ordinary data) is **Merriweather Sans**. **IBM Plex Mono** is reserved
for small, unimportant, computer-y text: the `.stage-sub` caption, tags/chips, character
counters, raw model or system output (the ASR transcript, entity IDs, token views). If in doubt,
use sans. Don't use Space Grotesk, Oswald or anything else — they aren't loaded.

The canonical Google Fonts URL (Page shell, above) includes Merriweather Sans **400**. That weight
was once missing, so sans body text silently rendered at the nearest heavier weight and looked
bold; don't drop it from the link.

## Buttons and form fields

- Buttons: use `.btn-uga` (primary), `.btn-uga-dark`, `.btn-uga-outline` (low emphasis) and
  `.btn-reset`. They share one font, 14px size and 44px minimum height, so they look identical
  inside a card and inside a `.stage-content`. Never restyle a bare `button` element; never use a
  different class for the same job (`.custom-btn-*` has been removed; 5C's page-local
  `button.primary` styling predates this rule and is the one known holdout). Put buttons in a `.btn-row`.
- Fields: wrap each label + control in `.field` (label 13px bold sans, control 15px, 44px tall).
  Hints go in `.field-hint`, optional markers in `.field-optional`, validation messages in
  `.error-text` with `role="alert"`. Every input needs a real `<label>` (use `.visually-hidden`
  if there's no room for a visible one).
- Text sizes are set by these widgets, **not** by overriding `.app-wrapper`'s font-size. The card
  keeps its 1.2rem prose size; controls and microcopy inside it don't inherit that size (7B once
  did, which made its forms and chat panels look oversized next to every other applet).

## Chat (conversation display and composer)

Every applet that shows a conversation — 3B's chatroom, 3_coref's transcript, 5C's "conversation
so far", both 7B assistants and its offline example — uses the same components:

```html
<ol id="log" class="chat-log" role="log" aria-label="Conversation" tabindex="0">
  <li class="chat-turn human">
    <span class="chat-turn__speaker">1. You</span>
    <p class="chat-turn__text">…</p>
  </li>
  <li class="chat-turn ai">
    <span class="chat-turn__speaker">2. Assistant</span>
    <p class="chat-turn__text">…</p>
    <div class="chat-turn__extras field"><!-- optional per-turn control --></div>
  </li>
</ol>
<p class="chat-status" role="status" aria-live="polite"></p>
<form class="chat-compose field">
  <label for="msg">Your message</label>
  <div class="chat-compose__row"><input id="msg" type="text"><button class="btn-uga" type="submit">Send</button></div>
  <div class="chat-compose__extras"><!-- optional whole-conversation options --></div>
</form>
```

The standard look: human turns left in grey, AI turns right in a teal tint; a small
"1. You" line (number, then speaker) above each bubble (so students can cite "turn 3"); 15px sans text;
a bordered, scrollable log (`.chat-log--static` for a fixed example that shouldn't scroll).
Set text with `textContent`, never `innerHTML`, and scroll the log to the bottom after a change.
Role classes are `human` / `ai` (not `user` / `assistant`). Give the log `role="log"`, unless a
separate `role="status"` line already announces each reply (7B), in which case use `aria-label`
only, so replies aren't read twice.

Different apps need different extras. Use the slots; do not fork the chat CSS:

| Need | Slot | Used by |
| --- | --- | --- |
| Per-turn control (annotate/mark a turn) | `.chat-turn__extras` | 7B "Mark this turn" |
| Option for the whole conversation | `.chat-compose__extras` | 3B auto-generate toggle; 3_coref Auto-demo |
| Extra control next to the input | a `<select>` / button inside `.chat-compose__row` | 3_coref speaker picker |
| Highlight the newest turn | `.chat-turn.just-added` | 3_coref |
| "AI is typing" | `.chat-turn.thinking` + `.thinking-dots` in the bubble | 3B |
| Two chats side by side | your own grid of `.chat-panel`s (page CSS) | 7B |

An **editable** list of turns (the student rewrites any line, changes its speaker, deletes it)
is a different job: use the `.turn-row` / `.turn-stamp` / `.turn-body` row pattern (5C's
conversation editor) rather than editing inside bubbles. Prefer that compact row over a boxed
`<fieldset>`/`<legend>` per item unless the page has a real requirement it can't meet.

## Feedback card (required on every applet)

Every applet page ends with the feedback card, directly after `</main>`. It is how students and
instructors report bugs and content errors, so a page without it is not finished.

```html
<section class="applet-feedback-card" aria-labelledby="applet-feedback-heading">
  <div class="applet-feedback-card__content">
    <div>
      <h2 id="applet-feedback-heading">Help us improve this applet</h2>
      <a class="applet-feedback-card__tutorial" href="https://kaltura.uga.edu/media/t/1_bhor4qfq" target="_blank" rel="noopener noreferrer">New to GitHub? Watch the one-minute account setup guide <span class="visually-hidden">(opens in a new tab)</span></a>
    </div>
    <a class="applet-feedback-card__button" href="https://github.com/uga-ling2150/applets/issues/new?template=applet-feedback.yml&amp;title=%5BApplet%20feedback%5D%20<ACTIVITY>&amp;applet=<ACTIVITY>&amp;source-url=<PAGE URL>" target="_blank" rel="noopener noreferrer">Report a problem or give feedback <span class="visually-hidden">(opens in a new tab)</span></a>
  </div>
</section>
```

- `<ACTIVITY>` and `<PAGE URL>` are URL-encoded and must name **this** page's activity and its
  published URL (`https://uga-ling2150.github.io/applets/week_N/<file>.html`). Copy-pasting the
  link from another page silently mislabels every bug report (5A and 5B once said "Activity 4B").
  The three parameters match the fields of `.github/ISSUE_TEMPLATE/applet-feedback.yml`.
- If another standard card follows (the source card), add `applet-feedback-card--followed`.
- Not needed on the site index, on `helpers/` tools, or on the embedded mini-applets
  (3Bi, 3Bii), which are standalone pieces without the page chrome.

## Source card (when the applet uses third-party material)

An applet that reproduces or adapts someone else's material — a benchmark or corpus, recordings,
a paper, a hosted model — credits it in a `<footer class="source-card" aria-labelledby="sources-title">`
after the feedback card (7A: the AMI corpus and its CC BY licence; 7B: the grounding paper and
the model). Use a short credit paragraph with a link to the source and licence and a note of
changes; put longer clip details, limitations and privacy notes in `<details>` *inside* the card.
Don't build a page-local card, and don't hide the credit in a collapsed box in the app.
(`.source-note`, a lighter inline variant, is used only inside 4A's closing note.) Applets with
no third-party material omit it.

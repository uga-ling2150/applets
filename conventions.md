# LING2150 Applets — conventions

Static HTML/CSS/JS teaching applets for a linguistics course, deployed via GitHub Pages
from `docs/`. Each week's activities live in `docs/week_N/`. Shared look-and-feel lives in
`docs/style.css`, which every applet page loads.

This file exists so a new applet page starts consistent with the rest of the site instead
of drifting. It was written after reconciling `docs/week_5/5C_explicit_query_rewriting.html`
against the established pattern (`docs/week_3/3F_rlhf_rewards.html`,
`docs/week_4/4B_chatbot_metrics.html`, `docs/week_2/3_coref.html`).

## Page shell

Every applet's `<head>` loads, in this order:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=...">
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
<link rel="stylesheet" href="../style.css">
<link rel="stylesheet" href="<slug>/applet.css">  <!-- only if the page needs page-specific CSS -->
```

Load Bootstrap even if a given applet doesn't use its components directly. `style.css`
assumes Bootstrap's reboot is present (heading sizes, form-control resets, etc.), and
several applets *do* use Bootstrap grid/utility classes — loading it everywhere keeps every
page's baseline typography and spacing identical. `<!DOCTYPE html>` is uppercase site-wide.

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

## Reflection & Discussion Guide

At the end of the page, outside the interactive area:

```html
<section class="reflection-container" aria-labelledby="reflection-title">
  <h3 id="reflection-title" class="uga-accent mb-3">Reflection &amp; Discussion Guide</h3>
  <ol>
    <li>...</li>
  </ol>
```

Plain list, no colored callout box. (A tinted `.discussion-box`-style callout is the right
call for a discussion prompt *inline*, attached to a specific step of a multi-step applet —
see 3F's per-stage discussion boxes — but the final wrap-up section at the bottom of the page
is always presented as a plain list across every applet that has one.)

## CSS discipline for page-specific `<slug>/applet.css`

`style.css` already provides: the card look for `.lesson-container` / `.app-wrapper` /
`.reflection-container` (padding, max-width, border, box-shadow, font-size), `.page-header`,
`.hero` / `.hero-text`, `.uga-accent`, and global `h1,h2,h3` weight/transform/spacing. A
page's own CSS file should contain **only** what's genuinely specific to that page's
interactive widgets (e.g. a turn editor, a comparison grid, a stage rack) — not
reimplementations or near-duplicates of anything above.

Before finishing a CSS edit, check for dead/duplicate rules:

```sh
grep -oE '\.[a-zA-Z][a-zA-Z0-9_-]*' docs/week_N/<slug>/applet.css | sort -u
# then grep the HTML/JS for each class name to confirm it's still used
```

Things that have gone stale in practice: a rule left behind after its only usage was
removed from the HTML, a rule that duplicates something `style.css` already defines byte-for-
byte, a page-local override of `.lesson-container`/`.app-wrapper` font-size or padding that
just makes that one page's cards look different from every other page's for no reason.

## Streamlined input patterns

For a simple "append one item, look at the result" interaction (adding a line to a
transcript, etc.), prefer the compact row pattern from `docs/week_2/3_coref.html`
(`.turn-row` / `.turn-stamp` / `.turn-body`: numbered circular stamp + inline fields, no
per-item `<fieldset>`/`<legend>` chrome) over a heavier boxed-fieldset editor, unless the
page has a real requirement (e.g. pre-authoring and freely editing *both* sides of a full
conversation before doing anything with it) that the row pattern can't support.

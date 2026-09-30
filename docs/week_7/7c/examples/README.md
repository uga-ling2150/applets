# Class examples for Activity 7C (Sequence builder)

Transcripts in this folder appear in the applet's **Transcript** menu under
**Class examples**, alongside the four built-in practice transcripts. Each file is one
transcript in the [sequence-annotation format](../../../specs/sequence-annotation/sequence-annotation.md),
optionally with a suggested analysis that students can reveal with **Show a suggested analysis**.

## Add an example (no JSON editing needed)

1. Open the applet and choose **My own transcript**.
2. Give it a **Title** (this becomes its menu name and its id) and paste the transcript, one
   turn per line, as `Speaker: what they said`. Select **Load transcript**.
3. Optional: build the analysis you want students to see as the suggested answer. To give
   no suggested answer, leave it empty.
4. Select **Download as JSON**. You get `<title-as-id>.seqann.json`.
5. Put the file in this folder. Rename it if you like, e.g. `borrowing-notes.json`; the name
   must contain only letters, digits, `.`, `_` or `-`, and end in `.json`.
6. Add it to [`index.json`](index.json):

   ```json
   {
     "examples": [
       { "file": "borrowing-notes.json" },
       { "file": "my-new-example.json", "label": "Optional menu name" }
     ]
   }
   ```

7. Commit and push. The example is live once GitHub Pages redeploys (usually a minute or two).

The order in `index.json` is the order in the menu. To withdraw an example, delete its line
(the file can stay). `borrowing-notes.json` is a sample; remove its line if you don't want it
shown.

## Link straight to an example

Add `?example=<transcript id>` to the applet URL to open that transcript directly, e.g.

`https://uga-ling2150.github.io/applets/week_7/7C_sequence_expansion.html?example=borrowing-notes`

The transcript id is `transcript.id` in the file: the slug of the title you typed in step 2.

## Things to know

- **Ids must be unique.** A file whose `transcript.id` matches a built-in example (`essay`,
  `counter`, `saturday`, `greetings`) or another class example is skipped. The reason is
  logged in the browser console.
- **The first analysis in a file is the suggested one.** Students always start with an empty
  analysis. Later analyses in the same file are ignored by the applet but kept in the file.
- **Editing a transcript resets students' saved work on it.** The applet saves each student's
  analysis in their browser. If the words of the transcript change, that saved analysis no
  longer matches and is discarded. Fixing a typo mid-class will therefore clear their
  work; changing only the title or the suggested analysis will not.
- **Students can hand in or share a JSON file.** **Download as JSON** on a class example
  produces a file with the same transcript id. **Open a JSON file** puts it back on that
  example, and the suggested analysis is still available.
- **Local testing.** Class examples are fetched from the web server, so they don't appear
  when the page is opened straight from disk (`file://`). Serve the folder instead:
  `python -m http.server -d docs 8000`, then open
  `http://localhost:8000/week_7/7C_sequence_expansion.html`.
- **Limits.** At most 40 turns per transcript. Turn text is shortened to 400 characters and speaker
  names to 40.
- **Hand-written files** are fine too, following the spec. Custom pair ids, `note` fields and
  `x-` fields are accepted but not shown by the applet.

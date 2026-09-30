# Sequence Annotation Format, version 1.0

A portable JSON format for a conversation-analytic analysis of **sequence organization**:
which turns form adjacency pairs, which pairs combine into larger sequences, and which
turns or sequences **expand** a base pair (pre-, insert and post-expansions). It is the
format we intend a full analysis tool to read and write, generalising the model behind the
Activity 7C applet (`docs/week_7/7C_sequence_expansion.html`).

| File | Purpose |
| --- | --- |
| [`v1.schema.json`](v1.schema.json) | JSON Schema (draft 2020-12) for the document shape |
| [`examples/saturday-plans.json`](examples/saturday-plans.json) | Every expansion type, including an expansion of an expansion |
| [`examples/catching-up.json`](examples/catching-up.json) | Sequences of sequences, and two competing analyses of one transcript |

The key words MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119. The schema checks the
document's *shape*. The structural rules in section 5 cannot be expressed in JSON Schema. A
document is **valid** only if it passes both.

---

## 1. Design principles

1. **Store structure, derive labels.** The document records only what the analyst decided:
   which units are bracketed together and which turn each expansion belongs to. FPP/SPP roles
   and expansion types (pre, insert, post) follow from position, and are computed by the rules
   in section 6. This means a stored label can never contradict the structure.
2. **Transcript and analyses travel together, but separately.** One transcript can carry any
   number of analyses (a student's, a partner's, a suggested one), so they can be compared.
   An analysis never edits the transcript.
3. **Stable ids, not positions.** Analyses refer to turns by `id`, not by index, so re-numbering
   the display or adding timing information does not break them.
4. **Forward-compatible.** Unknown `x-` fields are preserved and ignored (section 8).

## 2. Conceptual model

There are three kinds of **unit**:

| Unit | What it is | Stored as |
| --- | --- | --- |
| **Turn** | One speaker's contribution | `transcript.turns[]` |
| **Adjacency pair** | Two turns: the first pair part (FPP) and the second pair part (SPP) | `pairs[]` with `type: "adjacency"` |
| **Sequence** | Two pairs (adjacency pairs or sequences) joined into a larger sequence | `pairs[]` with `type: "sequence"` |

Adjacency pairs and sequences are both **pairs**: brackets with exactly two parts. Sequences
can nest to any depth, so the part-of relation forms a set of binary trees whose leaves
are turns.

A **dependency** says that one unit (the *dependent*: a single turn or any pair) expands a
*head* turn, which is the base FPP or base SPP it belongs to. A pair whose FPP or SPP is the
head of some dependency is a **base pair**. An expansion can itself be a base pair for further
expansions.

The *Saturday plans* example, as an outline of what depends on what (arrows point to the head):

```
invite (t5, t8)                 base pair: "Do you want to come?" / "Yeah, I'd love to."
├── pre (t1, t4)   → t5 (FPP)   pre-expansion: "Are you doing anything on Saturday?" / "No, I'm free."
│   └── why (t2, t3) → t1       insert expansion (post-first) inside the pre-sequence
├── who (t6, t7)   → t8 (SPP)   insert expansion (pre-second): "Who's playing?"
└── t9             → t8 (SPP)   minimal post-expansion (SCT): "Great."
```

## 3. Document structure

```jsonc
{
  "$schema": "https://uga-ling2150.github.io/applets/specs/sequence-annotation/v1.schema.json",
  "format": "sequence-annotation",      // fixed
  "version": "1.0",
  "transcript": {
    "id": "saturday", "title": "Saturday plans", "language": "en",
    "source": { "citation": "…", "constructed": true },
    "speakers": [ { "id": "maya", "label": "Maya" } ],     // optional
    "turns": [ { "id": "t1", "speaker": "maya", "text": "Are you doing anything on Saturday?" } ]
  },
  "analyses": [
    {
      "id": "suggested", "label": "Suggested analysis",
      "pairs":        [ { "id": "pre", "type": "adjacency", "parts": ["t1", "t4"] } ],
      "dependencies": [ { "dependent": "pre", "head": "t5" } ]
    }
  ]
}
```

### Id scopes

- Turn ids are unique within the transcript. Speaker ids are unique within `speakers`.
- Analysis ids are unique within `analyses`.
- Pair ids are unique **within their analysis** and MUST NOT equal any turn id, because
  `parts` and `dependent` can refer to either kind of unit. Two analyses MAY reuse the same
  pair ids.
- Ids match `^[A-Za-z][A-Za-z0-9_.-]{0,63}$`. Meaningful ids (`"pre"`, `"invite"`) are
  encouraged, and `t1`, `t2`, … is a good default for turns.

## 4. Field reference

### Document

| Field | Req. | Type | Meaning |
| --- | --- | --- | --- |
| `format` | yes | `"sequence-annotation"` | Identifies the format |
| `version` | yes | string | `1.<minor>[.<patch>]` |
| `transcript` | yes | object | The talk being analysed |
| `analyses` | yes | array | Zero or more analyses of that transcript |
| `$schema` | no | string | Schema URL, for editors and validators |

### `transcript`

| Field | Req. | Type | Meaning |
| --- | --- | --- | --- |
| `turns` | yes | array (≥1) | Turns **in the order they occur**. This order is what every positional rule uses. |
| `id`, `title` | no | string | Identification |
| `language` | no | string | BCP 47 tag |
| `source` | no | object | `citation`, `url`, `license` (SPDX or URL), `constructed` (true = written for teaching) |
| `speakers` | no | array | `{ id, label? }`. If present, every `turn.speaker` MUST be one of these ids. |

### Turn

| Field | Req. | Type | Meaning |
| --- | --- | --- | --- |
| `id` | yes | id | Unique turn id |
| `speaker` | yes | string | Speaker id, or the display name if there is no `speakers` list |
| `text` | yes | string | What was said. It may use any transcription convention; this format does not interpret it. |
| `start`, `end` | no | number | Seconds from the start of the recording. `end` ≥ `start`. |

### Analysis

| Field | Req. | Type | Meaning |
| --- | --- | --- | --- |
| `id` | yes | id | Unique analysis id |
| `pairs` | yes | array | Adjacency pairs and sequences |
| `dependencies` | yes | array | Expansions |
| `label`, `annotator` | no | string | Who or what this analysis is |
| `created`, `modified` | no | date-time | RFC 3339 timestamps |
| `tool` | no | object | `{ name, version?, url? }` of the program that wrote it |
| `note` | no | string | The analyst's comment |

### Pair

| Field | Req. | Type | Meaning |
| --- | --- | --- | --- |
| `id` | yes | id | Unique within the analysis |
| `type` | yes | `"adjacency"` \| `"sequence"` | Adjacency pairs join two turns; sequences join two pairs |
| `parts` | yes | [id, id] | In transcript order. For an adjacency pair, `parts[0]` is the FPP and `parts[1]` the SPP. |
| `note` | no | string | The analyst's comment |

### Dependency

| Field | Req. | Type | Meaning |
| --- | --- | --- | --- |
| `dependent` | yes | id | The expanding unit: a turn id or a pair id |
| `head` | yes | id | A **turn** id: the base FPP or SPP being expanded |
| `type` | no | enum | A cached copy of the derived type (section 6.3). If present, it MUST match what the rules derive. |
| `note` | no | string | The analyst's comment |

Heads are turns, not pairs, on purpose. Whether an insert attaches to the FPP (post-first) or
the SPP (pre-second) is an analytic claim, and only a turn-level head can record it.

## 5. Structural rules

A validator MUST reject a document that breaks any of these rules. Rules S1–S3 apply to the
whole document; the rest apply to each analysis separately. Write `index(t)` for a turn's
position in `transcript.turns`.

| # | Rule |
| --- | --- |
| S1 | Turn ids are unique. Speaker ids are unique. Analysis ids are unique. |
| S2 | If `speakers` is present, every `turn.speaker` is a speaker id. |
| S3 | If a turn has both `start` and `end`, then `end` ≥ `start`. |
| A1 | Pair ids are unique within the analysis and do not equal any turn id. |
| A2 | An **adjacency** pair's parts are two different turn ids, with `index(parts[0]) < index(parts[1])`. |
| A3 | A **sequence**'s parts are two different pair ids from the same analysis, with `end(parts[0]) < start(parts[1])`: the two spans are ordered and do not overlap (spans are defined in 6.1). |
| A4 | A turn is a part of **at most one** adjacency pair. A pair is a part of **at most one** sequence. |
| A5 | The part-of relation is acyclic: no pair contains itself, directly or indirectly. |
| A6 | Every `dependent` is a turn id or a pair id of the analysis. Every `head` is a turn id. |
| A7 | A unit is the `dependent` of **at most one** dependency. |
| A8 | A turn that is part of an adjacency pair MUST NOT be a `dependent`. Make its pair (or an enclosing sequence) the dependent instead. |
| A9 | The head lies outside the dependent's span: `index(head) < start(dependent)` or `index(head) > end(dependent)`. |
| A10 | No dependency cycles. Let `containers(t)` be turn `t` together with every pair that contains it, directly or indirectly. Draw an edge from each dependent `U` to every unit in `containers(head(U))`. The resulting graph MUST be acyclic. (Example: if `(t1,t2)` depends on `t5` and `(t5,t6)` depends on `t2`, that is a cycle.) |
| A11 | If a dependency has a `type`, it equals the type derived in 6.3. |

Array order within `pairs` and `dependencies` carries no meaning. Producers SHOULD list parts
before the sequences that contain them, but consumers MUST NOT rely on it.

## 6. Derived information

Tools MUST compute these values rather than store them (the one optional exception is
`dependency.type`).

### 6.1 Spans

The span of a unit is the pair of turn positions `[start, end]` it covers:

- turn `t`: `[index(t), index(t)]`
- adjacency pair: `[index(parts[0]), index(parts[1])]`
- sequence: `[start(parts[0]), end(parts[1])]`

### 6.2 Pair-part roles

For each adjacency pair, `parts[0]` is the **FPP** and `parts[1]` is the **SPP**. A turn that is
in no adjacency pair has no role.

### 6.3 Expansion type of a dependency

Let `U` be the dependent, with span `[s, e]`, and `h = index(head)`. Let `P` be the adjacency
pair that contains the head, with `F = index(FPP)` and `S = index(SPP)`.

| Condition (checked in order) | Derived `type` | Name |
| --- | --- | --- |
| head is in no adjacency pair | `unclassified` | expansion (incomplete analysis) |
| `e < F` | `pre` | pre-expansion |
| `s > S` and `U` is a single turn | `minimal-post` | minimal post-expansion, a **sequence-closing third** (SCT) |
| `s > S` | `post` | non-minimal post-expansion |
| `F < s` and `e < S` and `h = F` | `insert-post-first` | insert expansion, post-first |
| `F < s` and `e < S` and `h = S` | `insert-pre-second` | insert expansion, pre-second |
| otherwise (`U` straddles `F` or `S`) | `unclassified` | expansion (overlaps its base pair) |

The type depends on where `U` sits, not on which pair part is the head. One exception: inside
the base pair, the head is what distinguishes post-first from pre-second.

### 6.4 Per-turn tags (for display)

These are the tags the 7C applet shows. A full tool SHOULD use the same vocabulary.

- A turn in an adjacency pair `P` shows its role (`FPP`/`SPP`) with a subscript:
  1. Walk up from `P` through its enclosing sequences. The first unit found that is a dependent
     gives the subscript: `pre`, `ins` (either insert), or `post`.
  2. If there is none and `P` is a base pair (its FPP or SPP is some dependency's head): `base`.
  3. Otherwise: no subscript.

  So a pre-sequence that has its own insert expansion is still tagged `pre`: its expansion
  status takes precedence over its base status.
- A turn in no adjacency pair that is itself a dependent shows `pre`, `ins`, `SCT` (for
  `minimal-post`) or `exp` (for `unclassified`).
- Any other turn has no tag.

### 6.5 Warnings (valid but worth flagging)

A tool SHOULD flag these without rejecting the document:

- an adjacency pair whose two turns have the same speaker;
- a `pre` dependency whose head is an SPP ("pre-expansions normally attach to the base FPP");
- a `post` or `minimal-post` dependency whose head is an FPP ("post-expansions normally attach to the base SPP");
- any `unclassified` dependency.

## 7. Relation to the 7C applet

The applet (`docs/week_7/7c/applet.js`) reads and writes this format:

- **Download as JSON** writes the transcript plus one analysis (`id: "mine"`), with every
  dependency's derived `type` filled in.
- **Open a JSON file** reads a document, checks rules A1–A10, and loads its first analysis as
  the student's work.
- **Class examples** are documents listed in `docs/week_7/7c/examples/index.json` (see the
  README there). The first analysis in each is shown as the suggested analysis.

The applet keeps structure only. On import, pair ids are renumbered, and `note` and `x-` fields
are dropped. Speaker ids are replaced by their labels. Internally it uses a compact form
(also saved in `localStorage` under `ling2150-7c-v1`), which maps to this format as follows:

| Applet (internal) | This format |
| --- | --- |
| Turn index `i` (0-based) | Turn id `t{i+1}` |
| `{id:'p3', kind:'turn', a:i, b:j}` | `{ "id": "p3", "type": "adjacency", "parts": ["t{i+1}", "t{j+1}"] }` |
| `{id:'p5', kind:'pair', a:'p2', b:'p3'}` | `{ "id": "p5", "type": "sequence", "parts": ["p2", "p3"] }` |
| `deps: { 'p2': 0, 't8': 7 }` | `[{ "dependent": "p2", "head": "t1" }, { "dependent": "t9", "head": "t8" }]` |
| `classify()` / `tagFor()` | Sections 6.3 / 6.4 |
| Refusals and warnings in `makeAP`, `makeSeq`, `setDep` | Rules A2–A10 and section 6.5 |

The applet enforces A1–A10 as it goes (it refuses edits that would break them). When a turn
already in a pair is dragged, it promotes the dependency to the pair, which is how it satisfies A8.

## 8. Versioning and extensions

- `version` follows semantic versioning. A **minor** version only adds optional fields or
  enum values. A consumer that supports 1.0 MUST accept any 1.x document, ignore unknown
  optional fields, and treat unknown `dependency.type` values as absent. A breaking change
  becomes version 2 with a new schema URL.
- Any object MAY carry extra fields whose names start with `x-` (for example
  `"x-confidence": 0.8` on a dependency, or `"x-tool-state": {…}` on an analysis). Consumers
  MUST ignore `x-` fields they do not understand and SHOULD keep them when re-saving.
  Other unknown fields are schema errors.
- Recommended file name: `<transcript-id>.seqann.json`; media type `application/json`.

## 9. Out of scope in version 1

These are deliberately left out. They are candidates for later minor versions (as optional
fields) or for `x-` extensions until then:

- turn-constructional units (a turn that is SPP to one pair and FPP of the next is currently
  modelled only at the whole-turn level, and A4 allows a turn in just one adjacency pair);
- overlapping talk, gaps and other timing relations beyond `start`/`end`;
- pair *types* (question–answer, invitation–acceptance) and preferred or dispreferred responses;
- repair and other non-sequential annotations (see Activity 7B);
- multiple heads for one expansion, or an analyst's confidence in a decision.

## Reference

Schegloff, E. A. (2007). *Sequence Organization in Interaction: A Primer in Conversation
Analysis*. Cambridge University Press. https://doi.org/10.1017/CBO9780511791208

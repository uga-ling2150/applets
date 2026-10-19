/* Shared weighted highlighter for LING2150 applets.

   Give it a list of words and phrases, each with a number (its weight), and it
   highlights them in any text a student types: positive weights in amber with a
   solid underline, negative weights in teal with a dashed underline, and bigger
   weights in stronger colour.

   How to write a weights list and add this to a page:
   docs/helpers/highlighter.html, and "Weighted highlighter" in conventions.md.

   Optional: load Compromise (https://github.com/spencermountain/compromise)
   before this file and word forms are matched too ("circling" counts as
   "circle"). Without it, only exact word forms match.

   Public API (window.Highlighter):
     attach(options)        -> Promise<controller>   wire up a textarea + output box
     load(source)           -> Promise<object>       read a weights list
     prepare(rawWeights)    -> model                 check and index a weights list
     find(text, model)      -> [match]               the matches, in text order
     render(el, text, matches, model, showWeights)   draw highlighted text safely
     parse(jsonText)        -> object                JSON with a readable error
*/
(function (global) {
  "use strict";

  var NOT_LETTER_OR_DIGIT = /[^\p{L}\p{N}]+/gu;

  // "Café," -> "cafe": lowercase, no accents, no punctuation.
  function clean(s) {
    return String(s).normalize("NFD").replace(/\p{M}+/gu, "")
      .toLowerCase().replace(NOT_LETTER_OR_DIGIT, "");
  }

  function hasCompromise() { return typeof global.nlp === "function"; }

  // Split text into sentences, each a list of words: {start, end, key}.
  // start/end are character positions in the original text; key is the form
  // used for lookup (the dictionary form when Compromise is used).
  function tokenize(text, useCompromise) {
    if (useCompromise) {
      var doc = global.nlp(text);
      doc.compute("root");
      return doc.json({ offset: true }).map(function (sentence) {
        var words = [];
        sentence.terms.forEach(function (t) {
          if (!t.text || !t.offset) return; // hidden half of a contraction ("don't" -> do + not)
          // Contractions and slang ("don't", "gonna") keep their written form, so
          // "gonna" is matched as "gonna", not as "go to".
          var key = clean(t.implicit ? t.normal : (t.root || t.normal || t.text));
          if (key) words.push({ start: t.offset.start, end: t.offset.start + t.offset.length, key: key });
        });
        return words;
      });
    }
    var sentences = [[]];
    var re = /[\p{L}\p{N}\p{M}]+(?:['’][\p{L}\p{N}\p{M}]+)*|[.!?]+/gu;
    var m;
    while ((m = re.exec(text))) {
      if (/^[.!?]+$/.test(m[0])) {
        if (sentences[sentences.length - 1].length) sentences.push([]);
        continue;
      }
      var key = clean(m[0]);
      if (key) sentences[sentences.length - 1].push({ start: m.index, end: m.index + m[0].length, key: key });
    }
    return sentences;
  }

  function flat(sentences) {
    return sentences.reduce(function (all, s) { return all.concat(s); }, []);
  }

  // ---------- Reading and checking a weights list ----------

  function parseJson(text, where) {
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error("The weights in " + where + " aren't valid JSON (" + e.message + "). " +
        "Usual causes: a missing comma between entries, a comma after the last entry, " +
        "or curly quotes (“ ”) instead of straight ones (\").");
    }
  }

  // source: an object, "#id" of a <script type="application/json">, or a URL.
  function load(source) {
    if (source && typeof source === "object") return Promise.resolve(source);
    if (typeof source !== "string" || !source) {
      return Promise.reject(new Error("No weights were given. Pass an object, \"#id-of-a-script-tag\", or a URL."));
    }
    if (source.charAt(0) === "#") {
      var el = document.getElementById(source.slice(1));
      if (!el) return Promise.reject(new Error("There is no element with id \"" + source.slice(1) + "\" on this page."));
      try { return Promise.resolve(parseJson(el.textContent, source)); }
      catch (e) { return Promise.reject(e); }
    }
    return fetch(source).then(function (r) {
      if (!r.ok) throw new Error("Couldn't load the weights file " + source + " (error " + r.status + ").");
      return r.text();
    }, function () {
      throw new Error("Couldn't load the weights file " + source + ". If you opened the page straight " +
        "from your computer, put the weights in the page instead (see the helper page).");
    }).then(function (text) { return parseJson(text, source); });
  }

  function prepare(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("The weights list must be one { ... } object.");
    }
    var weights = raw.weights;
    if (!weights || typeof weights !== "object" || Array.isArray(weights)) {
      throw new Error("Put the words and their weights inside a \"weights\": { ... } section.");
    }
    var notes = [];
    var lemmatize = raw.lemmatize !== false;
    var useCompromise = lemmatize && hasCompromise();
    var labels = raw.labels && typeof raw.labels === "object" ? raw.labels : {};
    var minWeight = raw.minWeight == null ? 0 : Number(raw.minWeight);
    if (!isFinite(minWeight) || minWeight < 0) {
      notes.push("\"minWeight\" should be a number of 0 or more, so it was ignored.");
      minWeight = 0;
    }

    var table = Object.create(null);
    var model = {
      table: table, size: 0, longest: 1, biggest: 0, minWeight: minWeight,
      hasPositive: false, hasNegative: false,
      lemmatize: lemmatize, useCompromise: useCompromise,
      labels: {
        positive: String(labels.positive || "Positive weight"),
        negative: String(labels.negative || "Negative weight")
      },
      notes: notes
    };

    Object.keys(weights).forEach(function (entry) {
      var w = weights[entry];
      if (typeof w !== "number" || !isFinite(w)) {
        notes.push("\"" + entry + "\" was skipped: its weight needs to be a plain number, like 2.5 or -1 (no quotes).");
        return;
      }
      var words = flat(tokenize(entry, useCompromise)).map(function (t) { return t.key; });
      if (!words.length) {
        notes.push("\"" + entry + "\" was skipped: it has no letters or digits.");
        return;
      }
      var key = words.join(" ");
      if (table[key]) {
        notes.push("\"" + entry + "\" was skipped: it counts as the same entry as \"" + table[key].entry +
          "\" (both become \"" + key + "\").");
        return;
      }
      if (w === 0) notes.push("\"" + entry + "\" has weight 0, so it will never be highlighted.");
      else if (Math.abs(w) < minWeight) notes.push("\"" + entry + "\" is below minWeight, so it won't be highlighted.");
      table[key] = { entry: entry, weight: w };
      model.size++;
      model.longest = Math.max(model.longest, words.length);
      model.biggest = Math.max(model.biggest, Math.abs(w));
      if (w > 0) model.hasPositive = true;
      if (w < 0) model.hasNegative = true;
    });

    if (!model.size) throw new Error("None of the entries in \"weights\" could be used." +
      (notes.length ? " " + notes.join(" ") : ""));
    if (lemmatize && !useCompromise) {
      notes.push("The word-form library (Compromise) isn't loaded, so only exact word forms match: " +
        "\"circling\" won't count as \"circle\".");
    }
    return model;
  }

  // ---------- Matching ----------

  // Longest entries first, then left to right; a word is used by at most one
  // match, and matches never run across a sentence boundary.
  function find(text, model) {
    var matches = [];
    tokenize(text, model.useCompromise).forEach(function (words) {
      var used = [];
      for (var n = Math.min(model.longest, words.length); n >= 1; n--) {
        for (var i = 0; i + n <= words.length; i++) {
          var key = words.slice(i, i + n).map(function (t) { return t.key; }).join(" ");
          var hit = model.table[key];
          if (!hit || hit.weight === 0 || Math.abs(hit.weight) < model.minWeight) continue;
          var free = true;
          for (var j = i; j < i + n; j++) if (used[j]) free = false;
          if (!free) continue;
          for (j = i; j < i + n; j++) used[j] = true;
          var start = words[i].start, end = words[i + n - 1].end;
          matches.push({ start: start, end: end, text: text.slice(start, end), entry: hit.entry, weight: hit.weight });
        }
      }
    });
    return matches.sort(function (a, b) { return a.start - b.start; });
  }

  // ---------- Drawing ----------

  function formatWeight(w) {
    var n = String(Number(Math.abs(w).toFixed(2)));
    return (w > 0 ? "+" : w < 0 ? "−" : "") + n;
  }

  function strength(w, model) {
    return Math.min(1, Math.max(0.15, Math.abs(w) / (model.biggest || 1)));
  }

  function makeMark(match, model, showWeights) {
    var positive = match.weight > 0;
    var mark = document.createElement("mark");
    mark.className = "hl-mark " + (positive ? "hl-mark--pos" : "hl-mark--neg");
    mark.style.setProperty("--hl-strength", strength(match.weight, model).toFixed(2));
    mark.append(match.text);
    var sr = document.createElement("span");
    sr.className = "visually-hidden";
    sr.textContent = " (" + (positive ? model.labels.positive : model.labels.negative) +
      ", weight " + formatWeight(match.weight) + ")";
    mark.append(sr);
    if (showWeights) {
      var tag = document.createElement("span");
      tag.className = "hl-weight";
      tag.setAttribute("aria-hidden", "true");
      tag.textContent = formatWeight(match.weight);
      mark.append(tag);
    }
    return mark;
  }

  // Rebuilds el from text; typed text is only ever inserted as text, never as HTML.
  function render(el, text, matches, model, showWeights) {
    el.replaceChildren();
    if (!text.trim()) {
      var empty = document.createElement("span");
      empty.className = "placeholder";
      empty.textContent = "Your highlighted text will appear here.";
      el.append(empty);
      return;
    }
    var pos = 0;
    matches.forEach(function (m) {
      if (m.start > pos) el.append(text.slice(pos, m.start));
      el.append(makeMark(m, model, showWeights));
      pos = m.end;
    });
    if (pos < text.length) el.append(text.slice(pos));
  }

  function renderLegend(el, model) {
    el.replaceChildren();
    [[1, model.labels.positive, model.hasPositive], [-1, model.labels.negative, model.hasNegative]]
      .forEach(function (row) {
        if (!row[2]) return;
        var li = document.createElement("li");
        var sample = document.createElement("span");
        sample.className = "hl-mark " + (row[0] > 0 ? "hl-mark--pos" : "hl-mark--neg");
        sample.style.setProperty("--hl-strength", "1");
        sample.setAttribute("aria-hidden", "true");
        sample.textContent = "word";
        li.append(sample, row[1] + (row[0] > 0 ? " (positive weight, solid line)" : " (negative weight, dashed line)"));
        el.append(li);
      });
    var li = document.createElement("li");
    li.textContent = "Stronger colour means a bigger weight.";
    el.append(li);
  }

  function renderTable(el, matches, model) {
    el.replaceChildren();
    if (!matches.length) {
      var p = document.createElement("p");
      p.className = "placeholder";
      p.style.margin = "0";
      p.textContent = "No matches yet.";
      el.append(p);
      return;
    }
    var table = document.createElement("table");
    table.className = "dm-table hl-table";
    var head = table.createTHead().insertRow();
    ["In the text", "Entry in the list", "Leans toward", "Weight"].forEach(function (h) {
      var th = document.createElement("th");
      th.scope = "col";
      th.textContent = h;
      head.append(th);
    });
    var body = table.createTBody();
    matches.forEach(function (m) {
      var row = body.insertRow();
      [m.text.replace(/\s+/g, " "), m.entry,
        m.weight > 0 ? model.labels.positive : model.labels.negative,
        formatWeight(m.weight)].forEach(function (v) { row.insertCell().textContent = v; });
    });
    el.append(table);
  }

  function summary(text, matches, model) {
    if (!text.trim()) return "";
    if (!matches.length) return "Nothing from the word list shows up in this text yet.";
    var pos = 0, neg = 0, total = 0;
    matches.forEach(function (m) { total += m.weight; if (m.weight > 0) pos++; else neg++; });
    var parts = [];
    if (pos) parts.push(pos + " " + model.labels.positive);
    if (neg) parts.push(neg + " " + model.labels.negative);
    var count = matches.length === 1 ? "1 match" : matches.length + " matches";
    var lean = Math.abs(total) < 1e-9
      ? "gives 0, so on this simple tally the text doesn't lean either way."
      : "gives " + formatWeight(total) + ", so on this simple tally the text leans " +
        (total > 0 ? model.labels.positive : model.labels.negative) + ".";
    return count + " (" + parts.join(", ") + "). Adding up their weights " + lean;
  }

  // ---------- Wiring it to a page ----------

  function el(x) { return typeof x === "string" ? document.querySelector(x) : x || null; }

  function attach(options) {
    var o = options || {};
    var input = el(o.input), output = el(o.output);
    if (!input || !output) return Promise.reject(new Error("Highlighter.attach needs an input and an output element."));
    var legend = el(o.legend), matchesEl = el(o.matches), status = el(o.status), notice = el(o.notice);
    var statusTimer = null;

    var ctl = {
      model: null,
      matches: [],
      showWeights: !!o.showWeights,
      update: function (announceNow) {
        if (!ctl.model) return;
        var text = input.value;
        ctl.matches = find(text, ctl.model);
        render(output, text, ctl.matches, ctl.model, ctl.showWeights);
        if (matchesEl) renderTable(matchesEl, ctl.matches, ctl.model);
        if (status) {
          clearTimeout(statusTimer);
          var say = function () { status.textContent = summary(text, ctl.matches, ctl.model); };
          if (announceNow) say(); else statusTimer = setTimeout(say, 700);
        }
      },
      setText: function (text) { input.value = text; ctl.update(true); },
      setShowWeights: function (on) { ctl.showWeights = !!on; ctl.update(true); },
      // Throws (with a readable message) if the list can't be used; returns any notes.
      setWeights: function (raw) {
        ctl.model = prepare(raw);
        if (legend) renderLegend(legend, ctl.model);
        if (notice) notice.textContent = ctl.model.notes.join(" ");
        ctl.update(true);
        return ctl.model.notes;
      }
    };

    input.addEventListener("input", function () { ctl.update(false); });

    return load(o.weights).then(function (raw) {
      ctl.setWeights(raw);
      ctl.model.notes.forEach(function (n) { console.warn("Highlighter: " + n); });
      return ctl;
    }).catch(function (err) {
      var p = document.createElement("p");
      p.className = "error-text";
      p.setAttribute("role", "alert");
      p.textContent = "The highlighter couldn't start. " + err.message;
      output.replaceChildren(p);
      console.error(err);
      throw err;
    });
  }

  global.Highlighter = {
    attach: attach, load: load, prepare: prepare, find: find, render: render,
    formatWeight: formatWeight,
    // Read JSON text typed into a box, with a friendly error message.
    parse: function (text) { return parseJson(text, "the box"); }
  };
})(window);

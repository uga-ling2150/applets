/* SSML parsing for the Week 13A prosody player. No page code here, so the same file runs in the
   browser (window.SsmlCore) and in the node tests (require).

   Browser voices don't read SSML, so the parser turns a script into turns of plain-text chunks,
   each with its own rate, pitch and volume, plus pauses between them. The player then speaks
   one chunk at a time. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SsmlCore = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';

  const KNOWN = new Set(['speak', 'voice', 'p', 's', 'break', 'emphasis', 'prosody', 'say-as', 'sub', 'phoneme', 'mark']);
  const VOID = new Set(['break', 'mark']);
  const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

  // Web Speech ranges: rate 0.1-10 (1 = normal), pitch 0-2 (1 = normal), volume 0-1.
  const RATE = { 'x-slow': 0.5, slow: 0.75, medium: 1, fast: 1.3, 'x-fast': 1.7, default: 1 };
  const PITCH = { 'x-low': 0.55, low: 0.75, medium: 1, high: 1.3, 'x-high': 1.6, default: 1 };
  const VOLUME = { silent: 0, 'x-soft': 0.25, soft: 0.5, medium: 0.8, loud: 1, 'x-loud': 1, default: 1 };
  const EMPHASIS = {
    strong: { rate: 0.85, pitch: 1.3, volume: 1.15 },
    moderate: { rate: 0.92, pitch: 1.15, volume: 1.08 },
    reduced: { rate: 1.1, pitch: 0.88, volume: 0.8 },
    none: { rate: 1, pitch: 1, volume: 1 },
  };
  const BREAK = { none: 0, 'x-weak': 100, weak: 250, medium: 400, strong: 700, 'x-strong': 1000 };
  const PARAGRAPH_PAUSE = 400;
  const LIMITS = { rate: [0.3, 3], pitch: [0, 2], volume: [0, 1] };

  const clamp = (x, [lo, hi]) => Math.min(hi, Math.max(lo, x));

  function decode(text) {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e.toLowerCase()] ?? all;
    });
  }

  // A small, forgiving XML tokenizer: text, open, close and self-closing tags, with line numbers.
  function tokenize(src) {
    const tokens = [];
    const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<|[^<]+/g;
    let m;
    let line = 1;
    while ((m = re.exec(src))) {
      const raw = m[0];
      if (raw.startsWith('<!--') || raw.startsWith('<?')) {
        // comments and the XML declaration are ignored
      } else if (raw === '<') {
        tokens.push({ type: 'bad', line, raw: src.slice(m.index, m.index + 20).split('\n')[0] });
      } else if (m[2]) {
        const attrs = {};
        for (const a of m[3].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3]);
        const name = m[2].toLowerCase();
        tokens.push({ type: m[1] ? 'close' : m[4] || VOID.has(name) ? 'empty' : 'open', name, attrs, line });
      } else {
        tokens.push({ type: 'text', text: decode(raw), line });
      }
      line += (raw.match(/\n/g) || []).length;
    }
    return tokens;
  }

  // "+20%", "80%", "1.2", "+2st", "-10Hz" or a keyword, applied to the parent value.
  function scale(value, keywords, base, kind, warn, line) {
    if (value == null || value === '') return base;
    const v = value.trim().toLowerCase();
    if (v in keywords) return keywords[v] * (kind === 'volume' && v !== 'default' ? 1 : base);
    let m;
    if ((m = v.match(/^([+-])?(\d+(?:\.\d+)?)%$/))) {
      const n = parseFloat(m[2]) / 100;
      return base * (m[1] === '+' ? 1 + n : m[1] === '-' ? 1 - n : n);
    }
    if (kind === 'pitch' && (m = v.match(/^([+-]?\d+(?:\.\d+)?)st$/))) return base * Math.pow(2, parseFloat(m[1]) / 12);
    if (kind === 'pitch' && (m = v.match(/^([+-])(\d+(?:\.\d+)?)hz$/))) {
      warn(line, `pitch="${value}" is approximate here (treated as relative to a 150 Hz voice).`);
      return base * (1 + (m[1] === '-' ? -1 : 1) * parseFloat(m[2]) / 150);
    }
    if (kind === 'volume' && (m = v.match(/^([+-]?\d+(?:\.\d+)?)db$/))) return base * Math.pow(10, parseFloat(m[1]) / 20);
    if (kind === 'rate' && /^\d+(?:\.\d+)?$/.test(v)) return base * parseFloat(v);
    warn(line, `${kind}="${value}" isn't a value this player understands, so it was ignored.`);
    return base;
  }

  function breakMs(attrs, warn, line) {
    if (attrs.time) {
      const m = attrs.time.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(ms|s)$/);
      if (m) return Math.min(10000, Math.round(parseFloat(m[1]) * (m[2] === 's' ? 1000 : 1)));
      warn(line, `<break time="${attrs.time}"> needs a unit, such as "500ms" or "1s". A medium break was used.`);
    }
    if (attrs.strength) {
      const s = attrs.strength.trim().toLowerCase();
      if (s in BREAK) return BREAK[s];
      warn(line, `<break strength="${attrs.strength}"> isn't a known strength. A medium break was used.`);
    }
    return BREAK.medium;
  }

  // How say-as changes what the voice reads out.
  function sayAs(text, how, format) {
    const t = text.trim();
    switch (how) {
      case 'characters':
      case 'spell-out':
      case 'verbatim':
        return t.replace(/\s+/g, '').split('').join(' ');
      case 'telephone':
      case 'digits':
        return t.replace(/[^\d]+/g, ' ').trim().split('').join(' ').replace(/ {3}/g, ', ');
      case 'time': {
        const m = t.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
        if (!m) return t;
        const mins = m[2] === '00' ? "o'clock" : m[2][0] === '0' ? `oh ${m[2][1]}` : m[2];
        return `${parseInt(m[1], 10)} ${mins}${m[3] ? ' ' + m[3].toUpperCase().split('').join(' ') : ''}`;
      }
      case 'date': {
        const parts = t.split(/[/.-]/);
        const order = (format || 'mdy').toLowerCase().split('');
        if (parts.length !== order.length || parts.some((p) => !/^\d+$/.test(p))) return t;
        const d = Object.fromEntries(order.map((k, i) => [k, parseInt(parts[i], 10)]));
        if (!(d.m >= 1 && d.m <= 12)) return t;
        const out = [MONTHS[d.m - 1]];
        if (d.d) out.push(ordinal(d.d));
        if (d.y) out.push(String(d.y));
        return out.join(' ');
      }
      case 'ordinal':
        return /^\d+$/.test(t) ? ordinal(parseInt(t, 10)) : t;
      default:
        return t;
    }
  }

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function ordinal(n) {
    const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
    return n + s;
  }

  function parse(src) {
    const errors = [];
    const warnings = [];
    const warn = (line, msg) => {
      const text = `Line ${line}: ${msg}`;
      if (!warnings.includes(text)) warnings.push(text);
    };
    const tokens = tokenize(String(src || ''));
    const turns = [];
    const stack = [];
    let style = { rate: 1, pitch: 1, volume: 1, emphasis: null };
    let turn = null;
    let sawSpeak = false;
    let defaultTurn = null;
    // Text inside say-as / sub / phoneme is collected and replaced once the tag closes.
    let capture = null;

    const ensureTurn = () => {
      if (turn) return turn;
      if (!defaultTurn || turns[turns.length - 1] !== defaultTurn) {
        defaultTurn = { speaker: 'Speaker', items: [] };
        turns.push(defaultTurn);
      }
      return defaultTurn;
    };
    const pushText = (text) => {
      const t = ensureTurn();
      const last = t.items[t.items.length - 1];
      const s = { rate: style.rate, pitch: style.pitch, volume: style.volume, emphasis: style.emphasis };
      if (last && last.type === 'text' && last.rate === s.rate && last.pitch === s.pitch && last.volume === s.volume && last.emphasis === s.emphasis) {
        last.text += text;
      } else {
        t.items.push({ type: 'text', text, ...s });
      }
    };
    const pushBreak = (ms, kind) => {
      const t = turn || (turns.length ? turns[turns.length - 1] : null);
      if (!t) return;
      t.items.push({ type: 'break', ms, kind });
    };

    for (const tok of tokens) {
      if (errors.length) break;
      if (tok.type === 'bad') {
        errors.push(`Line ${tok.line}: "${tok.raw}" looks like a broken tag. Check the angle brackets and that every attribute value is in quotes.`);
        continue;
      }
      if (tok.type === 'text') {
        if (capture) capture.text += tok.text;
        else if (tok.text.trim() || turn) pushText(tok.text);
        continue;
      }
      if (!KNOWN.has(tok.name)) {
        if (tok.type !== 'close') warn(tok.line, `<${tok.name}> isn't one of the tags in the table, so this player ignores it (the words inside are still read).`);
        continue;
      }
      if (tok.type === 'close') {
        const frame = stack.pop();
        if (!frame || frame.name !== tok.name) {
          errors.push(!frame
            ? `Line ${tok.line}: </${tok.name}> has no matching opening tag.`
            : stack.some((f) => f.name === tok.name)
              ? `Line ${tok.line}: <${frame.name}> from line ${frame.line} must be closed with </${frame.name}> before </${tok.name}>.`
              : `Line ${tok.line}: </${tok.name}> closes a tag that isn't open. The most recent open tag is <${frame.name}> from line ${frame.line}.`);
          continue;
        }
        style = frame.saved;
        if (frame.name === 'voice') turn = null;
        if (frame.name === 'p') pushBreak(PARAGRAPH_PAUSE, 'p');
        if (frame.name === 's') pushBreak(0, 's');
        if (frame.capture) {
          const c = frame.capture;
          capture = frame.outerCapture;
          let spoken = c.text;
          if (frame.name === 'say-as') spoken = ` ${sayAs(c.text, (frame.attrs['interpret-as'] || '').toLowerCase(), frame.attrs.format)} `;
          if (frame.name === 'sub') spoken = ` ${frame.attrs.alias ?? c.text} `;
          if (capture) capture.text += spoken;
          else pushText(spoken);
        }
        continue;
      }
      const { name, attrs, line } = tok;
      if (tok.type === 'empty') {
        if (name === 'break') pushBreak(breakMs(attrs, warn, line), 'break');
        else if (name === 'mark') ensureTurn().items.push({ type: 'mark', name: attrs.name || '' });
        else warn(line, `<${name}/> is empty, so it does nothing.`);
        continue;
      }
      const frame = { name, attrs, line, saved: style };
      if (name === 'speak') {
        sawSpeak = true;
      } else if (name === 'voice') {
        if (turn) warn(line, '<voice> inside another <voice>: the inner one starts a new turn.');
        turn = { speaker: (attrs.name || attrs.gender || `Voice ${turns.length + 1}`).trim(), items: [] };
        turns.push(turn);
        style = { rate: 1, pitch: 1, volume: 1, emphasis: null };
      } else if (name === 'prosody') {
        if (attrs.contour) warn(line, 'contour isn\'t supported by browser voices, so it was ignored. Use pitch on shorter stretches instead.');
        if (attrs.range) warn(line, 'range isn\'t supported by browser voices, so it was ignored.');
        style = {
          ...style,
          rate: scale(attrs.rate, RATE, style.rate, 'rate', warn, line),
          pitch: scale(attrs.pitch, PITCH, style.pitch, 'pitch', warn, line),
          volume: scale(attrs.volume, VOLUME, style.volume, 'volume', warn, line),
        };
      } else if (name === 'emphasis') {
        const level = (attrs.level || 'moderate').toLowerCase();
        const e = EMPHASIS[level];
        if (!e) warn(line, `<emphasis level="${attrs.level}"> should be strong, moderate, reduced or none. Moderate was used.`);
        const f = e || EMPHASIS.moderate;
        style = { rate: style.rate * f.rate, pitch: style.pitch * f.pitch, volume: style.volume * f.volume, emphasis: e ? level : 'moderate' };
      } else if (name === 'say-as' || name === 'sub' || name === 'phoneme') {
        if (name === 'phoneme') warn(line, '<phoneme> pronunciations can\'t be played by browser voices, so the ordinary spelling is read instead.');
        if (name === 'sub' && attrs.alias == null) warn(line, '<sub> needs an alias="…" attribute.');
        if (name === 'say-as' && !attrs['interpret-as']) warn(line, '<say-as> needs an interpret-as="…" attribute.');
        frame.outerCapture = capture;
        frame.capture = capture = { text: '' };
      }
      stack.push(frame);
    }
    if (!errors.length && stack.length) {
      const f = stack[stack.length - 1];
      errors.push(`Line ${f.line}: <${f.name}> is never closed. Add </${f.name}> where it should end.`);
    }
    if (!errors.length && !sawSpeak && turns.length) warnings.unshift('The script should start with <speak> and end with </speak>. It was played anyway.');

    for (const t of turns) finishTurn(t);
    const kept = turns.filter((t) => t.items.some((i) => i.type === 'text'));
    return { turns: kept, errors, warnings };
  }

  // Tidy whitespace, clamp to what browser voices accept, and find likely TRPs.
  function finishTurn(t) {
    const items = [];
    for (const item of t.items) {
      if (item.type !== 'text') {
        items.push(item);
        continue;
      }
      let text = item.text.replace(/\s+/g, ' ').replace(/ ([.,?!;:])/g, '$1');
      // Punctuation straight after a stressed word belongs to that word, so it gets the
      // final intonation instead of being spoken as a chunk of its own.
      const prev = items[items.length - 1];
      const lead = text.match(/^\s*([.,?!;:"')\]]+)/);
      if (lead && prev && prev.type === 'text') {
        prev.text += lead[1];
        text = text.slice(lead[0].length);
      }
      if (!text.trim()) continue;
      items.push({
        ...item,
        text: text.trim(),
        rate: +clamp(item.rate, LIMITS.rate).toFixed(3),
        pitch: +clamp(item.pitch, LIMITS.pitch).toFixed(3),
        volume: +clamp(item.volume, LIMITS.volume).toFixed(3),
      });
    }
    t.items = items;
    t.trps = findTrps(items);
  }

  // A possible TRP follows any chunk that ends a sentence (. ? !), because the voice gives it
  // final intonation. The pause after it decides how strongly it invites the other speaker in.
  function findTrps(items) {
    const trps = [];
    const lastText = items.map((i) => i.type).lastIndexOf('text');
    items.forEach((item, i) => {
      if (item.type !== 'text' || !/[.?!]["')\]]*$/.test(item.text)) return;
      let pause = 0;
      let j = i + 1;
      for (; j < items.length && items[j].type !== 'text'; j++) if (items[j].type === 'break') pause += items[j].ms;
      trps.push({ after: i, pause, endOfTurn: i === lastText, question: /\?["')\]]*$/.test(item.text) });
    });
    return trps;
  }

  return { parse, tokenize, sayAs, findTrps, EMPHASIS, BREAK, PARAGRAPH_PAUSE };
});

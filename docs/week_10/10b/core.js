/* RoomBot: one plan, written as data. The chat engine, the flowchart, the designer's notes
   and the line-by-line transcript in applet.js all read from PLAN, so they can't drift apart. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RoomBotCore = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';

  const WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];

  const PLAN = {
    today: '2026-10-20', // a Tuesday; students only see it on the phone
    maxDaysAhead: 14,
    firstHour: 8,
    lastHour: 21,
    maxFallbacks: 3,
    rooms: [
      { name: 'Pod 1C', min: 1, max: 2, seats: 2, whiteboard: false },
      { name: 'Room 2B', min: 3, max: 4, seats: 4, whiteboard: false },
      { name: 'Room 3A', min: 5, max: 8, seats: 8, whiteboard: true }
    ],
    states: [
      { id: 'ID', label: 'Student ID', slot: 'id',
        prompt: "Hi there! 👋 I'm RoomBot. I can help you book a study room session. First, what's your student ID?",
        ask: "What's your student ID?", hint: 'Please type your 8-digit student ID, like 12345678.' },
      { id: 'DATE', label: 'Date', slot: 'date',
        prompt: 'Thanks! What date would you like the room?',
        ask: 'What date would you like the room?', hint: 'Please type a date, like 10/27 or October 27.' },
      { id: 'TIME', label: 'Time', slot: 'hour',
        prompt: 'Great! What time would you like to start?',
        ask: 'What time would you like to start?', hint: 'Please type a time, like 3pm.' },
      { id: 'SIZE', label: 'Group size', slot: 'size',
        prompt: 'And how many people will be using the room?',
        ask: 'How many people will be using the room?', hint: 'Please type a number of people, like 4.' },
      { id: 'ROOM', label: 'Room', slot: 'room', note: "say no and RoomBot picks",
        prompt: 'Got it! Do you have a particular room in mind?',
        ask: 'Do you have a particular room in mind?', hint: "Please type a room name, like Room 2B, or say no and I'll pick one for you." },
      { id: 'CONFIRM', label: 'Confirm',
        prompt: s => `Perfect! ${summary(s)}. Shall I book it?`,
        ask: s => `${summary(s)}. Shall I book it?`, hint: 'Please type yes to book it, or no to start over.' },
      { id: 'BOOKED', label: 'Booked',
        prompt: s => `🎉 You're all set! ${s.room} is booked for ${dateLabel(s.date)} at ${hourLabel(s.hour)}. Thanks for using RoomBot!` }
    ],
    // Arrows the flowchart draws besides "next step".
    edges: {
      self: "didn't catch that",
      saidNo: { from: 'CONFIRM', to: 'ID', label: 'said no (booking saved)' },
      startOver: { to: 'ID', label: 'start over / stuck 3 times (unfinished booking saved)' },
      resume: { from: 'BOOKED', label: 'back to where it stopped' }
    },
    // The hidden stack: a booking cut off by a restart is saved, and picked back up after the next booking.
    pile: { label: 'Unfinished bookings', sub: 'hidden from you' },
    words: {
      restart: ['start over', 'restart', 'start again', 'cancel'],
      help: ['help'],
      yes: ['yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'sounds good', 'correct', 'book it'],
      no: ['no', 'nope', 'not', 'wait', 'actually', 'change'],
      anyRoom: ['no', 'nope', 'nah', 'any', 'anything', 'whatever', 'either', "don'?t mind", "doesn'?t matter", 'not really']
    },
    replies: {
      restart: "No problem, let's start from the beginning! What's your student ID?",
      confirmNo: "No problem, let's start over! What's your student ID?",
      stuck: "Let's start over from the beginning! What's your student ID?",
      fallback: "Sorry, I didn't catch that.",
      past: 'Sorry, that date has already passed. What date would you like the room?',
      tooFar: 'Sorry, rooms can only be booked up to two weeks ahead. What date would you like the room?',
      outOfHours: 'Sorry, we can only book between 8am and 9pm. What time would you like to start?',
      tooBig: 'Our biggest room seats 8. How many people will be using it?',
      zero: 'A room needs at least one person! How many people will be using the room?',
      tooSmall: room => `${room.name} only seats ${room.seats}. Do you have a particular room in mind?`,
      done: "Your booking is complete! To make a new booking, just say 'start over'.",
      resume: "Now let's finish the booking you started earlier!"
    },
    neverAsks: ['Room equipment (like a whiteboard)', 'How long you need the room',
      'Changing just one answer', 'Whether you still want an unfinished booking'],
    notes: {
      'id-first': "We need to know who you are before anything else, so ID always comes first.",
      'slot-filled': 'Asking one thing at a time keeps the conversation short and simple.',
      'ignored-extra': 'People answer the question they’re asked, so we only listen for that answer.',
      'first-number': 'People usually reply with just the number we asked for, so the first number is the answer.',
      'date-only': "Day names are ambiguous (this week or next?), so we only accept exact dates.",
      'fallback': "If the bot isn't sure, it's safer to ask again than to guess.",
      'restart-stuck': "If someone's stuck, a fresh start usually helps.",
      'yes-confirm': "Anyone who says 'yes' here wants the booking.",
      'no-restart': 'Starting over is the cleanest way to fix a mistake.',
      'room-named': 'If someone already knows which room they want, we let them pick it.',
      'room-assigned': "Most people don't mind which room, so 'no' means we pick one with enough seats.",
      'no-equipment': 'Most people just need a table.',
      'fixed-slot': "One hour is the standard session, so there's no need to ask.",
      'booked-done': 'Once the booking is made, the job is done.',
      'restart-user': 'Starting over is the cleanest way to fix a mistake.',
      'restart-after-booking': 'Each booking is its own request, so a new one never touches the old one.',
      'help': 'A hint about the format is usually all people need.',
      'out-of-range': 'We can only offer what the library actually has, so we ask again.',
      'stack-push': "Nobody likes losing what they've already typed, so an unfinished booking is saved, not thrown away.",
      'stack-pop': 'Every request deserves to be finished, so we always go back to the one that was interrupted.'
    }
  };

  const stateById = id => PLAN.states.find(s => s.id === id);
  const nextOf = id => PLAN.states[PLAN.states.findIndex(s => s.id === id) + 1].id;
  const text = (v, slots) => (typeof v === 'function' ? v(slots) : v);

  // ---- Dates (ISO strings, UTC arithmetic so time zones can't shift a day) ----
  const DAY_MS = 86400000;
  const pad = n => String(n).padStart(2, '0');
  const toUtc = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const fromUtc = t => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
  function addDays(iso, n) { return fromUtc(toUtc(iso) + n * DAY_MS); }
  function dateLabel(iso) {
    const d = new Date(toUtc(iso));
    return `${WEEK[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  }
  function makeDate(y, m, d) {
    if (!m || m > 12 || !d) return null;
    const t = Date.UTC(y || Number(PLAN.today.slice(0, 4)), m - 1, d), check = new Date(t);
    return check.getUTCMonth() === m - 1 && check.getUTCDate() === d ? fromUtc(t) : null;
  }

  function roomFor(size) { return PLAN.rooms.find(r => size >= r.min && size <= r.max); }
  function roomNamed(name) { return PLAN.rooms.find(r => r.name === name); }
  function hourLabel(h) { return `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'AM' : 'PM'}`; }
  function rangeLabel(h, hours = 1) { return `${hourLabel(h)}–${hourLabel(h + hours)}`; }
  function people(n) { return `${n} ${n === 1 ? 'person' : 'people'}`; }
  function summary(s) {
    return `${s.room} for ${people(s.size)}, ${dateLabel(s.date)} at ${rangeLabel(s.hour)}`;
  }

  // ---- Parsers: word-boundary, case-insensitive; "first" = earliest position in the message ----
  const words = list => new RegExp(`\\b(${list.join('|')})\\b`, 'i');
  const RESTART_RE = words(PLAN.words.restart);
  const HELP_RE = words(PLAN.words.help);
  const YES_RE = words(PLAN.words.yes);
  const NO_RE = words(PLAN.words.no);
  const ANY_ROOM_RE = words(PLAN.words.anyRoom);
  const ROOM_RE = /\b(?:room|pod)?\s*(1c|2b|3a)\b/i;
  // Words people use instead of dates. RoomBot doesn't accept them, but notices them for the reveal.
  const DAY_RE = /\b(today|tonight|tomorrow|next week|weekend|(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?)\b/i;

  const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  const monthOf = word => MONTHS.findIndex(m => m.toLowerCase().startsWith(word.toLowerCase().slice(0, 3))) + 1;
  const yearOf = y => (y ? (y.length === 2 ? 2000 + Number(y) : Number(y)) : null);
  const DATE_FORMS = [
    { re: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, get: m => [Number(m[1]), Number(m[2]), Number(m[3])] },
    { re: /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}|\d{2}))?\b/g, get: m => [yearOf(m[3]), Number(m[1]), Number(m[2])] },
    { re: new RegExp(`\\b${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, 'gi'), get: m => [yearOf(m[3]), monthOf(m[1]), Number(m[2])] },
    { re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\b(?:,?\\s+(\\d{4}))?`, 'gi'), get: m => [yearOf(m[3]), monthOf(m[2]), Number(m[1])] }
  ];
  const ANY_DATE_RE = new RegExp([DAY_RE.source, ...DATE_FORMS.map(f => f.re.source)].join('|'), 'i');

  const MERIDIEM = '(a\\.?m\\.?|p\\.?m\\.?)';
  const DIGIT_TIME_RE = new RegExp(`\\b(\\d{1,2})(?::(\\d{2}))?\\s*${MERIDIEM}?(?![a-z0-9])`, 'gi');
  const WORD_TIME_RE = new RegExp(`\\b(noon|${NUMBER_WORDS.slice(1, 13).join('|')})\\b(?:\\s*${MERIDIEM}(?![a-z0-9]))?`, 'gi');
  const SIZE_WORD_RE = new RegExp(`\\b(${NUMBER_WORDS.slice(1).join('|')})\\b`, 'gi');

  function allMatches(re, s) { re.lastIndex = 0; return [...s.matchAll(re)]; }
  function earliest(...lists) {
    return lists.flat().sort((a, b) => a.index - b.index)[0] || null;
  }

  function toHour(n, meridiem) {
    if (meridiem) {
      if (n < 1 || n > 12) return null;
      const pm = meridiem[0].toLowerCase() === 'p';
      return pm ? (n === 12 ? 12 : n + 12) : (n === 12 ? 0 : n);
    }
    if (n >= 1 && n <= 7) return n + 12;
    if (n === 12) return 12;
    if (n > 23) return null;
    return n; // 8–11 AM, 13–21 on the 24-hour clock; 0, 22, 23 fall outside opening hours
  }

  const parse = {
    ID(s) {
      const m = /\b\d{8}\b/.exec(s);
      return m && { value: m[0], match: m, heard: `ID: ${m[0]}`, display: m[0] };
    },
    DATE(s) {
      const found = DATE_FORMS.flatMap(f => allMatches(f.re, s).map(m => Object.assign(m, { form: f })));
      const m = earliest(found);
      if (!m) return null;
      const iso = makeDate(...m.form.get(m));
      if (!iso) return null;
      const result = { value: iso, match: m, display: dateLabel(iso) };
      const ahead = (toUtc(iso) - toUtc(PLAN.today)) / DAY_MS;
      const heard = `Date: ${dateLabel(iso)}, from "${m[0].trim()}"`;
      if (ahead < 0) return Object.assign(result, { reprompt: 'past', reply: PLAN.replies.past, heard: `${heard} (already passed)` });
      if (ahead > PLAN.maxDaysAhead) return Object.assign(result, { reprompt: 'too-far', reply: PLAN.replies.tooFar, heard: `${heard} (too far ahead)` });
      return Object.assign(result, { heard });
    },
    TIME(s) {
      const found = [...allMatches(DIGIT_TIME_RE, s), ...allMatches(WORD_TIME_RE, s)];
      const m = earliest(found);
      if (!m) return null;
      const token = m[1].toLowerCase();
      let hour;
      if (token === 'noon') hour = 12;
      else {
        const n = /^\d/.test(token) ? Number(token) : NUMBER_WORDS.indexOf(token);
        hour = toHour(n, m[m.length - 1]);
      }
      if (hour === null) return null;
      const bare = /^\d+$/.test(m[0].trim());
      const from = bare ? `Number: ${m[0].trim()}` : `"${m[0].trim()}"`;
      const result = { value: hour, match: m, numbers: found.length, display: hourLabel(hour) };
      if (hour < PLAN.firstHour || hour > PLAN.lastHour) {
        return Object.assign(result, { reprompt: 'out-of-hours', reply: PLAN.replies.outOfHours,
          heard: `${from} → ${hourLabel(hour)} (outside opening hours)` });
      }
      return Object.assign(result, { heard: `${from} → ${hourLabel(hour)}` });
    },
    SIZE(s) {
      const found = [...allMatches(/\d+/g, s), ...allMatches(SIZE_WORD_RE, s)];
      const m = earliest(found);
      if (!m) return null;
      const n = /^\d/.test(m[0]) ? Number(m[0]) : NUMBER_WORDS.indexOf(m[0].toLowerCase());
      const from = /^\d/.test(m[0]) ? `Number: ${n}` : `"${m[0]}" → ${n}`;
      const result = { value: n, match: m, numbers: found.length, display: String(n) };
      if (n === 0) return Object.assign(result, { reprompt: 'zero', reply: PLAN.replies.zero, heard: `${from} (no one to book for)` });
      if (n > 8) return Object.assign(result, { reprompt: 'too-big', reply: PLAN.replies.tooBig, heard: `${from} (more than any room seats)` });
      return Object.assign(result, { heard: from });
    },
    ROOM(s, slots) {
      const m = ROOM_RE.exec(s);
      if (m) {
        const room = PLAN.rooms.find(r => r.name.toLowerCase().endsWith(m[1].toLowerCase()));
        const result = { value: room.name, match: m, display: room.name, eventType: 'room-named' };
        if (room.seats < slots.size) {
          return Object.assign(result, { reprompt: 'too-small', reply: PLAN.replies.tooSmall(room),
            heard: `Room: ${room.name} (too small for ${people(slots.size)})` });
        }
        return Object.assign(result, { heard: `Room: ${room.name}` });
      }
      const any = ANY_ROOM_RE.exec(s);
      if (!any) return null;
      const room = roomFor(slots.size);
      return { value: room.name, match: any, display: room.name, eventType: 'room-assigned',
        heard: `"${any[1].toLowerCase()}" → RoomBot picks ${room.name}` };
    }
  };

  // What else was in the message, so the reveal can show what RoomBot threw away.
  const EXTRAS = [
    { key: 'date', label: 'a day or date', re: ANY_DATE_RE },
    { key: 'time', label: 'a time', re: /\b(morning|afternoon|evening|tonight|noon|at \d+)\b|\d\s*(am|pm)\b/i },
    { key: 'size', label: 'how many people', re: /\b(of us|people|persons|friends?|just me|me and|group)\b/i },
    { key: 'room', label: 'a room', re: /\b(1c|2b|3a)\b/i },
    { key: 'equipment', label: 'equipment', re: /\b(white\s?boards?|projectors?|screens?|tv|monitors?|computers?|outlets?|markers?)\b/i },
    { key: 'length', label: 'how long', re: /\b(hours?|minutes?|mins?|how long|all day)\b/i },
    { key: 'question', label: 'your question', re: /\?/ }
  ];
  const OWN_KEY = { DATE: 'date', TIME: 'time', SIZE: 'size', ROOM: 'room' };

  function extrasIn(s, state, match) {
    const rest = match ? s.slice(0, match.index) + ' ' + s.slice(match.index + match[0].length) : s;
    return EXTRAS.filter(x => x.key !== OWN_KEY[state] && x.re.test(rest)).map(x => x.key);
  }
  function ignoredText(keys) {
    return keys.length ? ` (ignored: ${keys.map(k => EXTRAS.find(x => x.key === k).label).join(', ')})` : '';
  }

  // ---- Engine ----
  function createSession(round) {
    return { round, state: 'ID', slots: {}, fails: 0, bookings: [], log: [], stack: [] };
  }
  function opening() { return PLAN.states[0].prompt; }
  function firstOpen(slots) { return (PLAN.states.find(s => s.slot && slots[s.slot] === undefined) || stateById('CONFIRM')).id; }
  function partial(slots) {
    const value = { date: dateLabel, hour: hourLabel, size: people, room: v => v };
    return PLAN.states.filter(s => s.slot && s.slot !== 'id' && slots[s.slot] !== undefined)
      .map(s => `${s.label}: ${value[s.slot](slots[s.slot])}`).join(', ');
  }
  function currentAsk(session) { return text(stateById(session.state).ask, session.slots); }

  function handle(session, s) {
    const state = session.state;
    const restart = RESTART_RE.exec(s);
    if (restart) {
      return { heard: `"${restart[1].toLowerCase()}"`, eventType: state === 'BOOKED' ? 'restart-after-booking' : 'restart-user',
        reply: PLAN.replies.restart, next: 'ID', tag: 'restart' };
    }
    if (state === 'BOOKED') {
      return { heard: 'nothing it could use (the booking is already done)', eventType: 'booked-done',
        reply: PLAN.replies.done, next: 'BOOKED', tag: 'done' };
    }
    if (HELP_RE.test(s)) {
      const st = stateById(state);
      return { heard: '"help"', eventType: 'help', reply: `${st.hint} ${currentAsk(session)}`, next: state, tag: 'reprompt' };
    }
    if (state === 'CONFIRM') {
      const yes = YES_RE.exec(s);
      if (yes) {
        return { heard: `"${yes[1].toLowerCase()}" → book it${ignoredText(extrasIn(s, state, yes))}`,
          eventType: 'yes-confirm', next: 'BOOKED', tag: 'booked' };
      }
      const no = NO_RE.exec(s);
      if (no) {
        return { heard: `"${no[1].toLowerCase()}" → start over`, eventType: 'no-restart',
          reply: PLAN.replies.confirmNo, next: 'ID', tag: 'restart' };
      }
      return fallback(session, s);
    }
    const got = parse[state](s, session.slots);
    if (!got) return fallback(session, s);
    if (got.reprompt) {
      return { heard: got.heard, eventType: 'out-of-range', reply: got.reply, next: state, tag: 'reprompt', reason: got.reprompt };
    }
    const extras = extrasIn(s, state, got.match);
    let eventType = { ID: 'id-first', TIME: 'fixed-slot' }[state] || 'slot-filled';
    if (got.eventType) eventType = got.eventType;
    else if (got.numbers > 1) eventType = 'first-number';
    else if (extras.includes('equipment')) eventType = 'no-equipment';
    else if (extras.includes('length')) eventType = 'fixed-slot';
    else if (extras.length) eventType = 'ignored-extra';
    session.slots[stateById(state).slot] = got.value;
    return { heard: got.heard + ignoredText(extras), eventType, next: nextOf(state), tag: 'understood', display: got.display };
  }

  function fallback(session, s) {
    const extras = extrasIn(s, session.state, null);
    let eventType = 'fallback';
    if (session.state === 'ID' && extras.length) eventType = 'id-first';
    else if (session.state === 'DATE' && DAY_RE.test(s)) eventType = 'date-only';
    else if (extras.includes('equipment')) eventType = 'no-equipment';
    return { heard: 'nothing it could use', eventType, reply: `${PLAN.replies.fallback} ${currentAsk(session)}`,
      next: session.state, tag: 'fallback' };
  }

  function respond(session, raw) {
    const userText = String(raw).trim();
    const state = session.state;
    const r = handle(session, userText);
    if (r.tag === 'fallback') {
      session.fails += 1;
      if (session.fails >= PLAN.maxFallbacks) {
        Object.assign(r, { heard: `${r.heard} (${PLAN.maxFallbacks}rd time in a row)`, eventType: 'restart-stuck',
          reply: PLAN.replies.stuck, next: 'ID', tag: 'restart', stuck: true });
      }
    }
    if (r.next !== state || r.tag === 'understood' || r.tag === 'restart') session.fails = 0;
    let stack = null, hidden = null;
    if (r.next === 'ID' && r.tag === 'restart') {
      if (state !== 'BOOKED' && Object.keys(session.slots).length) {
        session.stack.push(session.slots);
        stack = 'push';
        hidden = `Saved your unfinished booking (${partial(session.slots)}) to finish later.`;
      }
      session.slots = {};
    }
    let booking = null;
    if (r.tag === 'booked') {
      const s = session.slots, room = roomNamed(s.room);
      booking = { round: session.round, id: s.id, date: s.date, hour: s.hour, size: s.size,
        room: room.name, seats: room.seats, whiteboard: room.whiteboard };
      session.bookings.push(booking);
    }
    session.state = r.next;
    let botReply = r.reply || text(stateById(r.next).prompt, session.slots);
    if (booking && session.stack.length) {
      session.slots = session.stack.pop();
      session.state = firstOpen(session.slots);
      botReply += ` ${PLAN.replies.resume} ${currentAsk(session)}`;
      stack = 'pop';
      hidden = `Picked your unfinished booking (${partial(session.slots)}) back up.`;
    }
    const entry = { round: session.round, state, userText, heard: r.heard, eventType: r.eventType, botReply,
      note: PLAN.notes[r.eventType], nextState: session.state, tag: r.tag, display: r.display || null,
      reason: r.reason || null, booking, stack, hidden, hiddenNote: stack && PLAN.notes[`stack-${stack}`] };
    session.log.push(entry);
    return entry;
  }

  // ---- Summaries built from the log ----
  function stats(log) {
    return {
      messages: log.length,
      notUnderstood: log.filter(e => e.tag === 'fallback' || e.eventType === 'restart-stuck').length,
      restarts: log.filter(e => e.tag === 'restart').length
    };
  }

  function journey(log) {
    const visits = { ID: 1 }, forward = {}, self = {}, resumedTo = {};
    let saidNo = 0, startOver = 0, saved = 0, resumed = 0;
    const path = ['Student ID'];
    for (const e of log) {
      visits[e.nextState] = (visits[e.nextState] || 0) + 1;
      const to = stateById(e.nextState).label;
      if (e.stack === 'push') saved += 1;
      if (e.stack === 'pop') {
        resumed += 1;
        resumedTo[e.nextState] = (resumedTo[e.nextState] || 0) + 1;
        visits.BOOKED = (visits.BOOKED || 0) + 1;
        forward['CONFIRM>BOOKED'] = (forward['CONFIRM>BOOKED'] || 0) + 1;
        path.push(stateById('BOOKED').label, '(back to an earlier booking)', to);
        continue;
      }
      if (e.eventType === 'no-restart') { saidNo += 1; path.push('(said no)', to); }
      else if (e.tag === 'restart') { startOver += 1; path.push(e.stuck ? '(stuck 3 times)' : '(started over)', to); }
      else if (e.nextState === e.state) {
        self[e.state] = (self[e.state] || 0) + 1;
        path.push({ fallback: '(not understood)', reprompt: '(asked again)', done: '(already booked)' }[e.tag], to);
      } else {
        const key = `${e.state}>${e.nextState}`;
        forward[key] = (forward[key] || 0) + 1;
        path.push(to);
      }
    }
    return { visits, forward, self, saidNo, startOver, saved, resumed, resumedTo, waiting: saved - resumed, path: path.join(' → ') };
  }

  // ---- What the friends asked for. A "session" is one booking, or two back-to-back bookings on one date. ----
  const roomsIn = g => [...new Set(g.map(b => b.room))];
  const seatsText = g => roomsIn(g).map(name => `${name} seats ${roomNamed(name).seats}`).join(', ');
  const boardText = g => roomsIn(g).map(name => `${name} ${roomNamed(name).whiteboard ? 'has a' : 'has no'} whiteboard`).join(', ');
  const GOALS = {
    1: ({ jackie, whiteboard }) => [
      { label: `Booked for tomorrow (${dateLabel(addDays(PLAN.today, 1))})`, test: g => g.every(b => b.date === addDays(PLAN.today, 1)),
        got: g => `RoomBot booked ${dateLabel(g[0].date)}` },
      { label: 'Two hours in a row', test: g => g.length === 2,
        got: g => (g.length === 2 ? `${rangeLabel(g[0].hour, 2)}, as two bookings` : 'only one hour booked') },
      jackie
        ? { label: 'Starts at 4:00 PM or later (once Jackie is free)', test: g => g[0].hour >= 16, got: g => `starts ${hourLabel(g[0].hour)}` }
        : { label: 'Starts in the afternoon (12:00 PM or later)', test: g => g[0].hour >= 12, got: g => `starts ${hourLabel(g[0].hour)}` },
      { label: 'Room fits all 3 of you (seats 3 or more)', test: g => g.every(b => b.seats >= 3), got: seatsText },
      whiteboard && { label: 'Room has a whiteboard', test: g => g.every(b => b.whiteboard), got: boardText }
    ].filter(Boolean),
    2: ({ date }) => [
      { label: `Booked for ${dateLabel(date)}`, test: g => g.every(b => b.date === date), got: g => `RoomBot booked ${dateLabel(g[0].date)}` },
      { label: 'Starts at 3:00 PM', test: g => g[0].hour === 15, got: g => `starts ${hourLabel(g[0].hour)}` },
      { label: 'Room fits all 6 of you (seats 6 or more)', test: g => g.every(b => b.seats >= 6), got: seatsText }
    ]
  };

  function sessionsFrom(bookings, pairs) {
    const groups = bookings.map(b => [b]);
    if (pairs) {
      for (const a of bookings) for (const b of bookings) {
        if (a.date === b.date && b.hour === a.hour + 1) groups.push([a, b]);
      }
    }
    return groups;
  }

  // opts: round 1 = { jackie, whiteboard } (which of Pat's later texts have arrived); round 2 = { date } Jordan now wants.
  function scoreGoal(round, bookings, opts = {}) {
    const goals = GOALS[round](opts);
    const score = g => goals.filter(goal => goal.test(g)).length;
    let best = null;
    for (const g of sessionsFrom(bookings, round === 1)) if (!best || score(g) >= score(best)) best = g;
    const items = goals.map(goal => ({ label: goal.label, met: !!best && goal.test(best),
      detail: best ? goal.got(best) : 'no booking made' }));
    return { group: best, items, met: items.filter(i => i.met).length, total: items.length };
  }

  // ---- Parser checks (run on load with console.assert, and by tests/10b-core.test.js) ----
  const PARSER_CASES = [
    ['ID', 'my id is 81144207', '81144207'],
    ['ID', '811 442 07', 'fallback'],
    ['DATE', '10/21', 'Wednesday, October 21'],
    ['DATE', 'Oct 21st please', 'Wednesday, October 21'],
    ['DATE', 'the 21st of October', 'Wednesday, October 21'],
    ['DATE', 'tomorrow afternoon for 4 of us', 'fallback'],
    ['DATE', 'wednesday the 21st', 'fallback'],
    ['DATE', '10/19', 'past'],
    ['DATE', 'December 1', 'too-far'],
    ['TIME', 'afternoon please', 'fallback'],
    ['TIME', '4 of us at 2', '4:00 PM'],
    ['TIME', 'for 2 hours', '2:00 PM'],
    ['TIME', '2:30pm', '2:00 PM'],
    ['TIME', '9', '9:00 AM'],
    ['TIME', '11pm', 'out-of-hours'],
    ['SIZE', 'me and three friends', '3'],
    ['SIZE', 'just me', 'fallback'],
    ['SIZE', '12', 'too-big'],
    ['ROOM', 'room 3a please', 'Room 3A'],
    ['ROOM', 'no, any is fine', 'Room 2B'],
    ['ROOM', 'one with a whiteboard', 'fallback'],
    ['ROOM', '1C', 'too-small'],
    ['CONFIRM', 'yes but does it have a whiteboard?', 'booked'],
    ['CONFIRM', 'wait', 'restart']
  ];

  function probe(state, input) {
    const session = createSession(0);
    session.state = state;
    session.slots = { id: '81144207', date: addDays(PLAN.today, 1), hour: 14, size: 4, room: 'Room 2B' };
    const e = respond(session, input);
    if (e.tag === 'understood') return e.display;
    if (e.tag === 'reprompt' && e.reason) return e.reason;
    return e.tag;
  }

  function selfTest(log) {
    let passed = 0;
    for (const [state, input, expected] of PARSER_CASES) {
      const got = probe(state, input);
      console.assert(got === expected, `RoomBot parser: ${state} "${input}" gave ${got}, expected ${expected}`);
      if (got === expected) passed += 1;
    }
    if (log) log(`RoomBot parser checks: ${passed}/${PARSER_CASES.length} passed`);
    return passed === PARSER_CASES.length;
  }

  return { PLAN, stateById, roomFor, hourLabel, rangeLabel, dateLabel, addDays, createSession, opening, respond, stats, journey,
    scoreGoal, PARSER_CASES, probe, selfTest };
});

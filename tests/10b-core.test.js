const assert = require('node:assert/strict');
const { test } = require('node:test');
const core = require('../docs/week_10/10b/core.js');

const PAT = { jackie: true, whiteboard: true };

function run(messages, round = 1) {
  const session = core.createSession(round);
  const entries = messages.map(m => core.respond(session, m));
  return { session, entries };
}

test('parser cases', () => {
  for (const [state, input, expected] of core.PARSER_CASES) {
    assert.equal(core.probe(state, input), expected, `${state} "${input}"`);
  }
});

test('bot-speak walkthrough books one hour in the chosen room', () => {
  const { session } = run(['81144207', '10/21', '4pm', '3', 'Room 3A', 'yes']);
  assert.equal(session.state, 'BOOKED');
  assert.deepEqual(session.bookings[0], { round: 1, id: '81144207', date: '2026-10-21', hour: 16, size: 3,
    room: 'Room 3A', seats: 8, whiteboard: true });
  const score = core.scoreGoal(1, session.bookings, PAT);
  assert.deepEqual(score.items.map(i => i.met), [true, false, true, true, true]);
});

test('two back-to-back bookings meet the two-hour request', () => {
  const { session } = run(['81144207', '10/21', '4pm', '4', '3A', 'yes', 'start over',
    '81144207', 'October 21', '5pm', '4', '3A', 'yes']);
  assert.equal(session.bookings.length, 2);
  const score = core.scoreGoal(1, session.bookings, PAT);
  assert.equal(score.met, 5);
  assert.equal(score.group.length, 2);
  assert.match(score.items[1].detail, /4:00 PM–6:00 PM/);
});

test('a 5pm start is fine once Jackie is free from 4', () => {
  const { session } = run(['81144207', '10/21', '5pm', '3', '3A', 'yes']);
  assert.equal(core.scoreGoal(1, session.bookings, PAT).items[2].met, true);
});

test('letting RoomBot pick a room for 3 gets one without a whiteboard', () => {
  const { session } = run(['81144207', '10/21', '4pm', '3', 'no', 'yes']);
  assert.equal(session.bookings[0].room, 'Room 2B');
  const items = core.scoreGoal(1, session.bookings, PAT).items;
  assert.equal(items[3].met, true);
  assert.equal(items[4].met, false);
});

test('requests only count once the text that made them has arrived', () => {
  const { session } = run(['81144207', '10/21', '2pm', '4', 'no', 'yes']);
  assert.equal(core.scoreGoal(1, session.bookings, {}).total, 4);
  assert.equal(core.scoreGoal(1, session.bookings, {}).items[2].met, true);
  assert.equal(core.scoreGoal(1, session.bookings, PAT).items[2].met, false);
});

test('a natural first message falls back on the ID step', () => {
  const { entries, session } = run(['Hi, I need a room tomorrow afternoon for 4 of us with a whiteboard']);
  assert.equal(entries[0].tag, 'fallback');
  assert.equal(entries[0].eventType, 'id-first');
  assert.equal(session.state, 'ID');
});

test('day names are not dates', () => {
  const { entries, session } = run(['81144207', 'tomorrow', 'wednesday']);
  assert.equal(entries[1].eventType, 'date-only');
  assert.equal(entries[2].tag, 'fallback');
  assert.equal(session.state, 'DATE');
});

test('only the current slot is kept from a message', () => {
  const { entries, session } = run(['81144207', '10/21 in the afternoon for 4 of us with a whiteboard']);
  assert.equal(session.state, 'TIME');
  assert.equal(session.slots.date, '2026-10-21');
  assert.equal(session.slots.size, undefined);
  assert.match(entries[1].heard, /ignored: a time, how many people, equipment/);
});

test('asking for a room by its features does not work', () => {
  const { entries, session } = run(['81144207', '10/21', '3pm', '4', 'the one with a whiteboard', 'Pod 1C']);
  assert.equal(entries[4].tag, 'fallback');
  assert.equal(entries[5].reason, 'too-small');
  assert.equal(session.state, 'ROOM');
});

test('three fallbacks in a row restart, and a success resets the count', () => {
  let { session } = run(['81144207', 'afternoon', 'whenever', 'soonish']);
  assert.equal(session.state, 'ID');
  assert.equal(session.log.at(-1).eventType, 'restart-stuck');
  ({ session } = run(['81144207', '10/21', 'afternoon', 'whenever', '2pm', 'just me', 'hmm']));
  assert.equal(session.state, 'SIZE');
});

test('start over after booking keeps the first booking', () => {
  const { session, entries } = run(['81144207', '10/21', '2', '3', 'no', 'yes', 'thanks!', 'start over']);
  assert.equal(entries[6].eventType, 'booked-done');
  assert.equal(entries[7].eventType, 'restart-after-booking');
  assert.equal(entries[7].stack, null);
  assert.equal(session.bookings.length, 1);
});

test('journey counts visits, loops and returns', () => {
  const { session } = run(['81144207', '10/21', 'afternoon', '2pm', '4', 'no', 'no']);
  const j = core.journey(session.log);
  assert.equal(j.visits.ID, 2);
  assert.equal(j.visits.TIME, 2);
  assert.equal(j.self.TIME, 1);
  assert.equal(j.saidNo, 1);
  assert.equal(j.path, 'Student ID → Date → Time → (not understood) → Time → Group size → Room → Confirm → (said no) → Student ID');
  assert.deepEqual(core.stats(session.log), { messages: 7, notUnderstood: 1, restarts: 1 });
});

test('round 2 scores against the date Jordan now wants', () => {
  const { session } = run(['81144207', '10/22', '3pm', '6', 'no', 'yes'], 2);
  assert.equal(core.scoreGoal(2, session.bookings, { date: '2026-10-22' }).met, 3);
  assert.equal(core.scoreGoal(2, session.bookings, { date: '2026-10-23' }).met, 2);
});

test('every event type has a designer note', () => {
  const { session } = run(['hello', 'help', '81144207', 'friday', '10/23', '11pm', 'four of us at 2', '20',
    'me and three friends', 'whiteboard one', 'any', 'sure', 'is it booked?', 'cancel']);
  for (const e of session.log) assert.ok(e.note, e.eventType);
});

test('a booking cut off by getting stuck is saved and picked back up after the next booking', () => {
  const { session, entries } = run(['81144207', '10/21', 'afternoon', 'later', 'soon',
    '81144207', '10/22', '3pm', '4', 'no', 'yes']);
  assert.equal(entries[4].stack, 'push');
  assert.equal(entries[10].stack, 'pop');
  for (const e of entries.filter(x => x.stack)) assert.ok(e.hiddenNote, e.stack);
  assert.match(entries[10].botReply, /You're all set!.*Now let's finish the booking you started earlier! What time would you like to start\?/);
  assert.equal(session.state, 'TIME');
  assert.deepEqual(session.slots, { id: '81144207', date: '2026-10-21' });
  const j = core.journey(session.log);
  assert.equal(j.resumedTo.TIME, 1);
  assert.equal(j.waiting, 0);
  assert.match(j.path, /Booked → \(back to an earlier booking\) → Time$/);
});

test('saying no at Confirm saves the whole booking, which comes back at Confirm', () => {
  const { session, entries } = run(['81144207', '10/21', '2pm', '4', 'no', 'no, change the time',
    '81144207', '10/21', '3pm', '4', 'no', 'yes']);
  assert.equal(entries[5].stack, 'push');
  assert.equal(session.state, 'CONFIRM');
  assert.match(entries[11].botReply, /Room 2B for 4 people, Wednesday, October 21 at 2:00 PM–3:00 PM\. Shall I book it\?$/);
  core.respond(session, 'sure');
  assert.equal(session.bookings.length, 2);
  assert.equal(session.state, 'BOOKED');
});

test("a time correction typed at the group-size step is read as the number of people", () => {
  const { session, entries } = run(['81144207', '10/21', '3pm', 'can we do 5pm instead?']);
  assert.equal(session.state, 'ROOM');
  assert.equal(session.slots.size, 5);
  assert.equal(session.slots.hour, 15);
  assert.match(entries[3].heard, /Number: 5/);
});

test('restarting with nothing filled in saves nothing', () => {
  const { entries } = run(['hello', 'start over']);
  assert.equal(entries[1].stack, null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseManualAttendanceDue } from '../src/utils/attendanceDue.js';

const source = readFileSync(new URL('../src/pages/Attendance.jsx', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('  const handleSetAttendanceDue ='), source.indexOf('  const handleAttendanceHistoryStatusChange ='));
function createHarness(update, refresh = async () => ({ _id: 'a', __v: 9, paymentRemainingAmount: 70 })) {
  const state = { pending: '', saving: false, input: '35', status: null, calls: [], board: [] };
  let sequence = 0;
  const context = vm.createContext({
    selectedPlayer: { _id: 'a', __v: 7, paymentRemainingAmount: 70 },
    dueAdjustmentForm: state.input,
    pendingSelectedPlayerMutationRef: { current: '' },
    parseManualAttendanceDue,
    setMessage() {},
    setIsSavingDueAdjustment(value) { state.saving = value; },
    setDueAdjustmentStatus(value) { state.status = value; },
    setDueAdjustmentForm(value) { state.input = context.dueAdjustmentForm = value; },
    beginSelectedPlayerMutation() {
      state.pending = context.pendingSelectedPlayerMutationRef.current = 'attendance-due';
      return { sequence: ++sequence, playerId: context.selectedPlayer._id };
    },
    isLatestSelectedPlayerMutation(mutation) { return mutation?.sequence === sequence; },
    isCurrentSelectedPlayerMutation(mutation) { return mutation?.sequence === sequence && mutation.playerId === context.selectedPlayer?._id; },
    finishSelectedPlayerMutation() { state.pending = context.pendingSelectedPlayerMutationRef.current = ''; },
    async updatePlayer(id, payload) { state.calls.push({ id, ...payload }); return update(id, payload); },
    getPlayer: refresh,
    mergeStablePlayerFields: (fresh, previous) => ({ ...previous, ...fresh }),
    patchExistingPlayerInAttendanceBoard(player) { state.board.push(player); },
    setSelectedPlayerIfOpen(player) { if (player._id === context.selectedPlayer?._id) context.selectedPlayer = player; }
  });
  vm.runInContext(handler + '\nglobalThis.save = handleSetAttendanceDue;', context);
  return { context, state, save: context.save };
}

test('due saves use the displayed player version and release the save lock', async () => {
  const { state, save } = createHarness(async (id, payload) => ({ _id: id, __v: 8, paymentRemainingAmount: payload.previousDueBalance }));
  let prevented = false;
  await save({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(state.calls[0].__v, 7);
  assert.equal(state.calls[0].previousDueBalance, 35);
  assert.equal(state.status.kind, 'success');
  assert.equal(state.input, '');
  assert.equal(state.pending, '');
  assert.equal(state.saving, false);
});

test('a failed due save is visible inside the card, keeps the input and can be retried', async () => {
  let fail = true;
  const { state, save } = createHarness(async () => {
    if (fail) throw new Error('Connection is offline or unstable.');
    return { _id: 'a', __v: 8, paymentRemainingAmount: 35 };
  });
  await save();
  assert.equal(state.status.kind, 'error');
  assert.match(state.status.text, /offline/);
  assert.equal(state.input, '35');
  assert.equal(state.pending, '');
  assert.equal(state.saving, false);
  fail = false;
  await save();
  assert.equal(state.status.kind, 'success');
});

test('a version conflict refreshes the card and keeps the amount for an explicit retry', async () => {
  let writes = 0;
  const { context, state, save } = createHarness(async () => {
    if (++writes === 1) throw { response: { status: 409, data: { message: 'Player changed.' } } };
    return { _id: 'a', __v: 10, paymentRemainingAmount: 35 };
  });
  await save();
  assert.equal(writes, 1, 'a conflict must never blindly retry a financial write');
  assert.equal(context.selectedPlayer.__v, 9);
  assert.equal(state.input, '35');
  assert.match(state.status.text, /press Edit due again/);
  assert.equal(state.pending, '');
  await save();
  assert.equal(state.calls[1].__v, 9);
  assert.equal(state.status.kind, 'success');
});

test('invalid amounts never write a zero balance or leave the card locked', async () => {
  const { context, state, save } = createHarness(async () => { throw new Error('Must not write'); });
  for (const input of ['', ' ', '-', 'abc', '80abc', '1.2.3']) {
    context.dueAdjustmentForm = input;
    await save();
    assert.equal(state.status.kind, 'error');
    assert.equal(state.pending, '');
    assert.equal(state.saving, false);
  }
  assert.equal(state.calls.length, 0);
});

test('a late due save cannot clear another player input or replace that player card', async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const { context, state, save } = createHarness(() => pending);
  const saving = save();
  assert.equal(state.saving, true);
  context.selectedPlayer = { _id: 'b', __v: 1 };
  state.input = context.dueAdjustmentForm = '90';
  resolve({ _id: 'a', __v: 8, paymentRemainingAmount: 35 });
  await saving;
  assert.equal(context.selectedPlayer._id, 'b');
  assert.equal(state.input, '90');
  assert.equal(state.status, null);
  assert.equal(state.board[0]._id, 'a');
  assert.equal(state.pending, '');
});

test('due entry accepts localized numbers, zero and credits without silently erasing invalid input', () => {
  for (const [input, expected] of [['80', 80], ['٠', 0], ['٨٠٫٥', 80.5], ['۸۰,۵', 80.5], ['-10', -10], ['−١٠', -10], ['.5', 0.5]]) {
    assert.equal(parseManualAttendanceDue(input), expected);
  }
  assert.throws(() => parseManualAttendanceDue('Infinity'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('both parent login entries provide an accessible password visibility toggle', () => {
  for (const file of ['../src/pages/Login.jsx', '../src/pages/ParentLogin.jsx']) {
    const source = readSource(file);
    assert.match(source, /type=\{showPassword \? 'text' : 'password'\}/);
    assert.match(source, /className=\{`login-password-toggle/);
    assert.match(source, /aria-pressed=\{showPassword\}/);
    assert.match(source, /setShowPassword\(\(current\) => !current\)/);
  }
});

test('admin modal guard intercepts outside clicks and only replays confirmed exits', () => {
  const guard = readSource('../src/components/AdminModalExitGuard.jsx');
  const app = readSource('../src/App.jsx');
  assert.match(guard, /document\.addEventListener\('click', interceptOutsideClick, true\)/);
  assert.match(guard, /modalExitConfirmed/);
  assert.match(guard, /student-modal-backdrop:not\(\.unsaved-exit-backdrop\)/);
  assert.match(app, /adminRoles\.includes\(user\?\.role\) && <AdminModalExitGuard/);
});

test('previously fixed modals now expose an outside-close action to the global guard', () => {
  const coach = readSource('../src/pages/CoachProfile.jsx');
  const player = readSource('../src/pages/PlayerProfile.jsx');
  assert.match(coach, /student-modal-backdrop[^>]+onClick=/);
  assert.match(player, /student-modal-backdrop[^>]+onClick=/);
});

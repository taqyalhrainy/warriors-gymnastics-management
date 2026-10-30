import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = readSource('../src/App.jsx');
const parentApp = readSource('../src/ParentApp.jsx');
const settings = readSource('../src/pages/ParentSettings.jsx');
const policy = readSource('../src/pages/PrivacyPolicy.jsx');
const parentBuildGuard = readSource('../scripts/parent-build-guard.mjs');

test('privacy policy is public in both application entries', () => {
  for (const source of [app, parentApp]) {
    const publicRoute = source.indexOf('path="/privacy-policy"');
    const protectedRoute = source.indexOf('<Route element={<');
    assert.ok(publicRoute >= 0);
    assert.ok(protectedRoute >= 0);
    assert.ok(publicRoute < protectedRoute);
  }
});

test('parent settings links to the public privacy policy', () => {
  assert.match(settings, /navigate\('\/privacy-policy'\)/);
  assert.match(settings, /privacyPolicy: 'سياسة الخصوصية'/);
  assert.match(settings, /privacyPolicy: 'Privacy Policy'/);
});

test('parent build allows the policy page without weakening its admin guard', () => {
  assert.match(parentBuildGuard, /'PrivacyPolicy\.jsx'/);
  assert.match(parentBuildGuard, /forbiddenModules/);
  assert.match(parentBuildGuard, /Parent build contains forbidden modules/);
});

test('policy accurately discloses verified retention, deletion, and push behavior', () => {
  assert.match(policy, /older than one year/);
  assert.match(policy, /أكثر من سنة واحدة/);
  assert.match(policy, /does not provide self-service account deletion/);
  assert.match(policy, /لا يوفر التطبيق الحالي حذف الحساب ذاتيًا/);
  assert.match(policy, /Firebase Cloud Messaging/);
  assert.match(policy, /Web Push/);
  assert.match(policy, /warriorsgymnastics99@gmail\.com/);
  assert.match(policy, /المحاربين الشجعان لتعليم الجمباز/);
  assert.match(policy, /Personal Data Protection Law No\. 24 of 2023/);
  assert.match(policy, /Virginia \(US East\), United States/);
  assert.match(policy, /Cape Town \(af-south-1\), South Africa/);
  assert.match(policy, /فرجينيا \(شرق الولايات المتحدة\)/);
  assert.match(policy, /كيب تاون \(af-south-1\)، جنوب أفريقيا/);
  assert.match(policy, /does not claim any specific transfer certification/);
  assert.doesNotMatch(policy, /TO BE CONFIRMED BEFORE PUBLICATION/);
});

// Uses a disposable database. Never loads the production .env or contacts phone providers.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  require('../utils/pushNotifications').sendPushToUser = async () => ({});
  require('../utils/nativePushNotifications').sendNativePushToUser = async () => ({});
  const mongo = await MongoMemoryServer.create();
  let server, vite, browser;
  const results = [];
  const errors = [];
  const output = process.env.AUDIT_OUTPUT || path.join(require('node:os').tmpdir(), 'warriors-browser-audit');
  fs.mkdirSync(output, { recursive: true });
  try {
    await mongoose.connect(mongo.getUri());
    const app = express();
    app.use(express.json());
    app.get('/api/health', (req, res) => res.json({ status: 'ok', database: 'connected' }));
    for (const route of ['auth', 'players', 'parents', 'groups', 'attendance', 'subscriptions', 'payments',
      'coaches', 'notifications', 'programs', 'packageOptions', 'waitingList', 'history', 'reports', 'clubMedia', 'security', 'auditLogs']) {
      app.use('/api/' + route.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase()), require('../routes/' + route));
    }
    app.use('/api', (req, res) => res.status(404).json({ message: 'Unknown audit API' }));
    app.use(require('../middleware/errorHandler'));
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const frontend = path.resolve(__dirname, '../../frontend');
    const { createServer } = await import(pathToFileURL(path.join(frontend, 'node_modules/vite/dist/node/index.js')));
    const react = require(require.resolve('@vitejs/plugin-react', { paths: [frontend] }));
    vite = await createServer({ root: frontend, configFile: false, envFile: false, plugins: [react()],
      define: { 'import.meta.env.VITE_API_URL': JSON.stringify(origin + '/api') },
      server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
    app.use(vite.middlewares);
    const User = require('../models/User');
    const Parent = require('../models/Parent');
    const Player = require('../models/Player');
    const Group = require('../models/TrainingGroup');
    const Coach = require('../models/Coach');
    const Attendance = require('../models/Attendance');
    const Subscription = require('../models/Subscription');
    const Notification = require('../models/Notification');
    const { encrypt } = require('../utils/encryption');
    const password = crypto.randomBytes(12).toString('hex');
    const passwordHash = await bcrypt.hash(password, 10);
    const [admin, parentUser] = await User.create([
      { name: 'Audit Admin', email: 'audit-admin@example.com', role: 'admin', passwordHash },
      { name: 'Audit Parent', email: 'audit-parent@example.com', role: 'parent', passwordHash }
    ]);
    const parent = await Parent.create({ name: parentUser.name, userId: parentUser._id, phoneEncrypted: encrypt('0790000000') });
    const group = await Group.create({ name: 'Audit Monday', days: ['Monday', 'Thursday'], startTime: '17:00', endTime: '18:00', maxCapacity: 40 });
    const coach = await Coach.create({ name: 'Audit Coach' });
    const player = await Player.create({ fullName: 'Audit Student', parentId: parent._id, parentPhoneEncrypted: encrypt('0790000000'),
      groupId: group._id, groupIds: [group._id], packageClasses: 8, packageName: '8 classes', payment: 100,
      startDate: '2026-09-20', currentSubscriptionStartedAt: '2026-09-01', endDate: '2027-12-31', dateOfBirth: '2015-09-30' });
    const staleSub = await Subscription.create({ playerId: player._id, type: 'sessions', totalSessions: 8, usedSessions: 8,
      remainingSessions: 0, status: 'expired', startDate: '2026-09-01', endDate: '2027-12-31' });
    player.subscriptionId = staleSub._id;
    await player.save();
    await Parent.updateOne({ _id: parent._id }, { $addToSet: { children: player._id } });
    await Attendance.create(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05',
      '2026-09-21', '2026-09-22', '2026-09-23'].map((date) => ({ playerId: player._id, groupId: group._id, date, status: 'present', markedBy: admin._id })));
    const notification = await Notification.create({ recipientUserId: parentUser._id, title: 'Audit message', message: 'Audit message body', type: 'announcement' });
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, serviceWorkers: 'block' });
    // Prevent test navigation or assets from reaching any production backend.
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      if (response.url().includes('/api/') && response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
    });
    const visit = async (route, label, screenshot = false) => {
      await page.goto(origin + route);
      await page.waitForLoadState('networkidle');
      assert.equal(new URL(page.url()).pathname, route, `Unexpected redirect: ${route}`);
      assert.ok((await page.locator('body').innerText()).length > 30, `Blank page: ${route}`);
      assert.equal(await page.locator('.data-load-status[role=alert]').count(), 0, route);
      if (screenshot) await page.screenshot({ path: path.join(output, label + '.png'), fullPage: true });
      results.push(label);
      console.log('PASS ' + label);
    };
    await visit('/', 'public-home', true);
    await visit('/admin/forgot-password', 'admin-recovery');
    await visit('/admin/login', 'admin-login');
    await page.locator('form input').first().fill(admin.email);
    await page.locator('input[type=password]').fill(password);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await page.waitForURL(origin + '/admin');
    results.push('admin-login-submit');
    if (process.env.AUDIT_PAYMENTS_ONLY === '1') {
      const Payment = require('../models/Payment');
      const { getAppDateKey } = require('../utils/appDate');
      const day = getAppDateKey();
      const old = await Payment.create({ playerNameSnapshot: 'Saved payer before 25 receipts', paidAmount: 110,
        paymentDate: `${day}T00:00:00Z`, transactionType: 'Full payment' });
      await Payment.create(Array.from({ length: 25 }, (_, i) => ({ playerNameSnapshot: `Later payer ${i}`,
        paidAmount: 20, paymentDate: `${day}T12:00:00Z` })));
      await visit('/payments', 'all-daily-payments');
      assert.equal(await page.locator('tbody tr').count(), 26);
      assert.match(await page.locator('tbody').innerText(), /Saved payer before 25 receipts/);
      await page.getByRole('button', { name: 'All Payments', exact: true }).click();
      const unlock = page.getByRole('dialog', { name: 'Unlock payment data' });
      await unlock.locator('input[type=password]').fill('1234');
      await unlock.getByRole('button', { name: 'Unlock', exact: true }).click();
      await unlock.waitFor({ state: 'hidden' });
      await page.waitForLoadState('networkidle');
      assert.equal(Number(await page.locator('.payment-metrics > div').first().locator('strong').innerText()), 610);
      const search = page.locator('.payment-search input');
      await search.fill('Saved payer before 25 receipts');
      await page.waitForResponse((response) => response.url().includes('/api/payments?') && response.url().includes('search='));
      await page.waitForLoadState('networkidle');
      assert.equal(await page.locator('tbody tr').count(), 1);
      assert.match(await page.locator('tbody').innerText(), /Saved payer before 25 receipts/);
      await page.locator('.payment-entry-grid select').first().selectOption('custom');
      await page.getByPlaceholder('Write member name...').fill('Saved financial receipt');
      await page.locator('.payment-entry-grid label').filter({ hasText: 'Paid Amount' }).locator('input').fill('75');
      const saved = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/payments'));
      await page.locator('.payment-entry-panel button[type=submit]').click();
      const receipt = await (await saved).json();
      await page.getByRole('status').filter({ hasText: 'Payment saved - Saved financial receipt' }).waitFor();
      await page.waitForLoadState('networkidle');
      assert.equal(await page.locator('tbody tr').count(), 27);
      assert.match(await page.locator('tbody').innerText(), /Saved financial receipt/);
      await page.reload();
      await page.waitForLoadState('networkidle');
      assert.equal(await page.locator('tbody tr').count(), 27);
      assert.equal((await Payment.findById(receipt._id)).paidAmount, 75);
      assert.equal((await Payment.findById(old._id)).paidAmount, 110);
      await page.screenshot({ path: path.join(output, 'payment-receipts-after-refresh.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: path.join(output, 'payment-receipts-mobile.png'), fullPage: true });
      assert.deepEqual(errors, [], 'Browser/API errors');
      console.log('Payment persistence browser checks passed: daily receipts, global search, totals, save and reload.');
      return;
    }
    if (process.env.AUDIT_REMAINING_ONLY === '1') {
      const token = require('jsonwebtoken').sign({ id: String(admin._id) }, process.env.JWT_SECRET);
      const update = async (route, body, method = 'PUT') => {
        const response = await fetch(origin + '/api' + route, { method,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        assert.ok(response.ok, await response.text());
      };
      const checkRemaining = async (amount, label) => {
        await visit('/payments', label);
        await page.getByRole('button', { name: 'Pending Amounts', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Unlock payment data' });
        await dialog.locator('input[type=password]').fill('1234');
        await dialog.getByRole('button', { name: 'Unlock', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        await page.waitForLoadState('networkidle');
        assert.equal(Number(await page.locator('.payment-metrics > div').nth(1).locator('strong').innerText()), amount);
        await page.screenshot({ path: path.join(output, label + '.png'), fullPage: true });
      };
      await Player.updateOne({ _id: player._id }, { $set: { preservedRemainingBalance: 110 } });
      await checkRemaining(0, 'remaining-legacy-automatic-zero');
      await update('/payments', { playerId: String(player._id), paidAmount: 20, paymentMethod: 'Cash' }, 'POST');
      await update(`/players/${player._id}`, { payment: 999, newSubscription: true, startDate: '2026-10-04' });
      await checkRemaining(0, 'remaining-after-payment-renewal-zero');
      await update(`/players/${player._id}`, { previousDueBalance: 70, dueAdjustment: 0 });
      await update('/payments', { playerId: String(player._id), paidAmount: 50, paymentMethod: 'Cash' }, 'POST');
      await checkRemaining(70, 'remaining-manual-seventy');
      await page.setViewportSize({ width: 390, height: 844 });
      await checkRemaining(70, 'remaining-mobile-seventy');
      await update(`/players/${player._id}`, { previousDueBalance: 0, dueAdjustment: 0 });
      await update(`/players/${player._id}`, { payment: 200, note: 'Unrelated edit' });
      await checkRemaining(0, 'remaining-manual-zero-persists');
      await update(`/coaches/${coach._id}/attendance`, { action: 'arrived', date: '2026-09-20' }, 'POST');
      await update(`/coaches/${coach._id}/attendance`, { action: 'note', date: '2026-09-21', dayNote: 'Other day' }, 'POST');
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
        await visit(`/coaches/${coach._id}`, `coach-note-${width}`);
        await page.getByRole('button', { name: 'Edit day note 9/20/2026', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel('Day note', { exact: true }).fill(`Past day note ${width}`);
        await page.screenshot({ path: path.join(output, `coach-note-editor-${width}.png`), fullPage: true });
        await dialog.getByRole('button', { name: 'Save note', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        await page.reload();
        await page.waitForLoadState('networkidle');
        const row = page.locator('.coach-history-row').filter({ hasText: '9/20/2026' });
        assert.match(await row.innerText(), new RegExp(`Past day note ${width}`));
        assert.match(await row.innerText(), /Present/);
        assert.match(await page.locator('.coach-history-row').filter({ hasText: '9/21/2026' }).innerText(), /Other day/);
        await page.screenshot({ path: path.join(output, `coach-note-saved-${width}.png`), fullPage: true });
      }
      await page.setViewportSize({ width: 1440, height: 960 });
      await visit('/attendance', 'player-level-admin');
      await page.locator('.attendance-player-main').filter({ hasText: player.fullName }).first().click();
      await page.getByRole('button', { name: 'Level', exact: true }).click();
      const levelDialog = page.getByRole('dialog', { name: 'Level' });
      const expectedLevels = { Beam: 'Level 3', Vault: '8.5', Floor: 'Working handspring', Bars: 'Silver' };
      for (const [label, value] of Object.entries(expectedLevels)) await levelDialog.getByLabel(label, { exact: true }).fill(value);
      await page.screenshot({ path: path.join(output, 'player-level-admin-editor.png'), fullPage: true });
      await levelDialog.getByRole('button', { name: 'Save', exact: true }).click();
      await levelDialog.waitFor({ state: 'hidden' });
      assert.deepEqual((await Player.findById(player._id)).skillLevels.toObject(), {
        beam: expectedLevels.Beam, vault: expectedLevels.Vault, floor: expectedLevels.Floor, bars: expectedLevels.Bars
      });
      await page.locator('.student-modal').filter({ hasText: player.fullName }).getByRole('button', { name: 'Close', exact: true }).click();
      await page.getByRole('button', { name: 'Logout', exact: true }).click();
      await visit('/parent/login', 'player-level-parent-login');
      await page.locator('form input').first().fill(parentUser.name);
      await page.locator('input[type=password]').fill(password);
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await page.waitForURL(origin + '/parent');
      await page.setViewportSize({ width: 390, height: 844 });
      await visit('/parent/children', 'player-level-parent-children');
      await page.locator('.parent-child-summary-card').filter({ hasText: player.fullName }).click();
      await page.getByRole('button', { name: 'Level', exact: true }).click();
      const levelPanel = page.locator('.parent-level-grid');
      for (const value of Object.values(expectedLevels)) assert.match(await levelPanel.innerText(), new RegExp(value));
      await page.screenshot({ path: path.join(output, 'player-level-parent-mobile.png'), fullPage: true });
      assert.deepEqual(errors, [], 'Browser/API errors');
      console.log(`Targeted browser audit passed; artifacts: ${output}`);
      return;
    }
    for (const route of ['/admin', '/players', '/players/new', `/players/${player._id}`, `/players/${player._id}/edit`, '/parents', '/groups', '/attendance', '/coaches', `/coaches/${coach._id}`, '/payments', '/notifications', '/reports', '/history', '/security', '/owner-summary', '/media-gallery']) {
      await visit(route, 'admin-' + route.replace(/\//g, '_'), ['/admin', '/attendance', '/reports'].includes(route));
    }
    await visit('/attendance', 'attendance-counter-before');
    assert.match(await page.locator('body').innerText(), /3\/8/);
    await page.locator('.attendance-player-main').first().click();
    await page.waitForLoadState('networkidle');
    assert.match(await page.locator('.attendance-player-main').first().innerText(), /3\/8/);
    assert.doesNotMatch(await page.locator('.attendance-player-main').first().innerText(), /Expired/);
    await page.screenshot({ path: path.join(output, 'attendance-player-modal.png'), fullPage: true });
    await page.reload();
    await page.waitForLoadState('networkidle');
    assert.match(await page.locator('body').innerText(), /3\/8/);
    results.push('attendance-counter-after-refresh');
    await page.getByRole('button', { name: 'Logout', exact: true }).click();
    await visit('/parent/login', 'parent-login');
    await page.locator('form input').first().fill(parentUser.name);
    await page.locator('input[type=password]').fill(password);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await page.waitForURL(origin + '/parent');
    results.push('parent-login-submit');
    const parentRoutes = ['/parent', '/parent/children', '/parent/attendance', '/parent/payments', '/parent/subscriptions', '/parent/notifications', `/parent/notifications/${notification._id}`, '/parent/settings'];
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
      for (const route of parentRoutes) await visit(route, `parent-${width}-` + route.replace(/\//g, '_'), true);
    }
    assert.deepEqual(errors, [], 'Browser/API errors');
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ passed: results.length, results, errors }, null, 2));
    console.log(`Browser audit: ${results.length} checks passed; artifacts: ${output}`);
  } finally {
    if (browser) await browser.close();
    if (vite) await vite.close();
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    await mongoose.disconnect();
    await mongo.stop();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

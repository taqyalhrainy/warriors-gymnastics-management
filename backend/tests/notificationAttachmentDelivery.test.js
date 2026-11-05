const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const loadDelivery = ({ failInsert = false } = {}) => {
  const inserted = [];
  const deleted = [];
  let attachmentCreates = 0;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../utils/notificationDelivery.js'), 'utf8'), {
    module,
    console: { error() {} },
    require: (name) => {
      if (name === '../models/Notification') return {
        create: async (data) => ({ ...data, _id: 'single-note' }),
        insertMany: async (items) => {
          if (failInsert) throw new Error('insert failed');
          inserted.push(...items);
          return items.map((item, index) => ({ ...item, _id: `note-${index}` }));
        }
      };
      if (name === '../models/NativePushToken') return { exists: async () => null };
      if (name === './pushNotifications') return { sendPushToUser: async () => undefined };
      if (name === './nativePushNotifications') return { sendNativePushToUser: async () => undefined };
      if (name === './notificationAttachments') return {
        createNotificationAttachment: async () => {
          attachmentCreates += 1;
          return { _id: 'shared-attachment' };
        },
        deleteNotificationAttachment: async (id) => deleted.push(id)
      };
      throw new Error(name);
    }
  });
  return { delivery: module.exports, inserted, deleted, getAttachmentCreates: () => attachmentCreates };
};

test('one broadcast stores one attachment reference shared by every recipient', async () => {
  const context = loadDelivery();
  await context.delivery.createNotifications([
    { recipientUserId: 'parent-1', title: 'Photo', message: 'First' },
    { recipientUserId: 'parent-2', title: 'Photo', message: 'Second' }
  ], { attachment: { dataUrl: 'test' }, createdBy: 'admin' });

  assert.equal(context.getAttachmentCreates(), 1);
  assert.equal(context.inserted.length, 2);
  assert.deepEqual(context.inserted.map((item) => item.attachmentId), ['shared-attachment', 'shared-attachment']);
});

test('failed notification persistence removes the newly stored attachment', async () => {
  const context = loadDelivery({ failInsert: true });
  await assert.rejects(
    context.delivery.createNotifications([{ recipientUserId: 'parent', title: 'Photo', message: 'Body' }], {
      attachment: { dataUrl: 'test' },
      createdBy: 'admin'
    }),
    /insert failed/
  );
  assert.deepEqual(context.deleted, ['shared-attachment']);
});

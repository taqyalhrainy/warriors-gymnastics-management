const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// Load only the parent router, as on the first parent request after deployment.
require('../routes/parents');

test('parent population works without first visiting an admin route', async () => {
  const Player = mongoose.model('Player');
  const fields = ['programId', 'groupId', 'groupIds', 'coachId', 'subscriptionId'];
  for (const field of fields) {
    const schemaPath = Player.schema.path(field);
    const modelName = schemaPath.options.ref || schemaPath.caster.options.ref;
    const Model = mongoose.model(modelName);
    const originalFind = Model.find;
    const id = new mongoose.Types.ObjectId();
    const related = new Model({ _id: id });
    Model.find = () => ({ exec: async () => [related] });
    try {
      const player = { [field]: field === 'groupIds' ? [id] : id };
      await Player.populate(player, { path: field });
      const populated = field === 'groupIds' ? player[field][0] : player[field];
      assert.equal(populated.constructor.modelName, modelName);
      assert.equal(String(populated._id), String(id));
    } finally {
      Model.find = originalFind;
    }
  }
});

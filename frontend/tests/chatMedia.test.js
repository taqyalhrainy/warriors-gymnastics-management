import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './moduleHarness.js';

const setup = async (getUserMedia) => {
  let instance, tick, clearCount = 0;
  class Recorder {
    static isTypeSupported(type) { return type.startsWith('audio/webm'); }
    constructor() { instance = this; this.state = 'inactive'; this.mimeType = 'audio/webm'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob(['audio']) }); this.onstop(); }
  }
  const api = await load('../src/utils/chatMedia.js', { './imageUpload.js': { compressProfileImage: async () => 'data:image/jpeg;base64,YQ==' } }, {
    navigator: { mediaDevices: { getUserMedia } }, MediaRecorder: Recorder, Blob, Date, Error, Promise,
    setInterval: (callback) => { tick = callback; return 1; }, clearInterval: () => { clearCount++; }
  });
  return { api, get instance() { return instance; }, get tick() { return tick; }, get clearCount() { return clearCount; } };
};

test('voice recording releases the microphone and yields a reviewable clip only on finish', async () => {
  let stopped = 0, completed = 0;
  const env = await setup(async () => ({ getTracks: () => [{ stop() { stopped++; } }] }));
  const recording = await env.api.createVoiceRecording({ onTime() {}, onComplete(blob) { assert.equal(blob.type, 'audio/webm'); completed++; }, onError: assert.fail });
  assert.equal(completed, 0);
  recording.stop();
  assert.equal(completed, 1);
  assert.ok(stopped > 0);
  assert.ok(env.clearCount > 0);
});

test('cancelling or leaving never sends a clip and stops the microphone', async () => {
  let stopped = 0;
  const env = await setup(async () => ({ getTracks: () => [{ stop() { stopped++; } }] }));
  const abort = new AbortController();
  await env.api.createVoiceRecording({ signal: abort.signal, onTime() {}, onComplete: assert.fail, onError: assert.fail });
  abort.abort();
  assert.equal(env.instance.state, 'inactive');
  assert.ok(stopped > 0);
});

test('a permission dialog resolving after unmount immediately releases the stream', async () => {
  let resolve, stopped = 0;
  const env = await setup(() => new Promise((done) => { resolve = done; }));
  const abort = new AbortController();
  const pending = env.api.createVoiceRecording({ signal: abort.signal, onTime: assert.fail, onComplete: assert.fail, onError: assert.fail });
  abort.abort();
  resolve({ getTracks: () => [{ stop() { stopped++; } }] });
  assert.equal(await pending, null);
  assert.equal(stopped, 1);
  assert.equal(env.instance, undefined);
});

test('gallery validation rejects oversized and unsupported files before reading them', async () => {
  const env = await setup(() => assert.fail());
  for (const file of [{ type: 'text/html', size: 20 }, { type: 'video/mp4', size: 4 * 1024 * 1024 }, { type: 'audio/midi', size: 20 }]) {
    await assert.rejects(env.api.prepareChatMedia(file));
  }
});

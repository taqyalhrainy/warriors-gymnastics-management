import { compressProfileImage } from './imageUpload.js';

export const MAX_CHAT_MEDIA_BYTES = 3 * 1024 * 1024;
export const MAX_VOICE_SECONDS = 120;

export const blobDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('read'));
  reader.readAsDataURL(blob);
});

export const prepareChatMedia = async (file) => {
  const originalType = String(file?.type || '').split(';')[0].toLowerCase();
  const mimeType = ({ 'audio/x-m4a': 'audio/mp4', 'audio/m4a': 'audio/mp4', 'audio/x-aac': 'audio/aac', 'video/x-m4v': 'video/mp4' })[originalType] || originalType;
  if (!/^(image|audio|video)\//.test(mimeType)) throw new Error('format');
  if (!file.size || file.size > (mimeType.startsWith('image/') ? 20 * 1024 * 1024 : MAX_CHAT_MEDIA_BYTES)) throw new Error('size');
  if (mimeType.startsWith('image/')) {
    const dataUrl = await compressProfileImage(file, { maxSide: 1600, quality: 0.82 });
    if (dataUrl.length > Math.ceil(1250 * 1024 * 4 / 3) + 100) throw new Error('size');
    return { dataUrl, mimeType: 'image/jpeg', kind: 'image', fileName: (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg' };
  }
  const supported = /^(?:audio\/(?:webm|mp4|ogg|mpeg|wav|x-wav|aac)|video\/(?:mp4|webm|quicktime))$/;
  if (!supported.test(mimeType)) throw new Error('format');
  const dataUrl = (await blobDataUrl(file)).replace(/^data:[^,]*,/, `data:${mimeType};base64,`);
  return { dataUrl, mimeType, kind: mimeType.split('/')[0], fileName: file.name || 'voice-message' };
};

// Only a user click starts this. Cancelling/unmounting also stops a microphone
// permission request that resolves after the screen has already closed.
export const createVoiceRecording = async ({ signal, onTime, onComplete, onError }) => {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('microphone');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const stopTracks = () => stream.getTracks().forEach((track) => track.stop());
  if (signal?.aborted) { stopTracks(); return null; }
  let recorder;
  try {
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((type) => MediaRecorder.isTypeSupported(type));
    recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64000 });
  } catch (error) { stopTracks(); throw error; }
  const chunks = [];
  let cancelled = false, timer, bytes = 0;
  const cleanup = () => { clearInterval(timer); stopTracks(); signal?.removeEventListener('abort', cancel); };
  const stop = () => { if (recorder.state !== 'inactive') recorder.stop(); cleanup(); };
  const cancel = () => { cancelled = true; stop(); };
  recorder.ondataavailable = (event) => {
    if (event.data.size) { chunks.push(event.data); bytes += event.data.size; }
    if (bytes > MAX_CHAT_MEDIA_BYTES) { cancel(); onError(new Error('size')); }
  };
  recorder.onerror = () => { cancel(); onError(new Error('microphone')); };
  recorder.onstop = () => {
    cleanup();
    if (!cancelled) {
      const blob = new Blob(chunks, { type: recorder.mimeType });
      if (blob.size && blob.size <= MAX_CHAT_MEDIA_BYTES) onComplete(blob);
      else onError(new Error('read'));
    }
  };
  signal?.addEventListener('abort', cancel, { once: true });
  try { recorder.start(1000); } catch (error) { cleanup(); throw error; }
  const startedAt = Date.now();
  timer = setInterval(() => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    onTime(seconds);
    if (seconds >= MAX_VOICE_SECONDS) stop();
  }, 250);
  return { stop, cancel };
};

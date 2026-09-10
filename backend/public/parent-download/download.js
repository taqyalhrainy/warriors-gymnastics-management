const button = document.getElementById('download');
const cancel = document.getElementById('cancel');
const progress = document.getElementById('progress');
const amount = document.getElementById('amount');
const status = document.getElementById('status');
const transfer = document.getElementById('transfer');
const installation = document.getElementById('installation');
const save = document.getElementById('save');
let controller;
let objectUrl;

button.addEventListener('click', async () => {
  if (controller) return;
  controller = new AbortController();
  button.disabled = true;
  cancel.hidden = false;
  transfer.hidden = false;
  installation.hidden = true;
  save.hidden = true;
  progress.removeAttribute('value');
  amount.textContent = 'Connecting...';
  status.textContent = 'Downloading the APK to this page. Keep this page open.';
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  const timeout = setTimeout(() => controller?.abort(), 120000);

  try {
    const response = await fetch('/downloads/Warriors-Parent-2.0.apk', { signal: controller.signal, cache: 'no-store' });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/vnd.android.package-archive')) {
      throw new Error('Download unavailable');
    }
    const total = Number(response.headers.get('content-length'));
    let blob;
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const chunks = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        const size = `${(received / 1048576).toFixed(1)} MB`;
        if (total > 0) {
          progress.value = Math.min(100, received / total * 100);
          amount.textContent = `${Math.floor(progress.value)}% - ${size}`;
        } else {
          amount.textContent = size;
        }
      }
      if (!received || (total > 0 && received !== total)) throw new Error('Incomplete download');
      blob = new Blob(chunks, { type: 'application/vnd.android.package-archive' });
    } else {
      blob = await response.blob();
      if (!blob.size) throw new Error('Empty download');
    }
    objectUrl = URL.createObjectURL(blob);
    save.href = objectUrl;
    save.hidden = false;
    progress.value = 100;
    amount.textContent = '100%';
    installation.hidden = false;
    status.textContent = 'File ready. Finish saving it in Chrome, then open it to install. If saving did not start, tap Save APK file.';
    // Chrome controls the save confirmation and Android controls installation.
    save.click();
  } catch (error) {
    status.textContent = error.name === 'AbortError'
      ? 'Download stopped. Tap Download app to try again.'
      : 'Download failed. Please retry or use Direct download.';
    amount.textContent = 'Not completed';
  } finally {
    clearTimeout(timeout);
    controller = null;
    button.disabled = false;
    cancel.hidden = true;
  }
});
cancel.addEventListener('click', () => controller?.abort());
window.addEventListener('pagehide', () => {
  controller?.abort();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
});

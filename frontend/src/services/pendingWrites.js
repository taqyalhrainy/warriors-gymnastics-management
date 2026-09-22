let pendingWrites = 0;
const warnBeforeUnload = (event) => {
  event.preventDefault();
  event.returnValue = '';
};

export const beginWrite = (config) => {
  if (config.__pendingWrite) return;
  config.__pendingWrite = true;
  if (pendingWrites++ === 0 && typeof window !== 'undefined') {
    window.addEventListener('beforeunload', warnBeforeUnload);
  }
};

export const finishWrite = (config) => {
  if (!config?.__pendingWrite) return;
  delete config.__pendingWrite;
  if (--pendingWrites === 0 && typeof window !== 'undefined') {
    window.removeEventListener('beforeunload', warnBeforeUnload);
  }
};

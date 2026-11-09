import { normalizeDigits } from './numberInput.js';

export const parseManualAttendanceDue = (value) => {
  const normalized = normalizeDigits(value).trim()
    .replace(/\u2212/g, '-')
    .replace(/[\u066b,]/g, '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    throw new Error('Enter a valid due amount, 0 to clear it, or a negative amount for credit.');
  }
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) throw new Error('Enter a valid due amount.');
  return amount;
};

export const normalizeDigits = (value) => String(value ?? '')
  .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632))
  .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776));

export const parseLocalizedNumber = (value) => {
  const normalized = normalizeDigits(value).replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

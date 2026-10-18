const { normalizeDigits } = require('./numberInput');

const INVISIBLE_FORMATTING = /[\u061c\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/gu;
const ARABIC_DIACRITICS = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/gu;

const normalizeUnicode = (value) => String(value ?? '')
  .normalize('NFKC')
  .replace(INVISIBLE_FORMATTING, '');

const normalizeParentLoginName = (value) => normalizeDigits(normalizeUnicode(value))
  .replace(ARABIC_DIACRITICS, '')
  .replace(/\s+/gu, ' ')
  .trim()
  .toLocaleLowerCase('en-US');

const normalizeParentPassword = (value) => normalizeDigits(normalizeUnicode(value));

const localizeDigits = (value, zeroCodePoint) => String(value).replace(/[0-9]/g,
  (digit) => String.fromCharCode(zeroCodePoint + Number(digit)));

const getParentPasswordCandidates = (value) => {
  const exact = String(value ?? '');
  const normalized = normalizeParentPassword(exact);
  return [...new Set([
    exact,
    normalized,
    localizeDigits(normalized, 0x0660),
    localizeDigits(normalized, 0x06f0)
  ])].filter(Boolean);
};

module.exports = {
  getParentPasswordCandidates,
  normalizeParentLoginName,
  normalizeParentPassword
};

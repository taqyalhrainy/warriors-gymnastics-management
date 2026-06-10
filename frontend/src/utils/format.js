export const formatCurrency = (value) => {
  const number = Number(value);
  if (Number.isNaN(number)) return '0 د.أ';
  return `${number.toFixed(2)} د.أ`;
};

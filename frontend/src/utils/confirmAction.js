export const confirmAction = (actionDescription = 'this action') => {
  const confirmFirst = window.confirm(`هل أنت متأكد أنك تريد ${actionDescription}?`);
  if (!confirmFirst) return false;
  return window.confirm('لا يمكن الرجوع عن هاي العملية. هل أنت متأكد؟');
};

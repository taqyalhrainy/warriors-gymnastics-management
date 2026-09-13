import { useLanguage } from '../context/LanguageContext.jsx';

const DataStatus = ({ state, retry }) => {
  const { language } = useLanguage();
  if (!state?.loading && !state?.error) return null;
  const ar = language === 'ar';
  return (
    <span className="data-load-status" role={state.error ? 'alert' : 'status'} aria-live="polite">
      {state.loading && <span className="loading-spinner" aria-hidden="true" />}
      <span>{state.error
        ? (ar ? '\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a. \u062d\u0627\u0648\u0644 \u0645\u062c\u062f\u062f\u0627\u064b.' : 'Unable to load data. Please try again.')
        : (ar ? '\u062c\u0627\u0631\u064d \u0627\u0644\u062a\u062d\u0645\u064a\u0644...' : 'Loading...')}</span>
      {state.error && retry && <button type="button" className="btn-secondary" onClick={retry}>{ar ? '\u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629' : 'Retry'}</button>}
    </span>
  );
};
export default DataStatus;

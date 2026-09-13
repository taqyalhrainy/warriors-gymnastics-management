import { useCallback, useEffect, useRef, useState } from 'react';

export const useSectionLoader = (keys = []) => {
  const [states, setStates] = useState(() => Object.fromEntries(keys.map((key) => [key, { loading: true, error: '', ready: false }])));
  const versions = useRef({});
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; versions.current = {}; };
  }, []);
  const load = useCallback(async (key, request, publish) => {
    const version = Symbol(key);
    versions.current[key] = version;
    const isCurrent = () => mounted.current && versions.current[key] === version;
    setStates((current) => ({ ...current, [key]: { ...current[key], loading: true, error: '' } }));
    try {
      const value = await request();
      if (!isCurrent()) return;
      publish(value);
      setStates((current) => ({ ...current, [key]: { loading: false, error: '', ready: true } }));
      return value;
    } catch (error) {
      if (!isCurrent()) return;
      setStates((current) => ({ ...current, [key]: { ...current[key], loading: false, error: 'Unable to load data. Please try again.' } }));
    }
  }, []);
  return { states, load };
};

export const canShowEmpty = (state) => Boolean(state?.ready && !state.loading && !state.error);

export const isSectionBlocking = (state) => Boolean(!state?.ready && (state?.loading || state?.error));

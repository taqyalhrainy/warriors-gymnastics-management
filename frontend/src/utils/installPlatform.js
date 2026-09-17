export const getInstallPlatform = (nav, standalone = false) => {
  const ua = nav.userAgent || '';
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  const isAndroid = !isIOS && (/android/i.test(ua) || nav.userAgentData?.platform === 'Android'
    || (/linux/i.test(nav.platform || '') && nav.maxTouchPoints > 0));
  return {
    isIOS, isAndroid, isStandalone: standalone,
    isMobile: isIOS || isAndroid || Boolean(nav.userAgentData?.mobile) || nav.maxTouchPoints > 0,
    isSafari: /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua)
  };
};

export const withInstallTimeout = (promise, milliseconds = 8000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Install preparation timed out')), milliseconds);
  Promise.resolve(promise).then(resolve, reject).finally(() => clearTimeout(timer));
});

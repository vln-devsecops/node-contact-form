import { useCallback } from 'react';

interface Grecaptcha {
  ready: (callback: () => void) => void;
  execute: (siteKey: string, options: { action: string }) => Promise<string>;
}

declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
  }
}

const SCRIPT_ID = 'vln-contact-form-recaptcha-v3';

function loadScript(siteKey: string): Promise<void> {
  if (window.grecaptcha) {
    return Promise.resolve();
  }

  const existing = document.getElementById(SCRIPT_ID);
  if (existing) {
    return new Promise((resolve) => existing.addEventListener('load', () => resolve(), { once: true }));
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    // Classic reCAPTCHA v3, not Enterprise, to match the backend's
    // siteverify-based verification (see @vln-devsecops/contact-form-lambda).
    script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load the reCAPTCHA script'));
    document.head.appendChild(script);
  });
}

export interface UseRecaptchaResult {
  execute: (action: string) => Promise<string | undefined>;
}

// A failed or blocked reCAPTCHA load (ad blocker, network hiccup, offline)
// must never prevent a submission -- the backend already treats a missing
// token as a spam-box entry rather than a rejection (see
// node-contact-form's design notes), so the safest behavior here is to
// resolve with undefined rather than reject and block the caller's submit
// flow over something outside the visitor's control.
export function useRecaptcha(siteKey: string): UseRecaptchaResult {
  const execute = useCallback(
    async (action: string): Promise<string | undefined> => {
      try {
        await loadScript(siteKey);
        return await new Promise<string>((resolve, reject) => {
          const grecaptcha = window.grecaptcha;
          if (!grecaptcha) {
            reject(new Error('grecaptcha did not load'));
            return;
          }
          grecaptcha.ready(() => {
            grecaptcha.execute(siteKey, { action }).then(resolve, reject);
          });
        });
      } catch {
        return undefined;
      }
    },
    [siteKey]
  );

  return { execute };
}

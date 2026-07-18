import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRecaptcha } from './useRecaptcha';

function getInjectedScript(): HTMLScriptElement | null {
  return document.querySelector<HTMLScriptElement>('script[src*="recaptcha/api.js"]');
}

afterEach(() => {
  document.querySelectorAll('script[src*="recaptcha/api.js"]').forEach((el) => el.remove());
  delete (window as { grecaptcha?: unknown }).grecaptcha;
});

describe('useRecaptcha', () => {
  it('resolves a token via grecaptcha.execute when already available', async () => {
    const execute = vi.fn().mockResolvedValue('token-123');
    window.grecaptcha = { ready: (cb) => cb(), execute };

    const { result } = renderHook(() => useRecaptcha('site-key'));
    await expect(result.current.execute('submit')).resolves.toBe('token-123');
    expect(execute).toHaveBeenCalledWith('site-key', { action: 'submit' });
  });

  it('injects the classic v3 script (not Enterprise) when grecaptcha is not yet loaded', () => {
    const { result } = renderHook(() => useRecaptcha('site-key'));
    void result.current.execute('submit');

    const script = getInjectedScript();
    expect(script?.src).toBe('https://www.google.com/recaptcha/api.js?render=site-key');
  });

  it('resolves undefined when the script fails to load', async () => {
    const { result } = renderHook(() => useRecaptcha('site-key'));
    const promise = result.current.execute('submit');

    getInjectedScript()?.dispatchEvent(new Event('error'));

    await expect(promise).resolves.toBeUndefined();
  });

  it('resolves undefined when the script loads but grecaptcha never appears', async () => {
    const { result } = renderHook(() => useRecaptcha('site-key'));
    const promise = result.current.execute('submit');

    getInjectedScript()?.dispatchEvent(new Event('load'));

    await expect(promise).resolves.toBeUndefined();
  });

  it('reuses one script element across concurrent execute calls', async () => {
    const { result } = renderHook(() => useRecaptcha('site-key'));
    const first = result.current.execute('submit');
    const second = result.current.execute('submit');

    expect(document.querySelectorAll('script[src*="recaptcha/api.js"]')).toHaveLength(1);

    getInjectedScript()?.dispatchEvent(new Event('load'));

    // Neither call ever gets a real grecaptcha in this test, so both
    // resolve undefined -- what matters here is that the second call's
    // own addEventListener('load', ...) listener actually fires instead
    // of hanging forever.
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
  });
});

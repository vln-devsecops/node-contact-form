import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyRecaptcha, RecaptchaError } from './recaptcha';

describe('verifyRecaptcha', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('returns passed: true for a valid, high-scoring, correctly-actioned response', async () => {
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ success: true, score: 0.9, action: 'submit' }),
    });

    await expect(verifyRecaptcha('token', 'secret')).resolves.toEqual({ score: 0.9, passed: true });
  });

  it('returns passed: false when success is false', async () => {
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ success: false }),
    });

    await expect(verifyRecaptcha('token', 'secret')).resolves.toEqual({ score: 0, passed: false });
  });

  it('returns passed: false when the score is below the threshold', async () => {
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ success: true, score: 0.1, action: 'submit' }),
    });

    await expect(verifyRecaptcha('token', 'secret')).resolves.toEqual({ score: 0.1, passed: false });
  });

  it('returns passed: false when there is no score at all', async () => {
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ success: true, action: 'submit' }),
    });

    await expect(verifyRecaptcha('token', 'secret')).resolves.toEqual({ score: 0, passed: false });
  });

  it('returns passed: false when the action does not match', async () => {
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ success: true, score: 0.9, action: 'login' }),
    });

    await expect(verifyRecaptcha('token', 'secret')).resolves.toEqual({ score: 0.9, passed: false });
  });

  it('throws RecaptchaError when the verification request itself fails', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(verifyRecaptcha('token', 'secret')).rejects.toThrow(RecaptchaError);
  });
});

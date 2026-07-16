import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { getRecaptchaSecretKey, resetSecretsCacheForTests } from './secrets';

const sendMock = vi.fn();

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: vi.fn().mockImplementation(() => ({ send: sendMock })),
  GetSecretValueCommand: vi.fn().mockImplementation((input) => input),
}));

describe('getRecaptchaSecretKey', () => {
  const originalEnv = process.env.RECAPTCHA_SECRET_ARN;

  beforeEach(() => {
    sendMock.mockReset();
    resetSecretsCacheForTests();
    process.env.RECAPTCHA_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:test';
  });

  afterAll(() => {
    process.env.RECAPTCHA_SECRET_ARN = originalEnv;
  });

  it('fetches and returns the secret string', async () => {
    sendMock.mockResolvedValue({ SecretString: 'shh' });

    await expect(getRecaptchaSecretKey()).resolves.toBe('shh');
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('caches the secret across calls', async () => {
    sendMock.mockResolvedValue({ SecretString: 'shh' });

    await getRecaptchaSecretKey();
    await getRecaptchaSecretKey();

    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('throws if RECAPTCHA_SECRET_ARN is not set', async () => {
    delete process.env.RECAPTCHA_SECRET_ARN;

    await expect(getRecaptchaSecretKey()).rejects.toThrow('RECAPTCHA_SECRET_ARN is not set');
  });

  it('throws if the secret has no string value', async () => {
    sendMock.mockResolvedValue({});

    await expect(getRecaptchaSecretKey()).rejects.toThrow('reCAPTCHA secret has no string value');
  });
});

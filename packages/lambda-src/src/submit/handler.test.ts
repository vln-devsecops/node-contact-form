import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from './handler';
import { ValidationError } from '../shared/validate';
import { RecaptchaError } from '../shared/recaptcha';

const parseSubmissionMock = vi.fn();
const verifyRecaptchaMock = vi.fn();
const getRecaptchaSecretKeyMock = vi.fn();
const putEntryMock = vi.fn();

vi.mock('../shared/validate', async () => ({
  parseSubmission: (...args: unknown[]) => parseSubmissionMock(...args),
  ValidationError: (await vi.importActual<typeof import('../shared/validate')>('../shared/validate'))
    .ValidationError,
}));

vi.mock('../shared/recaptcha', async () => ({
  verifyRecaptcha: (...args: unknown[]) => verifyRecaptchaMock(...args),
  RecaptchaError: (await vi.importActual<typeof import('../shared/recaptcha')>('../shared/recaptcha'))
    .RecaptchaError,
}));

vi.mock('../shared/secrets', () => ({
  getRecaptchaSecretKey: () => getRecaptchaSecretKeyMock(),
}));

vi.mock('../shared/repository', () => ({
  putEntry: (...args: unknown[]) => putEntryMock(...args),
}));

function buildEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/',
    rawQueryString: '',
    headers: { 'x-recaptcha-token': 'token-123' },
    requestContext: {
      http: { method: 'POST', path: '/', sourceIp: '203.0.113.1' },
    } as APIGatewayProxyEventV2['requestContext'],
    body: JSON.stringify({
      name: 'Ada',
      email: 'ada@example.com',
      subject: 'Hi',
      message: 'Hello',
    }),
    isBase64Encoded: false,
    ...overrides,
  } as APIGatewayProxyEventV2;
}

describe('submit handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parseSubmissionMock.mockReturnValue({
      name: 'Ada',
      email: 'ada@example.com',
      subject: 'Hi',
      message: 'Hello',
    });
    getRecaptchaSecretKeyMock.mockResolvedValue('secret');
    verifyRecaptchaMock.mockResolvedValue({ score: 0.9, passed: true });
    putEntryMock.mockResolvedValue(undefined);
  });

  it('stores a submission that passes reCAPTCHA with status "new"', async () => {
    const result = await handler(buildEvent());

    expect(result.statusCode).toBe(201);
    expect(putEntryMock).toHaveBeenCalledTimes(1);
    const [storedEntry] = putEntryMock.mock.calls[0];
    expect(storedEntry).toMatchObject({
      name: 'Ada',
      email: 'ada@example.com',
      recaptchaScore: 0.9,
      status: 'new',
      sourceIp: '203.0.113.1',
    });
    expect(typeof storedEntry.messageId).toBe('string');
    expect(JSON.parse(result.body as string).messageId).toBe(storedEntry.messageId);
  });

  it('still stores (not rejects) a submission that fails reCAPTCHA, tagged as spam', async () => {
    verifyRecaptchaMock.mockResolvedValue({ score: 0.1, passed: false });

    const result = await handler(buildEvent());

    expect(result.statusCode).toBe(201);
    expect(putEntryMock).toHaveBeenCalledTimes(1);
    expect(putEntryMock.mock.calls[0][0]).toMatchObject({ recaptchaScore: 0.1, status: 'spam' });
  });

  it('still stores a submission with a missing reCAPTCHA token, tagged as spam with a null score', async () => {
    const result = await handler(buildEvent({ headers: {} }));

    expect(result.statusCode).toBe(201);
    expect(putEntryMock).toHaveBeenCalledTimes(1);
    expect(putEntryMock.mock.calls[0][0]).toMatchObject({ recaptchaScore: null, status: 'spam' });
  });

  it('still stores a submission when the reCAPTCHA verification request itself fails, tagged as spam', async () => {
    verifyRecaptchaMock.mockRejectedValue(new RecaptchaError('network down'));

    const result = await handler(buildEvent());

    expect(result.statusCode).toBe(201);
    expect(putEntryMock.mock.calls[0][0]).toMatchObject({ recaptchaScore: null, status: 'spam' });
  });

  it('falls back to "unknown" when sourceIp is missing from the request context', async () => {
    const event = buildEvent({
      requestContext: { http: { method: 'POST', path: '/' } } as APIGatewayProxyEventV2['requestContext'],
    });

    await handler(event);

    expect(putEntryMock.mock.calls[0][0]).toMatchObject({ sourceIp: 'unknown' });
  });

  it('returns 400 on a validation error and never stores anything', async () => {
    parseSubmissionMock.mockImplementation(() => {
      throw new ValidationError('bad input');
    });

    const result = await handler(buildEvent());

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string).message).toBe('bad input');
    expect(putEntryMock).not.toHaveBeenCalled();
  });

  it('returns 500 (does not spam-box) when the secret itself fails to load', async () => {
    getRecaptchaSecretKeyMock.mockRejectedValue(new Error('secrets manager is down'));

    const result = await handler(buildEvent());

    expect(result.statusCode).toBe(500);
    expect(putEntryMock).not.toHaveBeenCalled();
  });

  it('returns 500 on an unexpected storage error without leaking details', async () => {
    putEntryMock.mockRejectedValue(new Error('table is on fire'));

    const result = await handler(buildEvent());

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body as string).message).toBe('Internal error');
  });
});

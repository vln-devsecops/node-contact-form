const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
const MIN_SCORE = 0.5;
const EXPECTED_ACTION = 'submit';
const TIMEOUT_MS = 2500;

// Thrown only when the verification *request itself* fails (network,
// timeout, malformed response) - i.e. when we genuinely can't tell whether
// the submission is legitimate. A low score or wrong action is not an
// error: verifyRecaptcha returns that as a normal, unsurprising result and
// leaves the decision of what to do about it to the caller.
export class RecaptchaError extends Error {}

export interface RecaptchaAssessment {
  score: number;
  passed: boolean;
}

interface SiteVerifyResponse {
  success: boolean;
  score?: number;
  action?: string;
}

// Classic reCAPTCHA v3, not Enterprise: one REST call, no GCP project/API-key
// setup.
export async function verifyRecaptcha(token: string, secret: string): Promise<RecaptchaAssessment> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: SiteVerifyResponse;
  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }).toString(),
      signal: controller.signal,
    });
    response = (await res.json()) as SiteVerifyResponse;
  } catch (err) {
    throw new RecaptchaError(`reCAPTCHA verification request failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.success) {
    return { score: 0, passed: false };
  }

  const score = response.score ?? 0;
  const passed = response.action === EXPECTED_ACTION && score >= MIN_SCORE;
  return { score, passed };
}

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { parseSubmission, ValidationError } from '../shared/validate';
import { verifyRecaptcha, RecaptchaError } from '../shared/recaptcha';
import { getRecaptchaSecretKey } from '../shared/secrets';
import { putEntry } from '../shared/repository';
import { jsonResponse } from '../shared/response';
import type { ContactFormEntry, ContactFormStatus } from '../shared/types';

const RECAPTCHA_HEADER = 'x-recaptcha-token';

// Public entry point - anyone on the internet can call this, so there is no
// auth check here by design.
export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const submission = parseSubmission(event.body);
    const token = event.headers?.[RECAPTCHA_HEADER];
    const { score, status } = await assessRecaptcha(token);

    const entry: ContactFormEntry = {
      ...submission,
      messageId: randomUUID(),
      submittedAt: new Date().toISOString(),
      recaptchaScore: score,
      status,
      sourceIp: event.requestContext?.http?.sourceIp ?? 'unknown',
    };

    await putEntry(entry);

    return jsonResponse(201, { messageId: entry.messageId });
  } catch (err) {
    if (err instanceof ValidationError) {
      return jsonResponse(400, { message: err.message });
    }

    // Never log headers or the raw body here - doing so would put a live
    // reCAPTCHA token (and, if this ever grows an auth header, a live
    // credential) into CloudWatch logs on every request.
    console.error('contact-form submit failed', {
      name: (err as Error).name,
      message: (err as Error).message,
    });
    return jsonResponse(500, { message: 'Internal error' });
  }
}

// Every submission that passes basic validation gets stored - keeping
// rejected-looking messages is deliberate: reCAPTCHA has false positives,
// and this is how whoever runs the form can check a "spam box" for anything
// it got wrong instead of a message silently vanishing. A missing token, a
// failed verdict, or reCAPTCHA being unreachable all tag the entry status:
// 'spam' (score: null when no assessment could be made at all) instead of
// rejecting it. A genuine operational failure (e.g. the secret itself
// failing to load) still surfaces as a 500, not a silent spam-box entry -
// that's a real error, not a verdict.
async function assessRecaptcha(
  token: string | undefined
): Promise<{ score: number | null; status: ContactFormStatus }> {
  if (!token) {
    return { score: null, status: 'spam' };
  }

  try {
    const secret = await getRecaptchaSecretKey();
    const { score, passed } = await verifyRecaptcha(token, secret);
    return { score, status: passed ? 'new' : 'spam' };
  } catch (err) {
    if (err instanceof RecaptchaError) {
      return { score: null, status: 'spam' };
    }
    throw err;
  }
}

export interface ContactFormSubmission {
  name: string;
  email: string;
  subject: string;
  message: string;
}

// 'spam' is a real bucket for manual review, not a rejection - reCAPTCHA has
// false positives, so a low score/wrong action/unreachable check must never
// silently drop a message. recaptchaScore is null when no assessment could
// be made at all (missing token, or the verification request itself
// failed), distinct from a real low score.
export type ContactFormStatus = 'new' | 'spam';

export interface ContactFormEntry extends ContactFormSubmission {
  messageId: string;
  submittedAt: string;
  recaptchaScore: number | null;
  status: ContactFormStatus;
  sourceIp: string;
}

export interface ListEntriesResult {
  entries: ContactFormEntry[];
  cursor?: string;
}

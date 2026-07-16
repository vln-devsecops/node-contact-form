import { z } from 'zod';
import type { ContactFormSubmission } from './types';

// Length caps only, no character-class allowlist - a contact form should
// accept anything a person might type (apostrophes, hyphens, accented
// characters), not just [a-zA-Z0-9 ]. JSON.stringify already makes
// storage/transport safe.
const submissionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(10000),
});

export class ValidationError extends Error {}

export function parseSubmission(body: string | null | undefined): ContactFormSubmission {
  if (!body) {
    throw new ValidationError('Request body is required');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new ValidationError('Request body must be valid JSON');
  }

  const result = submissionSchema.safeParse(parsed);
  if (!result.success) {
    throw new ValidationError(result.error.issues.map((issue) => issue.message).join('; '));
  }

  return result.data;
}

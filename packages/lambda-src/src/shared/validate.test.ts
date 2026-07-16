import { describe, it, expect } from 'vitest';
import { parseSubmission, ValidationError } from './validate';

const VALID_BODY = JSON.stringify({
  name: "O'Brien-José",
  email: 'obrien@example.com',
  subject: 'Question about services',
  message: 'Hello, I have a question.',
});

describe('parseSubmission', () => {
  it('parses a valid submission', () => {
    expect(parseSubmission(VALID_BODY)).toEqual({
      name: "O'Brien-José",
      email: 'obrien@example.com',
      subject: 'Question about services',
      message: 'Hello, I have a question.',
    });
  });

  it('rejects a missing body', () => {
    expect(() => parseSubmission(null)).toThrow(ValidationError);
    expect(() => parseSubmission(undefined)).toThrow(ValidationError);
    expect(() => parseSubmission('')).toThrow(ValidationError);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseSubmission('{not json')).toThrow(ValidationError);
  });

  it('rejects a missing required field', () => {
    const body = JSON.stringify({ name: 'A', email: 'a@example.com', subject: 'S' });
    expect(() => parseSubmission(body)).toThrow(ValidationError);
  });

  it('rejects an invalid email', () => {
    const body = JSON.stringify({ name: 'A', email: 'not-an-email', subject: 'S', message: 'M' });
    expect(() => parseSubmission(body)).toThrow(ValidationError);
  });

  it('rejects a message over the length cap', () => {
    const body = JSON.stringify({
      name: 'A',
      email: 'a@example.com',
      subject: 'S',
      message: 'x'.repeat(10001),
    });
    expect(() => parseSubmission(body)).toThrow(ValidationError);
  });

  it('trims whitespace from fields', () => {
    const body = JSON.stringify({
      name: '  Ada  ',
      email: '  ada@example.com  ',
      subject: '  Hi  ',
      message: '  Hello  ',
    });
    expect(parseSubmission(body)).toEqual({
      name: 'Ada',
      email: 'ada@example.com',
      subject: 'Hi',
      message: 'Hello',
    });
  });
});

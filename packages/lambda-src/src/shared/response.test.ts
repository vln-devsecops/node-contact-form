import { describe, it, expect } from 'vitest';
import { jsonResponse } from './response';

describe('jsonResponse', () => {
  it('serializes the body as JSON with a content-type header', () => {
    const result = jsonResponse(200, { hello: 'world' });

    expect(result).toEqual({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"hello":"world"}',
    });
  });

  it('emits an empty body for a null payload', () => {
    const result = jsonResponse(204, null);

    expect(result.body).toBe('');
  });
});

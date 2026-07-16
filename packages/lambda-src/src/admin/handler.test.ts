import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from './handler';
import type { ContactFormEntry } from '../shared/types';

const listEntriesMock = vi.fn();
const getEntryMock = vi.fn();
const deleteEntryMock = vi.fn();

vi.mock('../shared/repository', () => ({
  listEntries: (...args: unknown[]) => listEntriesMock(...args),
  getEntry: (...args: unknown[]) => getEntryMock(...args),
  deleteEntry: (...args: unknown[]) => deleteEntryMock(...args),
}));

const SAMPLE_ENTRY: ContactFormEntry = {
  messageId: 'msg-1',
  submittedAt: '2026-07-16T00:00:00.000Z',
  name: 'Ada',
  email: 'ada@example.com',
  subject: 'Hi',
  message: 'Hello',
  recaptchaScore: 0.9,
  status: 'new',
  sourceIp: '203.0.113.1',
};

function buildEvent(
  method: string,
  path: string,
  queryStringParameters?: Record<string, string>
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: '',
    headers: {},
    requestContext: { http: { method, path } } as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
    queryStringParameters,
  } as APIGatewayProxyEventV2;
}

describe('admin handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists entries with the default limit when none is given', async () => {
    listEntriesMock.mockResolvedValue({ entries: [SAMPLE_ENTRY] });

    const result = await handler(buildEvent('GET', '/entries'));

    expect(listEntriesMock).toHaveBeenCalledWith(20, undefined, undefined);
    expect(result.statusCode).toBe(200);
  });

  it('clamps an oversized limit query param', async () => {
    listEntriesMock.mockResolvedValue({ entries: [] });

    await handler(buildEvent('GET', '/entries', { limit: '9999' }));

    expect(listEntriesMock).toHaveBeenCalledWith(100, undefined, undefined);
  });

  it('falls back to the default limit for a non-numeric limit', async () => {
    listEntriesMock.mockResolvedValue({ entries: [] });

    await handler(buildEvent('GET', '/entries', { limit: 'abc' }));

    expect(listEntriesMock).toHaveBeenCalledWith(20, undefined, undefined);
  });

  it('passes a cursor through to listEntries', async () => {
    listEntriesMock.mockResolvedValue({ entries: [] });

    await handler(buildEvent('GET', '/entries', { cursor: 'abc123' }));

    expect(listEntriesMock).toHaveBeenCalledWith(20, 'abc123', undefined);
  });

  it('passes a valid status filter through to listEntries (checking the spam box)', async () => {
    listEntriesMock.mockResolvedValue({ entries: [] });

    await handler(buildEvent('GET', '/entries', { status: 'spam' }));

    expect(listEntriesMock).toHaveBeenCalledWith(20, undefined, 'spam');
  });

  it('ignores an invalid status filter rather than erroring', async () => {
    listEntriesMock.mockResolvedValue({ entries: [] });

    await handler(buildEvent('GET', '/entries', { status: 'bogus' }));

    expect(listEntriesMock).toHaveBeenCalledWith(20, undefined, undefined);
  });

  it('gets a single entry by id', async () => {
    getEntryMock.mockResolvedValue(SAMPLE_ENTRY);

    const result = await handler(buildEvent('GET', '/entries/msg-1'));

    expect(getEntryMock).toHaveBeenCalledWith('msg-1');
    expect(result.statusCode).toBe(200);
  });

  it('returns 404 when a single entry is not found', async () => {
    getEntryMock.mockResolvedValue(null);

    const result = await handler(buildEvent('GET', '/entries/missing'));

    expect(result.statusCode).toBe(404);
  });

  it('deletes an entry by id', async () => {
    deleteEntryMock.mockResolvedValue(true);

    const result = await handler(buildEvent('DELETE', '/entries/msg-1'));

    expect(deleteEntryMock).toHaveBeenCalledWith('msg-1');
    expect(result.statusCode).toBe(204);
  });

  it('returns 404 deleting an entry that does not exist', async () => {
    deleteEntryMock.mockResolvedValue(false);

    const result = await handler(buildEvent('DELETE', '/entries/missing'));

    expect(result.statusCode).toBe(404);
  });

  it('returns 404 for an unrecognized route', async () => {
    const result = await handler(buildEvent('PATCH', '/entries/msg-1'));

    expect(result.statusCode).toBe(404);
  });

  it('returns 500 on an unexpected error without leaking details', async () => {
    listEntriesMock.mockRejectedValue(new Error('table is on fire'));

    const result = await handler(buildEvent('GET', '/entries'));

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body as string).message).toBe('Internal error');
  });
});

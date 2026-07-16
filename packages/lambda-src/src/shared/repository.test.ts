import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { putEntry, listEntries, getEntry, deleteEntry } from './repository';
import type { ContactFormEntry } from './types';

const sendMock = vi.fn();

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: sendMock })) },
  PutCommand: vi.fn().mockImplementation((input) => ({ type: 'Put', input })),
  QueryCommand: vi.fn().mockImplementation((input) => ({ type: 'Query', input })),
  DeleteCommand: vi.fn().mockImplementation((input) => ({ type: 'Delete', input })),
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

describe('repository', () => {
  const originalEnv = process.env.CONTACT_FORM_TABLE_NAME;

  beforeEach(() => {
    sendMock.mockReset();
    process.env.CONTACT_FORM_TABLE_NAME = 'contact-form-table';
  });

  afterAll(() => {
    process.env.CONTACT_FORM_TABLE_NAME = originalEnv;
  });

  it('throws if CONTACT_FORM_TABLE_NAME is not set', async () => {
    delete process.env.CONTACT_FORM_TABLE_NAME;

    await expect(putEntry(SAMPLE_ENTRY)).rejects.toThrow('CONTACT_FORM_TABLE_NAME is not set');
  });

  describe('putEntry', () => {
    it('puts the entry with the constant partition key', async () => {
      sendMock.mockResolvedValue({});

      await putEntry(SAMPLE_ENTRY);

      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Put',
          input: expect.objectContaining({
            TableName: 'contact-form-table',
            Item: expect.objectContaining({ pk: 'CONTACT', messageId: 'msg-1' }),
          }),
        })
      );
    });
  });

  describe('listEntries', () => {
    it('queries newest-first with no cursor by default', async () => {
      sendMock.mockResolvedValue({ Items: [SAMPLE_ENTRY] });

      const result = await listEntries(20);

      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Query',
          input: expect.objectContaining({
            ScanIndexForward: false,
            Limit: 20,
            ExclusiveStartKey: undefined,
          }),
        })
      );
      expect(result.entries).toEqual([SAMPLE_ENTRY]);
      expect(result.cursor).toBeUndefined();
    });

    it('adds a status filter expression when a status is given', async () => {
      sendMock.mockResolvedValue({ Items: [] });

      await listEntries(20, undefined, 'spam');

      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            FilterExpression: '#status = :status',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':pk': 'CONTACT', ':status': 'spam' },
          }),
        })
      );
    });

    it('omits the filter expression when no status is given', async () => {
      sendMock.mockResolvedValue({ Items: [] });

      await listEntries(20);

      const sentQuery = sendMock.mock.calls[0][0];
      expect(sentQuery.input.FilterExpression).toBeUndefined();
      expect(sentQuery.input.ExpressionAttributeNames).toBeUndefined();
    });

    it('defaults to an empty entries array when Items is absent', async () => {
      sendMock.mockResolvedValue({});

      const result = await listEntries(20);

      expect(result.entries).toEqual([]);
    });

    it('decodes an incoming cursor and encodes an outgoing one', async () => {
      const lastKey = { pk: 'CONTACT', submittedAt: '2026-07-15T00:00:00.000Z' };
      sendMock.mockResolvedValue({ Items: [], LastEvaluatedKey: lastKey });
      const incomingCursor = Buffer.from(JSON.stringify({ pk: 'CONTACT', submittedAt: 'x' })).toString(
        'base64url'
      );

      const result = await listEntries(20, incomingCursor);

      const sentQuery = sendMock.mock.calls[0][0];
      expect(sentQuery.input.ExclusiveStartKey).toEqual({ pk: 'CONTACT', submittedAt: 'x' });
      expect(JSON.parse(Buffer.from(result.cursor!, 'base64url').toString('utf-8'))).toEqual(lastKey);
    });
  });

  describe('getEntry', () => {
    it('queries the messageId GSI and returns the first match', async () => {
      sendMock.mockResolvedValue({ Items: [SAMPLE_ENTRY] });

      const result = await getEntry('msg-1');

      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Query',
          input: expect.objectContaining({ IndexName: 'messageId-index' }),
        })
      );
      expect(result).toEqual(SAMPLE_ENTRY);
    });

    it('returns null when no match is found', async () => {
      sendMock.mockResolvedValue({ Items: [] });

      await expect(getEntry('missing')).resolves.toBeNull();
    });
  });

  describe('deleteEntry', () => {
    it('looks up the entry via the GSI then deletes it by the base table key', async () => {
      sendMock.mockResolvedValueOnce({ Items: [SAMPLE_ENTRY] }); // getEntry
      sendMock.mockResolvedValueOnce({}); // delete

      await expect(deleteEntry('msg-1')).resolves.toBe(true);

      expect(sendMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'Delete',
          input: expect.objectContaining({
            Key: { pk: 'CONTACT', submittedAt: SAMPLE_ENTRY.submittedAt },
          }),
        })
      );
    });

    it('returns false without deleting when the entry does not exist', async () => {
      sendMock.mockResolvedValueOnce({ Items: [] }); // getEntry finds nothing

      await expect(deleteEntry('missing')).resolves.toBe(false);
      expect(sendMock).toHaveBeenCalledTimes(1);
    });
  });
});

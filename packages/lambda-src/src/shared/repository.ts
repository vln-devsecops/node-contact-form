import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import type { ContactFormEntry, ContactFormStatus, ListEntriesResult } from './types';

// Every submission lives under one partition: item volume here is small
// enough that this is fine, and it's what makes "list newest first" a
// direct, cheap Query (ScanIndexForward: false) instead of a full-table Scan
// sorted in Lambda memory.
const PARTITION_KEY_VALUE = 'CONTACT';
const GSI_NAME = 'messageId-index';

let documentClient: DynamoDBDocumentClient | undefined;

function client(): DynamoDBDocumentClient {
  if (!documentClient) {
    documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  }
  return documentClient;
}

function tableName(): string {
  const name = process.env.CONTACT_FORM_TABLE_NAME;
  if (!name) {
    throw new Error('CONTACT_FORM_TABLE_NAME is not set');
  }
  return name;
}

export async function putEntry(entry: ContactFormEntry): Promise<void> {
  await client().send(
    new PutCommand({
      TableName: tableName(),
      Item: { pk: PARTITION_KEY_VALUE, ...entry },
    })
  );
}

// status is a DynamoDB reserved word, hence the #status alias. Filtering
// happens server-side (FilterExpression), not by fetching everything and
// filtering in Lambda memory - this is what makes checking the "spam box"
// (status: 'spam') a real, bounded query instead of a full scan.
export async function listEntries(
  limit: number,
  cursor?: string,
  status?: ContactFormStatus
): Promise<ListEntriesResult> {
  const result = await client().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'pk = :pk',
      FilterExpression: status ? '#status = :status' : undefined,
      ExpressionAttributeNames: status ? { '#status': 'status' } : undefined,
      ExpressionAttributeValues: status
        ? { ':pk': PARTITION_KEY_VALUE, ':status': status }
        : { ':pk': PARTITION_KEY_VALUE },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: cursor ? decodeCursor(cursor) : undefined,
    })
  );

  return {
    entries: (result.Items ?? []) as ContactFormEntry[],
    cursor: result.LastEvaluatedKey ? encodeCursor(result.LastEvaluatedKey) : undefined,
  };
}

// Direct GSI lookup by messageId, not a Scan/filter.
export async function getEntry(messageId: string): Promise<ContactFormEntry | null> {
  const result = await client().send(
    new QueryCommand({
      TableName: tableName(),
      IndexName: GSI_NAME,
      KeyConditionExpression: 'messageId = :id',
      ExpressionAttributeValues: { ':id': messageId },
      Limit: 1,
    })
  );

  return (result.Items?.[0] as ContactFormEntry | undefined) ?? null;
}

export async function deleteEntry(messageId: string): Promise<boolean> {
  const entry = await getEntry(messageId);
  if (!entry) {
    return false;
  }

  await client().send(
    new DeleteCommand({
      TableName: tableName(),
      Key: { pk: PARTITION_KEY_VALUE, submittedAt: entry.submittedAt },
    })
  );

  return true;
}

function encodeCursor(key: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(key)).toString('base64url');
}

function decodeCursor(cursor: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
}

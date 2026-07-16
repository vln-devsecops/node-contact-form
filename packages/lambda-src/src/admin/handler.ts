import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { listEntries, getEntry, deleteEntry } from '../shared/repository';
import { jsonResponse } from '../shared/response';
import type { ContactFormStatus } from '../shared/types';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const ENTRY_ID_PATH = /^\/entries\/([^/]+)$/;
const VALID_STATUSES: ContactFormStatus[] = ['new', 'spam'];

// IAM-authenticated entry point (this Lambda's Function URL is created with
// url_authorization_type = AWS_IAM by the contact_form module) - there is no
// app-level auth code here at all. Enforcing auth at the platform boundary
// instead of in each handler makes "a route forgot to check auth" a whole
// defect class impossible by construction.
export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const method = event.requestContext.http.method;
    const path = event.requestContext.http.path;
    const singleEntryMatch = path.match(ENTRY_ID_PATH);

    if (method === 'GET' && singleEntryMatch) {
      const entry = await getEntry(singleEntryMatch[1]);
      return entry ? jsonResponse(200, entry) : jsonResponse(404, { message: 'Not found' });
    }

    if (method === 'GET' && path === '/entries') {
      const limit = clampLimit(event.queryStringParameters?.limit);
      const cursor = event.queryStringParameters?.cursor;
      const status = parseStatus(event.queryStringParameters?.status);
      const result = await listEntries(limit, cursor, status);
      return jsonResponse(200, result);
    }

    if (method === 'DELETE' && singleEntryMatch) {
      const deleted = await deleteEntry(singleEntryMatch[1]);
      return deleted ? jsonResponse(204, null) : jsonResponse(404, { message: 'Not found' });
    }

    return jsonResponse(404, { message: 'Not found' });
  } catch (err) {
    console.error('contact-form admin failed', {
      name: (err as Error).name,
      message: (err as Error).message,
    });
    return jsonResponse(500, { message: 'Internal error' });
  }
}

function clampLimit(raw: string | undefined): number {
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_LIMIT;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
}

// Unrecognized values are treated as "no filter" rather than an error - a
// typo'd status query param should show everything, not fail the request.
function parseStatus(raw: string | undefined): ContactFormStatus | undefined {
  return VALID_STATUSES.includes(raw as ContactFormStatus) ? (raw as ContactFormStatus) : undefined;
}

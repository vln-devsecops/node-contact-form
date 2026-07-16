import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Cached across warm Lambda invocations, keyed by an explicit ARN env var
// set directly by Terraform - not derived by string-splitting
// AWS_LAMBDA_FUNCTION_NAME (a fragile convention that silently breaks if the
// function's name ever changes shape).
let cachedSecret: string | undefined;
let client: SecretsManagerClient | undefined;

function getClient(): SecretsManagerClient {
  if (!client) {
    client = new SecretsManagerClient({});
  }
  return client;
}

export async function getRecaptchaSecretKey(): Promise<string> {
  if (cachedSecret) {
    return cachedSecret;
  }

  const secretId = process.env.RECAPTCHA_SECRET_ARN;
  if (!secretId) {
    throw new Error('RECAPTCHA_SECRET_ARN is not set');
  }

  const result = await getClient().send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!result.SecretString) {
    throw new Error('reCAPTCHA secret has no string value');
  }

  cachedSecret = result.SecretString;
  return cachedSecret;
}

// Test-only: clears the module-level cache so each test controls its own
// mocked SecretsManagerClient response instead of inheriting a previous
// test's cached value.
export function resetSecretsCacheForTests(): void {
  cachedSecret = undefined;
  client = undefined;
}

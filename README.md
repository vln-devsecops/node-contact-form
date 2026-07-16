# node-contact-form

A reusable contact-form backend (two Lambdas + one DynamoDB table) and a React UI component,
designed to be deployed as a self-provisioning Terraform module and dropped into any site's
frontend — not a one-off built into a single site's repo.

Mirrors the shape already proven by [`node-vlinder-auth`](https://github.com/vln-devsecops/node-vlinder-auth)
for `cognito_auth`: application code here, a self-provisioning Terraform module in
[`terraform-modules`](https://github.com/vln-devsecops/terraform-modules), the Lambda source
consumed as a **published, versioned npm dependency** at `terraform apply` time — never vendored.

## Repositories

| Repo | Role |
| --- | --- |
| `terraform-modules` | `modules/aws/contact_form` (not yet built) — the self-provisioning module. All AWS infrastructure. |
| `node-contact-form` | This repo. The application code the module deploys: the two Lambda handlers, and a reusable React form component. |

## Runtime shape

Two Lambda Function URLs, one DynamoDB table:

- **`submit`** — public (`authorization_type = NONE`). Validates the request, checks reCAPTCHA
  classic v3, and stores the entry either way.
- **`admin`** — locked to `AWS_IAM` (`authorization_type = AWS_IAM`) on the Function URL itself, so
  access control is enforced by AWS, not application code. Lists/gets/deletes entries.

**Rejected-looking submissions are kept, not dropped.** A low reCAPTCHA score, a wrong action, a
missing token, or reCAPTCHA being unreachable all tag the entry `status: "spam"` instead of
returning an error to the submitter — reCAPTCHA has false positives, and this gives whoever runs
the form a "spam box" to check rather than silently losing a real message. Only genuine request
validation failures (malformed JSON, a missing required field) are rejected outright, since
reCAPTCHA has no opinion on those at all.

DynamoDB schema: hash key `pk` (constant `"CONTACT"` — one logical partition, fine at this scale),
range key `submittedAt` (ISO 8601, so listing newest-first is a direct `Query` with
`ScanIndexForward: false`, not a full scan sorted in memory), plus a `messageId` GSI for direct
get/delete-by-id. `GET /entries` supports a `status` query filter so the admin Lambda can list just
the spam box or just the legitimate queue.

## Build and release

The Lambda source is a versioned deliverable, not vendored source — see
`packages/lambda-src/`:

```
node-contact-form/packages/lambda-src
   └─ esbuild → one self-contained CJS bundle per handler (submit/handler.js, admin/handler.js)
   └─ published to GitHub Packages as @vln-devsecops/contact-form-lambda

terraform-modules/modules/aws/contact_form/lambda-build/package.json  (not yet built)
   └─ depends on @vln-devsecops/contact-form-lambda        (bumped by Dependabot)
   └─ at apply time: null_resource runs `npm install`,
      archive_file zips node_modules/.../dist
```

## Status

- `packages/lambda-src` — built, tested, not yet published (no CI run yet on `main`).
- `packages/ui-contact-form` (reusable React component) — not yet started.
- `terraform-modules/modules/aws/contact_form` — not yet started.
- vlinder.ca's own `infra/fn_contactform.tf` and `ContactForm.tsx` will consume this once both of
  the above land.

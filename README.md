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
| `terraform-modules` | `modules/aws/contact_form` — the self-provisioning module. All AWS infrastructure. |
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

Both packages are versioned deliverables, not vendored source:

```
node-contact-form/packages/lambda-src
   └─ esbuild → one self-contained CJS bundle per handler (submit/handler.js, admin/handler.js)
   └─ published to GitHub Packages as @vln-devsecops/contact-form-lambda

terraform-modules/modules/aws/contact_form/lambda-build/package.json
   └─ depends on @vln-devsecops/contact-form-lambda        (bumped by Dependabot)
   └─ at apply time: null_resource runs `npm install`,
      archive_file zips node_modules/.../dist

node-contact-form/packages/ui-contact-form
   └─ tsc -b → ESM + type declarations (dist/index.js, dist/index.d.ts)
   └─ published to GitHub Packages as @vln-devsecops/contact-form-ui
```

`ui-contact-form` is deliberately published (unlike `node-vlinder-auth`'s equivalent `ui-auth`
package, which is `private: true` with no publish workflow — that package's only consumer lives in
the same repo, so it's never needed to leave it). This package's whole purpose is being usable from
a *different* repo (e.g. `vlinder.ca`), so it follows `lambda-src`'s publish pattern instead:
auto-versioned `1.0.<run_number>`, published on every push to `main` that touches
`packages/ui-contact-form/**` (`cd_publish_ui.yml`).

## `@vln-devsecops/contact-form-ui`

A single unstyled, controlled `<ContactForm>` component plus a `useRecaptcha` hook. It only
collects and validates input and acquires a reCAPTCHA v3 token — it makes no assumption about how
or where the values are submitted:

```tsx
import { ContactForm } from '@vln-devsecops/contact-form-ui';

<ContactForm
  recaptchaSiteKey={RECAPTCHA_SITE_KEY}
  onSubmit={async (values, recaptchaToken) => {
    await fetch(SUBMIT_FUNCTION_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-recaptcha-token': recaptchaToken ?? '' },
      body: JSON.stringify(values),
    });
  }}
/>
```

A failed or blocked reCAPTCHA load (ad blocker, network hiccup) resolves `recaptchaToken` as
`undefined` rather than blocking the submit — matching the backend's spam-box design (a missing
token is stored for review, not rejected). Styling is left entirely to the consumer: fields are
plain `<input>`/`<textarea>` with stable `id`s and an optional `className` on the `<form>`.

## Status

- `packages/lambda-src` — built, tested, published to GitHub Packages
  (`@vln-devsecops/contact-form-lambda`), CI green on `main`.
- `packages/ui-contact-form` (reusable React component) — built, tested (100% coverage), published
  to GitHub Packages (`@vln-devsecops/contact-form-ui`).
- `terraform-modules/modules/aws/contact_form` — built and merged.
- vlinder.ca's own `infra/fn_contactform.tf` and `ContactForm.tsx` — not yet started. Both upstream
  packages now exist, so this is the only remaining piece.

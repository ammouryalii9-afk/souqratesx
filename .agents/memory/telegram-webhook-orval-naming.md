---
name: Telegram Bot API webhook and Orval naming pitfalls
description: Two recurring gotchas when wiring Telegram Bot API webhooks (Stars payments, bot updates) behind an Orval-generated OpenAPI client.
---

`setWebhook` on the Telegram Bot API rejects any non-HTTPS URL with "Bad Request: bad webhook: An HTTPS URL must be provided for webhook". This will always fail against a local dev preview domain — that is expected, not a bug. It only succeeds once the app is published on an HTTPS domain.

**Why:** Telegram enforces HTTPS server-side for webhook registration; there is no dev-mode bypass.

**How to apply:** Build the "register webhook" action as an idempotent admin-triggered button (not something run automatically at boot), and treat a failure in local dev as a non-issue — verify the request reaches Telegram's API and surfaces the real error, then re-test after publishing.

Orval-generated Zod schema/type names follow the OpenAPI `operationId`, not the request/response schema names you defined in `components.schemas`. E.g. a schema named `StarsInvoiceInput` in the spec may generate as `CreateStarsInvoiceBody` if the operationId is `createStarsInvoice`. Always grep the generated file for the actual exported names after codegen rather than guessing from the spec.

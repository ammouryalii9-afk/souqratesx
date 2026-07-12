---
name: OpenAPI/Zod response stripping
description: Generated Zod response schemas silently strip any field not declared in openapi.yaml — symptoms look like a frontend crash, not a backend bug.
---

Rule: every field a route handler returns MUST be declared in the matching schema in `lib/api-spec/openapi.yaml`. Server code wraps responses in generated-Zod `.parse()`, which strips undeclared keys silently (no error, HTTP 200).

**Why:** Admin "user details" modal went blank because `toUserDetail()` returned 7 extracted fields the `AdminUserDetail` OpenAPI schema didn't list; Zod stripped them, and the frontend crashed on `undefined.toLocaleString()`. Endpoint tests showed 200 + valid-looking JSON, hiding the bug.

**How to apply:** When adding fields to a server response, update openapi.yaml first, run codegen, then compare the actual curl output against what the frontend type expects — a 200 response does not prove the fields survived parsing. If a frontend detail view is blank while list views work, suspect stripped keys before suspecting the fetch.

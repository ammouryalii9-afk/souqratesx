---
name: CPX Research postback hash formula
description: The MD5 signature formula CPX Research uses for postback verification, including an undocumented separator.
---

CPX Research signs each server-to-server postback (`GET .../postback?...&hash=...`) with:

```
hash = md5(trans_id + "-" + secure_hash)
```

**Why:** CPX's own dashboard text and docs only say "hash of trans_id and your secure hash" without specifying a separator. The naive `md5(trans_id + secure_hash)` (no separator) does NOT match — it silently fails signature verification with no useful error from CPX's side. Confirmed via CPX's own "Test your Postback URL" tool, which reveals a real trans_id/hash pair you can use to brute-force-verify your formula offline before trusting it in production.

**How to apply:** When implementing or debugging CPX Research (or any survey wall with a similar "secure hash" postback scheme), don't assume the naive concatenation. Use the platform's built-in test-postback tool (if available) to get one real trans_id + hash sample, then verify your exact formula against it with a few algorithm/separator variants before assuming the shared secret itself is wrong. A "secret is wrong" symptom (signature never matches) may actually be a formula/separator problem, not a wrong secret value — regenerating the secret repeatedly will not fix it.

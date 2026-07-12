---
name: Telegram Mini App viral deep links
description: startapp vs start — which one delivers a payload into initData.start_param for auto-join/referral flows
---

# Telegram Mini App deep links: `startapp` vs `start`

For any viral loop that reads a payload server-side from `initData.start_param`
(auto-join squad, referral credit, etc.), the invite link MUST use **`startapp`**:

- `https://t.me/<bot>?startapp=<payload>` → launches the Mini App **directly** and the
  payload arrives as `start_param` inside the signed WebApp `initData`. This is what
  `telegramAuth.ts` (`verifyTelegramInitData`) reads and what `auth.ts` routes on signup.
- `https://t.me/<bot>?start=<payload>` → only opens the **bot chat** with a Start button;
  the payload goes to the bot's `/start` webhook message, NOT to `initData.start_param`.
  A link built this way will silently fail to auto-join / credit referrer on Mini App launch.

**Why:** during the Squads build, the invite link was first written with `?start=squad_<id>`,
which would have broken the whole viral auto-join + owner-referral flow because the payload
never reaches `start_param`. Fixed to `?startapp=`.

**How to apply:** whenever building a share/invite link whose payload is consumed by
server-side `start_param` parsing, use `startapp=`. Reserve `start=` only for flows that are
actually handled in the `/start` webhook handler.

# Never hardcode the bot username in invite links

A hardcoded, guessed bot username in `t.me/<bot>` links shows Telegram's
"Sorry, this user doesn't seem to exist" alert to every recipient.

**Why:** the referral + squad invite links shipped with a guessed username that didn't
match the real bot, breaking all sharing until fixed.

**How to apply:** the server exposes the real username (fetched once via Bot API `getMe`,
cached, 3s timeout) as `botUsername` in `GET /config/public`; the frontend reads it via a
cached `getBotUsername()` helper in `gameApi.ts`. Build all `t.me/` links from that value.

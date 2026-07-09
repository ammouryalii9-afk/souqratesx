# Self-hosting SouqrateX on Contabo

You keep editing on Replit and pushing to GitHub (`git push origin main`) as usual.
Contabo pulls from GitHub itself and rebuilds — Replit never talks to Contabo directly.

## One-time setup on the Contabo server

```bash
# 1. System packages
apt update && apt install -y git nginx
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs
npm install -g pnpm pm2

# 2. Clone the repo (use a deploy key or a personal access token for a private repo)
git clone https://github.com/ammouryalii9-afk/souqratesx.git /opt/souqratex
cd /opt/souqratex

# 3. Configure secrets
cp deploy/contabo/.env.example deploy/contabo/.env
nano deploy/contabo/.env   # fill in SESSION_SECRET, ADMIN_PASSWORD, SUPABASE_DATABASE_URL, TELEGRAM_BOT_TOKEN, DOMAIN

# 4. First deploy
chmod +x deploy/contabo/deploy.sh
./deploy/contabo/deploy.sh

# 5. nginx + HTTPS
cp deploy/contabo/nginx.conf.example /etc/nginx/sites-available/souqratex
# edit DOMAIN and the root path inside the file
ln -s /etc/nginx/sites-available/souqratex /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
apt install -y certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com   # Telegram requires HTTPS

# 6. Keep pm2 running across reboots
pm2 save
pm2 startup   # run the printed command once
```

## Every time you push a new change from Replit

SSH into Contabo and run:

```bash
cd /opt/souqratex && ./deploy/contabo/deploy.sh
```

This pulls the latest `main`, reinstalls deps, rebuilds both the API and the frontend,
and reloads the API process with pm2 (frontend is a static build served by nginx directly).

### Automating it

**Option A — GitHub Actions (recommended, deploys instantly on push):**

A workflow is already committed at `.github/workflows/deploy.yml`. It SSHes into Contabo
and runs `deploy.sh` automatically every time you push to `main`. One-time setup:

1. On Contabo, make sure the deploying user can SSH in with a key (create a dedicated
   keypair if you don't want to reuse your personal one):
   ```bash
   ssh-keygen -t ed25519 -f ~/contabo_deploy_key -N ""
   cat ~/contabo_deploy_key.pub >> ~/.ssh/authorized_keys   # run this ON Contabo, as the deploy user
   ```
2. In your GitHub repo, go to **Settings → Secrets and variables → Actions → New repository secret**
   and add three secrets:
   - `CONTABO_HOST` — your server's IP or domain (e.g. `194.163.155.52`)
   - `CONTABO_USER` — the SSH username you log in with (e.g. `root`)
   - `CONTABO_SSH_KEY` — the **private** key contents (`cat ~/contabo_deploy_key` — the one WITHOUT `.pub`)
3. That's it. From now on, `git push origin main` alone triggers the deploy — check progress
   under the **Actions** tab of your GitHub repo.

**Option B — cron polling (simpler, checks every minute instead of instantly):**

```bash
crontab -e
# add:
* * * * * cd /opt/souqratex && git fetch origin main -q && [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ] && ./deploy/contabo/deploy.sh >> /var/log/souqratex-deploy.log 2>&1
```

## After every deploy to a new/changed domain

Telegram webhook, bot commands, and the menu button are tied to the public HTTPS domain.
Log into `/manager` on the new domain and click "ربط Webhook الآن" again — this is required
whenever `DOMAIN` or `SESSION_SECRET` changes (the webhook secret is derived from `SESSION_SECRET`).

## Notes

- The DB (Supabase) is shared between Replit dev and Contabo prod — no separate database setup needed on Contabo.
- `deploy/contabo/.env` is gitignored-equivalent — never commit real secrets. Keep it only on the server.
- If you rename/move the repo directory, update the `cwd`/`root` paths in `pm2.config.cjs` and `nginx.conf.example` accordingly.

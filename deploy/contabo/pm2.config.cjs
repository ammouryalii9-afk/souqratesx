// PM2 process definitions for running SouqrateX on a plain Contabo VPS.
// Only the API server runs as a long-lived Node process — the frontend is a
// static build served directly by nginx (see deploy/contabo/nginx.conf.example).
module.exports = {
  apps: [
    {
      name: "souqratex-api",
      script: "artifacts/api-server/dist/index.mjs",
      cwd: __dirname + "/../..",
      env: {
        NODE_ENV: "production",
        PORT: process.env.API_PORT || "8080",
        SESSION_SECRET: process.env.SESSION_SECRET,
        ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
        SUPABASE_DATABASE_URL: process.env.SUPABASE_DATABASE_URL,
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
      },
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
    },
  ],
};

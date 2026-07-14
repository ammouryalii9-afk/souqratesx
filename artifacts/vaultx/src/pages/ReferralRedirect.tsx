import { useEffect, useState } from 'react';

function getBotNameFromConfig(): Promise<string | null> {
  return fetch('/api/config/public', { credentials: 'include' })
    .then(r => r.json())
    .then(d => d?.botUsername ?? null)
    .catch(() => null);
}

export function ReferralRedirect() {
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [redirected, setRedirected] = useState(false);

  useEffect(() => {
    const path = window.location.pathname;
    const refMatch = path.match(/^\/ref\/(.+)$/);
    const squadMatch = path.match(/^\/squad\/(\d+)$/);

    if (!refMatch && !squadMatch) return;

    const startapp = refMatch
      ? `ref_${refMatch[1]}`
      : `squad_${squadMatch![1]}`;

    getBotNameFromConfig().then(bot => {
      const name = bot ?? 'SouqratesX_bot';
      setBotUsername(name);

      const tgUrl = `https://t.me/${name}?startapp=${startapp}`;
      const deepLink = `tg://resolve?domain=${name}&startapp=${startapp}`;

      setFallbackUrl(tgUrl);

      window.location.href = deepLink;
      setTimeout(() => setRedirected(true), 1800);
    });
  }, []);

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100dvh',
        background: 'linear-gradient(160deg, #0d0d1a 0%, #111827 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
        color: '#fff',
        padding: '24px',
        textAlign: 'center',
        gap: '24px',
      }}
    >
      <div style={{ fontSize: 64 }}>⛏️</div>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>SouqratesX</h1>
        <p style={{ fontSize: 15, color: '#94a3b8', lineHeight: 1.6 }}>
          {redirected
            ? 'إذا لم يفتح التطبيق، اضغط الزر أدناه'
            : 'جارٍ فتح تيليجرام…'}
        </p>
      </div>

      {fallbackUrl && (
        <a
          href={fallbackUrl}
          style={{
            display: 'inline-block',
            padding: '14px 32px',
            background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
            borderRadius: 14,
            color: '#fff',
            fontWeight: 700,
            fontSize: 16,
            textDecoration: 'none',
            boxShadow: '0 4px 24px rgba(99,102,241,0.4)',
          }}
        >
          افتح في تيليجرام
        </a>
      )}

      <p style={{ fontSize: 12, color: '#475569', maxWidth: 300 }}>
        تحتاج إلى تثبيت تطبيق تيليجرام للمشاركة في اللعبة
      </p>
    </div>
  );
}

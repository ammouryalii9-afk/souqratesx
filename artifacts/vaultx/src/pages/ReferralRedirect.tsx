import { useEffect, useState } from 'react';

const DEFAULT_BOT = 'SouqratesX_bot';

function tryTgDeepLink(url: string) {
  // Programmatic click — doesn't navigate the current page.
  // On Android/iOS with Telegram installed: opens the app silently.
  // On iOS without Telegram: shows a small non-blocking system toast, page stays.
  const a = document.createElement('a');
  a.href = url;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { try { document.body.removeChild(a); } catch { /* ignore */ } }, 2000);
}

export function ReferralRedirect() {
  const [tgUrl, setTgUrl] = useState<string | null>(null);

  useEffect(() => {
    const path = window.location.pathname;
    const refMatch = path.match(/^\/ref\/(.+)$/);
    const squadMatch = path.match(/^\/squad\/(\d+)$/);
    if (!refMatch && !squadMatch) return;

    const startapp = refMatch
      ? `ref_${refMatch[1]}`
      : `squad_${squadMatch![1]}`;

    // Build both URLs immediately with default bot name, show the page at once.
    const buildUrls = (bot: string) => {
      const deepLink = `tg://resolve?domain=${bot}&startapp=${startapp}`;
      const webLink = `https://t.me/${bot}?startapp=${startapp}`;
      setTgUrl(webLink);
      // Try the deep link silently after 300ms (after page is rendered).
      setTimeout(() => tryTgDeepLink(deepLink), 300);
    };

    // Show immediately with default, then refresh if API returns a different name.
    buildUrls(DEFAULT_BOT);
    fetch('/api/config/public', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d?.botUsername && d.botUsername !== DEFAULT_BOT) buildUrls(d.botUsername); })
      .catch(() => { /* keep default */ });
  }, []);

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100dvh',
        background: 'linear-gradient(160deg, #07071a 0%, #0d0d2b 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
        color: '#fff',
        padding: '24px',
        textAlign: 'center',
        gap: '28px',
      }}
    >
      <img
        src="/logo.jpeg"
        alt="SouqratesX"
        style={{ width: 100, height: 100, borderRadius: 22, objectFit: 'cover',
          boxShadow: '0 8px 40px rgba(130,80,255,0.45)',
          border: '2px solid rgba(130,80,255,0.3)' }}
      />

      <div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 8px',
          background: 'linear-gradient(90deg, #a78bfa, #7c3aed)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          SouqratesX
        </h1>
        <p style={{ fontSize: 15, color: '#7c6fa0', margin: 0, lineHeight: 1.6 }}>
          منصة الربح داخل تيليجرام
        </p>
      </div>

      {/* Button is visible immediately — no loading state */}
      <a
        href={tgUrl ?? `https://t.me/${DEFAULT_BOT}?startapp=open`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          padding: '15px 36px',
          background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
          borderRadius: 16, color: '#fff', fontWeight: 700, fontSize: 17,
          textDecoration: 'none',
          boxShadow: '0 4px 32px rgba(124,58,237,0.5)',
        }}
      >
        <span style={{ fontSize: 20 }}>✈️</span>
        افتح في تيليجرام
      </a>

      <p style={{ fontSize: 12, color: '#3a3060', maxWidth: 300, margin: 0 }}>
        يجب أن يكون تطبيق تيليجرام مثبتاً على جهازك
      </p>
    </div>
  );
}

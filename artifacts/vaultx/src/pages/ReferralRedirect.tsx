import { useEffect, useState } from 'react';

const DEFAULT_BOT = 'souqratesx_bot';

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

function getStartapp(): string {
  const path = window.location.pathname;
  const refMatch = path.match(/^\/ref\/(.+)$/);
  const squadMatch = path.match(/^\/squad\/(\d+)$/);
  if (refMatch) return `ref_${refMatch[1]}`;
  if (squadMatch) return `squad_${squadMatch[1]}`;
  return 'open';
}

export function ReferralRedirect() {
  const [bot, setBot] = useState(DEFAULT_BOT);
  const startapp = getStartapp();
  const tgUrl = `https://t.me/${bot}?startapp=${startapp}`;
  const deepLink = `tg://resolve?domain=${bot}&startapp=${startapp}`;

  useEffect(() => {
    // Try the deep link silently after the page renders — opens the Telegram
    // app directly even when t.me is DNS-blocked on the user's network.
    const t = setTimeout(() => tryTgDeepLink(deepLink), 300);
    fetch('/api/config/public', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d?.botUsername) setBot(d.botUsername); })
      .catch(() => { /* keep default */ });
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpen = (e: React.MouseEvent) => {
    e.preventDefault();
    tryTgDeepLink(deepLink);
    setTimeout(() => {
      if (!document.hidden) window.location.href = tgUrl;
    }, 1500);
  };

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
          منصة SouqrateX
        </p>
      </div>

      {/* Button is visible immediately — no loading state */}
      <a
        href={tgUrl}
        onClick={handleOpen}
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

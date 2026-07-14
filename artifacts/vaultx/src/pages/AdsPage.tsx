import { useEffect, useState } from 'react';

function fetchBotUsername(): Promise<string> {
  return fetch('/api/config/public', { credentials: 'include' })
    .then(r => r.json())
    .then(d => (d?.botUsername as string | null) ?? 'souqratesx_bot')
    .catch(() => 'souqratesx_bot');
}

function openTelegram(botUsername: string, startapp: string) {
  const deepLink = `tg://resolve?domain=${botUsername}&startapp=${startapp}`;
  const webLink = `https://t.me/${botUsername}?startapp=${startapp}`;
  // Try the tg:// deep link first — opens the Telegram app directly even when
  // t.me is DNS-blocked on the user's network. Falls back to t.me shortly after.
  const a = document.createElement('a');
  a.href = deepLink;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try { document.body.removeChild(a); } catch { /* ignore */ }
    // If the page is still visible, the app didn't open — try the web link.
    if (!document.hidden) window.open(webLink, '_blank');
  }, 1500);
}

export function AdsPage() {
  const [botUsername, setBotUsername] = useState('souqratesx_bot');

  useEffect(() => {
    fetchBotUsername().then(setBotUsername).catch(() => {});
  }, []);

  const botLink = `https://t.me/${botUsername}?startapp=ads`;
  const handlePlay = (e: React.MouseEvent) => {
    e.preventDefault();
    openTelegram(botUsername, 'ads');
  };

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100dvh',
        background: 'linear-gradient(160deg, #07071a 0%, #0d0d2b 60%, #100820 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        color: '#fff',
        overflowX: 'hidden',
      }}
    >
      {/* Hero */}
      <section
        style={{
          width: '100%',
          maxWidth: 520,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '48px 24px 32px',
          gap: 20,
          textAlign: 'center',
        }}
      >
        {/* Logo */}
        <img
          src="/logo.jpeg"
          alt="SouqratesX"
          style={{
            width: 140,
            height: 140,
            borderRadius: 28,
            objectFit: 'cover',
            boxShadow: '0 8px 48px rgba(130,80,255,0.5)',
            border: '2px solid rgba(130,80,255,0.3)',
          }}
        />

        {/* Name + tagline */}
        <div>
          <h1
            style={{
              fontSize: 34,
              fontWeight: 800,
              margin: 0,
              background: 'linear-gradient(90deg, #a78bfa, #7c3aed)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.5px',
            }}
          >
            SouqratesX
          </h1>
          <p style={{ fontSize: 15, color: '#7c6fa0', margin: '6px 0 0', fontWeight: 500 }}>
            منصة الربح داخل تيليجرام
          </p>
        </div>

        {/* CTA */}
        <a
          href={botLink}
          onClick={handlePlay}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '15px 36px',
            background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
            borderRadius: 16,
            color: '#fff',
            fontWeight: 700,
            fontSize: 17,
            textDecoration: 'none',
            boxShadow: '0 4px 32px rgba(124,58,237,0.5)',
          }}
        >
          <span style={{ fontSize: 20 }}>✈️</span>
          العب على تيليجرام
        </a>
      </section>

      {/* Features */}
      <section
        style={{
          width: '100%',
          maxWidth: 520,
          padding: '0 24px 36px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {[
          { icon: '⛏️', title: 'التعدين التلقائي', desc: 'اضغط وعدّن النقاط في كل وقت، وارابح بشكل سلبي حتى وأنت غائب.' },
          { icon: '🎮', title: 'ألعاب يومية', desc: 'العجلة، تحدي الذاكرة، والنقر السريع — العب يومياً واكسب نقاطاً إضافية.' },
          { icon: '👥', title: 'نظام الإحالة', desc: 'ادعُ أصدقاءك واكسب نسبة من أرباحهم. كلما دعوت أكثر، ربحت أكثر.' },
          { icon: '🛡️', title: 'الفِرَق', desc: 'أنشئ فرقتك أو انضم لفرقة وتنافس على قائمة أفضل الفِرَق عالمياً.' },
          { icon: '💎', title: 'عملة SKX', desc: 'حوّل نقاطك إلى عملة SKX القابلة للسحب وشارك في نظام البكسلات.' },
        ].map(f => (
          <div
            key={f.title}
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(130,80,255,0.15)',
              borderRadius: 16,
              padding: '16px 18px',
              display: 'flex',
              gap: 14,
              alignItems: 'flex-start',
            }}
          >
            <div style={{ fontSize: 24, lineHeight: 1, minWidth: 32, textAlign: 'center', paddingTop: 2 }}>
              {f.icon}
            </div>
            <div>
              <h3 style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 700 }}>{f.title}</h3>
              <p style={{ margin: 0, fontSize: 13, color: '#7c6fa0', lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Bottom */}
      <section
        style={{
          width: '100%',
          maxWidth: 520,
          padding: '0 24px 56px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <p style={{ fontSize: 13, color: '#4c4470', margin: 0 }}>
          انضم لآلاف اللاعبين الآن وابدأ رحلتك
        </p>
        {botLink && (
          <a
            href={botLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 28px',
              background: 'rgba(124,58,237,0.12)',
              border: '1px solid rgba(124,58,237,0.3)',
              borderRadius: 14,
              color: '#a78bfa',
              fontWeight: 700,
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            <span>🚀</span>
            @{botUsername}
          </a>
        )}
        <p style={{ fontSize: 11, color: '#2a2040', margin: 0 }}>
          SouqratesX © {new Date().getFullYear()}
        </p>
      </section>
    </div>
  );
}

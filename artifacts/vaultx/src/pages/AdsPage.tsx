import { useEffect, useState } from 'react';

interface AdsPageFeature {
  icon: string;
  title: string;
  desc: string;
  url?: string | null;
}

interface AdsPageLink {
  label: string;
  url: string;
  icon?: string | null;
}

interface AdsPageConfig {
  title: string;
  tagline: string;
  ctaText: string;
  ctaEmoji: string;
  footerText: string;
  features: AdsPageFeature[];
  extraLinks: AdsPageLink[];
}

interface PublicConfigResponse {
  botUsername?: string;
  adsPage?: AdsPageConfig;
}

const DEFAULT_CONFIG: AdsPageConfig = {
  title: 'SouqratesX',
  tagline: 'منصة SouqrateX',
  ctaText: 'العب على تيليجرام',
  ctaEmoji: '✈️',
  footerText: 'انضم لآلاف اللاعبين الآن وابدأ رحلتك',
  features: [
    { icon: '⛏️', title: 'التعدين التلقائي', desc: 'اضغط وعدّن النقاط في كل وقت، وارابح بشكل سلبي حتى وأنت غائب.' },
    { icon: '🎮', title: 'ألعاب يومية', desc: 'العجلة، تحدي الذاكرة، والنقر السريع — العب يومياً واكسب نقاطاً إضافية.' },
    { icon: '👥', title: 'نظام الإحالة', desc: 'ادعُ أصدقاءك واكسب نسبة من أرباحهم. كلما دعوت أكثر، ربحت أكثر.' },
    { icon: '🛡️', title: 'الفِرَق', desc: 'أنشئ فرقتك أو انضم لفرقة وتنافس على قائمة أفضل الفِرَق عالمياً.' },
    { icon: '💎', title: 'عملة SKX', desc: 'حوّل نقاطك إلى عملة SKX القابلة للسحب وشارك في نظام البكسلات.' },
  ],
  extraLinks: [],
};

function openTelegram(botUsername: string, startapp: string) {
  const deepLink = `tg://resolve?domain=${botUsername}&startapp=${startapp}`;
  const webLink = `https://t.me/${botUsername}?startapp=${startapp}`;
  const a = document.createElement('a');
  a.href = deepLink;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try { document.body.removeChild(a); } catch { /* ignore */ }
    if (!document.hidden) window.open(webLink, '_blank');
  }, 1500);
}

export function AdsPage() {
  const [botUsername, setBotUsername] = useState('souqratesx_bot');
  const [cfg, setCfg] = useState<AdsPageConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    fetch('/api/config/public', { credentials: 'include' })
      .then(r => r.json())
      .then((d: PublicConfigResponse) => {
        if (d?.botUsername) setBotUsername(d.botUsername);
        if (d?.adsPage) setCfg(d.adsPage);
      })
      .catch(() => {});
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
        <img
          src="/logo.jpeg"
          alt={cfg.title}
          style={{
            width: 140,
            height: 140,
            borderRadius: 28,
            objectFit: 'cover',
            boxShadow: '0 8px 48px rgba(130,80,255,0.5)',
            border: '2px solid rgba(130,80,255,0.3)',
          }}
        />

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
            {cfg.title}
          </h1>
          <p style={{ fontSize: 15, color: '#7c6fa0', margin: '6px 0 0', fontWeight: 500 }}>
            {cfg.tagline}
          </p>
        </div>

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
          <span style={{ fontSize: 20 }}>{cfg.ctaEmoji}</span>
          {cfg.ctaText}
        </a>
      </section>

      {/* Features */}
      {cfg.features.length > 0 && (
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
          {cfg.features.map((f, i) => {
            const inner = (
              <div
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(130,80,255,0.15)',
                  borderRadius: 16,
                  padding: '16px 18px',
                  display: 'flex',
                  gap: 14,
                  alignItems: 'flex-start',
                  textDecoration: 'none',
                  color: 'inherit',
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
            );
            return f.url ? (
              <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                {inner}
              </a>
            ) : (
              <div key={i}>{inner}</div>
            );
          })}
        </section>
      )}

      {/* Extra Links */}
      {cfg.extraLinks.length > 0 && (
        <section
          style={{
            width: '100%',
            maxWidth: 520,
            padding: '0 24px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {cfg.extraLinks.map((link, i) => (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '12px 24px',
                background: 'rgba(124,58,237,0.12)',
                border: '1px solid rgba(124,58,237,0.25)',
                borderRadius: 12,
                color: '#a78bfa',
                fontWeight: 600,
                fontSize: 14,
                textDecoration: 'none',
              }}
            >
              {link.icon && <span style={{ fontSize: 18 }}>{link.icon}</span>}
              {link.label}
            </a>
          ))}
        </section>
      )}

      {/* Footer */}
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
        <p style={{ fontSize: 13, color: '#4c4470', margin: 0 }}>{cfg.footerText}</p>
        <p style={{ fontSize: 11, color: '#2a2040', margin: 0 }}>
          SouqratesX © {new Date().getFullYear()}
        </p>
      </section>
    </div>
  );
}

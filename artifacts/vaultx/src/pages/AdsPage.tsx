import { useEffect, useState } from 'react';

interface AdsPageFeature { icon: string; title: string; desc: string; url?: string | null }
interface AdsPageLink    { label: string; url: string; icon?: string | null }
interface AdsPageConfig  {
  title: string; tagline: string; ctaText: string; ctaEmoji: string;
  footerText: string; features: AdsPageFeature[]; extraLinks: AdsPageLink[];
}
interface PublicConfigResponse { botUsername?: string; adsPage?: AdsPageConfig }

const DEFAULT_CONFIG: AdsPageConfig = {
  title:       'SouqratesX',
  tagline:     'The #1 Telegram Play-to-Earn Platform',
  ctaText:     'Play on Telegram',
  ctaEmoji:    '🚀',
  footerText:  'Join thousands of players and start earning today',
  features: [
    { icon: '⛏️', title: 'Auto Mining',      desc: 'Tap to mine SKP points anytime. Your miners keep earning even when you are offline.' },
    { icon: '🎮', title: 'Daily Games',       desc: 'Lucky Wheel, Memory Match, Speed Tap — play every day for bonus rewards.' },
    { icon: '👥', title: 'Referral System',   desc: 'Invite friends and earn a share of their rewards. More invites = more income.' },
    { icon: '🛡️', title: 'Squads',            desc: 'Create or join a squad and compete for the global squad leaderboard prizes.' },
    { icon: '💎', title: 'SKX Currency',      desc: 'Convert your SKP points to SKX — the withdrawable hard currency of the platform.' },
  ],
  extraLinks: [],
};

function openTelegram(botUsername: string, startapp: string) {
  const deepLink = `tg://resolve?domain=${botUsername}&startapp=${startapp}`;
  const webLink  = `https://t.me/${botUsername}?startapp=${startapp}`;
  const a = document.createElement('a');
  a.href = deepLink;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try { document.body.removeChild(a); } catch { /**/ }
    if (!document.hidden) window.open(webLink, '_blank');
  }, 1500);
}

const S = {
  page: {
    minHeight: '100dvh',
    background: 'linear-gradient(145deg, #020617 0%, #0a0f2e 45%, #050d1a 100%)',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    color: '#fff',
    overflowX: 'hidden' as const,
    position: 'relative' as const,
  },
  glow1: {
    position: 'absolute' as const,
    top: -120,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 600,
    height: 600,
    background: 'radial-gradient(circle, rgba(56,189,248,0.12) 0%, transparent 70%)',
    pointerEvents: 'none' as const,
    zIndex: 0,
  },
  glow2: {
    position: 'absolute' as const,
    top: 200,
    right: -100,
    width: 400,
    height: 400,
    background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)',
    pointerEvents: 'none' as const,
    zIndex: 0,
  },
  hero: {
    position: 'relative' as const,
    zIndex: 1,
    width: '100%',
    maxWidth: 560,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    padding: '60px 28px 40px',
    gap: 24,
    textAlign: 'center' as const,
  },
  badge: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: 6,
    padding: '5px 14px',
    background: 'rgba(56,189,248,0.1)',
    border: '1px solid rgba(56,189,248,0.25)',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    color: '#38bdf8',
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 28,
    objectFit: 'cover' as const,
    boxShadow: '0 0 0 1px rgba(56,189,248,0.2), 0 20px 60px rgba(56,189,248,0.25)',
  },
  h1: {
    fontSize: 42,
    fontWeight: 900,
    margin: 0,
    background: 'linear-gradient(135deg, #f0f9ff 0%, #38bdf8 50%, #10b981 100%)',
    WebkitBackgroundClip: 'text' as const,
    WebkitTextFillColor: 'transparent' as const,
    letterSpacing: '-1px',
    lineHeight: 1.1,
  },
  tagline: {
    fontSize: 16,
    color: '#64748b',
    margin: '8px 0 0',
    fontWeight: 500,
    letterSpacing: '0.01em',
  },
  cta: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: 10,
    padding: '16px 40px',
    background: 'linear-gradient(135deg, #0ea5e9, #10b981)',
    borderRadius: 14,
    color: '#fff',
    fontWeight: 800,
    fontSize: 17,
    textDecoration: 'none' as const,
    boxShadow: '0 4px 40px rgba(14,165,233,0.45), 0 0 0 1px rgba(255,255,255,0.08) inset',
    letterSpacing: '-0.01em',
    transition: 'transform 0.15s',
  },
  featSection: {
    position: 'relative' as const,
    zIndex: 1,
    width: '100%',
    maxWidth: 560,
    padding: '0 24px 40px',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 12,
  },
  featHeader: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    color: '#38bdf8',
    marginBottom: 4,
  },
  featCard: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 16,
    padding: '18px 20px',
    display: 'flex' as const,
    gap: 16,
    alignItems: 'flex-start' as const,
    textDecoration: 'none' as const,
    color: 'inherit' as const,
    backdropFilter: 'blur(8px)',
    transition: 'border-color 0.2s, background 0.2s',
  },
  featIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: 'rgba(56,189,248,0.1)',
    border: '1px solid rgba(56,189,248,0.15)',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    fontSize: 22,
    flexShrink: 0,
  },
  featTitle: { margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: '#f1f5f9' },
  featDesc:  { margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.65 },
  linksSection: {
    position: 'relative' as const,
    zIndex: 1,
    width: '100%',
    maxWidth: 560,
    padding: '0 24px 28px',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 10,
  },
  linkBtn: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    padding: '13px 24px',
    background: 'rgba(14,165,233,0.08)',
    border: '1px solid rgba(14,165,233,0.2)',
    borderRadius: 12,
    color: '#38bdf8',
    fontWeight: 600,
    fontSize: 14,
    textDecoration: 'none' as const,
  },
  footer: {
    position: 'relative' as const,
    zIndex: 1,
    width: '100%',
    maxWidth: 560,
    padding: '0 24px 60px',
    textAlign: 'center' as const,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
};

export function AdsPage() {
  const [botUsername, setBotUsername] = useState('souqratesx_bot');
  const [cfg, setCfg] = useState<AdsPageConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    fetch('/api/config/public', { credentials: 'include' })
      .then(r => r.json())
      .then((d: PublicConfigResponse) => {
        if (d?.botUsername) setBotUsername(d.botUsername);
        if (d?.adsPage)     setCfg(d.adsPage);
      })
      .catch(() => {});
  }, []);

  const botLink   = `https://t.me/${botUsername}?startapp=ads`;
  const handlePlay = (e: React.MouseEvent) => { e.preventDefault(); openTelegram(botUsername, 'ads'); };

  return (
    <div style={S.page}>
      {/* Ambient glows */}
      <div style={S.glow1} />
      <div style={S.glow2} />

      {/* ─── Hero ─── */}
      <section style={S.hero}>
        <div style={S.badge}>
          <span>⚡</span> Play-to-Earn on Telegram
        </div>

        <img src="/logo.jpeg" alt={cfg.title} style={S.logo} />

        <div>
          <h1 style={S.h1}>{cfg.title}</h1>
          <p style={S.tagline}>{cfg.tagline}</p>
        </div>

        <a href={botLink} onClick={handlePlay} target="_blank" rel="noopener noreferrer" style={S.cta}>
          <span style={{ fontSize: 22 }}>{cfg.ctaEmoji}</span>
          {cfg.ctaText}
        </a>

        {/* Stats strip */}
        <div style={{ display: 'flex', gap: 32, marginTop: 8 }}>
          {[
            { num: '50K+', label: 'Players' },
            { num: 'SKX',  label: 'Earn Real' },
            { num: 'Free', label: 'To Play' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#38bdf8' }}>{s.num}</div>
              <div style={{ fontSize: 11, color: '#475569', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Features ─── */}
      {cfg.features.length > 0 && (
        <section style={S.featSection}>
          <p style={S.featHeader}>What you get</p>
          {cfg.features.map((f, i) => {
            const card = (
              <div style={S.featCard}>
                <div style={S.featIcon}>{f.icon}</div>
                <div>
                  <h3 style={S.featTitle}>{f.title}</h3>
                  <p style={S.featDesc}>{f.desc}</p>
                </div>
              </div>
            );
            return f.url
              ? <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>{card}</a>
              : <div key={i}>{card}</div>;
          })}
        </section>
      )}

      {/* ─── Extra Links ─── */}
      {cfg.extraLinks.length > 0 && (
        <section style={S.linksSection}>
          {cfg.extraLinks.map((link, i) => (
            <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" style={S.linkBtn}>
              {link.icon && <span style={{ fontSize: 18 }}>{link.icon}</span>}
              {link.label}
            </a>
          ))}
        </section>
      )}

      {/* ─── Footer ─── */}
      <section style={S.footer}>
        {/* Divider */}
        <div style={{ width: '100%', height: 1, background: 'linear-gradient(90deg, transparent, rgba(56,189,248,0.15), transparent)', marginBottom: 12 }} />
        <p style={{ fontSize: 14, color: '#334155', margin: 0, fontWeight: 500 }}>{cfg.footerText}</p>
        <p style={{ fontSize: 11, color: '#1e293b', margin: 0, letterSpacing: '0.04em' }}>
          SouqratesX &copy; {new Date().getFullYear()} &nbsp;·&nbsp; All rights reserved
        </p>
      </section>
    </div>
  );
}

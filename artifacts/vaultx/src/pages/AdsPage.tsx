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
    { icon: '⛏️', title: 'Auto Mining',     desc: 'Tap to mine SKP points anytime. Your miners keep earning even while you are offline.' },
    { icon: '🎮', title: 'Daily Games',      desc: 'Lucky Wheel, Memory Match, Speed Tap — play every day and earn bonus rewards.' },
    { icon: '👥', title: 'Referral System',  desc: 'Invite friends and earn a share of their rewards. More invites = more income.' },
    { icon: '🛡️', title: 'Squads',           desc: 'Create or join a squad and compete for the global squad leaderboard prizes.' },
    { icon: '💎', title: 'SKX Currency',     desc: 'Convert your SKP points to SKX — the withdrawable hard currency of the platform.' },
  ],
  extraLinks: [],
};

function openTelegram(botUsername: string, startapp: string) {
  const deepLink = `tg://resolve?domain=${botUsername}&startapp=${startapp}`;
  const webLink  = `https://t.me/${botUsername}?startapp=${startapp}`;
  const a = document.createElement('a');
  a.href = deepLink; a.style.display = 'none'; document.body.appendChild(a); a.click();
  setTimeout(() => { try { document.body.removeChild(a); } catch { /**/ } if (!document.hidden) window.open(webLink, '_blank'); }, 1500);
}

/* ── Accent colours per feature card ── */
const CARD_ACCENTS = [
  { bg: 'rgba(255,196,0,0.12)',  border: 'rgba(255,196,0,0.35)',  icon: '#ffc400', dot: '#ffc400' },
  { bg: 'rgba(255,80,180,0.12)', border: 'rgba(255,80,180,0.35)', icon: '#ff50b4', dot: '#ff50b4' },
  { bg: 'rgba(0,220,130,0.12)',  border: 'rgba(0,220,130,0.35)',  icon: '#00dc82', dot: '#00dc82' },
  { bg: 'rgba(99,160,255,0.12)', border: 'rgba(99,160,255,0.35)', icon: '#63a0ff', dot: '#63a0ff' },
  { bg: 'rgba(255,130,0,0.12)',  border: 'rgba(255,130,0,0.35)',  icon: '#ff8200', dot: '#ff8200' },
];

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

  const botLink    = `https://t.me/${botUsername}?startapp=ads`;
  const handlePlay = (e: React.MouseEvent) => { e.preventDefault(); openTelegram(botUsername, 'ads'); };

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(160deg, #0b0b1e 0%, #130d2e 55%, #0c1628 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      color: '#fff', overflowX: 'hidden', position: 'relative',
    }}>

      {/* ── Decorative blobs ── */}
      <div style={{ position: 'absolute', top: -80, left: '50%', transform: 'translateX(-50%)', width: 560, height: 560, background: 'radial-gradient(circle, rgba(255,196,0,0.1) 0%, rgba(255,80,180,0.06) 50%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'absolute', top: 320, right: -60, width: 360, height: 360, background: 'radial-gradient(circle, rgba(0,220,130,0.08) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'absolute', top: 600, left: -60, width: 300, height: 300, background: 'radial-gradient(circle, rgba(99,160,255,0.07) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      {/* ── Hero ── */}
      <section style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '52px 28px 36px', gap: 22, textAlign: 'center' }}>

        {/* Top badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 16px', background: 'linear-gradient(90deg, rgba(255,196,0,0.18), rgba(255,80,180,0.18))', border: '1px solid rgba(255,196,0,0.4)', borderRadius: 999, fontSize: 12, fontWeight: 700, color: '#ffd740', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          ⚡ Play-to-Earn on Telegram
        </div>

        {/* Logo with glow ring */}
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', inset: -8, borderRadius: 36, background: 'conic-gradient(from 0deg, #ffc400, #ff50b4, #00dc82, #63a0ff, #ffc400)', opacity: 0.55, filter: 'blur(10px)', zIndex: 0 }} />
          <img src="/logo.jpeg" alt={cfg.title} style={{ position: 'relative', zIndex: 1, width: 120, height: 120, borderRadius: 28, objectFit: 'cover', boxShadow: '0 0 0 3px rgba(255,255,255,0.1)' }} />
        </div>

        {/* Title */}
        <div>
          <h1 style={{ fontSize: 46, fontWeight: 900, margin: 0, background: 'linear-gradient(135deg, #ffd740 0%, #ff50b4 50%, #63a0ff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-1.5px', lineHeight: 1.05 }}>
            {cfg.title}
          </h1>
          <p style={{ fontSize: 16, color: '#c8c0e8', margin: '10px 0 0', fontWeight: 600, letterSpacing: '0.01em' }}>
            {cfg.tagline}
          </p>
        </div>

        {/* CTA */}
        <a href={botLink} onClick={handlePlay} target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '17px 44px', background: 'linear-gradient(135deg, #ffc400 0%, #ff50b4 60%, #a855f7 100%)', borderRadius: 16, color: '#fff', fontWeight: 800, fontSize: 18, textDecoration: 'none', boxShadow: '0 6px 40px rgba(255,80,180,0.5), 0 2px 0 rgba(255,255,255,0.15) inset', letterSpacing: '-0.01em', textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
          <span style={{ fontSize: 24 }}>{cfg.ctaEmoji}</span>
          {cfg.ctaText}
        </a>

        {/* Stats strip */}
        <div style={{ display: 'flex', gap: 36, marginTop: 6 }}>
          {[
            { num: '50K+',  label: 'Players',   color: '#ffd740' },
            { num: 'SKX',   label: 'Earn Real',  color: '#ff50b4' },
            { num: 'Free',  label: 'To Play',    color: '#00dc82' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: s.color, textShadow: `0 0 20px ${s.color}88` }}>{s.num}</div>
              <div style={{ fontSize: 11, color: '#8878aa', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      {cfg.features.length > 0 && (
        <section style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 560, padding: '0 24px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#ffd740', marginBottom: 4, textShadow: '0 0 16px rgba(255,215,64,0.5)' }}>
            What you get
          </p>
          {cfg.features.map((f, i) => {
            const ac = CARD_ACCENTS[i % CARD_ACCENTS.length];
            const card = (
              <div style={{ background: ac.bg, border: `1px solid ${ac.border}`, borderRadius: 18, padding: '18px 20px', display: 'flex', gap: 16, alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
                <div style={{ width: 50, height: 50, borderRadius: 14, background: `${ac.icon}18`, border: `1.5px solid ${ac.icon}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0, boxShadow: `0 0 16px ${ac.icon}30` }}>
                  {f.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: '0 0 5px', fontSize: 15, fontWeight: 800, color: '#ffffff' }}>{f.title}</h3>
                  <p style={{ margin: 0, fontSize: 13, color: '#a89ec8', lineHeight: 1.6, fontWeight: 500 }}>{f.desc}</p>
                </div>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: ac.dot, flexShrink: 0, boxShadow: `0 0 10px ${ac.dot}` }} />
              </div>
            );
            return f.url
              ? <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>{card}</a>
              : <div key={i}>{card}</div>;
          })}
        </section>
      )}

      {/* ── Extra Links ── */}
      {cfg.extraLinks.length > 0 && (
        <section style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 560, padding: '0 24px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {cfg.extraLinks.map((link, i) => (
            <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 24px', background: 'rgba(255,215,64,0.1)', border: '1px solid rgba(255,215,64,0.3)', borderRadius: 14, color: '#ffd740', fontWeight: 700, fontSize: 14, textDecoration: 'none', letterSpacing: '0.01em' }}>
              {link.icon && <span style={{ fontSize: 18 }}>{link.icon}</span>}
              {link.label}
            </a>
          ))}
        </section>
      )}

      {/* ── Footer ── */}
      <section style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 560, padding: '0 24px 64px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div style={{ width: '100%', height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,215,64,0.2), rgba(255,80,180,0.2), transparent)', marginBottom: 14 }} />
        <p style={{ fontSize: 14, color: '#9080b8', margin: 0, fontWeight: 600 }}>{cfg.footerText}</p>
        <p style={{ fontSize: 11, color: '#4a3d6a', margin: 0, letterSpacing: '0.05em' }}>
          SouqratesX &copy; {new Date().getFullYear()} &nbsp;·&nbsp; All rights reserved
        </p>
      </section>
    </div>
  );
}

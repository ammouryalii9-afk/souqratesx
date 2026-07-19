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
    { icon: '⛏️', title: 'Auto Mining',    desc: 'Tap to mine SKP points anytime. Your miners keep earning even while you are offline.' },
    { icon: '🎮', title: 'Daily Games',     desc: 'Lucky Wheel, Memory Match, Speed Tap — play every day and earn bonus rewards.' },
    { icon: '👥', title: 'Referral System', desc: 'Invite friends and earn a share of their rewards. More invites = more income.' },
    { icon: '🛡️', title: 'Squads',          desc: 'Create or join a squad and compete for the global squad leaderboard prizes.' },
    { icon: '💎', title: 'SKX Currency',    desc: 'Convert your SKP points to SKX — the withdrawable hard currency of the platform.' },
  ],
  extraLinks: [],
};

/* ── Unified palette: amber → rose → violet ── */
const C = {
  amber:  '#f59e0b',
  rose:   '#f43f8a',
  violet: '#8b5cf6',
  amberL: 'rgba(245,158,11,',
  roseL:  'rgba(244,63,138,',
  violetL:'rgba(139,92,246,',
};

/* 3-step cycling accent per card, all from the same family */
const CARD_ACCENTS = [
  { bg: `${C.amberL}0.10)`,  border: `${C.amberL}0.30)`,  color: C.amber  },
  { bg: `${C.roseL}0.10)`,   border: `${C.roseL}0.30)`,   color: C.rose   },
  { bg: `${C.violetL}0.10)`, border: `${C.violetL}0.30)`, color: C.violet },
];

function openTelegram(botUsername: string, startapp: string) {
  const deepLink = `tg://resolve?domain=${botUsername}&startapp=${startapp}`;
  const webLink  = `https://t.me/${botUsername}?startapp=${startapp}`;
  const a = document.createElement('a');
  a.href = deepLink; a.style.display = 'none'; document.body.appendChild(a); a.click();
  setTimeout(() => { try { document.body.removeChild(a); } catch { /**/ } if (!document.hidden) window.open(webLink, '_blank'); }, 1500);
}

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

    // record visit — fire and forget
    fetch('/api/track/adspage', { method: 'POST', credentials: 'include' }).catch(() => {});
  }, []);

  const botLink    = `https://t.me/${botUsername}?startapp=ads`;
  const handlePlay = (e: React.MouseEvent) => { e.preventDefault(); openTelegram(botUsername, 'ads'); };

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(160deg, #0e0920 0%, #14082e 50%, #0a1228 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      color: '#fff', overflowX: 'hidden', position: 'relative',
    }}>

      {/* ── Background glows (same palette) ── */}
      <div style={{ position:'absolute', top:-100, left:'50%', transform:'translateX(-50%)', width:600, height:600,
        background:'radial-gradient(circle, rgba(245,158,11,0.08) 0%, rgba(244,63,138,0.06) 45%, transparent 70%)',
        pointerEvents:'none', zIndex:0 }} />
      <div style={{ position:'absolute', top:380, right:-80, width:380, height:380,
        background:`radial-gradient(circle, ${C.violetL}0.07) 0%, transparent 70%)`,
        pointerEvents:'none', zIndex:0 }} />
      <div style={{ position:'absolute', top:700, left:-80, width:320, height:320,
        background:`radial-gradient(circle, ${C.roseL}0.06) 0%, transparent 70%)`,
        pointerEvents:'none', zIndex:0 }} />

      {/* ── Hero ── */}
      <section style={{ position:'relative', zIndex:1, width:'100%', maxWidth:560,
        display:'flex', flexDirection:'column', alignItems:'center',
        padding:'52px 28px 36px', gap:22, textAlign:'center' }}>

        {/* Badge */}
        <div style={{ display:'inline-flex', alignItems:'center', gap:7,
          padding:'6px 18px',
          background:'linear-gradient(90deg, rgba(245,158,11,0.15), rgba(244,63,138,0.15), rgba(139,92,246,0.15))',
          border:'1px solid rgba(245,158,11,0.35)',
          borderRadius:999, fontSize:12, fontWeight:700,
          color: C.amber, letterSpacing:'0.08em', textTransform:'uppercase' }}>
          ⚡ Play-to-Earn on Telegram
        </div>

        {/* Logo with glow ring */}
        <div style={{ position:'relative' }}>
          <div style={{ position:'absolute', inset:-6, borderRadius:34,
            background:`linear-gradient(135deg, ${C.amber}, ${C.rose}, ${C.violet})`,
            opacity:0.6, filter:'blur(8px)', zIndex:0 }} />
          <img src="/logo.jpeg" alt={cfg.title} style={{ position:'relative', zIndex:1,
            width:116, height:116, borderRadius:26, objectFit:'cover',
            boxShadow:'0 0 0 2px rgba(255,255,255,0.12)' }} />
        </div>

        {/* Title */}
        <div>
          <h1 style={{ fontSize:46, fontWeight:900, margin:0, letterSpacing:'-1.5px', lineHeight:1.05,
            background:`linear-gradient(135deg, ${C.amber} 0%, ${C.rose} 50%, ${C.violet} 100%)`,
            WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
            {cfg.title}
          </h1>
          <p style={{ fontSize:15, color:'#ccc0e8', margin:'10px 0 0', fontWeight:600 }}>
            {cfg.tagline}
          </p>
        </div>

        {/* CTA */}
        <a href={botLink} onClick={handlePlay} target="_blank" rel="noopener noreferrer"
          style={{ display:'inline-flex', alignItems:'center', gap:12,
            padding:'17px 44px',
            background:`linear-gradient(135deg, ${C.amber} 0%, ${C.rose} 55%, ${C.violet} 100%)`,
            borderRadius:16, color:'#fff', fontWeight:800, fontSize:18,
            textDecoration:'none',
            boxShadow:`0 6px 36px ${C.roseL}0.45), 0 2px 0 rgba(255,255,255,0.12) inset`,
            letterSpacing:'-0.01em', textShadow:'0 1px 3px rgba(0,0,0,0.3)' }}>
          <span style={{ fontSize:24 }}>{cfg.ctaEmoji}</span>
          {cfg.ctaText}
        </a>

        {/* Stats strip — no fake numbers */}
        <div style={{ display:'flex', gap:40, marginTop:4 }}>
          {[
            { num: 'SKX',  label: 'Earn Real',  color: C.rose   },
            { num: 'Free', label: 'To Play',     color: C.violet },
          ].map(s => (
            <div key={s.label} style={{ textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:900, color:s.color,
                textShadow:`0 0 18px ${s.color}88` }}>{s.num}</div>
              <div style={{ fontSize:11, color:'#8878aa', fontWeight:700,
                letterSpacing:'0.07em', textTransform:'uppercase', marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      {cfg.features.length > 0 && (
        <section style={{ position:'relative', zIndex:1, width:'100%', maxWidth:560,
          padding:'0 24px 40px', display:'flex', flexDirection:'column', gap:12 }}>

          <p style={{ fontSize:11, fontWeight:800, letterSpacing:'0.14em',
            textTransform:'uppercase', color:C.amber, marginBottom:4,
            textShadow:`0 0 14px ${C.amberL}0.5)` }}>
            What you get
          </p>

          {cfg.features.map((f, i) => {
            const ac = CARD_ACCENTS[i % CARD_ACCENTS.length];
            const inner = (
              <div style={{ background:ac.bg, border:`1px solid ${ac.border}`,
                borderRadius:18, padding:'18px 20px',
                display:'flex', gap:16, alignItems:'center' }}>
                <div style={{ width:50, height:50, borderRadius:14, flexShrink:0,
                  background:`rgba(${ac.color === C.amber ? '245,158,11' : ac.color === C.rose ? '244,63,138' : '139,92,246'},0.14)`,
                  border:`1.5px solid ${ac.color}40`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:24, boxShadow:`0 0 14px ${ac.color}30` }}>
                  {f.icon}
                </div>
                <div style={{ flex:1 }}>
                  <h3 style={{ margin:'0 0 5px', fontSize:15, fontWeight:800, color:'#ffffff' }}>
                    {f.title}
                  </h3>
                  <p style={{ margin:0, fontSize:13, color:'#b0a4ce', lineHeight:1.65, fontWeight:500 }}>
                    {f.desc}
                  </p>
                </div>
                <div style={{ width:7, height:7, borderRadius:'50%', flexShrink:0,
                  background:ac.color, boxShadow:`0 0 8px ${ac.color}` }} />
              </div>
            );
            return f.url
              ? <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration:'none', color:'inherit' }}>{inner}</a>
              : <div key={i}>{inner}</div>;
          })}
        </section>
      )}

      {/* ── Extra Links ── */}
      {cfg.extraLinks.length > 0 && (
        <section style={{ position:'relative', zIndex:1, width:'100%', maxWidth:560,
          padding:'0 24px 28px', display:'flex', flexDirection:'column', gap:10 }}>
          {cfg.extraLinks.map((link, i) => (
            <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
              style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                padding:'14px 24px',
                background:`linear-gradient(90deg, ${C.amberL}0.10), ${C.violetL}0.10))`,
                border:`1px solid ${C.amberL}0.25)`,
                borderRadius:14, color:C.amber, fontWeight:700, fontSize:14,
                textDecoration:'none' }}>
              {link.icon && <span style={{ fontSize:18 }}>{link.icon}</span>}
              {link.label}
            </a>
          ))}
        </section>
      )}

      {/* ── Footer ── */}
      <section style={{ position:'relative', zIndex:1, width:'100%', maxWidth:560,
        padding:'0 24px 64px', textAlign:'center',
        display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
        <div style={{ width:'100%', height:1, marginBottom:14,
          background:`linear-gradient(90deg, transparent, ${C.amberL}0.25), ${C.roseL}0.25), ${C.violetL}0.25), transparent)` }} />
        <p style={{ fontSize:14, color:'#9a8ec0', margin:0, fontWeight:600 }}>
          {cfg.footerText}
        </p>
        <p style={{ fontSize:11, color:'#4e3f72', margin:0, letterSpacing:'0.05em' }}>
          SouqratesX &copy; {new Date().getFullYear()} &nbsp;·&nbsp; All rights reserved
        </p>
      </section>
    </div>
  );
}

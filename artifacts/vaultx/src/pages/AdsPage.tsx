import { useEffect, useState } from 'react';

function getBotLink(): Promise<string> {
  return fetch('/api/config/public', { credentials: 'include' })
    .then(r => r.json())
    .then(d => `https://t.me/${d?.botUsername ?? 'SouqratesX_bot'}`)
    .catch(() => 'https://t.me/SouqratesX_bot');
}

export function AdsPage() {
  const [botLink, setBotLink] = useState('https://t.me/SouqratesX_bot');

  useEffect(() => {
    getBotLink().then(setBotLink);
  }, []);

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100dvh',
        background: 'linear-gradient(160deg, #0a0a14 0%, #0d1117 60%, #0f0a1a 100%)',
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
          padding: '60px 24px 40px',
          gap: 24,
          textAlign: 'center',
        }}
      >
        {/* Logo */}
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 24,
            background: 'linear-gradient(135deg, #FF3C00 0%, #ff6b35 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 48,
            boxShadow: '0 8px 40px rgba(255,60,0,0.45)',
          }}
        >
          ⛏️
        </div>

        {/* Name */}
        <div>
          <h1
            style={{
              fontSize: 36,
              fontWeight: 800,
              margin: 0,
              background: 'linear-gradient(90deg, #ff6b35, #f59e0b)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.5px',
            }}
          >
            SouqratesX
          </h1>
          <p style={{ fontSize: 15, color: '#64748b', margin: '6px 0 0', fontWeight: 500 }}>
            منصة الربح داخل تيليجرام
          </p>
        </div>

        {/* CTA */}
        <a
          href={botLink}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '15px 36px',
            background: 'linear-gradient(135deg, #FF3C00, #ff6b35)',
            borderRadius: 16,
            color: '#fff',
            fontWeight: 700,
            fontSize: 17,
            textDecoration: 'none',
            boxShadow: '0 4px 32px rgba(255,60,0,0.4)',
            transition: 'transform 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <span style={{ fontSize: 20 }}>✈️</span>
          ابدأ اللعب على تيليجرام
        </a>
      </section>

      {/* Description */}
      <section
        style={{
          width: '100%',
          maxWidth: 520,
          padding: '0 24px 40px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <Card
          icon="⛏️"
          title="التعدين التلقائي"
          desc="اضغط وعدّن النقاط في كل وقت، حتى وأنت غائب ترابح بشكل سلبي من مولداتك المُطوَّرة."
        />
        <Card
          icon="🎮"
          title="ألعاب يومية"
          desc="العجلة، تحدي الذاكرة، والنقر السريع — العب يومياً واكسب نقاطاً إضافية."
        />
        <Card
          icon="👥"
          title="نظام الإحالة"
          desc="ادعُ أصدقاءك واكسب نسبة من أرباحهم. كلما دعوت أكثر، ربحت أكثر."
        />
        <Card
          icon="🛡️"
          title="الفِرَق"
          desc="أنشئ فرقتك أو انضم لفرقة وتنافس على قائمة أفضل الفِرَق عالمياً."
        />
        <Card
          icon="💎"
          title="عملة SKX"
          desc="حوّل نقاطك إلى عملة SKX القابلة للسحب، وشارك في نظام البكسلات للحصول على أرباح إضافية."
        />
      </section>

      {/* Stats */}
      <section
        style={{
          width: '100%',
          maxWidth: 520,
          padding: '0 24px 40px',
          display: 'flex',
          gap: 12,
          justifyContent: 'center',
        }}
      >
        {[
          { num: '🌍', label: 'متاح عالمياً' },
          { num: '🔒', label: 'آمن ومضمون' },
          { num: '⚡', label: 'فوري ومجاني' },
        ].map(s => (
          <div
            key={s.label}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 14,
              padding: '16px 8px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 26 }}>{s.num}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 6, fontWeight: 500 }}>
              {s.label}
            </div>
          </div>
        ))}
      </section>

      {/* Bottom CTA */}
      <section
        style={{
          width: '100%',
          maxWidth: 520,
          padding: '0 24px 60px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <p style={{ fontSize: 14, color: '#475569', margin: 0 }}>
          انضم لآلاف اللاعبين الآن وابدأ رحلتك
        </p>
        <a
          href={botLink}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 32px',
            background: 'rgba(255,60,0,0.12)',
            border: '1px solid rgba(255,60,0,0.3)',
            borderRadius: 14,
            color: '#ff6b35',
            fontWeight: 700,
            fontSize: 15,
            textDecoration: 'none',
          }}
        >
          <span style={{ fontSize: 18 }}>🚀</span>
          {botLink.replace('https://t.me/', '@')}
        </a>
        <p style={{ fontSize: 11, color: '#1e293b', margin: 0 }}>
          SouqratesX © {new Date().getFullYear()}
        </p>
      </section>
    </div>
  );
}

function Card({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16,
        padding: '18px 20px',
        display: 'flex',
        gap: 16,
        alignItems: 'flex-start',
      }}
    >
      <div
        style={{
          fontSize: 26,
          lineHeight: 1,
          minWidth: 36,
          textAlign: 'center',
          paddingTop: 2,
        }}
      >
        {icon}
      </div>
      <div>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700 }}>{title}</h3>
        <p style={{ margin: 0, fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>{desc}</p>
      </div>
    </div>
  );
}

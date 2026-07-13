import logo from "@assets/logo_pro_1_transparent_1783761968725.png";

export function MaintenancePage() {
  return (
    <div
      className="min-h-[100dvh] w-full max-w-[430px] mx-auto flex flex-col items-center justify-center px-6 relative overflow-hidden"
      style={{ background: "radial-gradient(ellipse at top, #0d1f14 0%, #050a07 60%, #020402 100%)" }}
    >
      {/* Glow blobs */}
      <div className="absolute top-[-80px] left-1/2 -translate-x-1/2 w-[340px] h-[340px] rounded-full opacity-20 pointer-events-none"
        style={{ background: "radial-gradient(circle, #34d399 0%, transparent 70%)" }} />
      <div className="absolute bottom-[-60px] right-[-40px] w-[220px] h-[220px] rounded-full opacity-10 pointer-events-none"
        style={{ background: "radial-gradient(circle, #d4af37 0%, transparent 70%)" }} />

      {/* Logo */}
      <div className="mb-8 relative z-10">
        <div className="w-24 h-24 flex items-center justify-center mx-auto">
          <img
            src={logo}
            alt="SouqratesX"
            style={{
              width: 96,
              height: 96,
              objectFit: "contain",
              filter: "drop-shadow(0 0 24px rgba(52,211,153,0.5)) drop-shadow(0 0 8px rgba(212,175,55,0.3))",
            }}
          />
        </div>
      </div>

      {/* Icon */}
      <div className="mb-6 relative z-10">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
          style={{ background: "rgba(52,211,153,0.08)", border: "1.5px solid rgba(52,211,153,0.25)" }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(52,211,153,0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </div>
      </div>

      {/* Arabic text */}
      <div className="text-center relative z-10 mb-2" dir="rtl">
        <h1
          className="text-2xl font-black mb-3 leading-tight"
          style={{ color: "#34d399", textShadow: "0 0 24px rgba(52,211,153,0.4)" }}
        >
          🔧 صيانة مؤقتة
        </h1>
        <p className="text-base font-semibold mb-1" style={{ color: "rgba(255,255,255,0.9)" }}>
          البوت في وضع الصيانة المؤقتة لتقديم أفضل خدمة
        </p>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
          الرجاء المحاولة مرة أخرى خلال <span style={{ color: "#fbbf24", fontWeight: 700 }}>٥ ساعات</span>
        </p>
      </div>

      {/* Divider */}
      <div className="my-5 w-16 h-px relative z-10" style={{ background: "rgba(52,211,153,0.2)" }} />

      {/* English text */}
      <div className="text-center relative z-10 mb-8">
        <h2
          className="text-xl font-black mb-3 leading-tight"
          style={{ color: "#34d399", textShadow: "0 0 24px rgba(52,211,153,0.4)" }}
        >
          🔧 Temporary Maintenance
        </h2>
        <p className="text-base font-semibold mb-1" style={{ color: "rgba(255,255,255,0.9)" }}>
          The bot is under temporary maintenance to provide a better experience.
        </p>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
          Please try again in{" "}
          <span style={{ color: "#fbbf24", fontWeight: 700 }}>5 hours</span>.
        </p>
      </div>

      {/* Notice card */}
      <div
        className="w-full max-w-[340px] rounded-2xl p-4 relative z-10"
        style={{
          background: "rgba(212,175,55,0.06)",
          border: "1px solid rgba(212,175,55,0.2)",
        }}
      >
        <div className="flex items-start gap-3">
          <span className="text-xl mt-0.5">💰</span>
          <div>
            <p className="text-xs font-bold mb-1" style={{ color: "#fbbf24" }} dir="rtl">
              ملاحظة مهمة — Important Note
            </p>
            <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.65)" }} dir="rtl">
              جميع الأرصدة والنقاط محفوظة بالكامل وسيتم احتسابها وتعويضها عند العودة.
            </p>
            <p className="text-xs leading-relaxed mt-1" style={{ color: "rgba(255,255,255,0.65)" }}>
              All balances and points are fully saved and will be accounted for upon return.
            </p>
          </div>
        </div>
      </div>

      {/* Animated dots */}
      <div className="mt-8 flex gap-2 relative z-10">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full"
            style={{
              background: "#34d399",
              animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
              opacity: 0.7,
            }}
          />
        ))}
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../lib/i18n";
import { haptic } from "../lib/telegram";
import logo from "@assets/logo_pro_1_transparent_1783761968725.png";

const TOUR_KEY = "souqratesx_tour_seen_v1";

export function checkTourSeen(): boolean {
  return localStorage.getItem(TOUR_KEY) === "1";
}
export function markTourSeen() {
  localStorage.setItem(TOUR_KEY, "1");
}

// ── Tour steps data ────────────────────────────────────────────────────────────
interface TourStep {
  icon: string;
  color: string;
  glow: string;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  tag?: string;
}

const STEPS: TourStep[] = [
  {
    icon: "🌟",
    color: "#d4af37",
    glow: "rgba(212,175,55,0.35)",
    titleAr: "مرحباً بك في SouqratesX",
    titleEn: "Welcome to SouqratesX",
    descAr: "بوت تلغرام للربح — اِعدِن نقاط SKP ونقاط SKX، طوِّر عمّالقتك، وأكمل المهام. هذا الدليل سيريك كل شيء في دقيقة واحدة.",
    descEn: "The Telegram play-to-earn bot — mine SKP & SKX points, upgrade your miners, and complete tasks. This tour covers everything in under a minute.",
  },
  {
    icon: "⛏️",
    color: "#34d399",
    glow: "rgba(52,211,153,0.35)",
    titleAr: "Vault — المنجم الرئيسي",
    titleEn: "Vault — Main Mining Tab",
    descAr: "اضغط على الزر باستمرار لتعدين نقاط SKP. الطاقة تنتهي تدريجياً — استعدها بمشاهدة إعلان. فعِّل التوربو لمضاعفة الضربات لفترة محدودة.",
    descEn: "Tap the button to mine SKP points. Energy drains as you tap — recharge it by watching an ad. Activate Turbo for a short-term multiplier burst.",
    tag: "⛏️ Vault",
  },
  {
    icon: "🎮",
    color: "#a78bfa",
    glow: "rgba(167,139,250,0.35)",
    titleAr: "Games — الألعاب والترقيات",
    titleEn: "Games — Upgrades & Mini-Games",
    descAr: "اشترِ بطاقات الدخل السلبي (مثل Mining Rig وSolar Farm) لترفع ربحك بالساعة. العب Speed Tap وMemory Match وLucky Wheel يومياً للحصول على مكافآت إضافية.",
    descEn: "Buy passive income cards (Mining Rig, Solar Farm…) to boost your hourly profit. Play Speed Tap, Memory Match & Lucky Wheel daily for bonus rewards.",
    tag: "🎮 Games",
  },
  {
    icon: "✅",
    color: "#38bdf8",
    glow: "rgba(56,189,248,0.35)",
    titleAr: "Tasks — المهام اليومية",
    titleEn: "Tasks — Daily Challenges",
    descAr: "أكمل الشيفرة اليومية (Morse Code) وCombo اليومي. أنجز مهام الشركاء وشاهد الإعلانات للحصول على SKX (عملة صعبة قابلة للسحب).",
    descEn: "Crack the daily Morse cipher & daily combo. Complete partner tasks and watch ads to earn SKX — the hard currency you can actually withdraw.",
    tag: "✅ Tasks",
  },
  {
    icon: "🕹️",
    color: "#fb923c",
    glow: "rgba(251,146,60,0.4)",
    titleAr: "Arcade — المعركة الخفية",
    titleEn: "Arcade — The Hidden Battle",
    descAr: "اختر غرفة (Easy / Tactical / Hardcore) واحجز مربعات على الشبكة. الخلايا غير مرئية — استخدم الضربات والدروع والطُعوم لحماية منطقتك وتوسيعها. الفوز يمنحك نقاط SKX.",
    descEn: "Pick a room (Easy/Tactical/Hardcore) and claim squares on the grid. Cells are invisible — use Strikes, Shields & Decoys to guard your territory and expand. Winners earn SKX.",
    tag: "🕹️ Arcade",
  },
  {
    icon: "⭐",
    color: "#fbbf24",
    glow: "rgba(251,191,36,0.4)",
    titleAr: "Stars — المتجر المميز",
    titleEn: "Stars — Premium Store",
    descAr: "اشترِ حزم نجوم تلغرام للحصول على مكافآت حصرية: ضربات طاقة، مضاعفات دائمة، رصيد SKX مباشر، وباجات مميزة.",
    descEn: "Buy Telegram Stars bundles for exclusive perks: energy refills, permanent multipliers, direct SKX credits, and premium badges.",
    tag: "⭐ Stars",
  },
  {
    icon: "🛡️",
    color: "#4ade80",
    glow: "rgba(74,222,128,0.35)",
    titleAr: "Squad — الفريق",
    titleEn: "Squad — Team Up",
    descAr: "انضم إلى فريق أو أنشئ فريقك الخاص. نقاط كل عضو تُحتسب في لوحة تصنيف الفرق. مكافأة انضمام لمرة واحدة تنتظرك عند أول انضمام.",
    descEn: "Join or create a squad. Every member's lifetime points count toward the squad leaderboard. A one-time join bonus awaits your first squad.",
    tag: "🛡️ Squad",
  },
  {
    icon: "🟦",
    color: "#818cf8",
    glow: "rgba(129,140,248,0.35)",
    titleAr: "Pixels — السوق الرقمي",
    titleEn: "Pixels — Digital Real Estate",
    descAr: "اشترِ بكسلات بعملة SKX. نسبة من إيرادات الإعلانات تُوزَّع كأرباح على حاملي البكسلات في كل دورة. كلما كان عندك بكسلات أكثر، زادت أرباحك.",
    descEn: "Buy pixels with SKX. A share of ad revenue is distributed as dividends to pixel holders each cycle — the more you hold, the more you earn.",
    tag: "🟦 Pixels",
  },
  {
    icon: "👥",
    color: "#f472b6",
    glow: "rgba(244,114,182,0.35)",
    titleAr: "Friends — الإحالات",
    titleEn: "Friends — Referrals",
    descAr: "أرسل رابط الدعوة لأصدقائك. كل إحالة تعطيك مكافأة SKP، وتحقق أهداف لمكافآت أكبر (1، 5، 10، 25، 50، 100 دعوة). 10% مكافأة من أرباح كل مدعو.",
    descEn: "Share your invite link. Each referral gives you SKP, and milestone bonuses kick in at 1, 5, 10, 25, 50, 100 invites — plus 10% of every referral's verified earnings.",
    tag: "👥 Friends",
  },
];

// ── Component ──────────────────────────────────────────────────────────────────
interface AppTourProps {
  onClose: () => void;
}

export function AppTour({ onClose }: AppTourProps) {
  const { lang } = useLanguage();
  const isAr = lang === "ar";
  const [step, setStep] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [direction, setDirection] = useState<"next" | "prev">("next");

  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  const close = useCallback(() => {
    markTourSeen();
    onClose();
  }, [onClose]);

  const go = useCallback((dir: "next" | "prev") => {
    haptic("light");
    setDirection(dir);
    setExiting(true);
    setTimeout(() => {
      setStep(s => dir === "next" ? s + 1 : s - 1);
      setExiting(false);
    }, 160);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { if (!isLast) go("next"); }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { if (!isFirst) go("prev"); }
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, close, isFirst, isLast]);

  const title = isAr ? current.titleAr : current.titleEn;
  const desc  = isAr ? current.descAr  : current.descEn;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)" }}
      onClick={close}
    >
      {/* Card */}
      <div
        className="relative w-full max-w-[430px] rounded-t-3xl overflow-hidden pb-safe-or-6"
        style={{
          background: "linear-gradient(160deg, rgba(18,20,26,0.99) 0%, rgba(10,12,16,1) 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderBottom: "none",
          boxShadow: `0 -20px 80px ${current.glow}, 0 0 0 1px rgba(255,255,255,0.04)`,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Ambient glow top */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 pointer-events-none"
          style={{ background: `radial-gradient(ellipse, ${current.glow} 0%, transparent 70%)`, filter: "blur(20px)", transition: "background 0.4s" }}
        />

        {/* Header row */}
        <div className="relative z-10 flex items-center justify-between px-5 pt-5 pb-2">
          {/* Step counter */}
          <span className="text-[11px] font-bold text-white/30">
            {step + 1} / {STEPS.length}
          </span>
          {/* Tag pill */}
          {current.tag && (
            <span
              className="text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider"
              style={{ background: `${current.color}22`, color: current.color, border: `1px solid ${current.color}44` }}
            >
              {current.tag}
            </span>
          )}
          {/* Close */}
          <button
            onClick={close}
            className="w-7 h-7 rounded-full flex items-center justify-center bg-white/8 hover:bg-white/15 transition-all text-white/50 hover:text-white text-sm"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div
          className="relative z-10 px-5 pt-2 pb-4"
          style={{
            opacity: exiting ? 0 : 1,
            transform: exiting ? `translateX(${direction === "next" ? "-24px" : "24px"})` : "translateX(0)",
            transition: "opacity 0.15s ease, transform 0.15s ease",
          }}
        >
          {/* Icon */}
          <div className="flex items-center gap-4 mb-4">
            {step === 0 ? (
              <div className="w-16 h-16 flex items-center justify-center relative">
                <div className="absolute inset-0 rounded-2xl" style={{ background: `radial-gradient(circle, ${current.glow} 0%, transparent 70%)`, filter: "blur(8px)" }} />
                <img src={logo} alt="" className="w-14 h-14 object-contain relative z-10" style={{ filter: `drop-shadow(0 0 12px ${current.glow})` }} />
              </div>
            ) : (
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-3xl relative"
                style={{
                  background: `${current.color}18`,
                  border: `1px solid ${current.color}30`,
                  boxShadow: `0 0 20px ${current.glow}`,
                }}
              >
                {current.icon}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h2
                className="text-lg font-black text-white leading-tight mb-0.5"
                style={{ direction: isAr ? "rtl" : "ltr" }}
              >
                {title}
              </h2>
              {/* Colored line */}
              <div className="h-[2px] w-10 rounded-full" style={{ background: current.color }} />
            </div>
          </div>

          {/* Description */}
          <p
            className="text-sm text-white/65 leading-relaxed"
            style={{ direction: isAr ? "rtl" : "ltr", textAlign: isAr ? "right" : "left" }}
          >
            {desc}
          </p>
        </div>

        {/* Progress dots */}
        <div className="relative z-10 flex justify-center gap-1.5 pb-4">
          {STEPS.map((s, i) => (
            <button
              key={i}
              onClick={() => {
                if (i !== step) {
                  setDirection(i > step ? "next" : "prev");
                  setExiting(true);
                  setTimeout(() => { setStep(i); setExiting(false); }, 160);
                }
              }}
              className="transition-all duration-300 rounded-full"
              style={{
                width: i === step ? 20 : 6,
                height: 6,
                background: i === step ? s.color : "rgba(255,255,255,0.15)",
              }}
            />
          ))}
        </div>

        {/* Navigation buttons */}
        <div className="relative z-10 flex gap-3 px-5 pb-6">
          {!isFirst && (
            <button
              onClick={() => go("prev")}
              className="flex-1 py-3 rounded-2xl text-sm font-bold text-white/70 transition-all active:scale-95"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              {isAr ? "السابق" : "Back"}
            </button>
          )}
          <button
            onClick={() => isLast ? close() : go("next")}
            className="flex-1 py-3 rounded-2xl text-sm font-black text-black transition-all active:scale-95"
            style={{
              background: isLast
                ? `linear-gradient(135deg, #d4af37, #34d399)`
                : `linear-gradient(135deg, ${current.color}cc, ${current.color})`,
              boxShadow: `0 4px 20px ${current.glow}`,
            }}
          >
            {isLast
              ? (isAr ? "ابدأ الآن! 🚀" : "Let's Go! 🚀")
              : (isAr ? "التالي" : "Next")}
          </button>
          {isFirst && (
            <button
              onClick={close}
              className="py-3 px-4 rounded-2xl text-sm font-semibold text-white/40 transition-all active:scale-95"
              style={{ background: "rgba(255,255,255,0.04)" }}
            >
              {isAr ? "تخطّى" : "Skip"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tour trigger button ────────────────────────────────────────────────────────
interface TourButtonProps {
  onOpen: () => void;
}

export function TourButton({ onOpen }: TourButtonProps) {
  const { lang } = useLanguage();
  const isAr = lang === "ar";

  return (
    <button
      onClick={() => { haptic("light"); onOpen(); }}
      aria-label="App Tour"
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all active:scale-95"
      style={{ borderColor: "rgba(212,175,55,0.25)", background: "rgba(212,175,55,0.06)" }}
    >
      <span className="text-[13px] leading-none">🗺️</span>
      <span className="text-[11px] font-bold" style={{ color: "#d4af37" }}>
        {isAr ? "جولة" : "Tour"}
      </span>
    </button>
  );
}

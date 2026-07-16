import { useEffect, useState, useRef } from "react";
import { VaultProvider, useVault, getLeague, BADGES } from "./context/VaultContext";
import { useLanguage, type Lang } from "./lib/i18n";
import { BottomNav } from "./components/BottomNav";
import { SplashScreen } from "./components/SplashScreen";
import { AdBanner } from "./components/AdBanner";
import { AnnouncementBanner } from "./components/AnnouncementBanner";
import { EventBanner } from "./components/EventBanner";
import { CelebrationOverlay } from "./components/CelebrationOverlay";
import { WelcomeReward } from "./components/WelcomeReward";
import { OfflineEarningsModal } from "./components/OfflineEarningsModal";
import { BonusRewardModal } from "./components/BonusRewardModal";
import { VaultTab } from "./tabs/VaultTab";
import { GamesTab } from "./tabs/GamesTab";
import { TasksTab } from "./tabs/TasksTab";
import { FriendsTab } from "./tabs/FriendsTab";
import { SquadTab } from "./tabs/SquadTab";
import { PixelsTab } from "./tabs/PixelsTab";
import { StarsTab } from "./tabs/StarsTab";
import { Toaster } from "@/components/ui/toaster";
import logo from "@assets/logo_pro_1_transparent_1783761968725.png";
import { getPublicConfig } from "./lib/gameApi";
import { OnboardingCard, checkTermsAccepted } from "./components/OnboardingCard";
import { MaintenancePage } from "./components/MaintenancePage";

const LANG_OPTIONS: { code: Lang; flag: string; label: string; native: string }[] = [
  { code: 'en', flag: '🇺🇸', label: 'English',  native: 'English'  },
  { code: 'ar', flag: '🇸🇦', label: 'Arabic',   native: 'العربية'  },
];

function LangPicker() {
  const { lang, setLang } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const current = LANG_OPTIONS.find(o => o.code === lang) ?? LANG_OPTIONS[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Select language"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all active:scale-95"
      >
        <svg className="w-4 h-4 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
        <span className="text-[11px] font-bold text-white/80">{current.code.toUpperCase()}</span>
        <svg className={`w-3 h-3 text-white/40 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>

      {open && (
        <div
          className="absolute top-full mt-2 right-0 z-50 rounded-2xl overflow-hidden shadow-2xl"
          style={{
            background: 'linear-gradient(145deg, rgba(20,22,26,0.98) 0%, rgba(12,14,18,0.99) 100%)',
            border: '1px solid rgba(255,255,255,0.10)',
            backdropFilter: 'blur(20px)',
            minWidth: '160px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)',
          }}
        >
          <div className="px-3 pt-3 pb-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Language</p>
          </div>
          <div className="p-1.5 flex flex-col gap-0.5">
            {LANG_OPTIONS.map(opt => {
              const active = opt.code === lang;
              return (
                <button
                  key={opt.code}
                  onClick={() => { setLang(opt.code); setOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all ${
                    active
                      ? 'bg-primary/20 text-white'
                      : 'text-white/60 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span className="text-base leading-none">{opt.flag}</span>
                  <div className="flex flex-col gap-0 flex-1">
                    <span className="text-[12px] font-semibold leading-tight">{opt.native}</span>
                    <span className="text-[10px] text-white/30 leading-tight">{opt.label}</span>
                  </div>
                  {active && (
                    <svg className="w-3.5 h-3.5 text-primary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5"/>
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Header() {
  const { tempMiningPoints, skxBalance, lifetimePoints, profitPerHour, equippedBadgeId } = useVault();
  const { tr } = useLanguage();
  const league = getLeague(lifetimePoints);
  const badge = equippedBadgeId !== null ? BADGES[equippedBadgeId] : undefined;
  const [pointsPerDollar, setPointsPerDollar] = useState(2_000_000);
  const [dollarBonus, setDollarBonus] = useState(0);
  useEffect(() => {
    getPublicConfig().then(c => {
      setPointsPerDollar(c.pointsPerDollar);
      setDollarBonus(c.dollarBonus);
    }).catch(() => {});
  }, []);
  
  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-white/5 px-5 h-20 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 flex items-center justify-center">
          <img
            src={logo}
            alt="SouqrateX"
            style={{
              width: 40,
              height: 40,
              objectFit: 'contain',
              filter: 'drop-shadow(0 0 8px rgba(212,175,55,0.5)) drop-shadow(0 0 4px rgba(52,211,153,0.3))',
            }}
          />
        </div>
        <div className="flex flex-col">
          <span className="font-extrabold tracking-tight text-lg text-white leading-none">SouqrateX</span>
          <div className="flex gap-1 mt-1">
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider bg-white/10 text-white/90">
              {league.name}
            </span>
            {badge && (
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider bg-white/10 text-white/90">
                {badge.label}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <LangPicker />
        <div className="flex flex-col items-end gap-1">
          {/* SKP row */}
          <div className="px-3 py-1.5 rounded-xl flex items-center gap-1.5 relative overflow-hidden group" style={{
            background: 'linear-gradient(135deg, rgba(52,211,153,0.08) 0%, rgba(52,211,153,0.03) 100%)',
            border: '1px solid rgba(52,211,153,0.15)',
          }}>
            <span className="text-[9px] text-primary/70 font-bold uppercase tracking-wider">SKP</span>
            <span className="text-sm font-black text-white tabular-nums tracking-tight leading-none">{Math.floor(tempMiningPoints).toLocaleString()}</span>
            <div className="w-1 h-1 rounded-full bg-primary animate-pulse"></div>
            <span className="text-[9px] text-primary/70 font-semibold tabular-nums">+{profitPerHour}/hr</span>
          </div>
          {/* SKX row */}
          <div className="px-3 py-1.5 rounded-xl flex items-center gap-1.5" style={{
            background: 'linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(251,191,36,0.03) 100%)',
            border: '1px solid rgba(251,191,36,0.15)',
          }}>
            <span className="text-[9px] text-amber-400/70 font-bold uppercase tracking-wider">SKX</span>
            <span className="text-sm font-black text-amber-300 tabular-nums tracking-tight leading-none">{skxBalance.toLocaleString()}</span>
            <span className="text-[9px] text-amber-400/60 font-semibold tabular-nums">≈${(skxBalance / pointsPerDollar).toFixed(2)}</span>
            {dollarBonus > 0 && (
              <span className="text-[9px] font-bold px-1 py-0.5 rounded-full tabular-nums"
                style={{ background: 'rgba(251,191,36,0.2)', border: '1px solid rgba(251,191,36,0.4)', color: '#fbbf24' }}>
                +${dollarBonus.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function MainLayout() {
  const [activeTab, setActiveTab] = useState('vault');
  const [bannerBlockId, setBannerBlockId] = useState<string | null>(null);
  const { isTelegramUser } = useVault();

  useEffect(() => {
    getPublicConfig()
      .then((config) => {
        setBannerBlockId(config.adsgram.bannerBlockId);
        if (config.onclicka.inpageId) {
          import('./lib/onclicka').then(({ initOnclickaInpage }) => {
            initOnclickaInpage(config.onclicka.inpageId as string);
          });
        }

      })
      .catch(() => setBannerBlockId(null));
  }, []);

  return (
    <div className="min-h-[100dvh] w-full max-w-[430px] mx-auto bg-background text-foreground relative flex flex-col shadow-2xl overflow-hidden font-sans">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background z-[-1]"></div>
      <Header />
      <AnnouncementBanner isTelegramUser={isTelegramUser} />
      <EventBanner />
      <CelebrationOverlay />
      <WelcomeReward />
      <OfflineEarningsModal />
      <BonusRewardModal />

      <main className="flex-1 overflow-x-hidden relative">
        <div className="absolute inset-0 transition-opacity duration-300">
          {activeTab === 'vault' && <VaultTab />}
          {activeTab === 'games' && <GamesTab />}
          {activeTab === 'tasks' && <TasksTab />}
          {activeTab === 'squad' && <SquadTab />}
          {activeTab === 'pixels' && <PixelsTab />}
          {activeTab === 'friends' && <FriendsTab />}
          {activeTab === 'stars' && <StarsTab />}
        </div>
      </main>

      <AdBanner bannerBlockId={bannerBlockId} />
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [termsAccepted, setTermsAccepted] = useState(checkTermsAccepted);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  useEffect(() => {
    fetch('/api/config/maintenance')
      .then((r) => r.json())
      .then((d) => setMaintenanceMode(Boolean(d?.maintenanceMode)))
      .catch(() => {});
  }, []);

  if (maintenanceMode) {
    return <MaintenancePage />;
  }

  if (showSplash) {
    return <SplashScreen onDone={() => setShowSplash(false)} />;
  }

  if (!termsAccepted) {
    return <OnboardingCard onAccept={() => setTermsAccepted(true)} />;
  }

  return (
    <VaultProvider>
      <MainLayout />
      <Toaster />
    </VaultProvider>
  );
}

export default App;

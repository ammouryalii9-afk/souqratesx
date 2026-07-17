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
import { AppTour, TourButton, checkTourSeen } from "./components/AppTour";

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

interface HeaderProps { onOpenTour: () => void; }

function Header({ onOpenTour }: HeaderProps) {
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
  
  const pph = profitPerHour >= 1_000_000
    ? `+${(profitPerHour / 1_000_000).toFixed(1)}M/hr`
    : profitPerHour >= 1_000
      ? `+${(profitPerHour / 1_000).toFixed(0)}K/hr`
      : `+${profitPerHour}/hr`;

  const usdVal = (skxBalance / pointsPerDollar).toFixed(2);

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl border-b border-white/5 px-4 pt-3 pb-2.5 flex flex-col gap-2">
      {/* ── Row 1: identity + controls ───────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {/* Logo */}
        <div className="w-8 h-8 shrink-0 flex items-center justify-center">
          <img
            src={logo}
            alt="SouqrateX"
            style={{
              width: 32, height: 32, objectFit: 'contain',
              filter: 'drop-shadow(0 0 7px rgba(212,175,55,0.5)) drop-shadow(0 0 3px rgba(52,211,153,0.3))',
            }}
          />
        </div>

        {/* Name + league */}
        <div className="flex flex-col min-w-0 shrink-0">
          <span className="font-extrabold tracking-tight text-[15px] text-white leading-none">SouqrateX</span>
          <div className="flex items-center gap-1 mt-0.5">
            <span
              className="text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider"
              style={{ background: `${league.color}22`, color: league.color, border: `1px solid ${league.color}44` }}
            >
              {league.icon} {league.name}
            </span>
            {badge && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider bg-white/10 text-white/70">
                {badge.label}
              </span>
            )}
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Tour + Lang */}
        <div className="flex items-center gap-1.5 shrink-0">
          <TourButton onOpen={onOpenTour} />
          <LangPicker />
        </div>
      </div>

      {/* ── Row 2: balance pills — full width, side by side ──────────────── */}
      <div className="flex items-stretch gap-2">
        {/* SKP */}
        <div
          className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl min-w-0"
          style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.18)' }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-[9px] font-bold text-primary/60 uppercase tracking-wider leading-none mb-0.5">SKP</span>
            <span className="text-[13px] font-black text-white tabular-nums leading-none truncate">
              {Math.floor(tempMiningPoints).toLocaleString()}
            </span>
          </div>
          <span
            className="text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded-lg whitespace-nowrap"
            style={{ background: 'rgba(52,211,153,0.12)', color: 'rgba(52,211,153,0.8)' }}
          >
            {pph}
          </span>
        </div>

        {/* SKX */}
        <div
          className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl min-w-0"
          style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.22)' }}
        >
          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#d4af37' }} />
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-[9px] font-bold text-gold/60 uppercase tracking-wider leading-none mb-0.5">SKX</span>
            <span className="text-[13px] font-black text-gold tabular-nums leading-none truncate">
              {skxBalance.toLocaleString()}
            </span>
          </div>
          <div className="flex flex-col items-end shrink-0">
            <span className="text-[10px] font-bold text-gold/70 tabular-nums whitespace-nowrap">≈${usdVal}</span>
            {dollarBonus > 0 && (
              <span className="text-[9px] font-black text-gold whitespace-nowrap">+${dollarBonus.toFixed(2)}</span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

const ALL_TABS = ['vault', 'games', 'tasks', 'squad', 'pixels', 'friends', 'stars'] as const;
type TabId = typeof ALL_TABS[number];

function MainLayout() {
  const [activeTab, setActiveTab] = useState<TabId>('vault');
  const [mountedTabs, setMountedTabs] = useState<Set<TabId>>(new Set(['vault']));
  const [bannerBlockId, setBannerBlockId] = useState<string | null>(null);
  const [showTour, setShowTour] = useState(false);
  const { isTelegramUser } = useVault();

  // Auto-show tour once for every user (new + existing)
  useEffect(() => {
    if (checkTourSeen()) return;
    const t = setTimeout(() => setShowTour(true), 800);
    return () => clearTimeout(t);
  }, []);

  const handleSetActiveTab = (tab: string) => {
    const t = tab as TabId;
    setMountedTabs(prev => prev.has(t) ? prev : new Set([...prev, t]));
    setActiveTab(t);
  };

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
      <Header onOpenTour={() => setShowTour(true)} />
      <AnnouncementBanner isTelegramUser={isTelegramUser} />
      <EventBanner />
      <CelebrationOverlay />
      <WelcomeReward />
      <OfflineEarningsModal />
      <BonusRewardModal />
      {showTour && <AppTour onClose={() => setShowTour(false)} />}

      <main className="flex-1 overflow-x-hidden relative">
        <div className="absolute inset-0">
          {mountedTabs.has('vault') && <div className={activeTab !== 'vault' ? 'hidden' : ''}><VaultTab /></div>}
          {mountedTabs.has('games') && <div className={activeTab !== 'games' ? 'hidden' : ''}><GamesTab /></div>}
          {mountedTabs.has('tasks') && <div className={activeTab !== 'tasks' ? 'hidden' : ''}><TasksTab /></div>}
          {mountedTabs.has('squad') && <div className={activeTab !== 'squad' ? 'hidden' : ''}><SquadTab /></div>}
          {mountedTabs.has('pixels') && <div className={activeTab !== 'pixels' ? 'hidden' : ''}><PixelsTab /></div>}
          {mountedTabs.has('friends') && <div className={activeTab !== 'friends' ? 'hidden' : ''}><FriendsTab /></div>}
          {mountedTabs.has('stars') && <div className={activeTab !== 'stars' ? 'hidden' : ''}><StarsTab /></div>}
        </div>
      </main>

      <AdBanner bannerBlockId={bannerBlockId} />
      <BottomNav activeTab={activeTab} setActiveTab={handleSetActiveTab} />
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

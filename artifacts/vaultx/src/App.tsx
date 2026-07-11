import { useEffect, useState } from "react";
import { VaultProvider, useVault, getLeague, BADGES } from "./context/VaultContext";
import { BottomNav } from "./components/BottomNav";
import { SplashScreen } from "./components/SplashScreen";
import { AdBanner } from "./components/AdBanner";
import { AnnouncementBanner } from "./components/AnnouncementBanner";
import { EventBanner } from "./components/EventBanner";
import { CelebrationOverlay } from "./components/CelebrationOverlay";
import { WelcomeReward } from "./components/WelcomeReward";
import { VaultTab } from "./tabs/VaultTab";
import { GamesTab } from "./tabs/GamesTab";
import { TasksTab } from "./tabs/TasksTab";
import { FriendsTab } from "./tabs/FriendsTab";
import { SquadTab } from "./tabs/SquadTab";
import { Toaster } from "@/components/ui/toaster";
import logo from "@assets/logo_pro_1_transparent_1783761968725.png";
import { getPublicConfig } from "./lib/gameApi";
import { OnboardingCard, checkTermsAccepted } from "./components/OnboardingCard";

function Header() {
  const { totalBalanceUSD, lifetimePoints, profitPerHour, equippedBadgeId } = useVault();
  const league = getLeague(lifetimePoints);
  const badge = equippedBadgeId !== null ? BADGES[equippedBadgeId] : undefined;
  
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
      <div className="px-4 py-2 rounded-2xl flex flex-col items-end justify-center relative overflow-hidden group" style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.3)',
      }}>
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Balance</span>
          <span className="text-base font-black text-white tabular-nums tracking-tight leading-none">${totalBalanceUSD.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-1 mt-1">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></div>
          <span className="text-[11px] text-primary font-bold tabular-nums tracking-wide">+{profitPerHour}/hr</span>
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

      <main className="flex-1 overflow-x-hidden relative">
        <div className="absolute inset-0 transition-opacity duration-300">
          {activeTab === 'vault' && <VaultTab />}
          {activeTab === 'games' && <GamesTab />}
          {activeTab === 'tasks' && <TasksTab />}
          {activeTab === 'squad' && <SquadTab />}
          {activeTab === 'friends' && <FriendsTab />}
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

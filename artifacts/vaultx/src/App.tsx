import { useEffect, useState } from "react";
import { VaultProvider, useVault, getLeague, BADGES } from "./context/VaultContext";
import { BottomNav } from "./components/BottomNav";
import { SplashScreen } from "./components/SplashScreen";
import { AdBanner } from "./components/AdBanner";
import { VaultTab } from "./tabs/VaultTab";
import { GamesTab } from "./tabs/GamesTab";
import { TasksTab } from "./tabs/TasksTab";
import { FriendsTab } from "./tabs/FriendsTab";
import { Toaster } from "@/components/ui/toaster";
import { Menu, Settings } from "lucide-react";
import { getPublicConfig } from "./lib/gameApi";

function Header() {
  const { totalBalanceUSD, lifetimePoints, profitPerHour, equippedBadgeId } = useVault();
  const league = getLeague(lifetimePoints);
  const badge = equippedBadgeId !== null ? BADGES[equippedBadgeId] : undefined;
  
  return (
    <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-white/5 px-5 h-20 flex items-center justify-between">
      <button className="p-2 hover:bg-white/10 rounded-full transition-colors">
        <Menu className="w-6 h-6 text-white" />
      </button>
      
      <div className="flex flex-col items-center justify-center relative">
        <div className="flex items-center gap-0.5 text-2xl tracking-tighter leading-none italic drop-shadow-[0_0_15px_rgba(245,197,24,0.3)]">
          <span className="font-black" style={{ color: "var(--glow-green)", textShadow: "0 0 10px var(--glow-green)" }}>S</span>
          <span className="font-black text-primary" style={{ textShadow: "0 0 10px var(--primary)" }}>X</span>
        </div>
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
      
      <button className="p-2 hover:bg-white/10 rounded-full transition-colors">
        <Settings className="w-6 h-6 text-white" />
      </button>
    </header>
  );
}

function MainLayout() {
  const [activeTab, setActiveTab] = useState('vault');
  const [bannerBlockId, setBannerBlockId] = useState<string | null>(null);

  useEffect(() => {
    getPublicConfig()
      .then((config) => setBannerBlockId(config.adsgram.bannerBlockId))
      .catch(() => setBannerBlockId(null));
  }, []);

  return (
    <div className="min-h-[100dvh] w-full max-w-[430px] mx-auto bg-background text-foreground relative flex flex-col shadow-2xl overflow-hidden font-sans">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background z-[-1]"></div>
      <Header />
      
      <main className="flex-1 overflow-x-hidden relative">
        <div className="absolute inset-0 transition-opacity duration-300">
          {activeTab === 'vault' && <VaultTab />}
          {activeTab === 'games' && <GamesTab />}
          {activeTab === 'tasks' && <TasksTab />}
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

  if (showSplash) {
    return <SplashScreen onDone={() => setShowSplash(false)} />;
  }

  return (
    <VaultProvider>
      <MainLayout />
      <Toaster />
    </VaultProvider>
  );
}

export default App;

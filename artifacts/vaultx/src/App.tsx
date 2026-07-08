import { useState } from "react";
import { VaultProvider, useVault } from "./context/VaultContext";
import { BottomNav } from "./components/BottomNav";
import { VaultTab } from "./tabs/VaultTab";
import { GamesTab } from "./tabs/GamesTab";
import { TasksTab } from "./tabs/TasksTab";
import { FriendsTab } from "./tabs/FriendsTab";
import { Toaster } from "@/components/ui/toaster";
import { Coins } from "lucide-react";

function Header() {
  const { totalBalanceUSD } = useVault();
  
  return (
    <header className="sticky top-0 z-40 bg-[#0D0D0F]/90 backdrop-blur-md border-b border-white/5 px-4 h-16 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-[#8A6F00] flex items-center justify-center shadow-[0_0_15px_rgba(245,197,24,0.3)]">
          <Coins className="w-5 h-5 text-black" />
        </div>
        <span className="font-bold tracking-tight text-lg text-white">VaultX</span>
      </div>
      <div className="bg-white/5 px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-medium">Bal</span>
        <span className="text-sm font-bold text-primary">${totalBalanceUSD.toFixed(2)}</span>
      </div>
    </header>
  );
}

function MainLayout() {
  const [activeTab, setActiveTab] = useState('vault');

  return (
    <div className="min-h-[100dvh] w-full max-w-[430px] mx-auto bg-background text-foreground relative flex flex-col shadow-2xl">
      <Header />
      
      <main className="flex-1 overflow-x-hidden relative">
        <div className="absolute inset-0 transition-opacity duration-300">
          {activeTab === 'vault' && <VaultTab />}
          {activeTab === 'games' && <GamesTab />}
          {activeTab === 'tasks' && <TasksTab />}
          {activeTab === 'friends' && <FriendsTab />}
        </div>
      </main>

      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}

function App() {
  return (
    <VaultProvider>
      <MainLayout />
      <Toaster />
    </VaultProvider>
  );
}

export default App;

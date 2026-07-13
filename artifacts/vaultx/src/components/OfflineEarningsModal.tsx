import { Pickaxe, Coins } from "lucide-react";
import { useVault } from "../context/VaultContext";
import { useLanguage } from "../lib/i18n";

function formatAway(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function OfflineEarningsModal() {
  const { offlineEarnings, claimOfflineEarnings } = useVault();
  const { tr } = useLanguage();

  if (!offlineEarnings) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-5" data-testid="modal-offline-earnings">
      <div className="w-full max-w-[360px] rounded-3xl border border-white/10 bg-gradient-to-b from-[#1a1a24] to-[#0e0e14] p-6 shadow-2xl">
        <div className="flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-400/30 to-primary/20 flex items-center justify-center text-emerald-300 mb-4 animate-pulse">
            <Pickaxe className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-black text-white mb-1">{tr.offline.title}</h2>
          <p className="text-sm text-muted-foreground mb-4">{tr.offline.desc(formatAway(offlineEarnings.awayMs))}</p>
          <div className="flex items-center gap-2 text-3xl font-black text-emerald-300 mb-6">
            <Coins className="w-7 h-7" />
            +{offlineEarnings.amount.toLocaleString()}
          </div>
          <button
            onClick={claimOfflineEarnings}
            className="w-full bg-gradient-to-r from-emerald-400 to-primary text-black font-black py-3 rounded-xl transition-all hover:opacity-90"
            data-testid="button-offline-claim"
          >
            {tr.offline.claim(offlineEarnings.amount.toLocaleString())}
          </button>
        </div>
      </div>
    </div>
  );
}

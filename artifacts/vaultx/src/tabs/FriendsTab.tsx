import React from 'react';
import { useVault } from '../context/VaultContext';
import { useToast } from '@/hooks/use-toast';
import { Copy, Users, Coins, ArrowRightLeft, Wallet, AlertCircle } from 'lucide-react';

const WITHDRAWAL_HISTORY = [
  { id: 1, date: '2025-06-30', amount: 5.20, method: 'Binance Pay', status: 'Paid' },
  { id: 2, date: '2025-06-15', amount: 3.10, method: 'Binance Pay', status: 'Paid' },
  { id: 3, date: '2025-05-28', amount: 2.80, method: 'TON Wallet', status: 'Pending' },
  { id: 4, date: '2025-05-10', amount: 7.50, method: 'Binance Pay', status: 'Paid' },
  { id: 5, date: '2025-04-22', amount: 1.15, method: 'TON Wallet', status: 'Failed' },
];

export const FriendsTab = () => {
  const { userId, totalReferrals, referralEarnings } = useVault();
  const { toast } = useToast();
  
  const referralLink = `https://t.me/VaultXBot?start=ref_${userId}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      toast({
        title: "Copied!",
        description: "Link copied to clipboard!",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to copy link.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="flex flex-col space-y-8 px-4 pt-6 pb-24 animate-in fade-in duration-500">
      
      {/* Referral Center */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4">Referral Center</h2>
        
        <div className="bg-card border border-white/5 rounded-xl p-5 mb-4">
          <p className="text-sm text-muted-foreground mb-3">Invite friends and earn 10% of their mining rewards permanently.</p>
          
          <div className="flex items-center gap-2 bg-black/50 p-2 rounded-lg border border-white/10">
            <input 
              type="text" 
              readOnly 
              value={referralLink}
              className="bg-transparent flex-1 text-sm text-white/80 px-2 outline-none"
            />
            <button 
              data-testid="button-copy-ref"
              onClick={copyLink}
              className="bg-primary/20 hover:bg-primary/30 text-primary p-2 rounded-md transition-colors"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-white/5 rounded-xl p-4 flex flex-col">
            <Users className="w-5 h-5 text-primary mb-2" />
            <span className="text-2xl font-bold text-white">{totalReferrals}</span>
            <span className="text-xs text-muted-foreground">Friends Joined</span>
          </div>
          <div className="bg-card border border-white/5 rounded-xl p-4 flex flex-col">
            <Coins className="w-5 h-5 text-emerald-400 mb-2" />
            <span className="text-2xl font-bold text-white">${referralEarnings.toFixed(2)}</span>
            <span className="text-xs text-muted-foreground">Total Earned</span>
          </div>
        </div>
      </section>

      {/* Ledger */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4">Recent Withdrawals</h2>
        <div className="bg-card border border-white/5 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-white/5 text-xs text-muted-foreground uppercase border-b border-white/5">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {WITHDRAWAL_HISTORY.map((row) => (
                  <tr key={row.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-white/70">{row.date}</td>
                    <td className="px-4 py-3 font-medium text-white">${row.amount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-white/70 text-xs">
                      {row.method === 'Binance Pay' ? (
                        <span className="flex items-center gap-1"><ArrowRightLeft className="w-3 h-3" /> Binance</span>
                      ) : (
                        <span className="flex items-center gap-1"><Wallet className="w-3 h-3" /> TON</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                        row.status === 'Paid' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        row.status === 'Pending' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                        'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3 text-center text-xs text-muted-foreground border-t border-white/5 bg-white/[0.02]">
            End of history
          </div>
        </div>
      </section>

    </div>
  );
};

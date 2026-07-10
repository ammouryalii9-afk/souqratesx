import React from 'react';
import { useVault, getLeague } from '../context/VaultContext';
import { useToast } from '@/hooks/use-toast';
import { Copy, Users, Coins, ArrowRightLeft, Wallet, AlertCircle, Trophy } from 'lucide-react';

const WITHDRAWAL_HISTORY = [
  { id: 1, date: '2025-06-30', amount: 5.20, method: 'Binance Pay', status: 'Paid' },
  { id: 2, date: '2025-06-15', amount: 3.10, method: 'Binance Pay', status: 'Paid' },
  { id: 3, date: '2025-05-28', amount: 2.80, method: 'TON Wallet', status: 'Pending' },
  { id: 4, date: '2025-05-10', amount: 7.50, method: 'Binance Pay', status: 'Paid' },
  { id: 5, date: '2025-04-22', amount: 1.15, method: 'TON Wallet', status: 'Failed' },
];

const LEADERBOARD = [
  { rank: 1, name: 'CryptoKing_99',    pts: 8420000 },
  { rank: 2, name: 'VaultMaster',      pts: 6180000 },
  { rank: 3, name: 'GoldDigger_X',     pts: 4250000 },
  { rank: 4, name: 'SatoshiMiner',     pts: 2100000 },
  // 5 is current user
  { rank: 6, name: 'TokenHunter',      pts: 820000 },
  { rank: 7, name: 'BlockChainBot',    pts: 540000 },
  { rank: 8, name: 'DiamondHands77',   pts: 320000 },
  { rank: 9, name: 'AltcoinAce',       pts: 180000 },
  { rank: 10, name: 'MoonFarmer',      pts: 95000 },
];

export const FriendsTab = () => {
  const { userId, username, totalReferrals, referralEarnings, lifetimePoints } = useVault();
  const { toast } = useToast();
  
  const referralLink = `https://t.me/SouqrateXBot?start=ref_${userId}`;

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

  const fullLeaderboard: { rank: number; name: string; pts: number; isCurrentUser?: boolean }[] = [
    ...LEADERBOARD.slice(0, 4),
    { rank: 5, name: username, pts: lifetimePoints, isCurrentUser: true },
    ...LEADERBOARD.slice(4)
  ];

  return (
    <div className="flex flex-col space-y-8 px-4 pt-6 pb-24 animate-in fade-in duration-500">
      
      {/* Global Leaderboard */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-primary/10 p-2.5 rounded-xl border border-primary/20 shadow-inner">
            <Trophy className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Global Leaderboard</h2>
        </div>
        <div className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-[24px] overflow-hidden shadow-sm">
          <div className="p-3.5 bg-primary/10 text-center text-sm text-primary font-bold border-b border-white/5 shadow-inner">
            Your Rank: <span className="text-white">#5</span> globally
          </div>
          <div className="flex flex-col divide-y divide-white/5">
            {fullLeaderboard.map((user) => {
              const league = getLeague(user.pts);
              const isTop3 = user.rank <= 3;
              
              return (
                <div key={user.rank} className={`flex items-center justify-between p-4 transition-colors ${user.isCurrentUser ? 'bg-primary/10 relative' : 'hover:bg-white/[0.02]'}`}>
                  {user.isCurrentUser && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r-md"></div>}
                  <div className="flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm shadow-inner ${
                      user.rank === 1 ? 'bg-[#FFD700]/20 text-[#FFD700] border border-[#FFD700]/40' : 
                      user.rank === 2 ? 'bg-[#C0C0C0]/20 text-[#C0C0C0] border border-[#C0C0C0]/40' : 
                      user.rank === 3 ? 'bg-[#CD7F32]/20 text-[#CD7F32] border border-[#CD7F32]/40' : 
                      user.isCurrentUser ? 'bg-primary/20 text-primary border border-primary/40' :
                      'bg-white/5 text-muted-foreground border border-white/10'
                    }`}>
                      {user.rank}
                    </div>
                    <div className="flex flex-col">
                      <span className={`text-sm font-bold tracking-tight ${user.isCurrentUser ? 'text-primary' : 'text-white'}`}>{user.name}</span>
                      <span className="text-[11px] text-muted-foreground font-mono mt-0.5">{user.pts.toLocaleString()} pts</span>
                    </div>
                  </div>
                  <div className="px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap shadow-sm border border-white/10 flex items-center gap-1.5" style={{ background: `linear-gradient(135deg, ${league.color}40, ${league.color}10)`, color: league.color }}>
                    <span>{league.icon}</span> {league.name}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Referral Center */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-cyan-500/10 p-2.5 rounded-xl border border-cyan-500/20 shadow-inner">
            <Users className="w-5 h-5 text-cyan-400" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Referral Center</h2>
        </div>
        
        <div className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-[24px] p-6 mb-4 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-[40px] pointer-events-none" />
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed relative z-10">Invite friends and earn <span className="text-white font-bold">10%</span> of their mining rewards permanently.</p>
          
          <div className="flex items-center gap-2 bg-black/60 p-2 rounded-xl border border-white/10 shadow-inner relative z-10">
            <input 
              type="text" 
              readOnly 
              value={referralLink}
              className="bg-transparent flex-1 text-sm text-white/90 px-3 outline-none font-mono"
            />
            <button 
              data-testid="button-copy-ref"
              onClick={copyLink}
              className="bg-primary hover:bg-primary/90 text-primary-foreground p-3 rounded-lg transition-all active:scale-95 shadow-[0_0_15px_rgba(52,211,153,0.3)]"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-[20px] p-5 flex flex-col relative overflow-hidden shadow-sm">
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-[30px] pointer-events-none" />
            <div className="bg-cyan-500/10 w-10 h-10 rounded-xl flex items-center justify-center mb-3 border border-cyan-500/20 shadow-inner">
              <Users className="w-5 h-5 text-cyan-400" />
            </div>
            <span className="text-3xl font-black text-white tracking-tight tabular-nums">{totalReferrals}</span>
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-widest mt-1">Friends Joined</span>
          </div>
          <div className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-[20px] p-5 flex flex-col relative overflow-hidden shadow-sm">
            <div className="absolute bottom-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-[30px] pointer-events-none" />
            <div className="bg-emerald-500/10 w-10 h-10 rounded-xl flex items-center justify-center mb-3 border border-emerald-500/20 shadow-inner">
              <Coins className="w-5 h-5 text-emerald-400" />
            </div>
            <span className="text-3xl font-black text-white tracking-tight tabular-nums">{Math.floor(referralEarnings).toLocaleString()}</span>
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-widest mt-1">Points Earned</span>
          </div>
        </div>
      </section>

      {/* Ledger */}
      <section>
        <h2 className="text-xl font-bold text-white tracking-tight mb-4 mt-2">Recent Withdrawals</h2>
        <div className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-[24px] overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-white/5 text-[10px] text-muted-foreground uppercase font-bold tracking-widest border-b border-white/5">
                <tr>
                  <th className="px-5 py-4">Date</th>
                  <th className="px-5 py-4">Amount</th>
                  <th className="px-5 py-4">Method</th>
                  <th className="px-5 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {WITHDRAWAL_HISTORY.map((row) => (
                  <tr key={row.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-4 text-white/70 font-mono text-xs">{row.date}</td>
                    <td className="px-5 py-4 font-bold text-white">${row.amount.toFixed(2)}</td>
                    <td className="px-5 py-4 text-white/70 text-xs">
                      {row.method === 'Binance Pay' ? (
                        <span className="flex items-center gap-1.5"><ArrowRightLeft className="w-3.5 h-3.5 text-primary" /> Binance</span>
                      ) : (
                        <span className="flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5 text-cyan-400" /> TON</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider shadow-inner ${
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
          <div className="p-4 text-center text-[10px] uppercase font-bold tracking-widest text-muted-foreground border-t border-white/5 bg-white/[0.02]">
            End of history
          </div>
        </div>
      </section>

    </div>
  );
};

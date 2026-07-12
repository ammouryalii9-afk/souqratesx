import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../lib/i18n';
import { useVault, getLeague } from '../context/VaultContext';
import { useToast } from '@/hooks/use-toast';
import { Copy, Users, Coins, ArrowRightLeft, Wallet, Trophy, Loader2 } from 'lucide-react';
import {
  getLeaderboard,
  getWeeklyLeaderboard,
  type LeaderboardEntry,
  type WeeklyLeaderboardEntry,
} from '../lib/engageApi';
import { getBotUsername } from '../lib/gameApi';

type WithdrawalRequest = {
  id: number;
  pointsAmount: number;
  usdAmount: number;
  tonAmount: number;
  walletAddress: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
};

type Row = {
  rank: number;
  telegramId: string;
  name: string;
  pts: number;
  isCurrentUser: boolean;
};

export const FriendsTab = () => {
  const { userId, username, totalReferrals, referralEarnings, lifetimePoints, isTelegramUser } = useVault();
  const { toast } = useToast();
  const { tr } = useLanguage();

  const [mode, setMode] = useState<'all' | 'weekly'>('all');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<WithdrawalRequest[]>([]);
  const [botUsername, setBotUsername] = useState('SouqratesX_bot');

  useEffect(() => {
    getBotUsername().then(setBotUsername).catch(() => {});
  }, []);

  const referralLink = `https://t.me/${botUsername}?startapp=ref_${userId}`;

  const buildRows = useCallback(
    (entries: { telegramId: string; username: string | null; firstName: string | null; pts: number }[]): Row[] =>
      entries.map((e, i) => ({
        rank: i + 1,
        telegramId: e.telegramId,
        name: e.username || e.firstName || `Player ${e.telegramId.slice(-4)}`,
        pts: e.pts,
        isCurrentUser: e.telegramId === userId,
      })),
    [userId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === 'all') {
        const data = await getLeaderboard();
        setRows(buildRows(data.map((e: LeaderboardEntry) => ({ ...e, pts: e.lifetimePoints }))));
      } else {
        const { entries } = await getWeeklyLeaderboard();
        setRows(buildRows(entries.map((e: WeeklyLeaderboardEntry) => ({ ...e, pts: e.points }))));
      }
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [mode, buildRows]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!isTelegramUser) return;
    fetch('/api/withdraw/my-requests', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: WithdrawalRequest[]) => setHistory(Array.isArray(data) ? data : []))
      .catch(() => setHistory([]));
  }, [isTelegramUser]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      toast({ title: tr.friends.copiedTitle, description: tr.friends.linkCopiedDesc });
    } catch {
      toast({ title: tr.common.error, description: 'Failed to copy link.', variant: 'destructive' });
    }
  };

  const myRow = rows.find((r) => r.isCurrentUser);

  return (
    <div className="flex flex-col space-y-8 px-4 pt-6 pb-24 animate-in fade-in duration-500">

      {/* Global Leaderboard */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-primary/10 p-2.5 rounded-xl border border-primary/20 shadow-inner">
            <Trophy className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">{tr.friends.leaderboard}</h2>
        </div>

        {/* All-time / Weekly toggle */}
        <div className="flex gap-2 mb-3 p-1 bg-white/5 rounded-2xl border border-white/5">
          {(['all', 'weekly'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="flex-1 py-2 rounded-xl text-sm font-bold transition-all"
              style={{
                background: mode === m ? 'linear-gradient(135deg, hsl(152,76%,50%), hsl(152,76%,42%))' : 'transparent',
                color: mode === m ? 'hsl(224,71%,4%)' : 'rgba(255,255,255,0.6)',
              }}
            >
              {m === 'all' ? tr.friends.allTime : tr.friends.thisWeek}
            </button>
          ))}
        </div>

        <div className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-[24px] overflow-hidden shadow-sm">
          <div className="p-3.5 bg-primary/10 text-center text-sm text-primary font-bold border-b border-white/5 shadow-inner">
            {myRow ? (
              <>{tr.friends.yourRank}: <span className="text-white">#{myRow.rank}</span> {mode === 'all' ? tr.friends.globally : tr.friends.thisWeekLabel}</>
            ) : (
              <>{tr.friends.notRanked}</>
            )}
          </div>

          {loading ? (
            <div className="py-16 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {tr.friends.noPlayers}
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-white/5">
              {rows.slice(0, 50).map((user) => {
                const league = getLeague(user.pts);
                return (
                  <div key={user.telegramId} className={`flex items-center justify-between p-4 transition-colors ${user.isCurrentUser ? 'bg-primary/10 relative' : 'hover:bg-white/[0.02]'}`}>
                    {user.isCurrentUser && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r-md" />}
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
                        <span className={`text-sm font-bold tracking-tight ${user.isCurrentUser ? 'text-primary' : 'text-white'}`}>
                          {user.isCurrentUser ? `${user.name} ${tr.friends.youLabel}` : user.name}
                        </span>
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
          )}
        </div>
      </section>

      {/* Referral Center */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-cyan-500/10 p-2.5 rounded-xl border border-cyan-500/20 shadow-inner">
            <Users className="w-5 h-5 text-cyan-400" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">{tr.friends.referralCenter}</h2>
        </div>

        <div className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-[24px] p-6 mb-4 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-[40px] pointer-events-none" />
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed relative z-10">{tr.friends.referralDesc}</p>

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
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-widest mt-1">{tr.friends.totalReferrals}</span>
          </div>
          <div className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-[20px] p-5 flex flex-col relative overflow-hidden shadow-sm">
            <div className="absolute bottom-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-[30px] pointer-events-none" />
            <div className="bg-emerald-500/10 w-10 h-10 rounded-xl flex items-center justify-center mb-3 border border-emerald-500/20 shadow-inner">
              <Coins className="w-5 h-5 text-emerald-400" />
            </div>
            <span className="text-3xl font-black text-white tracking-tight tabular-nums">{Math.floor(referralEarnings).toLocaleString()}</span>
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-widest mt-1">{tr.friends.referralEarnings}</span>
          </div>
        </div>
      </section>

      {/* Withdrawal history */}
      <section>
        <h2 className="text-xl font-bold text-white tracking-tight mb-4 mt-2">{tr.friends.withdrawHistory}</h2>
        <div className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-[24px] overflow-hidden shadow-sm">
          {history.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {tr.friends.noHistory}
            </div>
          ) : (
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
                  {history.map((row) => (
                    <tr key={row.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-4 text-white/70 font-mono text-xs">{new Date(row.createdAt).toISOString().split('T')[0]}</td>
                      <td className="px-5 py-4 font-bold text-white">${row.usdAmount.toFixed(2)}</td>
                      <td className="px-5 py-4 text-white/70 text-xs">
                        <span className="flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5 text-cyan-400" /> {row.tonAmount.toFixed(2)} TON</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider shadow-inner ${
                          row.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          row.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
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
          )}
        </div>
      </section>

    </div>
  );
};

import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../lib/i18n';
import { useVault } from '../context/VaultContext';
import { useToast } from '@/hooks/use-toast';
import { haptic } from '../lib/telegram';
import { Shield, Crown, Users, Trophy, Loader2, Share2, Copy, LogOut, Zap, Plus } from 'lucide-react';
import {
  getSquadBoard,
  getMySquad,
  createSquad,
  joinSquad,
  leaveSquad,
  type SquadBoardEntry,
  type MySquad,
} from '../lib/squadsApi';
import { getBotUsername } from '../lib/gameApi';
const EMOJI_CHOICES = ['🛡️', '⚡', '🔥', '💎', '👑', '🚀', '🐉', '🦁', '🌊', '⭐', '💰', '🎯'];

export const SquadTab = () => {
  const { isTelegramUser, refreshFromServer } = useVault();
  const { toast } = useToast();
  const { tr } = useLanguage();

  const [mySquad, setMySquad] = useState<MySquad | null>(null);
  const [board, setBoard] = useState<SquadBoardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🛡️');
  const [botUsername, setBotUsername] = useState('SouqratesX_bot');

  useEffect(() => {
    getBotUsername().then(setBotUsername).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, boardRes] = await Promise.all([
        isTelegramUser ? getMySquad() : Promise.resolve({ squad: null }),
        getSquadBoard(),
      ]);
      setMySquad(meRes.squad);
      setBoard(boardRes);
    } catch {
      setBoard([]);
    } finally {
      setLoading(false);
    }
  }, [isTelegramUser]);

  useEffect(() => {
    load();
  }, [load]);

  const inviteLink = mySquad ? `https://t.me/${botUsername}?startapp=squad_${mySquad.id}` : '';

  const share = () => {
    if (!inviteLink) return;
    haptic('medium');
    const text = tr.squad.inviteShareText(mySquad?.name ?? '');
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(text)}`;
    window.open(shareUrl, '_blank');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      haptic('success');
      toast({ title: tr.squad.copiedTitle, description: tr.squad.inviteCopied });
    } catch {
      toast({ title: 'Error', description: 'Failed to copy link.', variant: 'destructive' });
    }
  };

  const handleCreate = async () => {
    if (!isTelegramUser) {
      toast({ title: tr.squad.openInTelegram, description: tr.squad.telegramOnly, variant: 'destructive' });
      return;
    }
    if (name.trim().length < 2) {
      toast({ title: tr.squad.nameTooShort, description: tr.squad.nameTooShortDesc, variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      await createSquad(name.trim(), emoji);
      haptic('success');
      toast({ title: tr.squad.createdTitle, description: tr.squad.createdDesc });
      setCreating(false);
      setName('');
      await load();
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed to create squad.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (id: number) => {
    if (!isTelegramUser) {
      toast({ title: tr.squad.openInTelegram, description: tr.squad.telegramOnly, variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const res = await joinSquad(id);
      haptic('success');
      toast({
        title: tr.squad.joinedTitle,
        description: res.creditedBonus > 0 ? `+${res.creditedBonus.toLocaleString()} ${tr.squad.bonusPoints}` : tr.squad.welcome,
      });
      await Promise.all([load(), refreshFromServer()]);
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed to join.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    setBusy(true);
    try {
      await leaveSquad();
      haptic('warning');
      toast({ title: tr.squad.leftTitle, description: tr.squad.leftDesc });
      await load();
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed to leave.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col space-y-8 px-4 pt-6 pb-24 animate-in fade-in duration-500">
      {/* Header */}
      <section>
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-primary/10 p-2.5 rounded-xl border border-primary/20 shadow-inner">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">{tr.squad.title}</h2>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {tr.squad.subtitle}
        </p>
      </section>

      {loading ? (
        <div className="py-16 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : mySquad ? (
        <MySquadCard
          squad={mySquad}
          inviteLink={inviteLink}
          onShare={share}
          onCopy={copy}
          onLeave={handleLeave}
          busy={busy}
        />
      ) : (
        <CreateOrJoin
          creating={creating}
          setCreating={setCreating}
          name={name}
          setName={setName}
          emoji={emoji}
          setEmoji={setEmoji}
          onCreate={handleCreate}
          busy={busy}
        />
      )}

      {/* Squad leaderboard */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-yellow-500/10 p-2.5 rounded-xl border border-yellow-500/20 shadow-inner">
            <Trophy className="w-5 h-5 text-yellow-400" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">{tr.squad.topSquads}</h2>
        </div>

        <div className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-[24px] overflow-hidden shadow-sm">
          {board.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {tr.squad.noSquads}
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-white/5">
              {board.slice(0, 50).map((s) => {
                const mine = mySquad?.id === s.id;
                const canJoin = !mySquad && isTelegramUser;
                return (
                  <div key={s.id} className={`flex items-center justify-between p-4 transition-colors ${mine ? 'bg-primary/10 relative' : 'hover:bg-white/[0.02]'}`}>
                    {mine && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r-md" />}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm shadow-inner shrink-0 ${
                        s.rank === 1 ? 'bg-[#FFD700]/20 text-[#FFD700] border border-[#FFD700]/40' :
                        s.rank === 2 ? 'bg-[#C0C0C0]/20 text-[#C0C0C0] border border-[#C0C0C0]/40' :
                        s.rank === 3 ? 'bg-[#CD7F32]/20 text-[#CD7F32] border border-[#CD7F32]/40' :
                        'bg-white/5 text-muted-foreground border border-white/10'
                      }`}>
                        {s.rank}
                      </div>
                      <span className="text-2xl shrink-0">{s.emoji}</span>
                      <div className="flex flex-col min-w-0">
                        <span className={`text-sm font-bold tracking-tight truncate ${mine ? 'text-primary' : 'text-white'}`}>
                          {s.name}{mine ? ` ${tr.squad.yours}` : ''}
                        </span>
                        <span className="text-[11px] text-muted-foreground font-mono mt-0.5 flex items-center gap-2">
                          <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {s.memberCount}</span>
                          <span>{s.totalPoints.toLocaleString()} pts</span>
                        </span>
                      </div>
                    </div>
                    {canJoin && (
                      <button
                        onClick={() => handleJoin(s.id)}
                        disabled={busy}
                        className="shrink-0 bg-primary/90 hover:bg-primary text-primary-foreground text-xs font-bold px-4 py-2 rounded-xl transition-all active:scale-95 disabled:opacity-50 shadow-[0_0_15px_rgba(52,211,153,0.25)]"
                      >
                        {tr.squad.joinBtn}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

function MySquadCard({
  squad,
  inviteLink,
  onShare,
  onCopy,
  onLeave,
  busy,
}: {
  squad: MySquad;
  inviteLink: string;
  onShare: () => void;
  onCopy: () => void;
  onLeave: () => void;
  busy: boolean;
}) {
  const { tr } = useLanguage();
  return (
    <section>
      <div className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-[24px] p-6 mb-4 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-primary/10 rounded-full blur-[50px] pointer-events-none" />
        <div className="flex items-center gap-4 mb-5 relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center text-4xl shadow-inner">
            {squad.emoji}
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xl font-black text-white tracking-tight truncate">{squad.name}</span>
              {squad.isOwner && <Crown className="w-4 h-4 text-yellow-400 shrink-0" />}
            </div>
            <span className="text-xs text-muted-foreground mt-0.5">
              {squad.rank ? `${tr.squad.rankedLabel} #${squad.rank}` : tr.squad.unranked} · {squad.memberCount} {tr.squad.membersLabel}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5 relative z-10">
          <div className="bg-black/30 rounded-2xl p-4 border border-white/5">
            <span className="text-2xl font-black text-white tabular-nums">{squad.totalPoints.toLocaleString()}</span>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">{tr.squad.squadPoints}</p>
          </div>
          <div className="bg-black/30 rounded-2xl p-4 border border-white/5">
            <span className="text-2xl font-black text-white tabular-nums">{squad.memberCount}</span>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">{tr.squad.members}</p>
          </div>
        </div>

        {/* Viral invite */}
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3 text-xs text-primary font-bold">
            <Zap className="w-4 h-4" /> {tr.squad.recruitFriends}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onShare}
              className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-xl transition-all active:scale-95 shadow-[0_0_20px_rgba(52,211,153,0.3)]"
            >
              <Share2 className="w-4 h-4" /> {tr.squad.invite}
            </button>
            <button
              onClick={onCopy}
              className="bg-white/5 hover:bg-white/10 border border-white/10 text-white p-3 rounded-xl transition-all active:scale-95"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground/70 font-mono mt-2 truncate">{inviteLink}</p>
        </div>
      </div>

      {/* Members */}
      <div className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-[24px] overflow-hidden shadow-sm mb-4">
        <div className="p-3.5 text-center text-xs text-muted-foreground font-bold uppercase tracking-widest border-b border-white/5">
          {tr.squad.squadMembers}
        </div>
        <div className="flex flex-col divide-y divide-white/5">
          {squad.members.map((m, i) => (
            <div key={m.telegramId} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <span className="w-6 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
                <span className="text-sm font-bold text-white flex items-center gap-1.5">
                  {m.name}
                  {m.isOwner && <Crown className="w-3.5 h-3.5 text-yellow-400" />}
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground font-mono">{m.lifetimePoints.toLocaleString()} pts</span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onLeave}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 text-red-400/80 hover:text-red-400 text-sm font-bold py-3 transition-colors disabled:opacity-50"
      >
        <LogOut className="w-4 h-4" /> {tr.squad.leaveSquad}
      </button>
    </section>
  );
}

function CreateOrJoin({
  creating,
  setCreating,
  name,
  setName,
  emoji,
  setEmoji,
  onCreate,
  busy,
}: {
  creating: boolean;
  setCreating: (v: boolean) => void;
  name: string;
  setName: (v: string) => void;
  emoji: string;
  setEmoji: (v: string) => void;
  onCreate: () => void;
  busy: boolean;
}) {
  const { tr } = useLanguage();
  return (
    <section>
      <div className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-[24px] p-6 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-[40px] pointer-events-none" />
        {!creating ? (
          <div className="relative z-10 text-center">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1">{tr.squad.startOwn}</h3>
            <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
              {tr.squad.startOwnDesc}
            </p>
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3.5 rounded-xl transition-all active:scale-95 shadow-[0_0_20px_rgba(52,211,153,0.3)]"
            >
              <Plus className="w-4 h-4" /> {tr.squad.createSquad}
            </button>
            <p className="text-xs text-muted-foreground mt-4">{tr.squad.orJoinBelow}</p>
          </div>
        ) : (
          <div className="relative z-10 space-y-4">
            <h3 className="text-lg font-bold text-white">{tr.squad.createYourSquad}</h3>
            <div>
              <label className="text-xs text-muted-foreground font-bold uppercase tracking-widest">{tr.squad.pickIcon}</label>
              <div className="grid grid-cols-6 gap-2 mt-2">
                {EMOJI_CHOICES.map((e) => (
                  <button
                    key={e}
                    onClick={() => setEmoji(e)}
                    className={`aspect-square rounded-xl text-2xl flex items-center justify-center transition-all ${
                      emoji === e ? 'bg-primary/20 border-2 border-primary scale-105' : 'bg-black/30 border border-white/10'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-bold uppercase tracking-widest">{tr.squad.squadName}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 24))}
                placeholder="e.g. Lightning Miners"
                className="w-full mt-2 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-primary/50 transition-colors"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setCreating(false)}
                className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold py-3 rounded-xl transition-all"
              >
                {tr.squad.cancel}
              </button>
              <button
                onClick={onCreate}
                disabled={busy}
                className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : tr.squad.create}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

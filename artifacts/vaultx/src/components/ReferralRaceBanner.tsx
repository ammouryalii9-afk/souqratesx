import { useEffect, useState, useCallback } from 'react';
import { Flame, Trophy, Timer, Users, Loader2, ChevronRight } from 'lucide-react';
import { getCompetitions, joinReferralRace, getRaceLeaderboard, type RaceCompetition, type RaceLeaderboardEntry } from '../lib/gameApi';
import { haptic } from '../lib/telegram';
import { useToast } from '@/hooks/use-toast';

const MEDALS = ['🥇', '🥈', '🥉'];

function useCountdown(endAt: string) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    const tick = () => {
      const ms = new Date(endAt).getTime() - Date.now();
      if (ms <= 0) { setLabel('انتهت'); return; }
      const d = Math.floor(ms / 86_400_000);
      const h = Math.floor((ms % 86_400_000) / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1_000);
      setLabel(d > 0
        ? `${d}ي ${h}س ${m}د`
        : `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endAt]);
  return label;
}

function RaceCard({ comp, onJoined }: { comp: RaceCompetition; onJoined: (id: number) => void }) {
  const { toast } = useToast();
  const countdown = useCountdown(comp.endAt);
  const [joining, setJoining] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [leaderboard, setLeaderboard] = useState<RaceLeaderboardEntry[]>([]);
  const [lbLoading, setLbLoading] = useState(false);

  const required = comp.requiredInvites ?? 100;
  const pct = comp.entered ? Math.min(100, Math.round((comp.myProgress / required) * 100)) : 0;

  const barColor = pct >= 100 ? '#22c55e'
    : pct >= 90 ? '#ef4444'
    : pct >= 66 ? '#f97316'
    : pct >= 33 ? '#f59e0b'
    : '#818cf8';

  const loadLb = useCallback(() => {
    if (leaderboard.length > 0) return;
    setLbLoading(true);
    getRaceLeaderboard(comp.id)
      .then(r => setLeaderboard(r.leaderboard.slice(0, 3)))
      .catch(() => {})
      .finally(() => setLbLoading(false));
  }, [comp.id, leaderboard.length]);

  useEffect(() => { if (expanded) loadLb(); }, [expanded, loadLb]);

  async function handleJoin() {
    if (joining) return;
    setJoining(true);
    try {
      const r = await joinReferralRace(comp.id);
      if (r.ok && !r.alreadyJoined) {
        haptic('success');
        toast({ title: 'انضممت للسباق! 🔥', description: 'شارك رابط دعوتك وادعو أصدقاءك الآن!' });
        onJoined(comp.id);
      } else {
        toast({ title: 'أنت مسجل بالفعل', description: 'شارك رابط دعوتك لتصعد في الترتيب.' });
      }
    } catch {
      toast({ title: 'خطأ', description: 'حاول مجدداً', variant: 'destructive' });
    } finally {
      setJoining(false);
    }
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(249,115,22,0.10) 0%, rgba(239,68,68,0.07) 60%, rgba(15,23,42,0.95) 100%)',
        border: '1px solid rgba(249,115,22,0.28)',
      }}
    >
      {/* Top row */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-3">
        {/* Icon */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
          style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.35)' }}
        >
          🔥
        </div>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-orange-400">سباق الدعوات</span>
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse shrink-0" />
          </div>
          <p className="text-white font-bold text-sm leading-tight truncate">{comp.title}</p>
        </div>

        {/* Countdown */}
        <div className="text-right shrink-0">
          <div className="flex items-center justify-end gap-1 text-orange-300/60 text-[10px]">
            <Timer className="w-3 h-3" /> ينتهي
          </div>
          <span className="font-mono text-sm font-bold text-orange-300">{countdown}</span>
        </div>
      </div>

      {/* Prize + target */}
      <div className="px-4 pb-2 flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1 text-yellow-400 font-bold">
          <Trophy className="w-3.5 h-3.5" />
          {comp.prizePoints.toLocaleString()} SKP
        </div>
        <div className="flex items-center gap-1 text-white/50">
          <Users className="w-3.5 h-3.5" />
          هدف {required} دعوة
        </div>
        {comp.entered && (
          <div className={`mr-auto font-bold ${pct >= 100 ? 'text-green-400' : 'text-white/70'}`}>
            تقدمك: {comp.myProgress}/{required}
          </div>
        )}
      </div>

      {/* Progress bar (only when entered) */}
      {comp.entered && (
        <div className="px-4 pb-2">
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, background: barColor, boxShadow: `0 0 6px ${barColor}` }}
            />
          </div>
        </div>
      )}

      {/* Expandable leaderboard */}
      {expanded && (
        <div className="px-4 pb-2 space-y-1">
          {lbLoading ? (
            <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 text-orange-400 animate-spin" /></div>
          ) : leaderboard.length === 0 ? (
            <p className="text-center text-xs text-white/30 py-1">لا يوجد متسابقون بعد</p>
          ) : (
            leaderboard.map((e, i) => (
              <div key={i} className="flex items-center gap-2 bg-white/3 rounded-lg px-3 py-1.5">
                <span className="text-sm w-5">{MEDALS[i]}</span>
                <span className="flex-1 text-xs text-white truncate">{e.name}</span>
                <span className="text-xs font-bold text-orange-300">{e.gained} / {required}</span>
                <div className="w-12 h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full"
                    style={{ width: `${Math.min(100, (e.gained / required) * 100)}%`, background: barColor }} />
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Bottom row: CTA + expand toggle */}
      <div className="px-3 pb-3 flex items-center gap-2">
        {!comp.entered ? (
          <button
            onClick={handleJoin}
            disabled={joining}
            className="flex-1 h-9 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 active:scale-95 transition-all"
            style={{ background: 'linear-gradient(135deg,#f97316,#ef4444)', color: 'white', boxShadow: '0 3px 14px rgba(249,115,22,0.35)' }}
          >
            {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Flame className="w-4 h-4" /> انضم مجاناً</>}
          </button>
        ) : pct >= 100 ? (
          <div className="flex-1 h-9 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5"
            style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>
            ✅ وصلت للهدف!
          </div>
        ) : (
          <div className="flex-1 h-9 rounded-xl text-xs text-white/40 flex items-center justify-center">
            شارك رابطك لتصعد 🚀
          </div>
        )}

        <button
          onClick={() => setExpanded(v => !v)}
          className="h-9 px-3 rounded-xl bg-white/5 border border-white/10 flex items-center gap-1 text-xs text-white/60 active:scale-95 transition-all"
        >
          <span>{expanded ? 'إخفاء' : 'الترتيب'}</span>
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
      </div>
    </div>
  );
}

export function ReferralRaceBanner({ isTelegramUser }: { isTelegramUser: boolean }) {
  const [races, setRaces] = useState<RaceCompetition[]>([]);

  const load = useCallback(() => {
    if (!isTelegramUser) return;
    getCompetitions()
      .then(r => setRaces(r.competitions.filter(c => c.type === 'referral')))
      .catch(() => {});
  }, [isTelegramUser]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  function markJoined(id: number) {
    setRaces(prev => prev.map(c => c.id === id ? { ...c, entered: true } : c));
  }

  if (races.length === 0) return null;

  return (
    <div className="mx-3 mt-3 flex flex-col gap-2">
      {races.map(comp => (
        <RaceCard key={comp.id} comp={comp} onJoined={markJoined} />
      ))}
    </div>
  );
}

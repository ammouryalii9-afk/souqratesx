import { useEffect, useState } from "react";
import { adminApi } from "./adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trophy, Plus, Trash2, CheckCircle2, XCircle } from "lucide-react";

interface PollOption { id: string; label: string; emoji: string }
interface PollWithStats {
  id: number;
  question: string;
  options: PollOption[];
  entryFeeSkx: number;
  status: string;
  correctOptionId: string | null;
  totalPool: number;
  voteCounts: Record<string, number>;
  createdAt: string;
  distributedAt: string | null;
}

function fmt(n: number) { return n.toLocaleString(); }

export function AdminPollManager() {
  const [polls, setPolls]       = useState<PollWithStats[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [distributing, setDistributing] = useState<number | null>(null);
  const [closing, setClosing]   = useState<number | null>(null);
  const [msg, setMsg]           = useState("");

  // Create form state
  const [question, setQuestion] = useState("من سيفوز بنهائي كأس العالم 2026؟");
  const [options, setOptions]   = useState<PollOption[]>([
    { id: "team_a", label: "", emoji: "🏳️" },
    { id: "team_b", label: "", emoji: "🏳️" },
  ]);
  const [fee, setFee]         = useState("5000");
  const [closesAt, setClosesAt] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const d = await adminApi.get<{ polls: PollWithStats[] }>("/admin/polls");
      setPolls(d.polls);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function createPoll() {
    if (!question.trim() || options.some(o => !o.label.trim())) {
      setMsg("أكمل جميع الحقول"); return;
    }
    setCreating(true); setMsg("");
    try {
      await adminApi.post("/admin/polls", {
        question,
        options: options.map(o => ({ ...o, id: o.id || o.label.toLowerCase().replace(/\s+/g, "_") })),
        entryFeeSkx: Number(fee) || 5000,
        closesAt: closesAt || undefined,
      });
      setShowForm(false);
      await load();
    } catch { setMsg("فشل إنشاء الاستطلاع"); }
    finally { setCreating(false); }
  }

  async function closePoll(id: number) {
    setClosing(id);
    try {
      await adminApi.patch(`/admin/polls/${id}/close`, {});
      await load();
    } finally { setClosing(null); }
  }

  async function distribute(poll: PollWithStats, correctOptionId: string) {
    if (!confirm(`سيتم توزيع ${fmt(poll.totalPool)} SKX على الفائزين بـ "${poll.options.find(o=>o.id===correctOptionId)?.label}". متأكد؟`)) return;
    setDistributing(poll.id); setMsg("");
    try {
      const r = await adminApi.post<{ winnerCount: number; rewardEach: number }>(
        `/admin/polls/${poll.id}/distribute`,
        { correctOptionId },
      );
      setMsg(`✓ تم توزيع ${fmt(r.rewardEach)} SKX على ${r.winnerCount} فائز`);
      await load();
    } catch { setMsg("فشل التوزيع"); }
    finally { setDistributing(null); }
  }

  if (loading) return <p className="text-sm text-muted-foreground">جار التحميل...</p>;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background:"rgba(168,85,247,0.15)", border:"1px solid rgba(168,85,247,0.3)" }}>
            <Trophy className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">استطلاعات كأس العالم</h2>
            <p className="text-xs text-muted-foreground">أنشئ استطلاعاً مدفوعاً ووزّع الجوائز على الفائزين</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowForm(v => !v)}
          style={{ background:"linear-gradient(135deg,rgba(168,85,247,0.8),rgba(59,130,246,0.8))", border:"none" }}>
          <Plus className="w-3.5 h-3.5 mr-1" /> استطلاع جديد
        </Button>
      </div>

      {msg && (
        <div className={`text-sm px-4 py-2.5 rounded-xl font-semibold ${msg.startsWith("✓") ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : "bg-red-500/15 text-red-400 border border-red-500/30"}`}>
          {msg}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-4">
          <h3 className="text-sm font-bold text-white">إنشاء استطلاع جديد</h3>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">السؤال</span>
            <Input value={question} onChange={e => setQuestion(e.target.value)} dir="rtl" />
          </label>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">الخيارات</span>
              <button
                type="button"
                onClick={() => setOptions(o => [...o, { id: `team_${o.length+1}`, label: "", emoji: "🏳️" }])}
                className="text-[11px] text-violet-400 hover:text-violet-300"
              >+ إضافة خيار</button>
            </div>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input value={opt.emoji} onChange={e => setOptions(arr => arr.map((x,j) => j===i ? {...x, emoji:e.target.value} : x))}
                  className="w-14 text-center text-lg" />
                <Input value={opt.label} onChange={e => setOptions(arr => arr.map((x,j) => j===i ? {...x, label:e.target.value} : x))}
                  placeholder={`اسم الفريق ${i+1}`} className="flex-1" dir="rtl" />
                {options.length > 2 && (
                  <button type="button" onClick={() => setOptions(arr => arr.filter((_,j)=>j!==i))}
                    className="text-red-400 hover:text-red-300 p-1"><Trash2 className="w-4 h-4" /></button>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-xs text-muted-foreground">رسوم التصويت (SKX)</span>
              <Input type="number" value={fee} onChange={e => setFee(e.target.value)} dir="ltr" />
            </label>
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-xs text-muted-foreground">ينتهي في (اختياري)</span>
              <Input type="datetime-local" value={closesAt} onChange={e => setClosesAt(e.target.value)} dir="ltr" />
            </label>
          </div>

          <div className="flex gap-2">
            <Button onClick={createPoll} disabled={creating} className="flex-1">
              {creating ? "جار الإنشاء..." : "إنشاء الاستطلاع"}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)} className="border-white/10">
              إلغاء
            </Button>
          </div>
        </div>
      )}

      {/* Poll list */}
      {polls.length === 0 && !showForm && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center">
          <Trophy className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-sm text-muted-foreground">لا توجد استطلاعات — اضغط "استطلاع جديد" لإنشاء أول استطلاع</p>
        </div>
      )}

      {polls.map(poll => {
        const totalVotes = Object.values(poll.voteCounts).reduce((a,b)=>a+b, 0);
        const isActive = poll.status === "active";
        const isClosed = poll.status === "closed";
        const isDone   = poll.status === "distributed";

        const statusColor = isActive ? "#22c55e" : isClosed ? "#f59e0b" : "#a855f7";
        const statusLabel = isActive ? "نشط" : isClosed ? "مغلق" : "موزّع";

        return (
          <div key={poll.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
            {/* Poll header */}
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-bold text-white">{poll.question}</p>
              <span style={{ padding:"2px 10px", borderRadius:999, background:`${statusColor}18`, border:`1px solid ${statusColor}40`, fontSize:11, fontWeight:800, color:statusColor, whiteSpace:"nowrap" }}>
                {statusLabel}
              </span>
            </div>

            {/* Stats row */}
            <div className="flex gap-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground">المجموع</p>
                <p className="text-base font-black text-violet-400">{fmt(poll.totalPool)} <span className="text-[10px] font-semibold">SKX</span></p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">الأصوات</p>
                <p className="text-base font-black text-blue-400">{fmt(totalVotes)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">الرسوم</p>
                <p className="text-base font-black text-white">{fmt(poll.entryFeeSkx)}</p>
              </div>
            </div>

            {/* Options with vote bars */}
            <div className="flex flex-col gap-2">
              {poll.options.map(opt => {
                const count = poll.voteCounts[opt.id] ?? 0;
                const pct   = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                const isWin = poll.correctOptionId === opt.id;
                return (
                  <div key={opt.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                        <span>{opt.emoji}</span> {opt.label}
                        {isWin && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                        {isDone && !isWin && <XCircle className="w-3.5 h-3.5 text-red-400/50" />}
                      </span>
                      <span className="text-xs text-muted-foreground">{fmt(count)} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div style={{ width:`${pct}%`, background: isWin ? "#22c55e" : "#3b82f6" }} className="h-full rounded-full transition-all" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            {(isActive || isClosed) && (
              <div className="flex flex-col gap-2 pt-1 border-t border-white/5">
                {isActive && (
                  <Button size="sm" variant="outline" disabled={closing === poll.id}
                    onClick={() => void closePoll(poll.id)}
                    className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 text-xs">
                    {closing === poll.id ? "جار الإغلاق..." : "🔒 إغلاق التصويت"}
                  </Button>
                )}
                {(isActive || isClosed) && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">اختر الفائز وابدأ التوزيع:</p>
                    <div className="flex flex-wrap gap-2">
                      {poll.options.map(opt => (
                        <Button key={opt.id} size="sm"
                          disabled={distributing === poll.id}
                          onClick={() => void distribute(poll, opt.id)}
                          style={{ background:"linear-gradient(135deg,rgba(34,197,94,0.8),rgba(16,185,129,0.8))", border:"none", fontSize:12 }}>
                          {distributing === poll.id ? "جار التوزيع..." : `🏆 ${opt.emoji} ${opt.label} فاز`}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {isDone && poll.distributedAt && (
              <div className="flex items-center gap-2 text-xs text-emerald-400/70 border-t border-white/5 pt-2">
                <CheckCircle2 className="w-3.5 h-3.5" />
                تم توزيع الجوائز · {new Date(poll.distributedAt).toLocaleString("ar")}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

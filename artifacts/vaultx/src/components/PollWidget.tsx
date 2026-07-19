import { useEffect, useState } from "react";
import { useVault } from "@/context/VaultContext";

interface PollOption { id: string; label: string; emoji: string }
interface Poll {
  id: number;
  question: string;
  options: PollOption[];
  entryFeeSkx: number;
  status: string;
  correctOptionId: string | null;
  totalPool: number;
}
interface PollResponse {
  poll: Poll | null;
  voteCounts: Record<string, number>;
  userVote: { optionId: string; rewardSkx: number | null } | null;
}

function fmt(n: number) { return n.toLocaleString(); }

export function PollWidget() {
  const { skxBalance, refreshFromServer } = useVault();
  const [data, setData] = useState<PollResponse | null>(null);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const r = await fetch("/api/poll/active", { credentials: "include" });
      if (r.ok) setData(await r.json() as PollResponse);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    void load();
    const id = setInterval(() => { void load(); }, 20_000);
    return () => clearInterval(id);
  }, []);

  async function vote(optionId: string) {
    if (!data?.poll) return;
    setError("");

    if (skxBalance < data.poll.entryFeeSkx) {
      setError(`تحتاج ${fmt(data.poll.entryFeeSkx)} SKX للتصويت`);
      return;
    }

    setVoting(true);
    try {
      const r = await fetch("/api/poll/vote", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pollId: data.poll.id, optionId }),
      });
      const json = await r.json() as { error?: string };
      if (!r.ok) { setError(json.error ?? "فشل التصويت"); return; }
      await refreshFromServer();
      await load();
    } catch {
      setError("خطأ في الاتصال");
    } finally {
      setVoting(false);
    }
  }

  if (!data?.poll) return null;
  const { poll, voteCounts, userVote } = data;

  const totalVotes = Object.values(voteCounts).reduce((a, b) => a + b, 0);
  const hasVoted   = !!userVote;
  const isActive   = poll.status === "active";
  const isClosed   = poll.status === "closed";
  const isDone     = poll.status === "distributed";

  const statusColor = isActive ? "#22c55e" : isClosed ? "#f59e0b" : "#a855f7";
  const statusLabel = isActive ? "مفتوح" : isClosed ? "انتهى التصويت" : "تم التوزيع";

  function pct(optId: string) {
    if (totalVotes === 0) return 0;
    return Math.round(((voteCounts[optId] ?? 0) / totalVotes) * 100);
  }

  return (
    <div style={{
      borderRadius: 22,
      padding: "16px",
      background: "linear-gradient(135deg, rgba(168,85,247,0.12) 0%, rgba(59,130,246,0.08) 60%, rgba(0,0,0,0.1) 100%)",
      border: "1px solid rgba(168,85,247,0.3)",
      boxShadow: "0 8px 32px rgba(168,85,247,0.08)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Background glow */}
      <div style={{ position:"absolute", top:-30, right:-30, width:160, height:160, borderRadius:"50%", background:"rgba(168,85,247,0.08)", filter:"blur(40px)", pointerEvents:"none" }} />

      {/* Trophy + status row */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:22 }}>🏆</span>
          <div>
            <p style={{ fontSize:12, fontWeight:900, color:"#fff", margin:0, lineHeight:1.2 }}>نهائي كأس العالم 2026</p>
            <p style={{ fontSize:10, color:"rgba(168,85,247,0.9)", margin:0, fontWeight:700 }}>صوّت وانتظر نهاية المباراة</p>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:5, padding:"3px 10px", borderRadius:999, background:`${statusColor}18`, border:`1px solid ${statusColor}40` }}>
          {isActive && <span style={{ width:6, height:6, borderRadius:"50%", background:statusColor, display:"inline-block" }} className="animate-pulse" />}
          <span style={{ fontSize:10, fontWeight:800, color:statusColor }}>{statusLabel}</span>
        </div>
      </div>

      {/* Question */}
      <p style={{ fontSize:14, fontWeight:800, color:"#fff", margin:"0 0 14px", textAlign:"center" }}>{poll.question}</p>

      {/* Options */}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {poll.options.map((opt) => {
          const isUserChoice   = userVote?.optionId === opt.id;
          const isWinner       = isDone && poll.correctOptionId === opt.id;
          const isLoser        = isDone && poll.correctOptionId !== opt.id;
          const count          = voteCounts[opt.id] ?? 0;
          const barPct         = hasVoted || !isActive ? pct(opt.id) : 0;
          const showResults    = hasVoted || !isActive;

          const optBorder = isWinner ? "rgba(34,197,94,0.6)"
                          : isLoser  ? "rgba(255,255,255,0.08)"
                          : isUserChoice ? "rgba(168,85,247,0.6)"
                          : "rgba(255,255,255,0.1)";
          const optBg     = isWinner ? "rgba(34,197,94,0.1)"
                          : isLoser  ? "rgba(255,255,255,0.03)"
                          : isUserChoice ? "rgba(168,85,247,0.12)"
                          : "rgba(255,255,255,0.05)";
          const barColor  = isWinner ? "#22c55e"
                          : isUserChoice ? "#a855f7"
                          : "#3b82f6";

          return (
            <button
              key={opt.id}
              onClick={() => { if (isActive && !hasVoted && !voting) void vote(opt.id); }}
              disabled={!isActive || hasVoted || voting}
              style={{
                position:"relative", overflow:"hidden",
                background: optBg,
                border: `1.5px solid ${optBorder}`,
                borderRadius:14, padding:"12px 14px",
                cursor: isActive && !hasVoted ? "pointer" : "default",
                textAlign:"left", width:"100%",
                transition:"transform 0.15s, box-shadow 0.15s",
              }}
            >
              {/* Progress bar */}
              {showResults && (
                <div style={{ position:"absolute", left:0, top:0, bottom:0, width:`${barPct}%`, background:`${barColor}18`, transition:"width 0.6s ease", borderRadius:13 }} />
              )}

              <div style={{ position:"relative", display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ fontSize:28, lineHeight:1 }}>{opt.emoji}</span>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontSize:14, fontWeight:900, color: isLoser ? "rgba(255,255,255,0.4)" : "#fff" }}>{opt.label}</span>
                    {isUserChoice && <span style={{ fontSize:9, fontWeight:800, padding:"2px 6px", borderRadius:999, background:"rgba(168,85,247,0.25)", color:"#c084fc", border:"1px solid rgba(168,85,247,0.3)" }}>صوتك</span>}
                    {isWinner && <span style={{ fontSize:9, fontWeight:800, padding:"2px 6px", borderRadius:999, background:"rgba(34,197,94,0.2)", color:"#4ade80", border:"1px solid rgba(34,197,94,0.3)" }}>الفائز 🎉</span>}
                  </div>
                  {showResults && (
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:3 }}>
                      <div style={{ flex:1, height:4, background:"rgba(255,255,255,0.08)", borderRadius:2, overflow:"hidden" }}>
                        <div style={{ width:`${barPct}%`, height:"100%", background:barColor, borderRadius:2, transition:"width 0.6s ease" }} />
                      </div>
                      <span style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.5)", minWidth:32, textAlign:"right" }}>{barPct}%</span>
                    </div>
                  )}
                </div>
                {showResults && (
                  <span style={{ fontSize:13, fontWeight:800, color:"rgba(255,255,255,0.6)" }}>{fmt(count)}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer info */}
      <div style={{ marginTop:14, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
        <div style={{ display:"flex", gap:14 }}>
          <div style={{ textAlign:"center" }}>
            <p style={{ fontSize:11, color:"rgba(255,255,255,0.4)", margin:0, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:700 }}>المجموع</p>
            <p style={{ fontSize:15, fontWeight:900, color:"#a855f7", margin:0 }}>{fmt(poll.totalPool)} <span style={{ fontSize:10, fontWeight:700 }}>SKX</span></p>
          </div>
          <div style={{ textAlign:"center" }}>
            <p style={{ fontSize:11, color:"rgba(255,255,255,0.4)", margin:0, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:700 }}>الأصوات</p>
            <p style={{ fontSize:15, fontWeight:900, color:"#3b82f6", margin:0 }}>{fmt(totalVotes)}</p>
          </div>
        </div>

        {isActive && !hasVoted && (
          <div style={{ padding:"6px 14px", borderRadius:10, background:"rgba(168,85,247,0.15)", border:"1px solid rgba(168,85,247,0.3)" }}>
            <p style={{ fontSize:11, fontWeight:800, color:"#c084fc", margin:0 }}>التصويت يكلّف {fmt(poll.entryFeeSkx)} SKX</p>
          </div>
        )}

        {isDone && userVote?.rewardSkx && userVote.rewardSkx > 0 && (
          <div style={{ padding:"6px 14px", borderRadius:10, background:"rgba(34,197,94,0.15)", border:"1px solid rgba(34,197,94,0.3)" }}>
            <p style={{ fontSize:11, fontWeight:800, color:"#4ade80", margin:0 }}>+{fmt(userVote.rewardSkx)} SKX ✓</p>
          </div>
        )}
      </div>

      {error && (
        <p style={{ fontSize:12, color:"#f87171", fontWeight:700, marginTop:10, textAlign:"center" }}>{error}</p>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { ExternalLink, Send, CheckCircle, XCircle, Clock, TrendingUp, Users } from "lucide-react";

interface Campaign {
  id: number;
  title: string;
  description: string | null;
  minFollowers: number;
  minViews: number;
  prizeSkx: number;
  perReferralSkx: number;
}

interface MyApplication {
  campaignId: number;
  status: string;
  rewardSkxPaid: number;
  referralCount: number;
  totalReferralSkx: number;
  rejectReason: string | null;
}

interface ApplyModalProps {
  campaign: Campaign;
  onClose: () => void;
  onSuccess: () => void;
}

function ApplyModal({ campaign, onClose, onSuccess }: ApplyModalProps) {
  const [tiktokUsername, setTiktokUsername] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!tiktokUsername.trim() || !videoUrl.trim()) { setError("Please fill in all fields"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/tiktok-campaigns/${campaign.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tiktokUsername: tiktokUsername.trim(), videoUrl: videoUrl.trim() }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) { setError(data.error ?? "Submission failed"); return; }
      onSuccess();
      onClose();
    } catch { setError("Network error, please try again"); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ position:"fixed", inset:0, zIndex:9999, background:"rgba(0,0,0,0.8)", display:"flex", alignItems:"flex-end", justifyContent:"center" }} onClick={onClose}>
      <div style={{ width:"100%", maxWidth:480, background:"#121212", borderRadius:"20px 20px 0 0", padding:"24px 20px 36px", border:"1px solid rgba(255,255,255,0.1)" }} onClick={e => e.stopPropagation()}>
        <div style={{ width:40, height:4, background:"rgba(255,255,255,0.2)", borderRadius:2, margin:"0 auto 20px" }} />
        <p style={{ margin:"0 0 4px", fontSize:16, fontWeight:900, color:"#fff" }}>Apply for {campaign.title}</p>
        <p style={{ margin:"0 0 20px", fontSize:12, color:"rgba(255,255,255,0.45)" }}>Enter your TikTok info — your application will be reviewed within 24 hours</p>

        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div>
            <p style={{ margin:"0 0 6px", fontSize:12, fontWeight:700, color:"rgba(255,255,255,0.6)" }}>Your TikTok Username</p>
            <input
              value={tiktokUsername}
              onChange={e => setTiktokUsername(e.target.value)}
              placeholder="@username"
              style={{ width:"100%", boxSizing:"border-box", padding:"10px 14px", borderRadius:10, background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", color:"#fff", fontSize:14, outline:"none" }}
            />
          </div>
          <div>
            <p style={{ margin:"0 0 6px", fontSize:12, fontWeight:700, color:"rgba(255,255,255,0.6)" }}>TikTok Video Link</p>
            <input
              value={videoUrl}
              onChange={e => setVideoUrl(e.target.value)}
              placeholder="https://www.tiktok.com/@username/video/..."
              style={{ width:"100%", boxSizing:"border-box", padding:"10px 14px", borderRadius:10, background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", color:"#fff", fontSize:14, outline:"none" }}
            />
            <p style={{ margin:"4px 0 0", fontSize:11, color:"rgba(255,255,255,0.3)" }}>The video must have {campaign.minViews.toLocaleString()}+ views</p>
          </div>
        </div>

        {error && <p style={{ margin:"12px 0 0", fontSize:12, color:"#f87171", textAlign:"center" }}>{error}</p>}

        <div style={{ display:"flex", gap:10, marginTop:20 }}>
          <button onClick={onClose} style={{ flex:1, padding:"12px", borderRadius:12, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.6)", fontSize:14, fontWeight:700, cursor:"pointer" }}>
            Cancel
          </button>
          <button onClick={() => void submit()} disabled={loading} style={{ flex:2, padding:"12px", borderRadius:12, background:"linear-gradient(135deg,#e879f9,#a855f7)", border:"none", color:"#fff", fontSize:14, fontWeight:900, cursor:loading?"not-allowed":"pointer", opacity:loading?0.7:1 }}>
            {loading ? "Submitting..." : "Submit Application 🚀"}
          </button>
        </div>
      </div>
    </div>
  );
}

function fmt(n: number) { return n.toLocaleString("en-US"); }

export function TikTokCampaignCard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [myApps, setMyApps] = useState<MyApplication[]>([]);
  const [applyingTo, setApplyingTo] = useState<Campaign | null>(null);
  const [applied, setApplied] = useState(false);

  function load() {
    fetch("/api/tiktok-campaigns", { credentials: "include" })
      .then(r => r.json() as Promise<{ campaigns: Campaign[]; myApplications: MyApplication[] }>)
      .then(d => { setCampaigns(d.campaigns ?? []); setMyApps(d.myApplications ?? []); })
      .catch(() => {});
  }

  useEffect(() => { load(); }, []);

  if (campaigns.length === 0) return null;

  function getMyApp(campaignId: number) { return myApps.find(a => a.campaignId === campaignId); }

  function StatusBadge({ app }: { app: MyApplication }) {
    if (app.status === "approved") return (
      <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, fontWeight:700, color:"#86efac", background:"rgba(34,197,94,0.15)", border:"1px solid rgba(34,197,94,0.3)", borderRadius:6, padding:"3px 8px" }}>
        <CheckCircle style={{ width:11, height:11 }} /> Approved
      </span>
    );
    if (app.status === "rejected") return (
      <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, fontWeight:700, color:"#f87171", background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:6, padding:"3px 8px" }}>
        <XCircle style={{ width:11, height:11 }} /> Rejected
      </span>
    );
    return (
      <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, fontWeight:700, color:"#fbbf24", background:"rgba(251,191,36,0.1)", border:"1px solid rgba(251,191,36,0.3)", borderRadius:6, padding:"3px 8px" }}>
        <Clock style={{ width:11, height:11 }} /> Under Review
      </span>
    );
  }

  return (
    <>
      {applyingTo && (
        <ApplyModal
          campaign={applyingTo}
          onClose={() => setApplyingTo(null)}
          onSuccess={() => { setApplied(true); load(); setTimeout(() => setApplied(false), 4000); }}
        />
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
          <span style={{ fontSize:16 }}>🎵</span>
          <p style={{ margin:0, fontSize:13, fontWeight:900, color:"#fff" }}>TikTok Campaigns</p>
          <span style={{ fontSize:10, fontWeight:700, color:"#e879f9", background:"rgba(232,121,249,0.15)", border:"1px solid rgba(232,121,249,0.3)", borderRadius:5, padding:"2px 7px" }}>Exclusive</span>
        </div>

        {applied && (
          <div style={{ padding:"10px 14px", borderRadius:12, background:"rgba(34,197,94,0.12)", border:"1px solid rgba(34,197,94,0.3)", color:"#86efac", fontSize:13, fontWeight:700, textAlign:"center" }}>
            ✅ Application submitted! We'll review it within 24 hours.
          </div>
        )}

        {campaigns.map(c => {
          const myApp = getMyApp(c.id);
          return (
            <div key={c.id} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:16, padding:"14px 16px", position:"relative", overflow:"hidden" }}>
              <div style={{ position:"absolute", top:0, right:0, width:80, height:80, background:"radial-gradient(circle,rgba(232,121,249,0.1),transparent)", borderRadius:"0 16px 0 80px", pointerEvents:"none" }} />

              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8, marginBottom:10 }}>
                <div style={{ flex:1 }}>
                  <p style={{ margin:"0 0 2px", fontSize:14, fontWeight:900, color:"#fff" }}>{c.title}</p>
                  {c.description && <p style={{ margin:0, fontSize:11, color:"rgba(255,255,255,0.45)", lineHeight:1.5 }}>{c.description}</p>}
                </div>
                {myApp && <StatusBadge app={myApp} />}
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
                <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:10, padding:"8px 10px", display:"flex", alignItems:"center", gap:6 }}>
                  <Users style={{ width:13, height:13, color:"#a78bfa" }} />
                  <div>
                    <p style={{ margin:0, fontSize:10, color:"rgba(255,255,255,0.4)", fontWeight:600 }}>Followers</p>
                    <p style={{ margin:0, fontSize:13, fontWeight:800, color:"#a78bfa" }}>{fmt(c.minFollowers)}+</p>
                  </div>
                </div>
                <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:10, padding:"8px 10px", display:"flex", alignItems:"center", gap:6 }}>
                  <TrendingUp style={{ width:13, height:13, color:"#60a5fa" }} />
                  <div>
                    <p style={{ margin:0, fontSize:10, color:"rgba(255,255,255,0.4)", fontWeight:600 }}>Views</p>
                    <p style={{ margin:0, fontSize:13, fontWeight:800, color:"#60a5fa" }}>{fmt(c.minViews)}+</p>
                  </div>
                </div>
              </div>

              <div style={{ background:"linear-gradient(135deg,rgba(232,121,249,0.08),rgba(168,85,247,0.08))", border:"1px solid rgba(232,121,249,0.2)", borderRadius:10, padding:"10px 12px", marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <p style={{ margin:"0 0 1px", fontSize:10, color:"rgba(255,255,255,0.45)", fontWeight:600 }}>Approval Prize</p>
                    <p style={{ margin:0, fontSize:18, fontWeight:900, color:"#e879f9" }}>{fmt(c.prizeSkx)} SKX</p>
                  </div>
                  {c.perReferralSkx > 0 && (
                    <div style={{ textAlign:"right" }}>
                      <p style={{ margin:"0 0 1px", fontSize:10, color:"rgba(255,255,255,0.45)", fontWeight:600 }}>+ per referral</p>
                      <p style={{ margin:0, fontSize:14, fontWeight:900, color:"#f59e0b" }}>+{fmt(c.perReferralSkx)} SKX</p>
                    </div>
                  )}
                </div>
              </div>

              {myApp?.status === "approved" && (
                <div style={{ background:"rgba(34,197,94,0.08)", border:"1px solid rgba(34,197,94,0.2)", borderRadius:10, padding:"8px 12px", marginBottom:12, display:"flex", justifyContent:"space-between" }}>
                  <div>
                    <p style={{ margin:"0 0 1px", fontSize:10, color:"rgba(255,255,255,0.4)" }}>Total Earned</p>
                    <p style={{ margin:0, fontSize:13, fontWeight:800, color:"#86efac" }}>{fmt((myApp.rewardSkxPaid ?? 0) + (myApp.totalReferralSkx ?? 0))} SKX</p>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <p style={{ margin:"0 0 1px", fontSize:10, color:"rgba(255,255,255,0.4)" }}>Referrals</p>
                    <p style={{ margin:0, fontSize:13, fontWeight:800, color:"#86efac" }}>{fmt(myApp.referralCount ?? 0)}</p>
                  </div>
                </div>
              )}

              {myApp?.status === "rejected" && myApp.rejectReason && (
                <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:10, padding:"8px 12px", marginBottom:12 }}>
                  <p style={{ margin:0, fontSize:11, color:"#f87171" }}>Reason: {myApp.rejectReason}</p>
                </div>
              )}

              {!myApp ? (
                <button
                  onClick={() => setApplyingTo(c)}
                  style={{ width:"100%", padding:"11px", borderRadius:12, background:"linear-gradient(135deg,#e879f9,#a855f7)", border:"none", color:"#fff", fontSize:14, fontWeight:900, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}
                >
                  <Send style={{ width:14, height:14 }} /> Join Now
                </button>
              ) : myApp.status === "approved" ? (
                <a
                  href={`https://t.me/share/url?url=${encodeURIComponent(window.location.origin)}&text=${encodeURIComponent("Join SouqratesX and earn SKX 🚀")}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ width:"100%", padding:"11px", borderRadius:12, background:"rgba(34,197,94,0.15)", border:"1px solid rgba(34,197,94,0.3)", color:"#86efac", fontSize:13, fontWeight:800, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6, textDecoration:"none", boxSizing:"border-box" }}
                >
                  <ExternalLink style={{ width:13, height:13 }} /> Share Your Link & Earn More
                </a>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

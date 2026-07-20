import { useState, useEffect, useCallback } from "react";
import { adminApi } from "./adminApi";
import { Loader2, CheckCircle, XCircle, Clock, Plus, ToggleLeft, ToggleRight, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";

interface Campaign {
  id: number;
  title: string;
  description: string | null;
  minFollowers: number;
  minViews: number;
  prizeSkx: number;
  perReferralSkx: number;
  isActive: boolean;
  createdAt: string;
}

interface Application {
  id: number;
  campaignId: number;
  campaignTitle: string | null;
  prizeSkx: number | null;
  perReferralSkx: number | null;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  tiktokUsername: string;
  videoUrl: string;
  status: string;
  rejectReason: string | null;
  prizeSkxPaid: number;
  referralCount: number;
  totalReferralSkx: number;
  reviewedAt: string | null;
  createdAt: string;
}

function fmt(n: number | null | undefined) { return (n ?? 0).toLocaleString("en-US"); }

function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <span className="flex items-center gap-1 text-xs font-bold text-green-400 bg-green-400/10 border border-green-400/30 rounded-md px-2 py-0.5"><CheckCircle className="w-3 h-3"/>مقبول</span>;
  if (status === "rejected") return <span className="flex items-center gap-1 text-xs font-bold text-red-400 bg-red-400/10 border border-red-400/30 rounded-md px-2 py-0.5"><XCircle className="w-3 h-3"/>مرفوض</span>;
  return <span className="flex items-center gap-1 text-xs font-bold text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 rounded-md px-2 py-0.5"><Clock className="w-3 h-3"/>قيد المراجعة</span>;
}

export function AdminTikTokCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingApps, setLoadingApps] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedApp, setExpandedApp] = useState<number | null>(null);

  const [newCamp, setNewCamp] = useState({ title: "", description: "", minFollowers: 10000, minViews: 10000, prizeSkx: 20000, perReferralSkx: 500 });
  const [creating, setCreating] = useState(false);

  const loadCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    try {
      const d = await adminApi.get<{ campaigns: Campaign[] }>("/admin/tiktok-campaigns");
      setCampaigns(d.campaigns);
    } catch { setError("فشل تحميل الحملات"); }
    finally { setLoadingCampaigns(false); }
  }, []);

  const loadApps = useCallback(async () => {
    setLoadingApps(true);
    try {
      const d = await adminApi.get<{ applications: Application[] }>(`/admin/tiktok-applications?status=${statusFilter}`);
      setApps(d.applications);
    } catch { setError("فشل تحميل الطلبات"); }
    finally { setLoadingApps(false); }
  }, [statusFilter]);

  useEffect(() => { void loadCampaigns(); }, [loadCampaigns]);
  useEffect(() => { void loadApps(); }, [loadApps]);

  async function approve(appId: number) {
    if (!confirm("الموافقة على هذا الطلب وإضافة الجائزة SKX للمستخدم؟")) return;
    setActionId(appId); setError("");
    try {
      await adminApi.post(`/admin/tiktok-applications/${appId}/approve`, {});
      void loadApps();
    } catch (e) { setError(e instanceof Error ? e.message : "فشل الموافقة"); }
    finally { setActionId(null); }
  }

  async function reject(appId: number) {
    setActionId(appId); setError("");
    try {
      await adminApi.post(`/admin/tiktok-applications/${appId}/reject`, { reason: rejectReason });
      setRejectingId(null); setRejectReason("");
      void loadApps();
    } catch (e) { setError(e instanceof Error ? e.message : "فشل الرفض"); }
    finally { setActionId(null); }
  }

  async function toggle(campId: number) {
    try {
      await adminApi.post(`/admin/tiktok-campaigns/${campId}/toggle`, {});
      void loadCampaigns();
    } catch { setError("فشل تغيير الحالة"); }
  }

  async function createCampaign() {
    if (!newCamp.title) { setError("يرجى إدخال عنوان الحملة"); return; }
    setCreating(true); setError("");
    try {
      await adminApi.post("/admin/tiktok-campaigns", {
        title: newCamp.title,
        description: newCamp.description || undefined,
        minFollowers: Number(newCamp.minFollowers),
        minViews: Number(newCamp.minViews),
        prizeSkx: Number(newCamp.prizeSkx),
        perReferralSkx: Number(newCamp.perReferralSkx),
      });
      setShowCreate(false);
      setNewCamp({ title: "", description: "", minFollowers: 10000, minViews: 10000, prizeSkx: 20000, perReferralSkx: 500 });
      void loadCampaigns();
    } catch (e) { setError(e instanceof Error ? e.message : "فشل الإنشاء"); }
    finally { setCreating(false); }
  }

  const pendingCount = apps.filter(a => a.status === "pending").length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-white">🎵 مسابقات TikTok</h2>
          <p className="text-xs text-muted-foreground mt-0.5">إدارة الحملات والطلبات</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-purple-500/20 border border-purple-500/40 text-purple-300 hover:bg-purple-500/30 transition-all"
        >
          <Plus className="w-3.5 h-3.5" /> حملة جديدة
        </button>
      </div>

      {error && <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</div>}

      {/* Create campaign form */}
      {showCreate && (
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 space-y-3">
          <p className="text-sm font-bold text-white">إنشاء حملة جديدة</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">العنوان</label>
              <input value={newCamp.title} onChange={e => setNewCamp(p => ({ ...p, title: e.target.value }))} placeholder="TikTok Creator — Big" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">وصف (اختياري)</label>
              <input value={newCamp.description} onChange={e => setNewCamp(p => ({ ...p, description: e.target.value }))} placeholder="للمبدعين الكبار على TikTok..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">أدنى متابعين</label>
              <input type="number" value={newCamp.minFollowers} onChange={e => setNewCamp(p => ({ ...p, minFollowers: Number(e.target.value) }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">أدنى مشاهدات</label>
              <input type="number" value={newCamp.minViews} onChange={e => setNewCamp(p => ({ ...p, minViews: Number(e.target.value) }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">جائزة القبول (SKX)</label>
              <input type="number" value={newCamp.prizeSkx} onChange={e => setNewCamp(p => ({ ...p, prizeSkx: Number(e.target.value) }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">SKX / إحالة</label>
              <input type="number" value={newCamp.perReferralSkx} onChange={e => setNewCamp(p => ({ ...p, perReferralSkx: Number(e.target.value) }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setShowCreate(false)} className="flex-1 py-2 rounded-lg bg-white/5 text-xs text-white/60 font-bold border border-white/10">إلغاء</button>
            <button onClick={() => void createCampaign()} disabled={creating} className="flex-2 py-2 px-4 rounded-lg bg-purple-600 text-xs text-white font-bold hover:bg-purple-500 transition-all disabled:opacity-50">
              {creating ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "إنشاء"}
            </button>
          </div>
        </div>
      )}

      {/* Campaigns list */}
      {!loadingCampaigns && campaigns.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">الحملات ({campaigns.length})</p>
          {campaigns.map(c => (
            <div key={c.id} className="flex items-center gap-3 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{c.title}</p>
                <p className="text-xs text-muted-foreground">{fmt(c.minFollowers)} متابع · {fmt(c.minViews)} مشاهدة · جائزة {fmt(c.prizeSkx)} SKX + {fmt(c.perReferralSkx)} SKX/إحالة</p>
              </div>
              <button onClick={() => void toggle(c.id)} className={`shrink-0 transition-all ${c.isActive ? "text-green-400" : "text-white/30"}`}>
                {c.isActive ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Applications */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">الطلبات</p>
          {pendingCount > 0 && <span className="text-xs font-black text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-full px-2 py-0.5">{pendingCount} جديد</span>}
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {["pending", "approved", "rejected", ""].map(s => (
            <button
              key={s || "all"}
              onClick={() => setStatusFilter(s)}
              className={`text-xs font-bold px-3 py-1 rounded-full border transition-all ${statusFilter === s ? "bg-purple-500/30 border-purple-500/50 text-purple-300" : "bg-white/5 border-white/10 text-white/50"}`}
            >
              {s === "pending" ? "قيد المراجعة" : s === "approved" ? "مقبولة" : s === "rejected" ? "مرفوضة" : "الكل"}
            </button>
          ))}
        </div>

        {loadingApps ? (
          <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 text-purple-400 animate-spin" /></div>
        ) : apps.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">لا توجد طلبات</div>
        ) : (
          <div className="space-y-2">
            {apps.map(app => (
              <div key={app.id} className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-3 py-3 cursor-pointer" onClick={() => setExpandedApp(expandedApp === app.id ? null : app.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-white">@{app.tiktokUsername}</p>
                      <StatusBadge status={app.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {app.firstName ?? app.username ?? app.telegramId} · {app.campaignTitle ?? `حملة #${app.campaignId}`}
                      {app.status === "approved" && ` · ${fmt(app.referralCount)} إحالة · ${fmt((app.prizeSkxPaid ?? 0) + (app.totalReferralSkx ?? 0))} SKX`}
                    </p>
                  </div>
                  <div className="text-white/30">
                    {expandedApp === app.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>

                {expandedApp === app.id && (
                  <div className="px-3 pb-3 border-t border-white/[0.06] pt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-white/[0.04] rounded-lg p-2">
                        <p className="text-muted-foreground mb-0.5">Telegram ID</p>
                        <p className="text-white font-mono font-bold">{app.telegramId}</p>
                      </div>
                      <div className="bg-white/[0.04] rounded-lg p-2">
                        <p className="text-muted-foreground mb-0.5">تاريخ التقديم</p>
                        <p className="text-white font-bold">{new Date(app.createdAt).toLocaleDateString("ar-SA")}</p>
                      </div>
                      {app.status === "approved" && (
                        <>
                          <div className="bg-green-400/[0.06] rounded-lg p-2 border border-green-400/10">
                            <p className="text-muted-foreground mb-0.5">جائزة مدفوعة</p>
                            <p className="text-green-400 font-bold">{fmt(app.prizeSkxPaid)} SKX</p>
                          </div>
                          <div className="bg-yellow-400/[0.06] rounded-lg p-2 border border-yellow-400/10">
                            <p className="text-muted-foreground mb-0.5">إحالات + SKX</p>
                            <p className="text-yellow-400 font-bold">{fmt(app.referralCount)} · {fmt(app.totalReferralSkx)} SKX</p>
                          </div>
                        </>
                      )}
                    </div>

                    <a href={app.videoUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-blue-400 font-bold py-1.5 px-3 bg-blue-400/10 border border-blue-400/20 rounded-lg w-full justify-center">
                      <ExternalLink className="w-3 h-3" /> مشاهدة الفيديو على TikTok
                    </a>

                    {app.status === "pending" && (
                      rejectingId === app.id ? (
                        <div className="space-y-2">
                          <input
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            placeholder="سبب الرفض (اختياري)..."
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 outline-none"
                          />
                          <div className="flex gap-2">
                            <button onClick={() => setRejectingId(null)} className="flex-1 py-2 rounded-lg bg-white/5 text-xs text-white/60 font-bold border border-white/10">إلغاء</button>
                            <button onClick={() => void reject(app.id)} disabled={actionId === app.id} className="flex-1 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-bold hover:bg-red-500/30 transition-all disabled:opacity-50">
                              {actionId === app.id ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "تأكيد الرفض"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button onClick={() => setRejectingId(app.id)} className="flex-1 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-500/20 transition-all">
                            ✕ رفض
                          </button>
                          <button onClick={() => void approve(app.id)} disabled={actionId === app.id} className="flex-2 py-2 px-4 rounded-lg bg-green-500/20 border border-green-500/40 text-green-400 text-xs font-bold hover:bg-green-500/30 transition-all disabled:opacity-50">
                            {actionId === app.id ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "✓ موافقة + إضافة الجائزة"}
                          </button>
                        </div>
                      )
                    )}

                    {app.status === "rejected" && app.rejectReason && (
                      <div className="text-xs text-red-400 bg-red-400/5 rounded-lg px-3 py-2 border border-red-400/10">سبب الرفض: {app.rejectReason}</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { adminApi } from "./adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, ExternalLink, Plus, Trash2, RefreshCw, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Smartphone, Monitor, HelpCircle } from "lucide-react";

interface DeviceBreakdown { device: string | null; count: number }
interface TrackingLink {
  id: number;
  code: string;
  name: string;
  destinationUrl: string;
  isActive: boolean;
  createdAt: string;
  total: number;
  unique: number;
  last1h: number;
  last24h: number;
  deviceBreakdown: DeviceBreakdown[];
}
interface ClickEvent {
  id: number;
  linkId: number;
  ipHash: string;
  userAgent: string | null;
  deviceType: string | null;
  referer: string | null;
  createdAt: string;
}

function buildTrackUrl(code: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/t/${code}`;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `منذ ${diff}ث`;
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)}د`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)}س`;
  return `منذ ${Math.floor(diff / 86400)} يوم`;
}

function DeviceIcon({ device }: { device: string | null }) {
  if (device === "mobile") return <Smartphone className="w-3 h-3 text-purple-400" />;
  if (device === "desktop") return <Monitor className="w-3 h-3 text-blue-400" />;
  return <HelpCircle className="w-3 h-3 text-muted-foreground" />;
}

export function AdminLinkTracker() {
  const [links, setLinks] = useState<TrackingLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", destinationUrl: "" });
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [events, setEvents] = useState<ClickEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadLinks() {
    try {
      const data = await adminApi.get<{ links: TrackingLink[] }>("/admin/tracking-links");
      setLinks(data.links);
    } finally {
      setLoading(false);
    }
  }

  async function loadEvents(id: number) {
    setEventsLoading(true);
    try {
      const data = await adminApi.get<{ events: ClickEvent[] }>(`/admin/tracking-links/${id}/events`);
      setEvents(data.events);
    } finally {
      setEventsLoading(false);
    }
  }

  useEffect(() => {
    loadLinks();
    intervalRef.current = setInterval(loadLinks, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  useEffect(() => {
    if (expanded !== null) loadEvents(expanded);
    const ev = setInterval(() => { if (expanded !== null) loadEvents(expanded); }, 5000);
    return () => clearInterval(ev);
  }, [expanded]);

  async function createLink() {
    if (!form.name.trim() || !form.destinationUrl.trim()) return;
    setCreating(true);
    try {
      await adminApi.post("/admin/tracking-links", form);
      setForm({ name: "", destinationUrl: "" });
      setShowForm(false);
      await loadLinks();
    } finally {
      setCreating(false);
    }
  }

  async function toggleLink(id: number, isActive: boolean) {
    await adminApi.patch(`/admin/tracking-links/${id}`, { isActive: !isActive });
    await loadLinks();
  }

  async function deleteLink(id: number) {
    if (!confirm("حذف الرابط وكل سجلات النقرات؟")) return;
    await adminApi.del(`/admin/tracking-links/${id}`);
    if (expanded === id) setExpanded(null);
    await loadLinks();
  }

  function copyLink(id: number, code: string) {
    navigator.clipboard.writeText(buildTrackUrl(code)).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loading) return <p className="text-sm text-muted-foreground">جار التحميل...</p>;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">تتبع الروابط</h2>
          <p className="text-xs text-muted-foreground mt-0.5">إحصائيات لحظية لكل رابط تتبع</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadLinks} className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-white transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <Button size="sm" onClick={() => setShowForm(v => !v)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> رابط جديد
          </Button>
        </div>
      </div>

      {/* New link form */}
      {showForm && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
          <h3 className="text-sm font-bold text-white">إنشاء رابط تتبع جديد</h3>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">اسم الحملة</span>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="مثال: إعلان تيليجرام يوليو" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">الرابط الوجهة (URL)</span>
            <Input value={form.destinationUrl} onChange={e => setForm(f => ({ ...f, destinationUrl: e.target.value }))} placeholder="https://..." dir="ltr" />
          </label>
          <div className="flex gap-2">
            <Button onClick={createLink} disabled={creating || !form.name.trim() || !form.destinationUrl.trim()}>
              {creating ? "جار الإنشاء..." : "إنشاء"}
            </Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>إلغاء</Button>
          </div>
        </div>
      )}

      {/* Links list */}
      {links.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          لا توجد روابط بعد — اضغط "رابط جديد" لإنشاء أول رابط تتبع
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {links.map(link => (
            <div key={link.id} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              {/* Link card header */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${link.isActive ? "bg-emerald-400" : "bg-red-400"}`} />
                      <h3 className="text-sm font-bold text-white truncate">{link.name}</h3>
                    </div>
                    <div className="flex items-center gap-1 mb-2">
                      <span className="text-xs text-purple-400 font-mono">{buildTrackUrl(link.code)}</span>
                      <button onClick={() => copyLink(link.id, link.code)} className="p-0.5 hover:text-white text-muted-foreground transition-colors">
                        <Copy className="w-3 h-3" />
                      </button>
                      {copied === link.id && <span className="text-[10px] text-emerald-400">تم النسخ!</span>}
                    </div>
                    <a href={link.destinationUrl} target="_blank" rel="noopener noreferrer"
                      className="text-[11px] text-muted-foreground hover:text-white flex items-center gap-1 truncate">
                      <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">{link.destinationUrl}</span>
                    </a>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => toggleLink(link.id, link.isActive)} className="text-muted-foreground hover:text-white transition-colors">
                      {link.isActive ? <ToggleRight className="w-5 h-5 text-emerald-400" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                    <button onClick={() => deleteLink(link.id)} className="text-muted-foreground hover:text-red-400 transition-colors p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-4 gap-2 mt-3">
                  {[
                    { label: "إجمالي النقرات", value: link.total.toLocaleString(), color: "text-white" },
                    { label: "زوار فريدون", value: link.unique.toLocaleString(), color: "text-purple-400" },
                    { label: "آخر ساعة", value: link.last1h.toLocaleString(), color: "text-blue-400" },
                    { label: "آخر 24 ساعة", value: link.last24h.toLocaleString(), color: "text-emerald-400" },
                  ].map(s => (
                    <div key={s.label} className="bg-white/5 rounded-lg p-2 text-center">
                      <div className={`text-lg font-black ${s.color}`}>{s.value}</div>
                      <div className="text-[9px] text-muted-foreground leading-tight mt-0.5">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Device breakdown */}
                {link.deviceBreakdown.length > 0 && (
                  <div className="flex items-center gap-3 mt-3">
                    {link.deviceBreakdown.map(d => (
                      <div key={d.device} className="flex items-center gap-1 text-xs text-muted-foreground">
                        <DeviceIcon device={d.device} />
                        <span>{d.device === "mobile" ? "موبايل" : d.device === "desktop" ? "سطح مكتب" : "غير معروف"}</span>
                        <span className="font-bold text-white">{d.count}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Expand button */}
                <button
                  onClick={() => setExpanded(expanded === link.id ? null : link.id)}
                  className="mt-3 w-full flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-white transition-colors py-1"
                >
                  {expanded === link.id ? <><ChevronUp className="w-3.5 h-3.5" /> إخفاء السجل</> : <><ChevronDown className="w-3.5 h-3.5" /> عرض آخر النقرات</>}
                </button>
              </div>

              {/* Events panel */}
              {expanded === link.id && (
                <div className="border-t border-white/10 bg-black/20">
                  {eventsLoading && events.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">جار التحميل...</p>
                  ) : events.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">لا توجد نقرات بعد</p>
                  ) : (
                    <div className="divide-y divide-white/5 max-h-72 overflow-y-auto">
                      {events.map(ev => (
                        <div key={ev.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <DeviceIcon device={ev.deviceType} />
                            <div className="min-w-0">
                              <div className="text-xs text-white font-mono truncate">
                                {ev.ipHash.slice(0, 12)}…
                              </div>
                              {ev.referer && (
                                <div className="text-[10px] text-muted-foreground truncate">
                                  من: {ev.referer.slice(0, 50)}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-[10px] text-muted-foreground">{timeAgo(ev.createdAt)}</div>
                            <div className="text-[9px] text-muted-foreground/60">
                              {ev.deviceType === "mobile" ? "موبايل" : ev.deviceType === "desktop" ? "سطح مكتب" : "غير معروف"}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/50 text-center">
        يتحدث تلقائياً كل 5 ثوانٍ · الزوار الفريدون محسوبون بـ IP مشفّر
      </p>
    </div>
  );
}

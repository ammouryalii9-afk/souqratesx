import { useEffect, useRef, useState } from "react";
import { adminApi, type AdminSettingsMap } from "./adminApi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save, Plus, Trash2, GripVertical, ExternalLink, Eye, X, Copy, Check, TrendingUp, Users, Clock, Calendar } from "lucide-react";

interface AdsFeature { icon: string; title: string; desc: string; url: string }
interface AdsLink { label: string; url: string; icon: string }

const TEXT_FIELDS = [
  { key: "adsPageTitle",      label: "عنوان التطبيق الرئيسي",             placeholder: "SouqratesX" },
  { key: "adsPageTagline",    label: "النص التعريفي (تحت العنوان)",        placeholder: "منصة SouqrateX" },
  { key: "adsPageCtaText",    label: "نص زر الدعوة (CTA)",                placeholder: "العب على تيليجرام" },
  { key: "adsPageCtaEmoji",   label: "إيموجي زر الدعوة",                  placeholder: "✈️" },
  { key: "adsPageFooterText", label: "نص التذييل",                        placeholder: "انضم لآلاف اللاعبين الآن وابدأ رحلتك" },
] as const;

const DEFAULT_FEATURES: AdsFeature[] = [
  { icon: '⛏️', title: 'التعدين التلقائي',  desc: 'اضغط وعدّن النقاط في كل وقت، وارابح بشكل سلبي حتى وأنت غائب.', url: '' },
  { icon: '🎮', title: 'ألعاب يومية',       desc: 'العجلة، تحدي الذاكرة، والنقر السريع — العب يومياً واكسب نقاطاً إضافية.', url: '' },
  { icon: '👥', title: 'نظام الإحالة',      desc: 'ادعُ أصدقاءك واكسب نسبة من أرباحهم. كلما دعوت أكثر، ربحت أكثر.', url: '' },
  { icon: '🛡️', title: 'الفِرَق',           desc: 'أنشئ فرقتك أو انضم لفرقة وتنافس على قائمة أفضل الفِرَق عالمياً.', url: '' },
  { icon: '💎', title: 'عملة SKX',          desc: 'حوّل نقاطك إلى عملة SKX القابلة للسحب وشارك في نظام البكسلات.', url: '' },
];

function parseJsonArray<T>(raw: unknown, fallback: T[]): T[] {
  try {
    if (typeof raw === "string" && raw.trim()) return JSON.parse(raw) as T[];
    if (Array.isArray(raw)) return raw as T[];
  } catch { /* ignore */ }
  return fallback;
}

interface ViewStats { total: number; today: number; lastHour: number }

interface ReportSummary {
  total: number; today: number; lastHour: number;
  last7d: number; last30d: number;
  uniqueIps: number; uniqueIpsToday: number; uniqueIps7d: number;
  firstVisit: string | null; latestVisit: string | null;
}
interface DailyRow  { date: string; visits: number; unique: number }
interface HourlyRow { hour: number; visits: number }
interface UARow     { ua: string | null; count: number }
interface FullReport {
  generatedAt: string;
  summary: ReportSummary;
  daily: DailyRow[];
  hourly: HourlyRow[];
  topUserAgents: UARow[];
}

// ── tiny helpers ──────────────────────────────────────────────────────────────
function fmt(n: number) { return n.toLocaleString("en-US"); }
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { dateStyle:"medium", timeStyle:"short", timeZone:"UTC" }) + " UTC";
}

function parseUA(ua: string | null): string {
  if (!ua) return "Unknown";
  if (/Telegram/i.test(ua))       return "Telegram WebApp";
  if (/TelegramBot/i.test(ua))    return "Telegram Bot";
  if (/Android/i.test(ua))        return "Android Browser";
  if (/iPhone|iPad/i.test(ua))    return "iOS Browser";
  if (/Chrome/i.test(ua))         return "Chrome Desktop";
  if (/Firefox/i.test(ua))        return "Firefox Desktop";
  if (/Safari/i.test(ua))         return "Safari";
  return ua.slice(0, 60) + (ua.length > 60 ? "…" : "");
}

// ── Report modal ──────────────────────────────────────────────────────────────
function ReportModal({ onClose }: { onClose: () => void }) {
  const [report, setReport] = useState<FullReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied]   = useState(false);

  useEffect(() => {
    adminApi.get<FullReport>("/admin/adspage-views/report")
      .then(r => setReport(r))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function buildTextReport(r: FullReport): string {
    const s = r.summary;
    const lines: string[] = [
      "═══════════════════════════════════════════════════════",
      "   TRAFFIC ANALYTICS REPORT — /adspage",
      "   Platform: SouqratesX (Telegram Mini App)",
      `   Report generated: ${new Date(r.generatedAt).toUTCString()}`,
      "═══════════════════════════════════════════════════════",
      "",
      "SUMMARY",
      "───────────────────────────────────────────────────────",
      `Total page visits (all-time):   ${fmt(s.total)}`,
      `Unique visitors (all-time):     ${fmt(s.uniqueIps)}`,
      `Visits today (UTC):             ${fmt(s.today)}`,
      `Unique visitors today:          ${fmt(s.uniqueIpsToday)}`,
      `Visits last 7 days:             ${fmt(s.last7d)}`,
      `Unique visitors last 7 days:    ${fmt(s.uniqueIps7d)}`,
      `Visits last 30 days:            ${fmt(s.last30d)}`,
      `Visits last hour:               ${fmt(s.lastHour)}`,
      `First recorded visit:           ${fmtDate(s.firstVisit)}`,
      `Latest recorded visit:          ${fmtDate(s.latestVisit)}`,
      "",
      "DAILY BREAKDOWN (last 30 days, newest first)",
      "───────────────────────────────────────────────────────",
      "Date            Total    Unique",
      ...r.daily.map(d => `${d.date.padEnd(16)}${fmt(d.visits).padStart(6)}   ${fmt(d.unique).padStart(6)}`),
      "",
      "HOURLY BREAKDOWN (today, UTC)",
      "───────────────────────────────────────────────────────",
      "Hour (UTC)   Visits",
      ...Array.from({ length: 24 }, (_, h) => {
        const row = r.hourly.find(x => x.hour === h);
        const v   = row?.visits ?? 0;
        const bar = "█".repeat(Math.min(20, Math.round(v / Math.max(1, Math.max(...r.hourly.map(x=>x.visits))) * 20)));
        return `${String(h).padStart(2,"0")}:00       ${fmt(v).padStart(6)}  ${bar}`;
      }),
      "",
      "TOP USER AGENTS",
      "───────────────────────────────────────────────────────",
      ...r.topUserAgents.map(u => `${fmt(u.count).padStart(6)}  ${parseUA(u.ua)}`),
      "",
      "═══════════════════════════════════════════════════════",
      "NOTE: IPs are SHA-256 hashed server-side. Unique visitor",
      "counts are based on distinct IP hashes per time window.",
      "All timestamps are UTC.",
      "═══════════════════════════════════════════════════════",
    ];
    return lines.join("\n");
  }

  async function copyReport() {
    if (!report) return;
    await navigator.clipboard.writeText(buildTextReport(report));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const s = report?.summary;

  return (
    <div
      style={{ position:"fixed", inset:0, zIndex:9999, display:"flex", alignItems:"flex-start", justifyContent:"center", background:"rgba(0,0,0,0.75)", backdropFilter:"blur(6px)", overflowY:"auto", padding:"16px 8px" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width:"100%", maxWidth:680, background:"#0d0d14", border:"1px solid rgba(139,92,246,0.3)", borderRadius:20, overflow:"hidden", boxShadow:"0 24px 80px rgba(0,0,0,0.6)" }}>

        {/* Header */}
        <div style={{ padding:"16px 20px", borderBottom:"1px solid rgba(255,255,255,0.07)", display:"flex", alignItems:"center", justifyContent:"space-between", background:"linear-gradient(135deg,rgba(139,92,246,0.12),rgba(59,130,246,0.08))" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:"rgba(139,92,246,0.2)", border:"1px solid rgba(139,92,246,0.4)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <TrendingUp style={{ width:18, height:18, color:"#a78bfa" }} />
            </div>
            <div>
              <p style={{ margin:0, fontSize:14, fontWeight:900, color:"#fff" }}>Traffic Analytics Report</p>
              <p style={{ margin:0, fontSize:11, color:"rgba(139,92,246,0.8)", fontWeight:600 }}>/adspage · SouqratesX</p>
            </div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button
              onClick={copyReport}
              disabled={!report}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 14px", borderRadius:8, background:"rgba(139,92,246,0.15)", border:"1px solid rgba(139,92,246,0.3)", color:"#c4b5fd", fontSize:12, fontWeight:700, cursor:"pointer" }}
            >
              {copied ? <Check style={{width:13,height:13}} /> : <Copy style={{width:13,height:13}} />}
              {copied ? "Copied!" : "Copy Report"}
            </button>
            <button onClick={onClose} style={{ width:32, height:32, borderRadius:8, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.6)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <X style={{width:14,height:14}} />
            </button>
          </div>
        </div>

        {loading && (
          <div style={{ padding:48, textAlign:"center", color:"rgba(255,255,255,0.4)", fontSize:13 }}>Loading report data…</div>
        )}

        {!loading && report && s && (
          <div style={{ padding:"20px", display:"flex", flexDirection:"column", gap:20 }}>

            {/* Generated at */}
            <p style={{ margin:0, fontSize:11, color:"rgba(255,255,255,0.35)", fontFamily:"monospace" }}>
              Generated: {new Date(report.generatedAt).toUTCString()}
            </p>

            {/* ── Summary grid ── */}
            <section>
              <p style={{ margin:"0 0 10px", fontSize:12, fontWeight:800, color:"rgba(255,255,255,0.5)", textTransform:"uppercase", letterSpacing:"0.08em" }}>Summary</p>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
                {[
                  { label:"Total Visits (All-Time)",    value:fmt(s.total),           icon:<Eye style={{width:14,height:14}}/>,      color:"#a78bfa" },
                  { label:"Unique Visitors (All-Time)", value:fmt(s.uniqueIps),        icon:<Users style={{width:14,height:14}}/>,    color:"#60a5fa" },
                  { label:"Visits Today (UTC)",         value:fmt(s.today),            icon:<Calendar style={{width:14,height:14}}/>, color:"#34d399" },
                  { label:"Unique Visitors Today",      value:fmt(s.uniqueIpsToday),   icon:<Users style={{width:14,height:14}}/>,    color:"#34d399" },
                  { label:"Visits — Last 7 Days",       value:fmt(s.last7d),           icon:<TrendingUp style={{width:14,height:14}}/>, color:"#f59e0b" },
                  { label:"Unique Visitors — 7 Days",   value:fmt(s.uniqueIps7d),      icon:<Users style={{width:14,height:14}}/>,    color:"#f59e0b" },
                  { label:"Visits — Last 30 Days",      value:fmt(s.last30d),          icon:<TrendingUp style={{width:14,height:14}}/>, color:"#fb923c" },
                  { label:"Visits — Last Hour",         value:fmt(s.lastHour),         icon:<Clock style={{width:14,height:14}}/>,    color:"#e879f9" },
                ].map(item => (
                  <div key={item.label} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:"12px 14px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:4, color:"rgba(255,255,255,0.45)" }}>
                      {item.icon}
                      <span style={{ fontSize:11, fontWeight:600 }}>{item.label}</span>
                    </div>
                    <p style={{ margin:0, fontSize:20, fontWeight:900, color:item.color, fontVariantNumeric:"tabular-nums" }}>{item.value}</p>
                  </div>
                ))}
              </div>

              {/* First / latest */}
              <div style={{ marginTop:8, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:10, padding:"10px 14px", display:"flex", gap:24, flexWrap:"wrap" }}>
                <div>
                  <p style={{ margin:"0 0 2px", fontSize:11, color:"rgba(255,255,255,0.4)", fontWeight:600 }}>First Recorded Visit</p>
                  <p style={{ margin:0, fontSize:12, fontWeight:700, color:"rgba(255,255,255,0.75)", fontFamily:"monospace" }}>{fmtDate(s.firstVisit)}</p>
                </div>
                <div>
                  <p style={{ margin:"0 0 2px", fontSize:11, color:"rgba(255,255,255,0.4)", fontWeight:600 }}>Latest Recorded Visit</p>
                  <p style={{ margin:0, fontSize:12, fontWeight:700, color:"rgba(255,255,255,0.75)", fontFamily:"monospace" }}>{fmtDate(s.latestVisit)}</p>
                </div>
              </div>
            </section>

            {/* ── Daily breakdown ── */}
            <section>
              <p style={{ margin:"0 0 10px", fontSize:12, fontWeight:800, color:"rgba(255,255,255,0.5)", textTransform:"uppercase", letterSpacing:"0.08em" }}>Daily Breakdown — Last 30 Days</p>
              <div style={{ background:"rgba(0,0,0,0.3)", borderRadius:12, border:"1px solid rgba(255,255,255,0.06)", overflow:"hidden" }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 80px 80px", padding:"8px 14px", borderBottom:"1px solid rgba(255,255,255,0.06)", background:"rgba(255,255,255,0.03)" }}>
                  <span style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.4)", textTransform:"uppercase" }}>Date (UTC)</span>
                  <span style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.4)", textTransform:"uppercase", textAlign:"right" }}>Visits</span>
                  <span style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.4)", textTransform:"uppercase", textAlign:"right" }}>Unique</span>
                </div>
                <div style={{ maxHeight:260, overflowY:"auto" }}>
                  {report.daily.length === 0 && (
                    <p style={{ margin:0, padding:"16px 14px", fontSize:12, color:"rgba(255,255,255,0.3)", textAlign:"center" }}>No data for last 30 days</p>
                  )}
                  {report.daily.map((d, i) => (
                    <div key={d.date} style={{ display:"grid", gridTemplateColumns:"1fr 80px 80px", padding:"7px 14px", borderBottom: i < report.daily.length-1 ? "1px solid rgba(255,255,255,0.04)" : "none", background: i%2===0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                      <span style={{ fontSize:12, fontWeight:600, color:"rgba(255,255,255,0.7)", fontFamily:"monospace" }}>{d.date}</span>
                      <span style={{ fontSize:12, fontWeight:700, color:"#a78bfa", textAlign:"right", fontVariantNumeric:"tabular-nums" }}>{fmt(d.visits)}</span>
                      <span style={{ fontSize:12, fontWeight:700, color:"#60a5fa", textAlign:"right", fontVariantNumeric:"tabular-nums" }}>{fmt(d.unique)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ── Hourly bar chart ── */}
            <section>
              <p style={{ margin:"0 0 10px", fontSize:12, fontWeight:800, color:"rgba(255,255,255,0.5)", textTransform:"uppercase", letterSpacing:"0.08em" }}>Hourly Breakdown — Today (UTC)</p>
              <div style={{ background:"rgba(0,0,0,0.3)", borderRadius:12, border:"1px solid rgba(255,255,255,0.06)", padding:"14px 14px 10px" }}>
                {(() => {
                  const maxV = Math.max(1, ...report.hourly.map(r => r.visits));
                  return (
                    <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:70 }}>
                      {Array.from({ length: 24 }, (_, h) => {
                        const row = report.hourly.find(x => x.hour === h);
                        const v   = row?.visits ?? 0;
                        const pct = Math.round((v / maxV) * 100);
                        const isNow = new Date().getUTCHours() === h;
                        return (
                          <div key={h} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }} title={`${String(h).padStart(2,"0")}:00 UTC — ${fmt(v)} visits`}>
                            <div style={{ width:"100%", height: pct > 0 ? `${Math.max(4, pct)}%` : 2, background: isNow ? "#a78bfa" : "rgba(139,92,246,0.45)", borderRadius:"2px 2px 0 0", minHeight: pct > 0 ? 4 : 2, transition:"height 0.4s", position:"relative" }}>
                              {isNow && <div style={{ position:"absolute", top:-3, left:"50%", transform:"translateX(-50%)", width:4, height:4, borderRadius:"50%", background:"#a78bfa" }} className="animate-pulse" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
                  {[0,6,12,18,23].map(h => (
                    <span key={h} style={{ fontSize:9, color:"rgba(255,255,255,0.3)", fontFamily:"monospace" }}>{String(h).padStart(2,"0")}h</span>
                  ))}
                </div>
                {report.hourly.length === 0 && (
                  <p style={{ margin:"8px 0 0", fontSize:12, color:"rgba(255,255,255,0.3)", textAlign:"center" }}>No visits recorded today yet</p>
                )}
              </div>
            </section>

            {/* ── User agents ── */}
            <section>
              <p style={{ margin:"0 0 10px", fontSize:12, fontWeight:800, color:"rgba(255,255,255,0.5)", textTransform:"uppercase", letterSpacing:"0.08em" }}>Top User Agents</p>
              <div style={{ background:"rgba(0,0,0,0.3)", borderRadius:12, border:"1px solid rgba(255,255,255,0.06)", overflow:"hidden" }}>
                {report.topUserAgents.length === 0 && (
                  <p style={{ margin:0, padding:"16px 14px", fontSize:12, color:"rgba(255,255,255,0.3)", textAlign:"center" }}>No user-agent data available</p>
                )}
                {report.topUserAgents.map((u, i) => {
                  const total = report.topUserAgents.reduce((a,b) => a + b.count, 0);
                  const pct   = total > 0 ? Math.round((u.count / total) * 100) : 0;
                  return (
                    <div key={i} style={{ padding:"8px 14px", borderBottom: i < report.topUserAgents.length-1 ? "1px solid rgba(255,255,255,0.04)" : "none", background: i%2===0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                        <span style={{ fontSize:11, color:"rgba(255,255,255,0.65)", fontWeight:600, flex:1, marginRight:8 }}>{parseUA(u.ua)}</span>
                        <span style={{ fontSize:11, fontWeight:700, color:"#a78bfa", whiteSpace:"nowrap" }}>{fmt(u.count)} ({pct}%)</span>
                      </div>
                      <div style={{ height:3, background:"rgba(255,255,255,0.06)", borderRadius:2, overflow:"hidden" }}>
                        <div style={{ width:`${pct}%`, height:"100%", background:"rgba(139,92,246,0.5)", borderRadius:2 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Privacy note */}
            <div style={{ padding:"10px 14px", borderRadius:10, background:"rgba(59,130,246,0.08)", border:"1px solid rgba(59,130,246,0.2)" }}>
              <p style={{ margin:0, fontSize:11, color:"rgba(96,165,250,0.8)", fontWeight:600, lineHeight:1.6 }}>
                ℹ️ <strong>Privacy note:</strong> IP addresses are SHA-256 hashed server-side before storage. No raw IP addresses are retained. Unique visitor counts are based on distinct IP hashes per time window. All timestamps are UTC.
              </p>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function AdminAdsPageEditor() {
  const [values, setValues]     = useState<AdminSettingsMap>({});
  const [features, setFeatures] = useState<AdsFeature[]>(DEFAULT_FEATURES);
  const [links, setLinks]       = useState<AdsLink[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [views, setViews]       = useState<ViewStats | null>(null);
  const [showReport, setShowReport] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function fetchViews() {
    adminApi.get<ViewStats>("/admin/adspage-views")
      .then(v => setViews(v))
      .catch(() => {});
  }

  useEffect(() => {
    adminApi.settings().then(v => {
      setValues(v);
      setFeatures(parseJsonArray<AdsFeature>(v.adsPageFeatures, DEFAULT_FEATURES)
        .map(f => ({ icon: f.icon ?? '', title: f.title ?? '', desc: f.desc ?? '', url: f.url ?? '' })));
      setLinks(parseJsonArray<AdsLink>(v.adsPageExtraLinks, [])
        .map(l => ({ label: l.label ?? '', url: l.url ?? '', icon: l.icon ?? '' })));
    }).finally(() => setLoading(false));

    fetchViews();
    timerRef.current = setInterval(fetchViews, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  async function save() {
    setSaving(true); setSaved(false);
    try {
      const payload: AdminSettingsMap = { ...values };
      TEXT_FIELDS.forEach(f => { payload[f.key] = values[f.key] ?? f.placeholder; });
      payload.adsPageFeatures   = features.map(f => ({ icon: f.icon, title: f.title, desc: f.desc, url: f.url || null }));
      payload.adsPageExtraLinks = links.map(l => ({ label: l.label, url: l.url, icon: l.icon || null }));
      const updated = await adminApi.updateSettings(payload);
      setValues(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  }

  const previewUrl = `/adspage`;

  if (loading) return <p className="text-sm text-muted-foreground">جار التحميل...</p>;

  return (
    <div className="flex flex-col gap-5">
      {showReport && <ReportModal onClose={() => setShowReport(false)} />}

      {/* ── View Counter — clickable ── */}
      <button
        type="button"
        onClick={() => setShowReport(true)}
        className="w-full text-left bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-4 hover:bg-white/[0.08] hover:border-violet-500/40 transition-all group cursor-pointer"
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform"
          style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)" }}>
          <Eye className="w-5 h-5 text-violet-400" />
        </div>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground mb-1">
            زيارات <span className="font-mono text-violet-400">/adspage</span>
            <span className="ml-2 text-[10px] text-violet-400/70 group-hover:text-violet-400 transition-colors">← اضغط لعرض التقرير الكامل</span>
          </p>
          <div className="flex items-end gap-5">
            {views ? (
              <>
                <div>
                  <span className="text-2xl font-black text-white">{views.total.toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground ml-1">إجمالي</span>
                </div>
                <div>
                  <span className="text-lg font-bold text-violet-400">{views.today.toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground ml-1">اليوم</span>
                </div>
                <div>
                  <span className="text-lg font-bold text-emerald-400">{views.lastHour.toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground ml-1">آخر ساعة</span>
                </div>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">جار التحميل...</span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wide">Live</span>
          </div>
          <TrendingUp className="w-4 h-4 text-violet-400/50 group-hover:text-violet-400 transition-colors" />
        </div>
      </button>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">محرر صفحة الإعلانات</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            تحكم كامل في محتوى <span className="font-mono text-purple-400">/adspage</span> — العنوان، البطاقات، الروابط
          </p>
        </div>
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white border border-white/10 rounded-lg px-3 py-1.5 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          معاينة
        </a>
      </div>

      {/* ── النصوص الأساسية ── */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-3">النصوص الأساسية</h3>
        <div className="flex flex-col gap-3">
          {TEXT_FIELDS.map(field => (
            <label key={field.key} className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{field.label}</span>
              <Input
                value={(values[field.key] as string) ?? field.placeholder}
                onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
              />
            </label>
          ))}
        </div>
      </div>

      {/* ── بطاقات الميزات ── */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white">بطاقات الميزات</h3>
          <button
            type="button"
            onClick={() => setFeatures(f => [...f, { icon: '⭐', title: '', desc: '', url: '' }])}
            className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 border border-purple-500/30 rounded-lg px-2 py-1"
          >
            <Plus className="w-3 h-3" /> إضافة بطاقة
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {features.map((f, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                <Input
                  value={f.icon}
                  onChange={e => setFeatures(arr => arr.map((x, j) => j === i ? { ...x, icon: e.target.value } : x))}
                  placeholder="إيموجي"
                  className="w-16 text-center"
                />
                <Input
                  value={f.title}
                  onChange={e => setFeatures(arr => arr.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                  placeholder="العنوان"
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => setFeatures(arr => arr.filter((_, j) => j !== i))}
                  className="text-red-400 hover:text-red-300 p-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <textarea
                rows={2}
                value={f.desc}
                onChange={e => setFeatures(arr => arr.map((x, j) => j === i ? { ...x, desc: e.target.value } : x))}
                placeholder="الوصف"
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                dir="rtl"
              />
              <Input
                value={f.url}
                onChange={e => setFeatures(arr => arr.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                placeholder="رابط (اختياري — اتركه فارغاً إذا لا تريد رابطاً)"
                dir="ltr"
              />
            </div>
          ))}
          {features.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">لا توجد بطاقات — اضغط "إضافة بطاقة" لإنشاء أول ميزة</p>
          )}
        </div>
      </div>

      {/* ── روابط إضافية ── */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white">روابط إضافية (أزرار)</h3>
          <button
            type="button"
            onClick={() => setLinks(l => [...l, { label: '', url: '', icon: '' }])}
            className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 border border-purple-500/30 rounded-lg px-2 py-1"
          >
            <Plus className="w-3 h-3" /> إضافة رابط
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {links.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={l.icon}
                onChange={e => setLinks(arr => arr.map((x, j) => j === i ? { ...x, icon: e.target.value } : x))}
                placeholder="🔗"
                className="w-14 text-center"
              />
              <Input
                value={l.label}
                onChange={e => setLinks(arr => arr.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                placeholder="نص الزر"
                className="flex-1"
              />
              <Input
                value={l.url}
                onChange={e => setLinks(arr => arr.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                placeholder="https://..."
                className="flex-1"
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setLinks(arr => arr.filter((_, j) => j !== i))}
                className="text-red-400 hover:text-red-300 p-1"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {links.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">لا توجد روابط — اضغط "إضافة رابط" لإضافة زر</p>
          )}
        </div>
      </div>

      <Button onClick={save} disabled={saving} className="sticky bottom-4">
        <Save className="w-4 h-4 mr-1" />
        {saving ? "جار الحفظ..." : saved ? "تم الحفظ ✓" : "حفظ صفحة الإعلانات"}
      </Button>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { adminApi, type AdminSettingsMap } from "./adminApi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Save, Plus, Trash2, GripVertical, ExternalLink, Eye, X,
  Copy, Check, TrendingUp, Users, Clock, Calendar,
  ShieldAlert, AlertTriangle, CheckCircle2, Zap, RefreshCw, Download,
} from "lucide-react";

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

// ── Analytics report types ─────────────────────────────────────────────────
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

// ── Fraud report types ─────────────────────────────────────────────────────
interface FraudSignal { count: number; pct: number }
interface FraudReport {
  generatedAt: string;
  window: string;
  total: number;
  uniqueIps: number;
  uniqueRatio: number;
  signals: {
    emptyUserAgent:  FraudSignal;
    botUserAgent:    FraudSignal;
    highRepeatIps:   FraudSignal & { totalVisits: number; top: { ipHashPrefix: string; count: number }[] };
    burstWindows:    { count: number; totalVisits: number; top: { minute: string; count: number }[] };
    rapidFireClicks: FraudSignal;
  };
  suspiciousPct: number;
  riskLevel: "CLEAN" | "LOW" | "MEDIUM" | "HIGH";
}

// ── helpers ────────────────────────────────────────────────────────────────
function fmt(n: number) { return n.toLocaleString("en-US"); }
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { dateStyle:"medium", timeStyle:"short", timeZone:"UTC" }) + " UTC";
}
function parseUA(ua: string | null): string {
  if (!ua) return "Unknown / Empty";
  if (/Telegram/i.test(ua))    return "Telegram WebApp";
  if (/TelegramBot/i.test(ua)) return "Telegram Bot";
  if (/Android/i.test(ua))     return "Android Browser";
  if (/iPhone|iPad/i.test(ua)) return "iOS Browser";
  if (/Chrome/i.test(ua))      return "Chrome Desktop";
  if (/Firefox/i.test(ua))     return "Firefox Desktop";
  if (/Safari/i.test(ua))      return "Safari";
  return ua.slice(0, 60) + (ua.length > 60 ? "…" : "");
}

function riskColor(r: string) {
  if (r === "HIGH")   return { bg:"rgba(239,68,68,0.12)",   border:"rgba(239,68,68,0.4)",   text:"#f87171" };
  if (r === "MEDIUM") return { bg:"rgba(245,158,11,0.12)",  border:"rgba(245,158,11,0.4)",  text:"#fbbf24" };
  if (r === "LOW")    return { bg:"rgba(251,191,36,0.08)",  border:"rgba(251,191,36,0.3)",  text:"#fde68a" };
  return                     { bg:"rgba(34,197,94,0.10)",  border:"rgba(34,197,94,0.35)",  text:"#4ade80" };
}
function riskIcon(r: string) {
  if (r === "HIGH")   return <ShieldAlert style={{width:20,height:20,color:"#f87171"}} />;
  if (r === "MEDIUM") return <AlertTriangle style={{width:20,height:20,color:"#fbbf24"}} />;
  if (r === "LOW")    return <AlertTriangle style={{width:20,height:20,color:"#fde68a"}} />;
  return                     <CheckCircle2 style={{width:20,height:20,color:"#4ade80"}} />;
}
function riskDesc(r: string) {
  if (r === "HIGH")   return "Significant fraud signals detected. Most of these visits are likely fake — strong grounds for a complaint.";
  if (r === "MEDIUM") return "Notable suspicious activity detected. You may have been charged for non-human traffic.";
  if (r === "LOW")    return "Minor suspicious signals. Could be automated crawlers or ad preview bots.";
  return                     "Traffic looks clean. No significant fraud signals detected.";
}

// ── GigaPub reply template ─────────────────────────────────────────────────
function GigaPubReplyBox({ fraud }: { fraud: FraudReport }) {
  const [copied, setCopied] = useState(false);
  const sig = fraud.signals;

  const topBurst = sig.burstWindows.top[0];
  const topIp    = sig.highRepeatIps.top[0];

  const template = `Hello GigaPub Support,

Thank you for your response. Here is the structured evidence from our server-side logs:

TRAFFIC SUMMARY (last 30 days)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total recorded visits:      ${fraud.total.toLocaleString("en-US")}
Unique visitor ratio:       ${fraud.uniqueRatio}% (${fraud.uniqueIps.toLocaleString("en-US")} unique IPs out of ${fraud.total.toLocaleString("en-US")} hits)
Estimated suspicious traffic: ~${fraud.suspiciousPct}%

FRAUD SIGNALS DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Empty/missing User-Agent:       ${sig.emptyUserAgent.count.toLocaleString("en-US")} visits (${sig.emptyUserAgent.pct}%)
   → Direct HTTP requests with no browser signature. These are not human users.

2. Known bot/crawler User-Agents:  ${sig.botUserAgent.count.toLocaleString("en-US")} visits (${sig.botUserAgent.pct}%)
   → Matched against 20+ known patterns (curl, Puppeteer, Selenium, AhrefsBot, etc.)

3. High-repeat IPs (>10 visits):   ${sig.highRepeatIps.count} IPs responsible for ${sig.highRepeatIps.totalVisits.toLocaleString("en-US")} visits (${sig.highRepeatIps.pct}%)
   → ${topIp ? `Top offender: IP hash ${topIp.ipHashPrefix} — ${topIp.count} visits` : "See attached CSV for full list."}
   → No legitimate user visits a static landing page 10+ times.

4. Traffic burst windows (≥5 hits/min): ${sig.burstWindows.count} windows, ${sig.burstWindows.totalVisits.toLocaleString("en-US")} total visits
   → ${topBurst ? `Worst burst: ${topBurst.count} visits in a single minute at ${topBurst.minute} UTC` : "See attached CSV for exact timestamps."}
   → Organic traffic never spikes this sharply on a landing page.

5. Rapid-fire clicks (<2s gap, same IP): ${sig.rapidFireClicks.count.toLocaleString("en-US")} occurrences (${sig.rapidFireClicks.pct}%)
   → Same IP hash hitting the page twice within 2 seconds. Physically impossible for a human.

REGARDING YOUR REQUEST FOR IPs
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
We store IP addresses as one-way SHA-256 hashes for GDPR compliance — raw IPs are never retained. The attached CSV contains the full log: timestamp (UTC), IP hash, and User-Agent for every recorded visit. The hash is consistent per IP, so you can identify clusters of repeat visits from the same source.

ATTACHED: souqratesx-adspage-visits-30d.csv
This file contains server-recorded timestamps for all visits in the last 30 days.
Timestamps are UTC, recorded server-side — not client-side and not manipulable.

We expect a formal credit or refund for the invalid traffic volume identified above.
If this cannot be resolved at your level, we will escalate to relevant advertising standards bodies.

Best regards,
SouqratesX Team`.trim();

  async function copy() {
    await navigator.clipboard.writeText(template);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div style={{ background:"rgba(168,85,247,0.07)", border:"1px solid rgba(168,85,247,0.25)", borderRadius:12, padding:"14px 16px" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <p style={{ margin:0, fontSize:12, fontWeight:800, color:"#c084fc" }}>💬 Ready-to-Send Reply to GigaPub</p>
        <button
          onClick={() => void copy()}
          style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 12px", borderRadius:7, background:"rgba(168,85,247,0.2)", border:"1px solid rgba(168,85,247,0.4)", color:"#c084fc", fontSize:11, fontWeight:700, cursor:"pointer" }}
        >
          {copied ? <Check style={{width:12,height:12}}/> : <Copy style={{width:12,height:12}}/>}
          {copied ? "Copied!" : "Copy Message"}
        </button>
      </div>
      <pre style={{ margin:0, fontSize:10.5, color:"rgba(255,255,255,0.55)", lineHeight:1.7, whiteSpace:"pre-wrap", wordBreak:"break-word", fontFamily:"monospace", maxHeight:220, overflowY:"auto", background:"rgba(0,0,0,0.25)", borderRadius:8, padding:"10px 12px" }}>
        {template}
      </pre>
    </div>
  );
}

// ── Modal ──────────────────────────────────────────────────────────────────
function ReportModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab]         = useState<"analytics"|"fraud">("analytics");
  const [report, setReport]   = useState<FullReport | null>(null);
  const [fraud, setFraud]     = useState<FraudReport | null>(null);
  const [loadingA, setLoadingA] = useState(true);
  const [loadingF, setLoadingF] = useState(true);
  const [copied, setCopied]   = useState(false);

  useEffect(() => {
    adminApi.get<FullReport>("/admin/adspage-views/report")
      .then(r => setReport(r)).catch(() => {}).finally(() => setLoadingA(false));
    adminApi.get<FraudReport>("/admin/adspage-views/fraud")
      .then(r => setFraud(r)).catch(() => {}).finally(() => setLoadingF(false));
  }, []);

  function buildTextReport(): string {
    const lines: string[] = [];
    if (report) {
      const s = report.summary;
      lines.push(
        "═══════════════════════════════════════════════════════",
        "   TRAFFIC ANALYTICS REPORT — /adspage",
        "   Platform: SouqratesX (Telegram Mini App)",
        `   Generated: ${new Date(report.generatedAt).toUTCString()}`,
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
        ...report.daily.map(d =>
          `${d.date.padEnd(16)}${fmt(d.visits).padStart(6)}   ${fmt(d.unique).padStart(6)}`
        ),
        "",
      );
    }
    if (fraud) {
      const f = fraud;
      const sig = f.signals;
      lines.push(
        "═══════════════════════════════════════════════════════",
        "   FRAUD / FAKE VISIT ANALYSIS — /adspage",
        `   Window: ${f.window}`,
        `   Generated: ${new Date(f.generatedAt).toUTCString()}`,
        "═══════════════════════════════════════════════════════",
        "",
        `RISK LEVEL: ${f.riskLevel}`,
        `Suspicious traffic estimate: ${f.suspiciousPct}% of ${fmt(f.total)} visits`,
        `Unique visitor ratio: ${f.uniqueRatio}% (lower = more suspicious)`,
        "",
        "FRAUD SIGNALS",
        "───────────────────────────────────────────────────────",
        `Empty / missing User-Agent:       ${fmt(sig.emptyUserAgent.count)}  (${sig.emptyUserAgent.pct}%)`,
        `Known bot / crawler User-Agents:  ${fmt(sig.botUserAgent.count)}    (${sig.botUserAgent.pct}%)`,
        `High-repeat IPs (>10 visits):     ${fmt(sig.highRepeatIps.totalVisits)} visits from ${sig.highRepeatIps.count} IPs  (${sig.highRepeatIps.pct}%)`,
        `Burst windows (≥5 visits/min):    ${sig.burstWindows.count} windows, ${fmt(sig.burstWindows.totalVisits)} visits`,
        `Rapid-fire clicks (<2s gap):      ${fmt(sig.rapidFireClicks.count)}  (${sig.rapidFireClicks.pct}%)`,
        "",
        "TOP BURST MINUTES",
        "───────────────────────────────────────────────────────",
        ...sig.burstWindows.top.map(b => `${b.minute}   ${b.count} visits`),
        "",
        "NOTE: IPs are SHA-256 hashed. 'Rapid-fire' = same IP",
        "hash hitting the page within 2 seconds of a prior visit.",
        "═══════════════════════════════════════════════════════",
      );
    }
    return lines.join("\n");
  }

  async function copyReport() {
    await navigator.clipboard.writeText(buildTextReport());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const TABS = [
    { id: "analytics" as const, label: "Analytics" },
    { id: "fraud"     as const, label: "🚨 Fraud Analysis" },
  ];

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
              <p style={{ margin:0, fontSize:14, fontWeight:900, color:"#fff" }}>Traffic Report — /adspage</p>
              <p style={{ margin:0, fontSize:11, color:"rgba(139,92,246,0.8)", fontWeight:600 }}>SouqratesX · Telegram Mini App</p>
            </div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={copyReport} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 14px", borderRadius:8, background:"rgba(139,92,246,0.15)", border:"1px solid rgba(139,92,246,0.3)", color:"#c4b5fd", fontSize:12, fontWeight:700, cursor:"pointer" }}>
              {copied ? <Check style={{width:13,height:13}} /> : <Copy style={{width:13,height:13}} />}
              {copied ? "Copied!" : "Copy Full Report"}
            </button>
            <button onClick={onClose} style={{ width:32, height:32, borderRadius:8, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.6)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <X style={{width:14,height:14}} />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display:"flex", borderBottom:"1px solid rgba(255,255,255,0.07)", background:"rgba(0,0,0,0.2)" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ flex:1, padding:"10px 0", fontSize:13, fontWeight:700, cursor:"pointer", background:"none", border:"none", borderBottom: tab===t.id ? "2px solid #a78bfa" : "2px solid transparent", color: tab===t.id ? "#a78bfa" : "rgba(255,255,255,0.45)", transition:"all 0.15s" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── ANALYTICS TAB ── */}
        {tab === "analytics" && (
          <div style={{ padding:"20px", display:"flex", flexDirection:"column", gap:20 }}>
            {loadingA && <p style={{ padding:40, textAlign:"center", color:"rgba(255,255,255,0.4)", fontSize:13 }}>Loading analytics…</p>}
            {!loadingA && report && (() => {
              const s = report.summary;
              return (
                <>
                  <p style={{ margin:0, fontSize:11, color:"rgba(255,255,255,0.35)", fontFamily:"monospace" }}>Generated: {new Date(report.generatedAt).toUTCString()}</p>

                  {/* Summary grid */}
                  <section>
                    <p style={{ margin:"0 0 10px", fontSize:12, fontWeight:800, color:"rgba(255,255,255,0.5)", textTransform:"uppercase", letterSpacing:"0.08em" }}>Summary</p>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
                      {[
                        { label:"Total Visits (All-Time)",    value:fmt(s.total),          icon:<Eye style={{width:13,height:13}}/>,          color:"#a78bfa" },
                        { label:"Unique Visitors (All-Time)", value:fmt(s.uniqueIps),       icon:<Users style={{width:13,height:13}}/>,        color:"#60a5fa" },
                        { label:"Visits Today (UTC)",         value:fmt(s.today),           icon:<Calendar style={{width:13,height:13}}/>,     color:"#34d399" },
                        { label:"Unique Visitors Today",      value:fmt(s.uniqueIpsToday),  icon:<Users style={{width:13,height:13}}/>,        color:"#34d399" },
                        { label:"Visits — Last 7 Days",       value:fmt(s.last7d),          icon:<TrendingUp style={{width:13,height:13}}/>,   color:"#f59e0b" },
                        { label:"Unique Visitors — 7 Days",   value:fmt(s.uniqueIps7d),     icon:<Users style={{width:13,height:13}}/>,        color:"#f59e0b" },
                        { label:"Visits — Last 30 Days",      value:fmt(s.last30d),         icon:<TrendingUp style={{width:13,height:13}}/>,   color:"#fb923c" },
                        { label:"Visits — Last Hour",         value:fmt(s.lastHour),        icon:<Clock style={{width:13,height:13}}/>,        color:"#e879f9" },
                      ].map(item => (
                        <div key={item.label} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:"12px 14px" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:4, color:"rgba(255,255,255,0.45)" }}>{item.icon}<span style={{ fontSize:11, fontWeight:600 }}>{item.label}</span></div>
                          <p style={{ margin:0, fontSize:20, fontWeight:900, color:item.color, fontVariantNumeric:"tabular-nums" }}>{item.value}</p>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop:8, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:10, padding:"10px 14px", display:"flex", gap:24, flexWrap:"wrap" }}>
                      <div><p style={{ margin:"0 0 2px", fontSize:11, color:"rgba(255,255,255,0.4)", fontWeight:600 }}>First Recorded Visit</p><p style={{ margin:0, fontSize:12, fontWeight:700, color:"rgba(255,255,255,0.75)", fontFamily:"monospace" }}>{fmtDate(s.firstVisit)}</p></div>
                      <div><p style={{ margin:"0 0 2px", fontSize:11, color:"rgba(255,255,255,0.4)", fontWeight:600 }}>Latest Recorded Visit</p><p style={{ margin:0, fontSize:12, fontWeight:700, color:"rgba(255,255,255,0.75)", fontFamily:"monospace" }}>{fmtDate(s.latestVisit)}</p></div>
                    </div>
                  </section>

                  {/* Daily */}
                  <section>
                    <p style={{ margin:"0 0 10px", fontSize:12, fontWeight:800, color:"rgba(255,255,255,0.5)", textTransform:"uppercase", letterSpacing:"0.08em" }}>Daily Breakdown — Last 30 Days</p>
                    <div style={{ background:"rgba(0,0,0,0.3)", borderRadius:12, border:"1px solid rgba(255,255,255,0.06)", overflow:"hidden" }}>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 80px 80px", padding:"8px 14px", borderBottom:"1px solid rgba(255,255,255,0.06)", background:"rgba(255,255,255,0.03)" }}>
                        {["Date (UTC)","Visits","Unique"].map(h => <span key={h} style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.4)", textTransform:"uppercase", textAlign: h!=="Date (UTC)" ? "right" : "left" }}>{h}</span>)}
                      </div>
                      <div style={{ maxHeight:240, overflowY:"auto" }}>
                        {report.daily.length === 0 && <p style={{ margin:0, padding:"16px 14px", fontSize:12, color:"rgba(255,255,255,0.3)", textAlign:"center" }}>No data for last 30 days</p>}
                        {report.daily.map((d, i) => (
                          <div key={d.date} style={{ display:"grid", gridTemplateColumns:"1fr 80px 80px", padding:"7px 14px", borderBottom: i<report.daily.length-1?"1px solid rgba(255,255,255,0.04)":"none", background:i%2===0?"transparent":"rgba(255,255,255,0.01)" }}>
                            <span style={{ fontSize:12, fontWeight:600, color:"rgba(255,255,255,0.7)", fontFamily:"monospace" }}>{d.date}</span>
                            <span style={{ fontSize:12, fontWeight:700, color:"#a78bfa", textAlign:"right", fontVariantNumeric:"tabular-nums" }}>{fmt(d.visits)}</span>
                            <span style={{ fontSize:12, fontWeight:700, color:"#60a5fa", textAlign:"right", fontVariantNumeric:"tabular-nums" }}>{fmt(d.unique)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>

                  {/* Hourly bar */}
                  <section>
                    <p style={{ margin:"0 0 10px", fontSize:12, fontWeight:800, color:"rgba(255,255,255,0.5)", textTransform:"uppercase", letterSpacing:"0.08em" }}>Hourly Breakdown — Today (UTC)</p>
                    <div style={{ background:"rgba(0,0,0,0.3)", borderRadius:12, border:"1px solid rgba(255,255,255,0.06)", padding:"14px 14px 10px" }}>
                      {(() => {
                        const maxV = Math.max(1, ...report.hourly.map(r => r.visits));
                        return (
                          <>
                            <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:70 }}>
                              {Array.from({length:24},(_,h)=>{
                                const row=report.hourly.find(x=>x.hour===h);
                                const v=row?.visits??0;
                                const p=Math.round((v/maxV)*100);
                                const isNow=new Date().getUTCHours()===h;
                                return (
                                  <div key={h} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}} title={`${String(h).padStart(2,"0")}:00 UTC — ${fmt(v)} visits`}>
                                    <div style={{width:"100%",height:p>0?`${Math.max(4,p)}%`:2,background:isNow?"#a78bfa":"rgba(139,92,246,0.45)",borderRadius:"2px 2px 0 0",minHeight:p>0?4:2,transition:"height 0.4s",position:"relative"}}>
                                      {isNow&&<div style={{position:"absolute",top:-3,left:"50%",transform:"translateX(-50%)",width:4,height:4,borderRadius:"50%",background:"#a78bfa"}} className="animate-pulse"/>}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                              {[0,6,12,18,23].map(h=><span key={h} style={{fontSize:9,color:"rgba(255,255,255,0.3)",fontFamily:"monospace"}}>{String(h).padStart(2,"0")}h</span>)}
                            </div>
                          </>
                        );
                      })()}
                      {report.hourly.length===0&&<p style={{margin:"8px 0 0",fontSize:12,color:"rgba(255,255,255,0.3)",textAlign:"center"}}>No visits recorded today yet</p>}
                    </div>
                  </section>

                  {/* User agents */}
                  <section>
                    <p style={{ margin:"0 0 10px", fontSize:12, fontWeight:800, color:"rgba(255,255,255,0.5)", textTransform:"uppercase", letterSpacing:"0.08em" }}>Top User Agents</p>
                    <div style={{ background:"rgba(0,0,0,0.3)", borderRadius:12, border:"1px solid rgba(255,255,255,0.06)", overflow:"hidden" }}>
                      {report.topUserAgents.length===0&&<p style={{margin:0,padding:"16px 14px",fontSize:12,color:"rgba(255,255,255,0.3)",textAlign:"center"}}>No user-agent data available</p>}
                      {report.topUserAgents.map((u,i)=>{
                        const tot=report.topUserAgents.reduce((a,b)=>a+b.count,0);
                        const p=tot>0?Math.round((u.count/tot)*100):0;
                        return (
                          <div key={i} style={{padding:"8px 14px",borderBottom:i<report.topUserAgents.length-1?"1px solid rgba(255,255,255,0.04)":"none",background:i%2===0?"transparent":"rgba(255,255,255,0.01)"}}>
                            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                              <span style={{fontSize:11,color:"rgba(255,255,255,0.65)",fontWeight:600,flex:1,marginRight:8}}>{parseUA(u.ua)}</span>
                              <span style={{fontSize:11,fontWeight:700,color:"#a78bfa",whiteSpace:"nowrap"}}>{fmt(u.count)} ({p}%)</span>
                            </div>
                            <div style={{height:3,background:"rgba(255,255,255,0.06)",borderRadius:2,overflow:"hidden"}}>
                              <div style={{width:`${p}%`,height:"100%",background:"rgba(139,92,246,0.5)",borderRadius:2}}/>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <div style={{ padding:"10px 14px", borderRadius:10, background:"rgba(59,130,246,0.08)", border:"1px solid rgba(59,130,246,0.2)" }}>
                    <p style={{ margin:0, fontSize:11, color:"rgba(96,165,250,0.8)", fontWeight:600, lineHeight:1.6 }}>
                      ℹ️ <strong>Privacy note:</strong> IP addresses are SHA-256 hashed server-side before storage. No raw IPs are retained. All timestamps are UTC.
                    </p>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* ── FRAUD TAB ── */}
        {tab === "fraud" && (
          <div style={{ padding:"20px", display:"flex", flexDirection:"column", gap:20 }}>
            {loadingF && (
              <div style={{ padding:48, textAlign:"center", display:"flex", flexDirection:"column", alignItems:"center", gap:12 }}>
                <RefreshCw style={{ width:24, height:24, color:"rgba(255,255,255,0.3)", animation:"spin 1.2s linear infinite" }} />
                <p style={{ margin:0, fontSize:13, color:"rgba(255,255,255,0.4)" }}>Analysing traffic patterns…</p>
              </div>
            )}
            {!loadingF && fraud && (() => {
              const f = fraud;
              const sig = f.signals;
              const rc = riskColor(f.riskLevel);
              const uniqueRatioColor = f.uniqueRatio > 70 ? "#4ade80" : f.uniqueRatio > 40 ? "#fbbf24" : "#f87171";

              return (
                <>
                  <p style={{ margin:0, fontSize:11, color:"rgba(255,255,255,0.35)", fontFamily:"monospace" }}>Generated: {new Date(f.generatedAt).toUTCString()} · Window: {f.window}</p>

                  {/* Risk banner */}
                  <div style={{ borderRadius:14, padding:"16px 18px", background:rc.bg, border:`1.5px solid ${rc.border}`, display:"flex", alignItems:"flex-start", gap:14 }}>
                    {riskIcon(f.riskLevel)}
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                        <span style={{ fontSize:16, fontWeight:900, color:rc.text }}>Risk Level: {f.riskLevel}</span>
                        <span style={{ fontSize:13, fontWeight:800, color:rc.text, opacity:0.8 }}>~{f.suspiciousPct}% suspicious</span>
                      </div>
                      <p style={{ margin:0, fontSize:12, color:"rgba(255,255,255,0.65)", lineHeight:1.6 }}>{riskDesc(f.riskLevel)}</p>
                    </div>
                  </div>

                  {/* Unique ratio */}
                  <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:"14px 16px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                      <div>
                        <p style={{ margin:0, fontSize:12, fontWeight:700, color:"rgba(255,255,255,0.6)" }}>Unique Visitor Ratio</p>
                        <p style={{ margin:"2px 0 0", fontSize:11, color:"rgba(255,255,255,0.35)" }}>{fmt(f.uniqueIps)} unique IPs out of {fmt(f.total)} total visits</p>
                      </div>
                      <span style={{ fontSize:24, fontWeight:900, color:uniqueRatioColor }}>{f.uniqueRatio}%</span>
                    </div>
                    <div style={{ height:6, background:"rgba(255,255,255,0.08)", borderRadius:3, overflow:"hidden" }}>
                      <div style={{ width:`${f.uniqueRatio}%`, height:"100%", background:uniqueRatioColor, borderRadius:3, transition:"width 0.6s ease" }} />
                    </div>
                    <p style={{ margin:"6px 0 0", fontSize:11, color:"rgba(255,255,255,0.35)", lineHeight:1.5 }}>
                      A ratio below 40% means most visits are repeat hits from the same IPs — a strong sign of bot traffic or click-farm activity.
                    </p>
                  </div>

                  {/* Signal cards */}
                  <section>
                    <p style={{ margin:"0 0 10px", fontSize:12, fontWeight:800, color:"rgba(255,255,255,0.5)", textTransform:"uppercase", letterSpacing:"0.08em" }}>Fraud Signals</p>
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>

                      {/* Empty UA */}
                      <SignalRow
                        label="Empty / Missing User-Agent"
                        desc="Requests with no browser signature — direct HTTP calls or stripped bots."
                        count={sig.emptyUserAgent.count}
                        pct={sig.emptyUserAgent.pct}
                        total={f.total}
                        color="#f87171"
                      />

                      {/* Bot UA */}
                      <SignalRow
                        label="Known Bot / Crawler User-Agents"
                        desc="UAs matching known patterns: curl, wget, Python, Puppeteer, Selenium, AhrefsBot, SemrushBot, and 20+ others."
                        count={sig.botUserAgent.count}
                        pct={sig.botUserAgent.pct}
                        total={f.total}
                        color="#fb923c"
                      />

                      {/* Rapid fire */}
                      <SignalRow
                        label="Rapid-Fire Clicks (< 2s gap, same IP)"
                        desc="Same IP hash hitting the page within 2 seconds of a prior visit — impossible for a real human navigating naturally."
                        count={sig.rapidFireClicks.count}
                        pct={sig.rapidFireClicks.pct}
                        total={f.total}
                        color="#f59e0b"
                      />

                      {/* High-repeat IPs */}
                      <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:"12px 14px" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                          <div style={{ flex:1, marginRight:12 }}>
                            <p style={{ margin:0, fontSize:13, fontWeight:700, color:"#fff" }}>High-Repeat IPs (&gt;10 visits in 30 days)</p>
                            <p style={{ margin:"3px 0 0", fontSize:11, color:"rgba(255,255,255,0.45)", lineHeight:1.5 }}>
                              {sig.highRepeatIps.count} IP{sig.highRepeatIps.count!==1?"s":""} responsible for {fmt(sig.highRepeatIps.totalVisits)} visits ({sig.highRepeatIps.pct}%). Real users rarely visit a landing page 10+ times.
                            </p>
                          </div>
                          <span style={{ fontSize:18, fontWeight:900, color:"#fbbf24", whiteSpace:"nowrap" }}>{sig.highRepeatIps.count} IPs</span>
                        </div>
                        {sig.highRepeatIps.top.length > 0 && (
                          <div style={{ marginTop:8, background:"rgba(0,0,0,0.3)", borderRadius:8, overflow:"hidden" }}>
                            <div style={{ display:"grid", gridTemplateColumns:"1fr auto", padding:"6px 10px", background:"rgba(255,255,255,0.03)", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                              <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.35)", textTransform:"uppercase" }}>IP Hash (truncated)</span>
                              <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.35)", textTransform:"uppercase" }}>Visits</span>
                            </div>
                            {sig.highRepeatIps.top.map((ip, i) => (
                              <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr auto", padding:"5px 10px", borderBottom:i<sig.highRepeatIps.top.length-1?"1px solid rgba(255,255,255,0.04)":"none" }}>
                                <span style={{ fontSize:11, fontFamily:"monospace", color:"rgba(255,255,255,0.55)" }}>{ip.ipHashPrefix}</span>
                                <span style={{ fontSize:11, fontWeight:700, color:"#fbbf24" }}>{fmt(ip.count)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Burst windows */}
                      <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:"12px 14px" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                          <div style={{ flex:1, marginRight:12 }}>
                            <p style={{ margin:0, fontSize:13, fontWeight:700, color:"#fff" }}>Traffic Burst Windows (≥5 visits/min)</p>
                            <p style={{ margin:"3px 0 0", fontSize:11, color:"rgba(255,255,255,0.45)", lineHeight:1.5 }}>
                              {sig.burstWindows.count} minute{sig.burstWindows.count!==1?"s":""} with abnormally high traffic ({fmt(sig.burstWindows.totalVisits)} total visits). Organic traffic never spikes this sharply.
                            </p>
                          </div>
                          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                            <Zap style={{ width:14, height:14, color:"#e879f9" }} />
                            <span style={{ fontSize:18, fontWeight:900, color:"#e879f9", whiteSpace:"nowrap" }}>{sig.burstWindows.count}</span>
                          </div>
                        </div>
                        {sig.burstWindows.top.length > 0 && (
                          <div style={{ marginTop:8, background:"rgba(0,0,0,0.3)", borderRadius:8, overflow:"hidden" }}>
                            <div style={{ display:"grid", gridTemplateColumns:"1fr auto", padding:"6px 10px", background:"rgba(255,255,255,0.03)", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                              <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.35)", textTransform:"uppercase" }}>Minute (UTC)</span>
                              <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.35)", textTransform:"uppercase" }}>Visits</span>
                            </div>
                            {sig.burstWindows.top.map((b, i) => (
                              <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr auto", padding:"5px 10px", borderBottom:i<sig.burstWindows.top.length-1?"1px solid rgba(255,255,255,0.04)":"none" }}>
                                <span style={{ fontSize:11, fontFamily:"monospace", color:"rgba(255,255,255,0.55)" }}>{b.minute}</span>
                                <span style={{ fontSize:11, fontWeight:700, color:"#e879f9" }}>{b.count}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                    </div>
                  </section>

                  {/* CSV Export */}
                  <div style={{ background:"rgba(59,130,246,0.08)", border:"1px solid rgba(59,130,246,0.25)", borderRadius:12, padding:"14px 16px" }}>
                    <p style={{ margin:"0 0 8px", fontSize:12, fontWeight:800, color:"#60a5fa" }}>📥 Export Raw Visit Logs (CSV)</p>
                    <p style={{ margin:"0 0 12px", fontSize:11, color:"rgba(255,255,255,0.5)", lineHeight:1.6 }}>
                      GigaPub is asking for logs — download a CSV with every visit's exact timestamp (UTC), IP hash, and User-Agent. This is the server-side evidence they need.
                    </p>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      {[
                        { label:"Last 7 Days",  days:7  },
                        { label:"Last 30 Days", days:30 },
                        { label:"All Time",     days:365 },
                      ].map(opt => (
                        <a
                          key={opt.days}
                          href={`/api/admin/adspage-views/export.csv?days=${opt.days}`}
                          download
                          style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:8, background:"rgba(59,130,246,0.15)", border:"1px solid rgba(59,130,246,0.35)", color:"#93c5fd", fontSize:12, fontWeight:700, textDecoration:"none", cursor:"pointer" }}
                        >
                          <Download style={{width:13,height:13}} />
                          {opt.label}
                        </a>
                      ))}
                    </div>
                  </div>

                  {/* GigaPub reply template */}
                  <GigaPubReplyBox fraud={f} />

                  {/* Complaint tip */}
                  <div style={{ padding:"12px 16px", borderRadius:12, background:"rgba(251,191,36,0.08)", border:"1px solid rgba(251,191,36,0.25)" }}>
                    <p style={{ margin:"0 0 6px", fontSize:12, fontWeight:800, color:"#fbbf24" }}>📋 How to use this for a complaint</p>
                    <p style={{ margin:0, fontSize:11, color:"rgba(255,255,255,0.6)", lineHeight:1.7 }}>
                      1. Download the CSV above and attach it to your ticket.<br/>
                      2. Use the reply template above — copy it and send it to GigaPub.<br/>
                      3. Mention that IP hashes are SHA-256 derived (privacy-compliant) and timestamps are server-recorded UTC — this establishes server-side data integrity.
                    </p>
                  </div>
                </>
              );
            })()}
          </div>
        )}

      </div>
    </div>
  );
}

// ── Reusable signal row ────────────────────────────────────────────────────
function SignalRow({ label, desc, count, pct, total, color }: {
  label: string; desc: string; count: number; pct: number; total: number; color: string;
}) {
  const barPct = total > 0 ? Math.min(100, (count / total) * 100) : 0;
  return (
    <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:"12px 14px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
        <div style={{ flex:1, marginRight:12 }}>
          <p style={{ margin:0, fontSize:13, fontWeight:700, color:"#fff" }}>{label}</p>
          <p style={{ margin:"3px 0 0", fontSize:11, color:"rgba(255,255,255,0.45)", lineHeight:1.5 }}>{desc}</p>
        </div>
        <div style={{ textAlign:"right" }}>
          <p style={{ margin:0, fontSize:18, fontWeight:900, color, fontVariantNumeric:"tabular-nums" }}>{count.toLocaleString("en-US")}</p>
          <p style={{ margin:0, fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.4)" }}>{pct}%</p>
        </div>
      </div>
      <div style={{ height:4, background:"rgba(255,255,255,0.07)", borderRadius:2, overflow:"hidden" }}>
        <div style={{ width:`${barPct}%`, height:"100%", background:color, borderRadius:2, transition:"width 0.6s ease", opacity:0.7 }} />
      </div>
    </div>
  );
}

// ── Main editor component ──────────────────────────────────────────────────
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
      .then(v => setViews(v)).catch(() => {});
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

  if (loading) return <p className="text-sm text-muted-foreground">جار التحميل...</p>;

  return (
    <div className="flex flex-col gap-5">
      {showReport && <ReportModal onClose={() => setShowReport(false)} />}

      {/* ── View counter (clickable) ── */}
      <button
        type="button"
        onClick={() => setShowReport(true)}
        className="w-full text-left bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-4 hover:bg-white/[0.08] hover:border-violet-500/40 transition-all group cursor-pointer"
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform"
          style={{ background:"rgba(139,92,246,0.15)", border:"1px solid rgba(139,92,246,0.3)" }}>
          <Eye className="w-5 h-5 text-violet-400" />
        </div>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground mb-1">
            زيارات <span className="font-mono text-violet-400">/adspage</span>
            <span className="ml-2 text-[10px] text-violet-400/60 group-hover:text-violet-400 transition-colors">← tap for full report + fraud analysis</span>
          </p>
          <div className="flex items-end gap-5">
            {views ? (
              <>
                <div><span className="text-2xl font-black text-white">{views.total.toLocaleString()}</span><span className="text-xs text-muted-foreground ml-1">إجمالي</span></div>
                <div><span className="text-lg font-bold text-violet-400">{views.today.toLocaleString()}</span><span className="text-xs text-muted-foreground ml-1">اليوم</span></div>
                <div><span className="text-lg font-bold text-emerald-400">{views.lastHour.toLocaleString()}</span><span className="text-xs text-muted-foreground ml-1">آخر ساعة</span></div>
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
          <ShieldAlert className="w-4 h-4 text-red-400/50 group-hover:text-red-400 transition-colors" />
        </div>
      </button>

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">محرر صفحة الإعلانات</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            تحكم كامل في محتوى <span className="font-mono text-purple-400">/adspage</span>
          </p>
        </div>
        <a href="/adspage" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white border border-white/10 rounded-lg px-3 py-1.5 transition-colors">
          <ExternalLink className="w-3.5 h-3.5" /> معاينة
        </a>
      </div>

      {/* ── Text fields ── */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-3">النصوص الأساسية</h3>
        <div className="flex flex-col gap-3">
          {TEXT_FIELDS.map(field => (
            <label key={field.key} className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{field.label}</span>
              <Input value={(values[field.key] as string) ?? field.placeholder}
                onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder} />
            </label>
          ))}
        </div>
      </div>

      {/* ── Feature cards ── */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white">بطاقات الميزات</h3>
          <button type="button" onClick={() => setFeatures(f => [...f, { icon:'⭐', title:'', desc:'', url:'' }])}
            className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 border border-purple-500/30 rounded-lg px-2 py-1">
            <Plus className="w-3 h-3" /> إضافة بطاقة
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {features.map((f, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                <Input value={f.icon} onChange={e => setFeatures(arr => arr.map((x,j)=>j===i?{...x,icon:e.target.value}:x))} placeholder="إيموجي" className="w-16 text-center" />
                <Input value={f.title} onChange={e => setFeatures(arr => arr.map((x,j)=>j===i?{...x,title:e.target.value}:x))} placeholder="العنوان" className="flex-1" />
                <button type="button" onClick={() => setFeatures(arr => arr.filter((_,j)=>j!==i))} className="text-red-400 hover:text-red-300 p-1"><Trash2 className="w-4 h-4" /></button>
              </div>
              <textarea rows={2} value={f.desc} onChange={e => setFeatures(arr => arr.map((x,j)=>j===i?{...x,desc:e.target.value}:x))} placeholder="الوصف"
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none" dir="rtl" />
              <Input value={f.url} onChange={e => setFeatures(arr => arr.map((x,j)=>j===i?{...x,url:e.target.value}:x))} placeholder="رابط (اختياري)" dir="ltr" />
            </div>
          ))}
          {features.length===0&&<p className="text-xs text-muted-foreground text-center py-4">لا توجد بطاقات</p>}
        </div>
      </div>

      {/* ── Extra links ── */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white">روابط إضافية (أزرار)</h3>
          <button type="button" onClick={() => setLinks(l => [...l, { label:'', url:'', icon:'' }])}
            className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 border border-purple-500/30 rounded-lg px-2 py-1">
            <Plus className="w-3 h-3" /> إضافة رابط
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {links.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={l.icon} onChange={e => setLinks(arr => arr.map((x,j)=>j===i?{...x,icon:e.target.value}:x))} placeholder="🔗" className="w-14 text-center" />
              <Input value={l.label} onChange={e => setLinks(arr => arr.map((x,j)=>j===i?{...x,label:e.target.value}:x))} placeholder="نص الزر" className="flex-1" />
              <Input value={l.url} onChange={e => setLinks(arr => arr.map((x,j)=>j===i?{...x,url:e.target.value}:x))} placeholder="https://..." className="flex-1" dir="ltr" />
              <button type="button" onClick={() => setLinks(arr => arr.filter((_,j)=>j!==i))} className="text-red-400 hover:text-red-300 p-1"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          {links.length===0&&<p className="text-xs text-muted-foreground text-center py-3">لا توجد روابط</p>}
        </div>
      </div>

      <Button onClick={save} disabled={saving} className="sticky bottom-4">
        <Save className="w-4 h-4 mr-1" />
        {saving ? "جار الحفظ..." : saved ? "تم الحفظ ✓" : "حفظ صفحة الإعلانات"}
      </Button>
    </div>
  );
}

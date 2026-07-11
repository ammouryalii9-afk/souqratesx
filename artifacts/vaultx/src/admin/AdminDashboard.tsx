import { useState } from "react";
import { adminApi } from "./adminApi";
import { AdminOverview } from "./AdminOverview";
import { AdminUsers } from "./AdminUsers";
import { AdminSettings } from "./AdminSettings";
import { AdminAuditLog } from "./AdminAuditLog";
import { AdminBroadcast } from "./AdminBroadcast";
import { AdminAds } from "./AdminAds";
import { AdminStarStore } from "./AdminStarStore";
import { AdminAnalytics } from "./AdminAnalytics";
import { AdminAntiCheat } from "./AdminAntiCheat";
import { AdminProviderReports } from "./AdminProviderReports";
import { AdminPartnerTasks } from "./AdminPartnerTasks";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Users as UsersIcon, Settings as SettingsIcon, ScrollText, LogOut, ShieldCheck, Send, Megaphone, Star, TrendingUp, ShieldAlert, Zap, ListTodo } from "lucide-react";

type Tab = "overview" | "analytics" | "anticheat" | "providers" | "users" | "broadcast" | "ads" | "star-store" | "partner-tasks" | "settings" | "log";

const TAB_GROUPS: { label: string; tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: string }[] }[] = [
  {
    label: "البيانات",
    tabs: [
      { id: "overview",   label: "نظرة عامة",   icon: <LayoutDashboard className="w-4 h-4" /> },
      { id: "analytics",  label: "التحليلات",    icon: <TrendingUp className="w-4 h-4" />,   badge: "جديد" },
      { id: "anticheat",  label: "مكافحة الغش",  icon: <ShieldAlert className="w-4 h-4" />,  badge: "جديد" },
      { id: "providers",  label: "المزودون",      icon: <Zap className="w-4 h-4" />,          badge: "جديد" },
    ],
  },
  {
    label: "الإدارة",
    tabs: [
      { id: "users",      label: "المستخدمون",   icon: <UsersIcon className="w-4 h-4" /> },
      { id: "broadcast",  label: "رسائل جماعية", icon: <Send className="w-4 h-4" /> },
      { id: "ads",        label: "الإعلانات",    icon: <Megaphone className="w-4 h-4" /> },
      { id: "star-store",     label: "متجر النجوم",    icon: <Star className="w-4 h-4" /> },
      { id: "partner-tasks",  label: "مهام الشركاء",   icon: <ListTodo className="w-4 h-4" /> },
      { id: "settings",       label: "الإعدادات",      icon: <SettingsIcon className="w-4 h-4" /> },
      { id: "log",        label: "السجل",         icon: <ScrollText className="w-4 h-4" /> },
    ],
  },
];

export function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");

  async function handleLogout() {
    await adminApi.logout();
    onLogout();
  }

  return (
    <div className="min-h-screen bg-[#0D0D0F] text-white">
      <header className="sticky top-0 z-30 bg-[#0D0D0F]/95 backdrop-blur-md border-b border-white/5 px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{
            background: "linear-gradient(145deg, rgba(52,211,153,0.25) 0%, rgba(52,211,153,0.08) 100%)",
            border: "1px solid rgba(52,211,153,0.3)",
            boxShadow: "0 0 16px rgba(52,211,153,0.2)",
          }}>
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-white text-sm leading-none">SouqrateX</span>
            <span className="text-[9px] text-primary/60 font-semibold uppercase tracking-wider">Control Panel</span>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={handleLogout} data-testid="button-admin-logout"
          className="border-white/10 hover:border-red-500/30 hover:text-red-400 hover:bg-red-500/10 transition-all">
          <LogOut className="w-4 h-4 mr-1" /> خروج
        </Button>
      </header>

      <nav className="sticky top-16 z-20 bg-[#0D0D0F]/95 backdrop-blur-md border-b border-white/5 overflow-x-auto">
        {TAB_GROUPS.map((group) => (
          <div key={group.label} className="flex items-center px-2 gap-0.5 border-b border-white/3 last:border-0">
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 mr-2 shrink-0 hidden sm:block">{group.label}</span>
            {group.tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                data-testid={`tab-admin-${t.id}`}
                className={`relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
                  tab === t.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-white"
                }`}
              >
                {t.icon}
                {t.label}
                {t.badge && (
                  <span className="absolute -top-0.5 -right-0.5 text-[7px] font-black px-1 py-0.5 rounded-full bg-primary text-black leading-none">
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <main className="p-4 max-w-3xl mx-auto">
        {tab === "overview"   && <AdminOverview />}
        {tab === "analytics"  && <AdminAnalytics />}
        {tab === "anticheat"  && <AdminAntiCheat />}
        {tab === "providers"  && <AdminProviderReports />}
        {tab === "users"      && <AdminUsers />}
        {tab === "broadcast"  && <AdminBroadcast />}
        {tab === "ads"        && <AdminAds />}
        {tab === "star-store"    && <AdminStarStore />}
        {tab === "partner-tasks" && <AdminPartnerTasks />}
        {tab === "settings"      && <AdminSettings />}
        {tab === "log"        && <AdminAuditLog />}
      </main>
    </div>
  );
}

import { useState } from "react";
import { adminApi } from "./adminApi";
import { AdminOverview } from "./AdminOverview";
import { AdminUsers } from "./AdminUsers";
import { AdminSettings } from "./AdminSettings";
import { AdminAuditLog } from "./AdminAuditLog";
import { AdminBroadcast } from "./AdminBroadcast";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Users as UsersIcon, Settings as SettingsIcon, ScrollText, LogOut, ShieldCheck, Send } from "lucide-react";

type Tab = "overview" | "users" | "broadcast" | "settings" | "log";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "نظرة عامة", icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: "users", label: "المستخدمون", icon: <UsersIcon className="w-4 h-4" /> },
  { id: "broadcast", label: "رسائل جماعية", icon: <Send className="w-4 h-4" /> },
  { id: "settings", label: "الإعدادات", icon: <SettingsIcon className="w-4 h-4" /> },
  { id: "log", label: "السجل", icon: <ScrollText className="w-4 h-4" /> },
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
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-[#8A6F00] flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-black" />
          </div>
          <span className="font-bold">لوحة تحكم SouqrateX</span>
        </div>
        <Button size="sm" variant="outline" onClick={handleLogout} data-testid="button-admin-logout">
          <LogOut className="w-4 h-4 mr-1" /> خروج
        </Button>
      </header>

      <nav className="sticky top-16 z-20 bg-[#0D0D0F]/95 backdrop-blur-md border-b border-white/5 px-2 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            data-testid={`tab-admin-${t.id}`}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-white"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>

      <main className="p-4 max-w-3xl mx-auto">
        {tab === "overview" && <AdminOverview />}
        {tab === "users" && <AdminUsers />}
        {tab === "broadcast" && <AdminBroadcast />}
        {tab === "settings" && <AdminSettings />}
        {tab === "log" && <AdminAuditLog />}
      </main>
    </div>
  );
}

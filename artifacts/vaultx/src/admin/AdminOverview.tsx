import { useEffect, useState } from "react";
import { adminApi, type AdminStats } from "./adminApi";
import { Users, Coins, Crown, Ban, UserPlus, DollarSign } from "lucide-react";

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center text-primary">{icon}</div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-bold text-white">{value}</div>
      </div>
    </div>
  );
}

export function AdminOverview() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .stats()
      .then(setStats)
      .catch(() => setError("فشل تحميل الإحصائيات"));
  }, []);

  if (error) return <p className="text-red-400 text-sm" data-testid="text-overview-error">{error}</p>;
  if (!stats) return <p className="text-muted-foreground text-sm">جار التحميل...</p>;

  return (
    <div className="grid grid-cols-2 gap-3" data-testid="section-admin-overview">
      <StatCard icon={<Users className="w-5 h-5" />} label="إجمالي المستخدمين" value={stats.totalUsers} />
      <StatCard icon={<UserPlus className="w-5 h-5" />} label="مستخدمون جدد اليوم" value={stats.newUsersToday} />
      <StatCard icon={<Coins className="w-5 h-5" />} label="إجمالي النقاط" value={stats.totalLifetimePoints.toLocaleString()} />
      <StatCard icon={<DollarSign className="w-5 h-5" />} label="إجمالي الرصيد $" value={stats.totalBalanceUSD.toFixed(2)} />
      <StatCard icon={<Crown className="w-5 h-5" />} label="مستخدمو بريميوم" value={stats.premiumUsers} />
      <StatCard icon={<Ban className="w-5 h-5" />} label="محظورون" value={stats.bannedUsers} />
    </div>
  );
}

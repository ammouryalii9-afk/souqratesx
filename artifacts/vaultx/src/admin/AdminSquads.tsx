import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Trash2, Users, Crown } from "lucide-react";
import { adminApi } from "./adminApi";

type AdminSquad = {
  id: number;
  name: string;
  emoji: string;
  ownerId: string;
  createdAt: string;
  memberCount: number;
  totalPoints: number;
};

export function AdminSquads() {
  const [items, setItems] = useState<AdminSquad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    adminApi
      .get<AdminSquad[]>("/admin/squads")
      .then(setItems)
      .catch(() => setError("فشل تحميل الفِرَق"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(item: AdminSquad) {
    if (!confirm(`حذف فريق "${item.name}"؟ سيتم إخراج جميع الأعضاء (${item.memberCount}).`)) return;
    setDeletingId(item.id);
    try {
      await adminApi.del(`/admin/squads/${item.id}`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحذف");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="section-admin-squads">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-white text-sm">الفِرَق</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {items.length} فريق · مرتّبة حسب مجموع النقاط
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} className="border-white/10 gap-1">
          <RefreshCw className="w-3.5 h-3.5" /> تحديث
        </Button>
      </div>

      {error && <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <p className="text-3xl mb-2">🛡️</p>
          <p className="text-sm">لا توجد فِرَق بعد</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((item, i) => (
            <div
              key={item.id}
              className="rounded-2xl border border-white/6 bg-white/2 p-4 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-6 text-center text-xs font-black text-muted-foreground shrink-0">{i + 1}</span>
                <span className="text-2xl shrink-0">{item.emoji}</span>
                <div className="min-w-0">
                  <p className="font-bold text-white text-sm truncate">{item.name}</p>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {item.memberCount}</span>
                    <span>{item.totalPoints.toLocaleString()} نقطة</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground/50 flex items-center gap-1 mt-0.5">
                    <Crown className="w-2.5 h-2.5 text-yellow-500/70" /> {item.ownerId}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => remove(item)}
                disabled={deletingId === item.id}
                className="gap-1 shrink-0"
              >
                {deletingId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                حذف
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

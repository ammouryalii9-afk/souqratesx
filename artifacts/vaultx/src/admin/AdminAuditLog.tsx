import { useEffect, useState } from "react";
import { adminApi, type AdminAuditLogEntry } from "./adminApi";

export function AdminAuditLog() {
  const [entries, setEntries] = useState<AdminAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi
      .auditLog()
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-muted-foreground text-sm">جار التحميل...</p>;
  if (entries.length === 0) return <p className="text-muted-foreground text-sm text-center py-6">لا يوجد سجل حتى الآن</p>;

  return (
    <div className="flex flex-col gap-2" data-testid="section-admin-audit-log">
      {entries.map((entry) => (
        <div key={entry.id} className="bg-white/5 border border-white/10 rounded-lg p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-white font-medium">{entry.action}</span>
            <span className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</span>
          </div>
          {entry.targetTelegramId && <div className="text-xs text-muted-foreground">المستخدم: {entry.targetTelegramId}</div>}
        </div>
      ))}
    </div>
  );
}

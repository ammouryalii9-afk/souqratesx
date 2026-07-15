import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, Download, Eye, EyeOff } from "lucide-react";

type ContractSettings = {
  botName: string;
  botLogoUrl: string;
  contractText: string;
  party2Obligations: string;
  publicationPage: string;
};

type Signature = {
  id: number;
  telegramId: string | null;
  name: string;
  age: number;
  country: string;
  signatureDataUrl: string;
  contractVersion: string;
  ipAddress: string | null;
  signedAt: string;
};

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function AdminContract() {
  const [settings, setSettings] = useState<ContractSettings>({
    botName: "",
    botLogoUrl: "",
    contractText: "",
    party2Obligations: "",
    publicationPage: "",
  });
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [expandedSig, setExpandedSig] = useState<number | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const [s, sigs] = await Promise.all([
        fetch("/api/contract/settings").then((r) => r.json()) as Promise<ContractSettings>,
        adminFetch<Signature[]>("/admin/contract-signatures"),
      ]);
      setSettings(s);
      setSignatures(sigs);
    } catch {
      setError("فشل تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await adminFetch("/admin/contract-settings", {
        method: "PUT",
        body: JSON.stringify({
          botName: settings.botName,
          botLogoUrl: settings.botLogoUrl,
          contractText: settings.contractText,
          party2Obligations: settings.party2Obligations,
          publicationPage: settings.publicationPage,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("حذف هذا التوقيع؟")) return;
    try {
      await adminFetch(`/admin/contract-signatures/${id}`, { method: "DELETE" });
      setSignatures((prev) => prev.filter((s) => s.id !== id));
    } catch {
      setError("فشل الحذف");
    }
  }

  function downloadSignature(sig: Signature) {
    const a = document.createElement("a");
    a.href = sig.signatureDataUrl;
    a.download = `signature-${sig.name}-${sig.id}.png`;
    a.click();
  }

  if (loading) return <p className="text-muted-foreground text-sm">جار التحميل...</p>;

  return (
    <div className="flex flex-col gap-6" data-testid="section-admin-contract">
      {/* Settings Editor */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-4">
        <h3 className="font-bold text-white text-sm">⚙️ إعدادات صفحة العقد</h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">اسم البوت</label>
            <input
              value={settings.botName}
              onChange={(e) => setSettings((p) => ({ ...p, botName: e.target.value }))}
              placeholder="SouqratesX"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">رابط لوجو البوت (URL)</label>
            <input
              value={settings.botLogoUrl}
              onChange={(e) => setSettings((p) => ({ ...p, botLogoUrl: e.target.value }))}
              placeholder="https://..."
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">صفحة النشر</label>
          <input
            value={settings.publicationPage}
            onChange={(e) => setSettings((p) => ({ ...p, publicationPage: e.target.value }))}
            placeholder="مثال: قناة @SouqratesX على تيليجرام"
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">نص الاتفاقية</label>
          <textarea
            value={settings.contractText}
            onChange={(e) => setSettings((p) => ({ ...p, contractText: e.target.value }))}
            rows={8}
            placeholder="اكتب نص الاتفاقية هنا..."
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-y"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">التزامات الطرف الثاني</label>
          <textarea
            value={settings.party2Obligations}
            onChange={(e) => setSettings((p) => ({ ...p, party2Obligations: e.target.value }))}
            rows={5}
            placeholder="ما الذي يتوجب على الطرف الثاني القيام به..."
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-y"
          />
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}
        {saved && <p className="text-emerald-400 text-xs">✅ تم الحفظ بنجاح</p>}

        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "جار الحفظ..." : "حفظ الإعدادات"}
          </Button>
          <Button variant="outline" className="border-white/10 text-muted-foreground text-xs" asChild>
            <a href="/contract" target="_blank" rel="noreferrer">👁 معاينة الصفحة</a>
          </Button>
        </div>
      </div>

      {/* Signatures List */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-white text-sm">
            ✍️ التوقيعات المستلمة ({signatures.length})
          </h3>
        </div>

        {signatures.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm bg-white/3 rounded-xl border border-white/5">
            <p className="text-2xl mb-2">📭</p>
            <p>لا توجد توقيعات بعد</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {signatures.map((sig) => (
              <div
                key={sig.id}
                className="bg-white/5 border border-white/10 rounded-xl p-3"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium text-sm">{sig.name}</span>
                      <span className="text-[10px] text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded-full">
                        {sig.age} سنة · {sig.country}
                      </span>
                      {sig.telegramId && (
                        <span className="text-[10px] text-blue-400">
                          TG: {sig.telegramId}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground/50 mt-1">
                      {new Date(sig.signedAt).toLocaleString("ar-SA")}
                      {sig.ipAddress && ` · IP: ${sig.ipAddress}`}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpandedSig(expandedSig === sig.id ? null : sig.id)}
                      className="w-7 h-7 p-0 border-white/10"
                      title="عرض التوقيع"
                    >
                      {expandedSig === sig.id ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadSignature(sig)}
                      className="w-7 h-7 p-0 border-white/10"
                      title="تنزيل التوقيع"
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(sig.id)}
                      className="w-7 h-7 p-0"
                      title="حذف"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                {expandedSig === sig.id && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <p className="text-[10px] text-muted-foreground mb-1">صورة التوقيع:</p>
                    <div className="bg-white/5 rounded-lg p-2 inline-block">
                      <img
                        src={sig.signatureDataUrl}
                        alt="signature"
                        className="max-w-[200px] h-auto rounded"
                        style={{ filter: "invert(1)" }}
                      />
                    </div>
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

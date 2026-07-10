import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminApi } from "./adminApi";
import { ShieldCheck, Hexagon } from "lucide-react";

export function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await adminApi.login(password);
      onSuccess();
    } catch {
      setError("كلمة المرور غير صحيحة");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background relative overflow-hidden text-white px-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background z-0"></div>
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-card/60 backdrop-blur-2xl border border-white/10 rounded-[32px] p-8 flex flex-col gap-6 relative z-10 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
        <div className="flex flex-col items-center gap-3 mb-2">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-cyan-500/10 border border-primary/30 flex items-center justify-center shadow-[0_0_30px_rgba(52,211,153,0.15)] relative">
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-2xl"></div>
            <Hexagon className="w-8 h-8 text-primary relative z-10 fill-primary/20" />
            <ShieldCheck className="w-4 h-4 text-white absolute bottom-3 right-3 z-20" />
          </div>
          <h1 className="text-2xl font-black tracking-tight mt-2">لوحة تحكم SouqrateX</h1>
          <p className="text-sm text-muted-foreground text-center">أدخل كلمة مرور المدير للاستمرار</p>
        </div>
        <div className="flex flex-col gap-2">
          <Input
            type="password"
            placeholder="كلمة المرور"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            data-testid="input-admin-password"
            className="h-12 bg-black/40 border-white/10 focus-visible:border-primary focus-visible:ring-primary/30 rounded-xl px-4 text-center tracking-widest font-mono"
          />
          {error && <p className="text-xs text-destructive text-center font-medium animate-in slide-in-from-top-1" data-testid="text-admin-login-error">{error}</p>}
        </div>
        <Button type="submit" disabled={loading || !password} data-testid="button-admin-login" className="h-12 rounded-xl font-bold shadow-[0_0_20px_rgba(52,211,153,0.2)]">
          {loading ? "..." : "تسجيل الدخول"}
        </Button>
      </form>
    </div>
  );
}

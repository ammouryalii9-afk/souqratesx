import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminApi } from "./adminApi";
import { ShieldCheck } from "lucide-react";

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
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0D0D0F] text-white px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2 mb-2">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-[#8A6F00] flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-black" />
          </div>
          <h1 className="text-lg font-bold">لوحة تحكم SouqratesX</h1>
          <p className="text-xs text-muted-foreground">أدخل كلمة مرور المدير للاستمرار</p>
        </div>
        <Input
          type="password"
          placeholder="كلمة المرور"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          data-testid="input-admin-password"
        />
        {error && <p className="text-sm text-red-400" data-testid="text-admin-login-error">{error}</p>}
        <Button type="submit" disabled={loading || !password} data-testid="button-admin-login">
          {loading ? "..." : "تسجيل الدخول"}
        </Button>
      </form>
    </div>
  );
}

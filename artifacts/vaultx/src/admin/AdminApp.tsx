import { useEffect, useState } from "react";
import { adminApi } from "./adminApi";
import { AdminLogin } from "./AdminLogin";
import { AdminDashboard } from "./AdminDashboard";
import { Toaster } from "@/components/ui/toaster";

export function AdminApp() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    adminApi
      .me()
      .then((res) => setAuthenticated(res.authenticated))
      .catch(() => setAuthenticated(false));
  }, []);

  if (authenticated === null) {
    return <div className="min-h-screen bg-[#0D0D0F]" />;
  }

  return (
    <>
      {authenticated ? (
        <AdminDashboard onLogout={() => setAuthenticated(false)} />
      ) : (
        <AdminLogin onSuccess={() => setAuthenticated(true)} />
      )}
      <Toaster />
    </>
  );
}

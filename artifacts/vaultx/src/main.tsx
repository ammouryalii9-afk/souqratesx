import { createRoot } from "react-dom/client";
import App from "./App";
import { AdminApp } from "./admin/AdminApp";
import { LanguageProvider } from "./lib/i18n";
import "./index.css";

const isManagerRoute = window.location.pathname.startsWith("/manager");

createRoot(document.getElementById("root")!).render(
  <LanguageProvider>
    {isManagerRoute ? <AdminApp /> : <App />}
  </LanguageProvider>
);

document.getElementById("boot-loader")?.remove();

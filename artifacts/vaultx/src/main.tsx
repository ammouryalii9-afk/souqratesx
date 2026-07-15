import { createRoot } from "react-dom/client";
import App from "./App";
import { AdminApp } from "./admin/AdminApp";
import { ReferralRedirect } from "./pages/ReferralRedirect";
import { AdsPage } from "./pages/AdsPage";
import { ContractPage } from "./pages/ContractPage";
import { LanguageProvider } from "./lib/i18n";
import "./index.css";

const path = window.location.pathname;
const isManagerRoute = path.startsWith("/manager");
const isRedirectRoute = path.startsWith("/ref/") || path.startsWith("/squad/");
const isAdsPage = path === "/adspage";
const isContractPage = path === "/contract";

createRoot(document.getElementById("root")!).render(
  <LanguageProvider>
    {isManagerRoute ? <AdminApp /> : isRedirectRoute ? <ReferralRedirect /> : isAdsPage ? <AdsPage /> : isContractPage ? <ContractPage /> : <App />}
  </LanguageProvider>
);

document.getElementById("boot-loader")?.remove();

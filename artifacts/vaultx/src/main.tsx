import { createRoot } from "react-dom/client";
import App from "./App";
import { AdminApp } from "./admin/AdminApp";
import "./index.css";

const isManagerRoute = window.location.pathname.startsWith("/manager");

createRoot(document.getElementById("root")!).render(isManagerRoute ? <AdminApp /> : <App />);

document.getElementById("boot-loader")?.remove();

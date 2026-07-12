type OnclickaShowFn = () => Promise<void>;

declare global {
  interface Window {
    initCdTma?: (opts: { id: string }) => Promise<OnclickaShowFn>;
  }
}

let scriptPromise: Promise<void> | null = null;
const showFns = new Map<string, Promise<OnclickaShowFn>>();

function loadOnclickaScript(spotId: string): Promise<void> {
  if (typeof window.initCdTma === "function") return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js.onclckmn.com/static/onclicka.js";
    script.dataset.admpid = spotId;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Failed to load Onclicka SDK"));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export async function showOnclickaRewardedAd(spotId: string): Promise<void> {
  await loadOnclickaScript(spotId);
  if (typeof window.initCdTma !== "function") {
    throw new Error("Onclicka SDK unavailable");
  }
  let showPromise = showFns.get(spotId);
  if (!showPromise) {
    showPromise = window.initCdTma({ id: spotId });
    showFns.set(spotId, showPromise);
  }
  let show: OnclickaShowFn;
  try {
    show = await showPromise;
  } catch (err) {
    showFns.delete(spotId);
    throw err;
  }
  await show();
}

type OnclickaShowFn = () => Promise<void>;

declare global {
  interface Window {
    initCdTma?: (opts: { id: string }) => Promise<OnclickaShowFn>;
  }
}

let scriptPromise: Promise<void> | null = null;
const showFns = new Map<string, Promise<OnclickaShowFn>>();

/** Polls window.initCdTma until it appears or timeout expires. */
function waitForSdk(maxWaitMs = 5000): Promise<void> {
  if (typeof window.initCdTma === "function") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + maxWaitMs;
    const tick = () => {
      if (typeof window.initCdTma === "function") {
        resolve();
      } else if (Date.now() >= deadline) {
        reject(new Error("Onclicka SDK unavailable"));
      } else {
        setTimeout(tick, 150);
      }
    };
    tick();
  });
}

function loadOnclickaScript(spotId: string): Promise<void> {
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src*="onclckmn.com"]`,
    );
    if (existing) {
      resolve();
      return;
    }
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
  await waitForSdk(5000);

  let showPromise = showFns.get(spotId);
  if (!showPromise) {
    showPromise = window.initCdTma!({ id: spotId });
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

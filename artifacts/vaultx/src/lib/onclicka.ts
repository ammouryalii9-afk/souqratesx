type OnclickaShowFn = () => Promise<void>;

declare global {
  interface Window {
    initCdTma?: (opts: { id: number | string }) => Promise<OnclickaShowFn>;
  }
}

const VIDEO_SDK_URL = "https://js.onclckvd.com/in-stream-ad-admanager/tma.js";
const INPAGE_SDK_URL = "https://js.onclckmn.com/static/onclicka.js";

let videoScriptPromise: Promise<void> | null = null;
const showFns = new Map<string, Promise<OnclickaShowFn>>();

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

function loadVideoSdk(): Promise<void> {
  if (videoScriptPromise) return videoScriptPromise;

  videoScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${VIDEO_SDK_URL}"]`,
    );
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = VIDEO_SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      videoScriptPromise = null;
      reject(new Error("Failed to load Onclicka SDK"));
    };
    document.head.appendChild(script);
  });

  return videoScriptPromise;
}

/** Rewarded video (TMA in-stream): load tma.js, init with the video spot id, then show. */
export async function showOnclickaRewardedAd(spotId: string): Promise<void> {
  await loadVideoSdk();
  await waitForSdk(5000);

  let showPromise = showFns.get(spotId);
  if (!showPromise) {
    const numericId = /^\d+$/.test(spotId) ? Number(spotId) : spotId;
    showPromise = window.initCdTma!({ id: numericId });
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

let inpageLoaded = false;

/**
 * Inpage/interstitial ads (auto-displaying, no reward flow): load onclicka.js
 * once with the ad-code id in data-admpid. Ads render automatically.
 */
export function initOnclickaInpage(adCodeId: string): void {
  if (inpageLoaded) return;
  if (document.querySelector(`script[src="${INPAGE_SDK_URL}"]`)) {
    inpageLoaded = true;
    return;
  }
  const script = document.createElement("script");
  script.src = INPAGE_SDK_URL;
  script.dataset.admpid = adCodeId;
  script.async = true;
  script.onerror = () => {
    script.remove();
    inpageLoaded = false;
  };
  document.head.appendChild(script);
  inpageLoaded = true;
}

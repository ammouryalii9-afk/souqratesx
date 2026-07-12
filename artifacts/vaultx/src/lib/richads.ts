const SDK_URL = "https://richinfo.co/richpartners/telegram/js/tg-ob.js";

interface TelegramAdsControllerInstance {
  initialize(opts: { pubId: string; appId: string }): void;
  showInterstitial(): Promise<void>;
  showVastVideo(): Promise<void>;
}

type TelegramAdsControllerCtor = new () => TelegramAdsControllerInstance;

let controller: TelegramAdsControllerInstance | null = null;
let loadPromise: Promise<TelegramAdsControllerInstance> | null = null;

function loadSDK(pubId: string, appId: string): Promise<TelegramAdsControllerInstance> {
  if (controller) return Promise.resolve(controller);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<TelegramAdsControllerInstance>((resolve, reject) => {
    if (document.querySelector(`script[src="${SDK_URL}"]`)) {
      const Ctrl = (window as unknown as Record<string, unknown>)["TelegramAdsController"] as TelegramAdsControllerCtor | undefined;
      if (typeof Ctrl === "function") {
        const ctrl = new Ctrl();
        ctrl.initialize({ pubId, appId });
        controller = ctrl;
        resolve(ctrl);
        return;
      }
    }

    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => {
      const Ctrl = (window as unknown as Record<string, unknown>)["TelegramAdsController"] as TelegramAdsControllerCtor | undefined;
      if (typeof Ctrl !== "function") {
        reject(new Error("RichAds SDK unavailable"));
        return;
      }
      const ctrl = new Ctrl();
      ctrl.initialize({ pubId, appId });
      controller = ctrl;
      resolve(ctrl);
    };
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("Failed to load RichAds SDK"));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

/** Auto-init only (passive — no reward). Called from App.tsx at boot. */
export function initRichAds(pubId: string, appId: string): void {
  loadSDK(pubId, appId).catch(() => {
    loadPromise = null;
  });
}

/**
 * Show a RichAds interstitial ad triggered by a user button click.
 * Resolves when the ad completes or is closed. Rejects if the SDK
 * fails to load or the ad cannot be shown.
 */
export async function showRichAdsInterstitial(pubId: string, appId: string): Promise<void> {
  const ctrl = await loadSDK(pubId, appId);
  try {
    await ctrl.showInterstitial();
  } catch {
    await ctrl.showVastVideo();
  }
}

const SDK_URL = "https://richinfo.co/richpartners/telegram/js/tg-ob.js";

interface TelegramAdsControllerInstance {
  initialize(opts: { pubId: string; appId: string }): void;
  triggerInterstitialVideo(): Promise<void>;
  triggerInterstitialBanner(): Promise<void>;
  triggerInterstitialMixed(): Promise<void>;
}

type TelegramAdsControllerCtor = new () => TelegramAdsControllerInstance;

let controller: TelegramAdsControllerInstance | null = null;
let loadPromise: Promise<TelegramAdsControllerInstance> | null = null;

function loadSDK(pubId: string, appId: string): Promise<TelegramAdsControllerInstance> {
  if (controller) return Promise.resolve(controller);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<TelegramAdsControllerInstance>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SDK_URL}"]`);
    if (existing) {
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
        loadPromise = null;
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
 * Tries video → banner → mixed in order. Resolves when the ad completes
 * or is closed. Rejects if SDK fails to load or no ad is available.
 */
export async function showRichAdsInterstitial(pubId: string, appId: string): Promise<void> {
  const ctrl = await loadSDK(pubId, appId);

  const methods = [
    "triggerInterstitialVideo",
    "triggerInterstitialBanner",
    "triggerInterstitialMixed",
  ] as const;

  type TriggerFn = () => Promise<void>;

  let lastErr: unknown;
  for (const method of methods) {
    try {
      await (ctrl[method] as TriggerFn)();
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("No RichAds ad available");
}

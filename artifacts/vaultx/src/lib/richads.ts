const SDK_URL = "https://richinfo.co/richpartners/telegram/js/tg-ob.js";

interface TelegramAdsControllerInstance {
  initialize(opts: { pubId: string; appId: string }): Promise<void>;
  triggerInterstitialVideo(): Promise<void>;
  triggerInterstitialBanner(): Promise<void>;
  triggerInterstitialMixed(): Promise<void>;
  process(): Promise<void>;
}

type TelegramAdsControllerCtor = new () => TelegramAdsControllerInstance;

let controller: TelegramAdsControllerInstance | null = null;
let loadPromise: Promise<TelegramAdsControllerInstance> | null = null;

function loadSDK(pubId: string, appId: string): Promise<TelegramAdsControllerInstance> {
  if (controller) return Promise.resolve(controller);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<TelegramAdsControllerInstance>((resolve, reject) => {
    const injectScript = () => {
      const script = document.createElement("script");
      script.src = SDK_URL;
      script.async = true;
      script.onload = async () => {
        const Ctrl = (window as unknown as Record<string, unknown>)[
          "TelegramAdsController"
        ] as TelegramAdsControllerCtor | undefined;
        if (typeof Ctrl !== "function") {
          loadPromise = null;
          reject(new Error("RichAds SDK unavailable"));
          return;
        }
        try {
          const ctrl = new Ctrl();
          await ctrl.initialize({ pubId, appId });
          controller = ctrl;
          resolve(ctrl);
        } catch (e) {
          loadPromise = null;
          reject(e instanceof Error ? e : new Error("RichAds init failed"));
        }
      };
      script.onerror = () => {
        loadPromise = null;
        reject(new Error("Failed to load RichAds SDK"));
      };
      document.head.appendChild(script);
    };

    // If script already in DOM (from passive initRichAds), wait a tick then
    // check if the constructor is already available.
    if (document.querySelector(`script[src="${SDK_URL}"]`)) {
      const Ctrl = (window as unknown as Record<string, unknown>)[
        "TelegramAdsController"
      ] as TelegramAdsControllerCtor | undefined;
      if (typeof Ctrl === "function") {
        const ctrl = new Ctrl();
        ctrl.initialize({ pubId, appId }).then(() => {
          controller = ctrl;
          resolve(ctrl);
        }).catch((e) => {
          loadPromise = null;
          reject(e instanceof Error ? e : new Error("RichAds init failed"));
        });
        return;
      }
    }

    injectScript();
  });

  return loadPromise;
}

/** Auto-init (passive — no reward). Called from App.tsx at boot. */
export function initRichAds(pubId: string, appId: string): void {
  loadSDK(pubId, appId).catch(() => {
    loadPromise = null;
  });
}

/**
 * Show a RichAds ad triggered by a user button click.
 * Awaits full SDK initialization before triggering.
 * Tries video → banner → mixed → process in order.
 */
export async function showRichAdsInterstitial(
  pubId: string,
  appId: string
): Promise<void> {
  const ctrl = await loadSDK(pubId, appId);

  type TriggerFn = () => Promise<void>;
  const methods: Array<keyof TelegramAdsControllerInstance> = [
    "triggerInterstitialVideo",
    "triggerInterstitialBanner",
    "triggerInterstitialMixed",
    "process",
  ];

  let lastErr: unknown;
  for (const method of methods) {
    const fn = ctrl[method] as TriggerFn | undefined;
    if (typeof fn !== "function") continue;
    try {
      await fn.call(ctrl);
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("No RichAds ad available");
}

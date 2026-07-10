type AdsgramController = {
  show: () => Promise<void>;
  destroy?: () => void;
};

type AdsgramBannerController = {
  render: (container: HTMLElement) => void;
  destroy?: () => void;
};

type AdsgramSdk = {
  init: (params: { blockId: string }) => AdsgramController;
  initBanner?: (params: { blockId: string }) => AdsgramBannerController;
};

declare global {
  interface Window {
    Adsgram?: AdsgramSdk;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadAdsgramScript(): Promise<void> {
  if (window.Adsgram) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://sad.adsgram.ai/js/sad.min.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Adsgram SDK"));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export async function showAdsgramRewardedAd(blockId: string): Promise<void> {
  await loadAdsgramScript();
  if (!window.Adsgram) {
    throw new Error("Adsgram SDK unavailable");
  }
  const controller = window.Adsgram.init({ blockId });
  await controller.show();
}

export async function renderAdsgramBanner(blockId: string, container: HTMLElement): Promise<() => void> {
  await loadAdsgramScript();
  if (!window.Adsgram) {
    throw new Error("Adsgram SDK unavailable");
  }
  const initBanner = window.Adsgram.initBanner ?? window.Adsgram.init;
  const controller = initBanner({ blockId }) as AdsgramBannerController & AdsgramController;
  if (typeof controller.render === "function") {
    controller.render(container);
  }
  return () => {
    controller.destroy?.();
  };
}

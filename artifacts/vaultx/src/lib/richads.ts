const SDK_URL = "https://richinfo.co/richpartners/telegram/js/tg-ob.js";
let loaded = false;

export function initRichAds(pubId: string, appId: string): void {
  if (loaded) return;
  if (document.querySelector(`script[src="${SDK_URL}"]`)) {
    loaded = true;
    return;
  }
  const script = document.createElement("script");
  script.src = SDK_URL;
  script.async = true;
  script.onload = () => {
    const Ctrl = (window as unknown as Record<string, unknown>)["TelegramAdsController"] as
      | (new () => { initialize: (opts: { pubId: string; appId: string }) => void })
      | undefined;
    if (typeof Ctrl === "function") {
      const ctrl = new Ctrl();
      ctrl.initialize({ pubId, appId });
    }
  };
  script.onerror = () => {
    script.remove();
    loaded = false;
  };
  document.head.appendChild(script);
  loaded = true;
}

type MonetagShowFn = () => Promise<void>;

declare global {
  interface Window {
    [key: `show_${string}`]: MonetagShowFn | undefined;
  }
}

const scriptPromises = new Map<string, Promise<void>>();

function loadMonetagScript(zoneId: string): Promise<void> {
  const fnName = `show_${zoneId}` as const;
  if (typeof window[fnName] === "function") return Promise.resolve();

  const existing = scriptPromises.get(zoneId);
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "//libtl.com/sdk.js";
    script.dataset.zone = zoneId;
    script.dataset.sdk = fnName;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Monetag SDK"));
    document.head.appendChild(script);
  });

  scriptPromises.set(zoneId, promise);
  return promise;
}

export async function showMonetagRewardedAd(zoneId: string): Promise<void> {
  await loadMonetagScript(zoneId);
  const fnName = `show_${zoneId}` as const;
  const show = window[fnName];
  if (typeof show !== "function") {
    throw new Error("Monetag SDK unavailable");
  }
  await show();
}

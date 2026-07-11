declare global {
  interface Window {
    AdProvider: object[] | undefined;
  }
}

let scriptLoaded = false;
let scriptPromise: Promise<void> | null = null;

function loadExoclickScript(): Promise<void> {
  if (scriptLoaded) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://a.pemsrv.com/ad-provider.js";
    script.async = true;
    script.type = "application/javascript";
    script.onload = () => {
      scriptLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load ExoClick SDK"));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

let initialized = false;

export async function initExoclick(zoneId: string, insClass: string): Promise<void> {
  if (initialized) return;
  initialized = true;

  // 1. Queue the serve command BEFORE the script loads (mirrors ExoClick's recommended tag order)
  window.AdProvider = window.AdProvider ?? [];
  window.AdProvider.push({ serve: {} });

  // 2. Insert the <ins> element (no display:none — ExoClick needs to find it)
  const el = document.createElement("ins");
  el.className = insClass;
  el.dataset.zoneid = zoneId;
  document.body.appendChild(el);

  // 3. Load the SDK — it picks up the queued serve command and the <ins> element
  await loadExoclickScript();
}

/** Call to trigger an additional interstitial (e.g. after a user action). */
export function showExoclickInterstitial(): void {
  try {
    window.AdProvider = window.AdProvider ?? [];
    window.AdProvider.push({ serve: {} });
  } catch {
    // silently ignore — ad blocked or outside supported browser
  }
}

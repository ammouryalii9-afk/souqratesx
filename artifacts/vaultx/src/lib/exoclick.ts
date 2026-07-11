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

let insElement: HTMLElement | null = null;

function ensureInsElement(zoneId: string, insClass: string): void {
  if (insElement) return;
  const el = document.createElement("ins");
  el.className = insClass;
  el.dataset.zoneid = zoneId;
  el.style.display = "none";
  document.body.appendChild(el);
  insElement = el;
}

export async function initExoclick(zoneId: string, insClass: string): Promise<void> {
  ensureInsElement(zoneId, insClass);
  await loadExoclickScript();
}

export function showExoclickInterstitial(): void {
  try {
    window.AdProvider = window.AdProvider ?? [];
    window.AdProvider.push({ serve: {} });
  } catch {
    // silently ignore — ad blocked or outside supported browser
  }
}

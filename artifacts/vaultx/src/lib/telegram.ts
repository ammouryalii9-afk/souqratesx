type TelegramWebAppUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
};

type HapticFeedback = {
  impactOccurred?: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
  notificationOccurred?: (type: "error" | "success" | "warning") => void;
  selectionChanged?: () => void;
};

type TelegramWebApp = {
  initData: string;
  initDataUnsafe: { user?: TelegramWebAppUser };
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  enableClosingConfirmation?: () => void;
  disableVerticalSwipes?: () => void;
  requestFullscreen?: () => void;
  openInvoice?: (url: string, callback: (status: "paid" | "cancelled" | "failed" | "pending") => void) => void;
  HapticFeedback?: HapticFeedback;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

export function initTelegramWebApp(): TelegramWebApp | null {
  const webApp = getTelegramWebApp();
  if (!webApp) {
    return null;
  }
  webApp.ready();
  webApp.expand();
  webApp.requestFullscreen?.();
  webApp.disableVerticalSwipes?.();
  webApp.setHeaderColor?.("#0D0D0F");
  webApp.setBackgroundColor?.("#0D0D0F");
  return webApp;
}

export function getTelegramInitData(): string | null {
  const webApp = getTelegramWebApp();
  if (!webApp || !webApp.initData) {
    return null;
  }
  return webApp.initData;
}

/**
 * Fire a native haptic pulse when running inside Telegram. No-ops silently outside Telegram
 * (e.g. local dev browser preview) so it's safe to call from anywhere without extra checks.
 */
export function haptic(
  kind: "light" | "medium" | "heavy" | "success" | "warning" | "error" | "select" = "light",
): void {
  const feedback = getTelegramWebApp()?.HapticFeedback;
  if (!feedback) return;
  try {
    if (kind === "success" || kind === "warning" || kind === "error") {
      feedback.notificationOccurred?.(kind);
    } else if (kind === "select") {
      feedback.selectionChanged?.();
    } else {
      feedback.impactOccurred?.(kind);
    }
  } catch {
    // Haptics are a nice-to-have; never let a WebApp SDK quirk break gameplay.
  }
}

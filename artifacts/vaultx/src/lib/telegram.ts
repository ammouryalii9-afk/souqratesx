type TelegramWebAppUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
};

type TelegramWebApp = {
  initData: string;
  initDataUnsafe: { user?: TelegramWebAppUser };
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  enableClosingConfirmation?: () => void;
  openInvoice?: (url: string, callback: (status: "paid" | "cancelled" | "failed" | "pending") => void) => void;
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

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { renderAdsgramBanner } from '../lib/adsgram';

interface AdBannerProps {
  bannerBlockId: string | null;
}

const DISMISS_KEY = 'adBannerDismissedDate';

export const AdBanner = ({ bannerBlockId }: AdBannerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dismissed, setDismissed] = useState(() => {
    const today = new Date().toISOString().split('T')[0];
    return localStorage.getItem(DISMISS_KEY) === today;
  });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!bannerBlockId || dismissed || !containerRef.current) return;
    let cleanup: (() => void) | undefined;
    renderAdsgramBanner(bannerBlockId, containerRef.current)
      .then((destroy) => {
        cleanup = destroy;
      })
      .catch(() => setFailed(true));
    return () => cleanup?.();
  }, [bannerBlockId, dismissed]);

  if (!bannerBlockId || dismissed || failed) return null;

  const handleDismiss = () => {
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem(DISMISS_KEY, today);
    setDismissed(true);
  };

  return (
    <div className="relative w-full flex items-center justify-center bg-black/30 border-t border-white/5 px-2 py-1">
      <div ref={containerRef} className="w-full flex items-center justify-center min-h-[50px]" data-testid="ad-banner-container" />
      <button
        onClick={handleDismiss}
        aria-label="Hide ad"
        data-testid="button-dismiss-banner"
        className="absolute top-0.5 right-1 w-4 h-4 rounded-full bg-black/50 flex items-center justify-center text-white/50 hover:text-white/90"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};

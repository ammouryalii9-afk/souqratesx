import { useEffect, useState } from 'react';
import { X, Pin } from 'lucide-react';
import { getAnnouncements, type Announcement } from '../lib/achievementsApi';

const DISMISSED_KEY = 'dismissed_announcements';

function getDismissed(): Set<number> {
  try {
    const arr = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]') as number[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<number>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
}

export function AnnouncementBanner({ isTelegramUser }: { isTelegramUser: boolean }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(getDismissed);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!isTelegramUser) return;
    getAnnouncements()
      .then((rows) => setAnnouncements(rows))
      .catch(() => {});
  }, [isTelegramUser]);

  const visible = announcements.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  const item = visible[current % visible.length]!;

  function dismiss(id: number) {
    const next = new Set(dismissed);
    next.add(id);
    saveDismissed(next);
    setDismissed(next);
    setCurrent(0);
  }

  return (
    <div
      className="mx-3 mt-3 rounded-2xl overflow-hidden"
      style={{
        background: item.isPinned
          ? 'linear-gradient(135deg, rgba(52,211,153,0.12) 0%, rgba(52,211,153,0.04) 100%)'
          : 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
        border: item.isPinned ? '1px solid rgba(52,211,153,0.25)' : '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <div className="px-4 py-3 flex items-start gap-3">
        <span className="text-xl flex-shrink-0 mt-0.5">{item.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {item.isPinned && <Pin className="w-2.5 h-2.5 text-primary flex-shrink-0" />}
            <span className="text-white font-semibold text-sm leading-tight truncate">{item.title}</span>
          </div>
          {item.body && (
            <p className="text-muted-foreground text-xs leading-relaxed">{item.body}</p>
          )}
          {visible.length > 1 && (
            <div className="flex items-center gap-1 mt-2">
              {visible.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrent(i)}
                  className={`h-1 rounded-full transition-all ${i === current % visible.length ? 'w-4 bg-primary' : 'w-1 bg-white/20'}`}
                />
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => dismiss(item.id)}
          className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-white hover:bg-white/10 transition-all flex-shrink-0 mt-0.5"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

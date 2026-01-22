import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Info, AlertTriangle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Announcement } from '@shared/schema';

type AnnouncementPriority = 'info' | 'warning' | 'urgent';

interface AnnouncementBannerProps {
  userBrands?: string[];
}

const DISMISSED_KEY = 'dismissed-announcements';

function getDismissedIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(DISMISSED_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function dismissAnnouncement(id: string): void {
  if (typeof window === 'undefined') return;
  const dismissed = getDismissedIds();
  if (!dismissed.includes(id)) {
    dismissed.push(id);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
  }
}

function getPriorityStyles(priority: AnnouncementPriority) {
  switch (priority) {
    case 'urgent':
      return {
        container: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
        icon: 'text-red-600',
        title: 'text-red-800 dark:text-red-200',
      };
    case 'warning':
      return {
        container: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
        icon: 'text-amber-600',
        title: 'text-amber-800 dark:text-amber-200',
      };
    case 'info':
    default:
      return {
        container: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
        icon: 'text-blue-600',
        title: 'text-blue-800 dark:text-blue-200',
      };
  }
}

function getPriorityIcon(priority: AnnouncementPriority) {
  switch (priority) {
    case 'urgent':
      return AlertCircle;
    case 'warning':
      return AlertTriangle;
    case 'info':
    default:
      return Info;
  }
}

function AnnouncementItem({ 
  announcement, 
  onDismiss 
}: { 
  announcement: Announcement; 
  onDismiss: (id: string) => void;
}) {
  const styles = getPriorityStyles(announcement.priority as AnnouncementPriority);
  const Icon = getPriorityIcon(announcement.priority as AnnouncementPriority);
  
  return (
    <div 
      className={`flex items-start gap-3 p-3 rounded-lg border ${styles.container}`}
      data-testid={`announcement-${announcement.id}`}
    >
      <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${styles.icon}`} />
      <div className="flex-1 min-w-0">
        <p className={`font-medium text-sm ${styles.title}`}>
          {announcement.title}
        </p>
        <p className="text-sm text-muted-foreground mt-0.5">
          {announcement.message}
        </p>
      </div>
      <div className="flex-shrink-0 opacity-60 hover:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDismiss(announcement.id)}
          data-testid={`dismiss-announcement-${announcement.id}`}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function AnnouncementBanner({ userBrands }: AnnouncementBannerProps) {
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  
  const { data: announcements = [] } = useQuery<Announcement[]>({
    queryKey: ['/api/announcements'],
    staleTime: 60000,
  });
  
  useEffect(() => {
    setDismissedIds(getDismissedIds());
  }, []);
  
  const handleDismiss = (id: string) => {
    dismissAnnouncement(id);
    setDismissedIds(prev => [...prev, id]);
  };
  
  const visibleAnnouncements = announcements.filter(a => !dismissedIds.includes(a.id));
  
  if (visibleAnnouncements.length === 0) {
    return null;
  }
  
  return (
    <div className="space-y-2 mb-4" data-testid="announcement-banner">
      {visibleAnnouncements.slice(0, 3).map(announcement => (
        <AnnouncementItem
          key={announcement.id}
          announcement={announcement}
          onDismiss={handleDismiss}
        />
      ))}
    </div>
  );
}

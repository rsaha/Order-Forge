export type AnnouncementPriority = 'info' | 'warning' | 'urgent';

export interface Announcement {
  id: string;
  title: string;
  message: string;
  priority: AnnouncementPriority;
  targetBrands: string[] | 'all';
  expiresAt?: string;
}

export const announcements: Announcement[] = [
  // Example announcements - edit this array and redeploy to update
  {
    id: 'saraswati-puja-jan-2026',
    title: 'Office Closed on January 23rd',
    message: 'To Celebrate Saraswati Puja. Order Processing and Dispatch will resume from January 24th.',
    priority: 'urgent',
    targetBrands: 'all',
    expiresAt: '2026-01-24',
  },
  // {
  //   id: 'morison-delay-jan-2026',
  //   title: 'Delivery Delay Notice',
  //   message: 'Due to weather conditions, Morison brand orders may experience 2-3 day delays this week.',
  //   priority: 'warning',
  //   targetBrands: ['Morison'],
  //   expiresAt: '2026-01-25',
  // },
  // {
  //   id: 'tynor-scheme-jan-2026',
  //   title: 'Special Scheme',
  //   message: 'Buy 10 Tynor Knee Caps, get 1 free! Valid till Jan 31.',
  //   priority: 'info',
  //   targetBrands: ['Tynor'],
  //   expiresAt: '2026-02-01',
  // },
];

export function getActiveAnnouncements(userBrands: string[]): Announcement[] {
  const now = new Date();
  const isAdminUser = userBrands.length === 1 && userBrands[0] === 'all';
  
  return announcements.filter(announcement => {
    if (announcement.expiresAt) {
      const expiryDate = new Date(announcement.expiresAt);
      if (now > expiryDate) return false;
    }
    
    if (isAdminUser) return true;
    if (announcement.targetBrands === 'all') return true;
    
    return announcement.targetBrands.some(brand => 
      userBrands.includes(brand)
    );
  });
}

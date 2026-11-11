import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { unreadCount } from '@/lib/api/notifications';
import { currentLocation } from '@/lib/current-location';
import { accessToken, currentUser } from '@/lib/session';

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const [location, user, token] = await Promise.all([currentLocation(), currentUser(), accessToken()]);
  // The bell is extra: without notification-service the page still shows, with no count.
  const unread = token ? await unreadCount(token).catch(() => 0) : 0;
  return (
    <>
      <Header location={location} user={user} unread={unread} />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}

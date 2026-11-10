import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { currentLocation } from '@/lib/current-location';
import { currentUser } from '@/lib/session';

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header location={await currentLocation()} user={await currentUser()} />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}

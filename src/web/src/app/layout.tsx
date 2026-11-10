import type { Metadata, Viewport } from 'next';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { currentLocation } from '@/lib/current-location';
import { currentUser } from '@/lib/session';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'FoodKoala: food delivery in Pakistan', template: '%s · FoodKoala' },
  description: 'Order from restaurants near you in Karachi, Lahore, Islamabad and more. Cash on delivery.',
};

export const viewport: Viewport = { themeColor: '#7a1fb3' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <Header location={await currentLocation()} user={await currentUser()} />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

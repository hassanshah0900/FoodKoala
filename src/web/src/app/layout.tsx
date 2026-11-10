import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'FoodKoala: food delivery in Pakistan', template: '%s · FoodKoala' },
  description: 'Order from restaurants near you in Karachi, Lahore, Islamabad and more. Cash on delivery.',
};

export const viewport: Viewport = { themeColor: '#7a1fb3' };

/** The document only: customers' pages and the admin console each bring their own frame. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">{children}</body>
    </html>
  );
}

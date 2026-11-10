import { Logo } from '@/components/Logo';
import { AREAS } from '@/lib/location';

export function Footer() {
  return (
    <footer className="mt-16 bg-brand-900 text-brand-100">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 md:grid-cols-[2fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo tone="white" />
          <p className="max-w-sm text-sm text-brand-200">
            Food from the restaurants you love, delivered across Pakistan. Pay cash on delivery and follow your rider to
            the door.
          </p>
        </div>
        <div>
          <h2 className="mb-3 font-bold text-white">Cities</h2>
          <ul className="space-y-2 text-sm">
            {AREAS.map((c) => (
              <li key={c.city}>{c.city}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="mb-3 font-bold text-white">FoodKoala</h2>
          <ul className="space-y-2 text-sm">
            <li>Delivery 7 days a week</li>
            <li>Cash on delivery</li>
            <li>Live rider tracking</li>
          </ul>
        </div>
      </div>
      <p className="border-t border-white/10 py-5 text-center text-xs text-brand-300">
        © {new Date().getFullYear()} FoodKoala
      </p>
    </footer>
  );
}

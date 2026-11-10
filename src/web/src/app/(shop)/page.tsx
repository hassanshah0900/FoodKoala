import { chooseArea } from '@/app/(shop)/actions';
import { BikeIcon, CashIcon, MapIcon } from '@/components/icons';
import { KoalaMark } from '@/components/Logo';
import { LocationPicker } from '@/components/location/LocationPicker';
import { currentLocation } from '@/lib/current-location';
import { AREAS } from '@/lib/location';

const PERKS = [
  {
    icon: BikeIcon,
    title: 'Delivered fast',
    text: 'Riders near the restaurant pick your order up the moment it is ready.',
  },
  { icon: CashIcon, title: 'Cash on delivery', text: 'Pay the rider at your door. No card needed.' },
  { icon: MapIcon, title: 'Follow your rider', text: 'See where your food is, from the kitchen to your door.' },
];

/** The hero's illustration: a bag with the koala mark and steam. */
function HeroArt() {
  return (
    <div className="relative mx-auto hidden size-80 md:block" aria-hidden="true">
      <div className="absolute inset-0 rounded-full bg-white/10" />
      <div className="absolute inset-8 rounded-full bg-white/10" />
      <div className="absolute inset-x-16 top-20 bottom-12 rounded-3xl bg-white shadow-2xl shadow-brand-900/40">
        <div className="absolute -top-6 left-1/2 h-12 w-20 -translate-x-1/2 rounded-t-full border-8 border-white" />
        <div className="flex h-full items-center justify-center text-brand-600">
          <KoalaMark className="size-24" />
        </div>
      </div>
      <span className="absolute top-6 right-8 rounded-full bg-amber-400 px-4 py-2 text-sm font-extrabold text-brand-900 shadow-lg">
        Hot &amp; fresh
      </span>
    </div>
  );
}

export default async function Home() {
  const location = await currentLocation();
  return (
    <>
      <section className="bg-brand-600 text-white">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
          <div className="space-y-6">
            <h1 className="text-4xl leading-tight font-extrabold md:text-5xl">
              The food you love, delivered to your door
            </h1>
            <p className="text-lg text-brand-100">Biryani, karahi, burgers and more from restaurants near you.</p>
            <LocationPicker current={location?.label} />
          </div>
          <HeroArt />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14">
        <h2 className="text-2xl font-extrabold md:text-3xl">Find us in these cities</h2>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {AREAS.map((c, i) => (
            <form key={c.city} action={chooseArea}>
              <input type="hidden" name="area" value={c.areas[0].label} />
              <button
                type="submit"
                className={`flex aspect-[4/3] w-full items-end rounded-xl bg-gradient-to-br p-4 text-left text-lg font-extrabold text-white transition-transform hover:-translate-y-1 hover:shadow-lg ${
                  i % 2 ? 'from-brand-400 to-brand-700' : 'from-brand-600 to-brand-900'
                }`}
              >
                {c.city}
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="bg-brand-50">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 md:grid-cols-3">
          {PERKS.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
                <Icon className="size-6" />
              </span>
              <div>
                <h3 className="font-bold">{title}</h3>
                <p className="mt-1 text-sm text-muted">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

'use client';

import { useActionState, useState } from 'react';
import type { SettingsState } from '@/app/vendor/settings-actions';
import { CUISINES, cuisineEmoji, cuisineLabel } from '@/lib/cuisines';
import { AREAS } from '@/lib/location';
import { PROVINCES } from '@/lib/restaurant-form';

type Action = (prev: SettingsState, form: FormData) => Promise<SettingsState>;

export interface RestaurantDefaults {
  name: string;
  description: string;
  cuisines: string[];
  phone: string;
  line1: string;
  area: string;
  city: string;
  province: string;
  pin: string;
  logoUrl: string;
  coverUrl: string;
}

/** The province of each city areas are offered in, so choosing an area fills it in. */
const PROVINCE_OF: Record<string, string> = {
  Karachi: 'sindh',
  Lahore: 'punjab',
  Islamabad: 'islamabad',
  Faisalabad: 'punjab',
  Peshawar: 'khyber_pakhtunkhwa',
  Multan: 'punjab',
};

const input = 'mt-1 block w-full rounded-lg border border-line px-3 py-2 font-normal';
const label = 'block text-sm font-semibold';

/** A restaurant's listing: what it is, how to reach it, and where it is. Applying and editing share it. */
export function RestaurantForm({
  action,
  defaults,
  submitLabel,
}: {
  action: Action;
  defaults: RestaurantDefaults;
  submitLabel: string;
}) {
  const [state, submit, pending] = useActionState(action, {});
  const v = state.values;
  // Address fields are controlled so choosing an area, or "use my location", can fill them.
  const [place, setPlace] = useState({
    area: v?.area ?? defaults.area,
    city: v?.city ?? defaults.city,
    province: v?.province ?? defaults.province,
    pin: v?.pin ?? defaults.pin,
  });
  const [locating, setLocating] = useState(false);
  const chosen = new Set(v ? v.cuisines.split(',') : defaults.cuisines);

  const pickArea = (value: string) => {
    for (const c of AREAS)
      for (const a of c.areas)
        if (a.label === value)
          setPlace({
            area: a.label.split(',')[0],
            city: c.city,
            province: PROVINCE_OF[c.city] ?? place.province,
            pin: `${a.lat}, ${a.lng}`,
          });
  };
  const locate = () => {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPlace({ ...place, pin: `${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}` });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <form key={JSON.stringify(v ?? {})} action={submit} className="space-y-6">
      {state.errors && (
        <ul role="alert" className="space-y-1 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {state.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {state.saved && !state.errors && (
        <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
          Saved.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          Restaurant name
          <input
            name="name"
            required
            minLength={2}
            maxLength={100}
            defaultValue={v?.name ?? defaults.name}
            className={input}
          />
        </label>
        <label className={label}>
          Phone for riders and FoodKoala
          <input
            name="phone"
            type="tel"
            required
            defaultValue={v?.phone ?? defaults.phone}
            placeholder="021 3456 7890"
            className={input}
          />
        </label>
      </div>
      <label className={label}>
        About <span className="font-normal text-muted">optional, shown to customers</span>
        <textarea
          name="description"
          maxLength={500}
          rows={2}
          defaultValue={v?.description ?? defaults.description}
          className={input}
        />
      </label>

      <fieldset>
        <legend className={label}>Cuisines (1 to 5)</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {CUISINES.map((c) => (
            <label
              key={c}
              className="cursor-pointer rounded-full border border-line px-3 py-1.5 text-sm has-checked:border-brand-600 has-checked:bg-brand-50 has-checked:text-brand-700"
            >
              <input type="checkbox" name="cuisines" value={c} defaultChecked={chosen.has(c)} className="sr-only" />
              {cuisineEmoji(c)} {cuisineLabel(c)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className={label}>Address</legend>
        <label className={label}>
          Quick fill from an area <span className="font-normal text-muted">optional</span>
          <select defaultValue="" onChange={(e) => pickArea(e.target.value)} className={input}>
            <option value="">Choose an area…</option>
            {AREAS.map((c) => (
              <optgroup key={c.city} label={c.city}>
                {c.areas.map((a) => (
                  <option key={a.label} value={a.label}>
                    {a.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className={label}>
          Street address
          <input
            name="line1"
            required
            maxLength={200}
            defaultValue={v?.line1 ?? defaults.line1}
            placeholder="Shop 4, Block 13"
            className={input}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className={label}>
            Area
            <input
              name="area"
              required
              maxLength={100}
              value={place.area}
              onChange={(e) => setPlace({ ...place, area: e.target.value })}
              className={input}
            />
          </label>
          <label className={label}>
            City
            <input
              name="city"
              required
              maxLength={60}
              value={place.city}
              onChange={(e) => setPlace({ ...place, city: e.target.value })}
              className={input}
            />
          </label>
          <label className={label}>
            Province
            <select
              name="province"
              required
              value={place.province}
              onChange={(e) => setPlace({ ...place, province: e.target.value })}
              className={input}
            >
              <option value="">Choose…</option>
              {PROVINCES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div>
          <label className={label}>
            Where it is on the map
            <input
              name="pin"
              required
              value={place.pin}
              onChange={(e) => setPlace({ ...place, pin: e.target.value })}
              placeholder="24.92130, 67.09410"
              className={input}
            />
          </label>
          <p className="mt-1 text-xs text-muted">
            Latitude, longitude: riders come here. Copy it from a map app, or{' '}
            <button type="button" onClick={locate} className="font-semibold text-brand-700">
              {locating ? 'finding you…' : 'use where you are now'}
            </button>
            .
          </p>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          Logo link <span className="font-normal text-muted">optional, https://</span>
          <input name="logoUrl" type="url" defaultValue={v?.logoUrl ?? defaults.logoUrl} className={input} />
        </label>
        <label className={label}>
          Cover photo link <span className="font-normal text-muted">optional, https://</span>
          <input name="coverUrl" type="url" defaultValue={v?.coverUrl ?? defaults.coverUrl} className={input} />
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-600 px-5 py-2.5 font-bold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {submitLabel}
      </button>
    </form>
  );
}

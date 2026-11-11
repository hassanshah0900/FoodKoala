const field = 'h-11 w-full rounded-lg border border-line px-3 text-sm outline-none focus:border-brand-600';

/**
 * A new address's details, inside a two-column form: its label, house and street, area and city
 * (started from the chosen area), landmark and a note for the rider. The pin is the chosen area.
 */
export function AddressFields({ start }: { start: { area: string; city: string } }) {
  return (
    <>
      <fieldset className="flex gap-2 sm:col-span-2">
        <legend className="sr-only">Label</legend>
        {(['home', 'work', 'other'] as const).map((l, i) => (
          <label
            key={l}
            className="cursor-pointer rounded-full border border-line px-4 py-1.5 text-sm font-semibold capitalize has-checked:border-brand-600 has-checked:bg-brand-50 has-checked:text-brand-700"
          >
            <input type="radio" name="label" value={l} defaultChecked={i === 0} className="sr-only" />
            {l}
          </label>
        ))}
      </fieldset>
      <input
        name="labelText"
        maxLength={40}
        placeholder="Name for an “other” address"
        className={`${field} sm:col-span-2`}
      />
      <input
        name="line1"
        required
        maxLength={200}
        placeholder="House, flat and street"
        className={`${field} sm:col-span-2`}
      />
      <input name="area" required maxLength={100} defaultValue={start.area} placeholder="Area" className={field} />
      <input name="city" required maxLength={60} defaultValue={start.city} placeholder="City" className={field} />
      <input name="landmark" maxLength={200} placeholder="Landmark (optional)" className={`${field} sm:col-span-2`} />
      <input
        name="instructions"
        maxLength={300}
        placeholder="Note for the rider (optional)"
        className={`${field} sm:col-span-2`}
      />
    </>
  );
}

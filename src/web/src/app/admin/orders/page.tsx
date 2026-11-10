import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Section } from '@/components/checkout/Section';
import { isUuid, one, type Params } from '@/lib/params';
import { requireAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Find an order' };

/** Finds an order by the id a customer, restaurant or rider reads out. */
export default async function FindOrder({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin('/admin/orders');
  const id = one((await searchParams).id);
  if (isUuid(id)) redirect(`/admin/orders/${id.toLowerCase()}`);

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-extrabold">Find an order</h1>
      <Section title="Order id">
        <form className="flex gap-2">
          <input
            name="id"
            required
            defaultValue={id}
            placeholder="e.g. 4223f29b-9a01-4179-b502-d9833be3d735"
            aria-label="Order id"
            className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 font-mono text-sm"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700"
          >
            Find
          </button>
        </form>
        {id && (
          <p className="mt-2 text-sm text-red-700">That isn't an order id. It has 36 characters, like the example.</p>
        )}
      </Section>
    </div>
  );
}

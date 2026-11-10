import type { OrderDelivery } from '@/lib/api/types';
import { rupees } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { directions, nextStep } from '@/lib/rider';
import { StepButtons } from './StepButtons';

/** The delivery in hand: where to go now, who to call, what to collect, and the button for the next step. */
export function DeliveryCard({ delivery: d }: { delivery: OrderDelivery }) {
  const next = nextStep(d);
  const stop = (
    title: string,
    name: string,
    detail: string | null,
    to: { lat: number; lng: number },
    current: boolean,
    phone?: string,
  ) => (
    <div className={`rounded-xl p-4 ${current ? 'bg-brand-50 ring-2 ring-brand-600' : 'bg-white opacity-70'}`}>
      <p className="text-xs font-bold tracking-wide text-muted uppercase">{title}</p>
      <p className="mt-1 text-lg font-bold">{name}</p>
      {detail && <p className="text-sm text-muted">{detail}</p>}
      <div className="mt-3 flex gap-2">
        <a
          href={directions(to)}
          target="_blank"
          rel="noreferrer"
          className="flex-1 rounded-xl border border-line bg-white py-2.5 text-center text-sm font-bold"
        >
          Directions
        </a>
        {phone && (
          <a
            href={`tel:${phone}`}
            className="flex-1 rounded-xl border border-line bg-white py-2.5 text-center text-sm font-bold"
          >
            Call {formatPhone(phone)}
          </a>
        )}
      </div>
    </div>
  );

  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-extrabold">Order #{d.orderId.slice(0, 8).toUpperCase()}</h2>
        {d.deliveryFeePaisa + d.tipPaisa > 0 && (
          <span className="text-sm font-semibold text-green-700">
            You earn {rupees(d.deliveryFeePaisa + d.tipPaisa)}
          </span>
        )}
      </div>
      {stop(
        'Pick up from',
        d.restaurant.name,
        next?.note ?? null,
        d.restaurant.location,
        next?.heading === 'restaurant',
      )}
      {stop(
        'Deliver to',
        d.dropoff.text,
        d.dropoff.landmark && `Near ${d.dropoff.landmark}`,
        d.dropoff.location,
        next?.heading === 'customer',
        d.customerPhone,
      )}
      <p
        className={`rounded-xl p-3 text-center font-bold ${
          d.cashToCollectPaisa ? 'bg-amber-50 text-amber-900' : 'bg-green-50 text-green-800'
        }`}
      >
        {d.cashToCollectPaisa ? `Collect ${rupees(d.cashToCollectPaisa)} in cash` : 'Already paid: collect nothing'}
      </p>
      {next && (
        <StepButtons deliveryId={d.id} next={next.step} label={next.label} canDecline={next.step === 'pickup'} />
      )}
    </section>
  );
}

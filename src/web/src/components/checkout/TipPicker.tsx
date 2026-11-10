import Link from 'next/link';
import { type CheckoutChoices, checkoutHref, TIPS_PAISA } from '@/lib/checkout';
import { rupees } from '@/lib/format';

export function TipPicker({ choices }: { choices: CheckoutChoices }) {
  return (
    <div>
      <p className="mb-3 text-sm text-muted">Your rider keeps all of it.</p>
      <div className="flex flex-wrap gap-2">
        {TIPS_PAISA.map((tip) => {
          const active = choices.tipPaisa === tip;
          return (
            <Link
              key={tip}
              href={checkoutHref(choices, { tipPaisa: tip })}
              aria-current={active ? 'true' : undefined}
              className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                active ? 'border-brand-600 bg-brand-600 text-white' : 'border-line hover:border-brand-300'
              }`}
            >
              {tip === 0 ? 'Not now' : rupees(tip)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { AutoRefresh } from '@/components/orders/AutoRefresh';
import { ApplyForm } from '@/components/rider/ApplyForm';
import { DeliveryCard } from '@/components/rider/DeliveryCard';
import { LocationBeacon } from '@/components/rider/LocationBeacon';
import { ShiftSwitch } from '@/components/rider/ShiftSwitch';
import { getChat } from '@/lib/api/chat';
import { myDelivery, myRider } from '@/lib/api/delivery';
import { accessToken, requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Shift' };

/** The rider's shift: apply, go online, and work through the delivery they're given. */
export default async function RiderHome() {
  await requireUser('/rider');
  const token = (await accessToken())!;
  const rider = await myRider(token);

  if (!rider) {
    return (
      <>
        <div>
          <h1 className="text-2xl font-extrabold">Ride with FoodKoala</h1>
          <p className="mt-1 text-muted">
            Deliver when it suits you. You keep every delivery fee and tip. FoodKoala checks your details before your
            first shift.
          </p>
        </div>
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <ApplyForm />
        </section>
      </>
    );
  }

  if (rider.status !== 'approved') {
    return (
      <section className="rounded-2xl bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-extrabold">
          {rider.status === 'pending' ? 'Thanks for applying' : 'Your account is suspended'}
        </h1>
        <p className="mt-2 text-muted">
          {rider.status === 'pending'
            ? 'FoodKoala is checking your details. You can go online as soon as you are approved.'
            : 'You can’t go online for now. Please contact FoodKoala.'}
        </p>
      </section>
    );
  }

  const delivery = rider.online ? await myDelivery(token) : null;
  // The chat is extra: if chat-service is down the delivery still shows.
  const chat = delivery ? await getChat(token, delivery.orderId).catch(() => null) : null;
  return (
    <>
      {rider.online && <LocationBeacon />}
      {/* While waiting for an order, check for one every 10 seconds. */}
      {rider.online && !delivery && <AutoRefresh seconds={10} />}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Hi, {rider.name.split(' ')[0]}</h1>
          <p className="text-sm text-muted">{rider.online ? 'You are online.' : 'You are offline.'}</p>
        </div>
        <span
          aria-hidden="true"
          className={`size-3 rounded-full ${rider.online ? 'bg-green-500 ring-4 ring-green-100' : 'bg-line'}`}
        />
      </div>
      {delivery ? (
        <>
          <DeliveryCard delivery={delivery} />
          {chat && <ChatPanel key={chat.orderId} initial={chat} title="Chat with the customer" />}
        </>
      ) : (
        rider.online && (
          <section className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <p className="text-lg font-bold">Waiting for an order…</p>
            <p className="mt-1 text-sm text-muted">Orders go to the nearest free rider. Keep this page open.</p>
          </section>
        )
      )}
      <ShiftSwitch online={rider.online} carrying={delivery !== null} />
    </>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChatEvent, ChatView } from '@/lib/api/types';
import { applyEvent, author, lastSeen, newClientId, QUICK_REPLIES, unread } from '@/lib/chat';
import { clockTime } from '@/lib/format';
import { shrinkPhoto } from '@/lib/shrink-photo';

/** Sends to the app's chat routes (app/chat/[orderId]); the message also comes back over the live stream. */
async function post(path: string, body: BodyInit, json: boolean): Promise<{ error: string | null; data?: unknown }> {
  const res = await fetch(path, {
    method: 'POST',
    body,
    headers: json ? { 'content-type': 'application/json' } : undefined,
  }).catch(() => null);
  if (!res) return { error: 'You seem to be offline. Try again.' };
  const data = await res.json().catch(() => null);
  if (!res.ok) return { error: (data as { message?: string } | null)?.message ?? 'Could not send. Try again.' };
  return { error: null, data };
}

/**
 * The chat between an order's customer and rider: messages and photos as they arrive, "Seen" under
 * your last message the other side read, quick replies, and a box to write or attach a photo.
 */
export function ChatPanel({ initial, title }: { initial: ChatView; title: string }) {
  const [view, setView] = useState(initial);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const base = `/chat/${initial.orderId}`;
  const role = view.me;
  const toRead = unread(view);
  const seen = lastSeen(view);

  // Live: a snapshot first, then every message and read receipt.
  useEffect(() => {
    const source = new EventSource(`${base}/live`);
    source.addEventListener('chat', (e) => {
      const event = JSON.parse((e as MessageEvent<string>).data) as ChatEvent;
      setView((v) => applyEvent(v, event));
    });
    source.addEventListener('end', () => {
      source.close();
      setGone(true);
    });
    return () => source.close();
  }, [base]);

  // Keep the newest message in view.
  const count = view.messages.length;
  useEffect(() => {
    if (count > 0) list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [count]);

  // Seeing new messages from the other side marks them read, so they get "Seen".
  useEffect(() => {
    if (toRead > 0 && document.visibilityState === 'visible') void fetch(`${base}/read`, { method: 'POST' });
  }, [toRead, base]);

  const send = async (message: string) => {
    if (!message.trim() || busy) return;
    setBusy(true);
    setError(null);
    const { error } = await post(`${base}/messages`, JSON.stringify({ clientId: newClientId(), text: message }), true);
    setBusy(false);
    if (error) setError(error);
    else setText('');
  };

  const sendPhoto = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set('clientId', newClientId());
    form.set('caption', text);
    form.set('photo', await shrinkPhoto(file), 'photo.jpg');
    const { error } = await post(`${base}/photos`, form, false);
    setBusy(false);
    if (error) setError(error);
    else setText('');
    if (photoInput.current) photoInput.current.value = '';
  };

  const canWrite = view.open && role !== '' && !gone;
  return (
    <section className="overflow-hidden rounded-xl bg-white shadow-sm">
      <header className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="font-bold">{title}</h2>
        {!view.open && <span className="text-xs text-muted">Chat closed</span>}
      </header>
      <div ref={list} className="max-h-80 min-h-32 space-y-3 overflow-y-auto bg-canvas px-4 py-3">
        {view.messages.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">
            {role === 'rider' ? 'Message the customer about the delivery.' : 'Message your rider about the delivery.'}
          </p>
        )}
        {view.messages.map((m) => {
          const mine = m.from === role;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              <div
                className={`max-w-[80%] space-y-1 rounded-2xl px-3 py-2 text-sm ${
                  mine ? 'rounded-br-sm bg-brand-600 text-white' : 'rounded-bl-sm bg-white text-ink shadow-sm'
                }`}
              >
                {m.photo && (
                  <a href={`${base}/photos/${m.photo.id}`} target="_blank" rel="noreferrer" className="block">
                    {/* biome-ignore lint/performance/noImgElement: a private photo served by our own route, not optimisable */}
                    <img
                      src={`${base}/photos/${m.photo.id}`}
                      alt={m.text || 'Photo'}
                      className="max-h-60 rounded-lg object-cover"
                    />
                  </a>
                )}
                {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
              </div>
              <span className="mt-0.5 text-[11px] text-muted">
                {author(view, m)} · {clockTime(m.sentAt)}
                {m.id === seen && ' · Seen'}
              </span>
            </div>
          );
        })}
      </div>
      {canWrite ? (
        <div className="space-y-2 border-t border-line p-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {QUICK_REPLIES[role].map((q) => (
              <button
                key={q}
                type="button"
                disabled={busy}
                onClick={() => send(q)}
                className="shrink-0 rounded-full border border-brand-300 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
          >
            <input
              ref={photoInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="sr-only"
              id={`photo-${initial.orderId}`}
              onChange={(e) => sendPhoto(e.target.files?.[0])}
            />
            <label
              htmlFor={`photo-${initial.orderId}`}
              className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border border-line text-lg hover:border-brand-600"
              title="Send a photo"
            >
              <span aria-hidden>📷</span>
              <span className="sr-only">Send a photo</span>
            </label>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={1000}
              placeholder="Write a message"
              aria-label="Message"
              className="h-10 min-w-0 flex-1 rounded-full border border-line px-4 text-sm outline-none focus:border-brand-600"
            />
            <button
              type="submit"
              disabled={busy || !text.trim()}
              className="h-10 shrink-0 rounded-full bg-brand-600 px-4 text-sm font-bold text-white disabled:bg-neutral-300"
            >
              {busy ? '…' : 'Send'}
            </button>
          </form>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      ) : (
        <p className="border-t border-line px-4 py-3 text-xs text-muted">
          {gone ? 'Another rider has this order now.' : 'This chat has closed. You can still read it.'}
        </p>
      )}
    </section>
  );
}

# ADR 0008: Chat keeps messages in MongoDB and photos in S3-compatible storage

- **Status:** accepted
- **Date:** 2026-11-11

## Context

Customers and riders need to talk while an order is on its way: "I'm at the
gate", a photo of where the food was left. A chat is a short-lived list of
messages that only ever grows, read whole by its two sides, with no joins
and no reporting across chats. It opens when a rider is assigned and is
read-only an hour after the order ends.

Messages need live delivery to whichever replica each side is connected to,
like tracking (tracking-service). Photos are files of up to a few megabytes,
private to the two sides of one chat.

## Decision

- A new **chat-service** (Go, like tracking-service, for long-lived
  WebSockets). It follows `delivery.assigned`, `delivery.delivered` and
  `order.status_changed` to know who may talk; it asks no other service.
- **MongoDB** for chats and messages: a document per chat (its members and
  read marks) and a document per message, indexed by chat and time. A unique
  index on (chat, sender, clientId) makes sending idempotent. Out-of-order
  and repeated events are applied with conditional upserts, so no
  transaction is needed.
- **Redis pub/sub** fans each message out to every replica's sockets, as in
  tracking-service.
- **S3-compatible object storage** for photos, in a private bucket. Clients
  never get a bucket URL: photos are uploaded and served through
  chat-service, which checks the caller is in the chat. Locally this is
  SeaweedFS (MinIO no longer publishes free images); production can use any
  S3 (AWS, Cloudflare R2, ...), configured with `S3_ENDPOINT` and keys.
  Photo uploads elsewhere (menus, restaurants) can use the same storage.

## Consequences

- One more datastore to run and back up. MongoDB was already part of the
  local stack.
- Telling someone who isn't looking about a message: chat-service publishes
  `chat.message_waiting` once a message has waited a minute unread (once per
  unread streak, which reading ends), and notification-service texts them
  and adds it to their inbox. The event goes through an `outbox` collection
  (ADR 0007): MongoDB here runs without a replica set, so there are no
  multi-document transactions. Instead the event's id is derived from the
  streak and written before the streak is marked told, so a retry after a
  crash collides on the id instead of telling them twice. Replicas may
  publish the same outbox entry twice; consumers drop repeats by envelope id.
- Uploads pass through chat-service and the gateway, limited to 5 MB. Larger
  files would call for presigned uploads straight to the bucket.

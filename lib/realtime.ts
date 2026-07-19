import "server-only";

import { EventEmitter } from "node:events";
import type Redis from "ioredis";
import { getRedisPublisher, getRedisSubscriber } from "./redis";
import { logOperationalEvent } from "./observability";

/**
 * Distributed Pub/Sub for SSE chat and live-room updates.
 *
 * With REDIS_URL, every process publishes to and subscribes from Redis. Local
 * development keeps the in-process EventEmitter fallback. During a transient
 * Redis outage publishing falls back to same-instance delivery; clients on a
 * different instance still recover through the existing polling fallback.
 */

const REDIS_CHANNEL_PREFIX = "aera:realtime:v1:";
const VALID_CHANNEL = /^[A-Za-z0-9:_-]{1,240}$/;

type Listener = (data: unknown) => void;
type RealtimeState = {
  bus: EventEmitter;
  references: Map<string, number>;
  redisChannels: Set<string>;
  subscribeOperations: Map<string, Promise<void>>;
  boundSubscriber?: Redis;
  messageHandler?: (channel: string, payload: string) => void;
  readyHandler?: () => void;
  lastErrorLogAt: number;
};

const realtimeGlobal = globalThis as unknown as {
  __aeraRealtimeState?: RealtimeState;
};

function state(): RealtimeState {
  if (!realtimeGlobal.__aeraRealtimeState) {
    const bus = new EventEmitter();
    // Many concurrent SSE connections are expected.
    bus.setMaxListeners(0);
    realtimeGlobal.__aeraRealtimeState = {
      bus,
      references: new Map(),
      redisChannels: new Set(),
      subscribeOperations: new Map(),
      lastErrorLogAt: 0,
    };
  }
  return realtimeGlobal.__aeraRealtimeState;
}

function assertChannel(channel: string): void {
  if (!VALID_CHANNEL.test(channel)) throw new Error("Invalid realtime channel");
}

function redisChannel(channel: string): string {
  return `${REDIS_CHANNEL_PREFIX}${channel}`;
}

function logRealtimeDegradation(): void {
  const current = state();
  const now = Date.now();
  if (now - current.lastErrorLogAt < 30_000) return;
  current.lastErrorLogAt = now;
  logOperationalEvent("error", "realtime_redis_degraded", {
    fallback: "same-instance-and-polling",
  });
}

function emitLocally(channel: string, data: unknown): void {
  for (const listener of state().bus.listeners(channel)) {
    try {
      (listener as Listener)(data);
    } catch {
      // One disconnected/broken SSE listener must not block the remaining
      // listeners or turn a successfully persisted chat message into a 500.
      logRealtimeDegradation();
    }
  }
}

async function resubscribeActive(subscriber: Redis): Promise<void> {
  const current = state();
  await Promise.all(
    [...current.references.keys()].map((channel) => subscribeRedisChannel(channel, subscriber)),
  );
}

function bindSubscriber(subscriber: Redis): boolean {
  const current = state();
  if (current.boundSubscriber === subscriber) return false;

  if (current.boundSubscriber && current.messageHandler && current.readyHandler) {
    current.boundSubscriber.off("message", current.messageHandler);
    current.boundSubscriber.off("ready", current.readyHandler);
  }

  const messageHandler = (incomingChannel: string, payload: string) => {
    if (!incomingChannel.startsWith(REDIS_CHANNEL_PREFIX)) return;
    const channel = incomingChannel.slice(REDIS_CHANNEL_PREFIX.length);
    if (!current.references.has(channel)) return;
    try {
      const envelope = JSON.parse(payload) as { data?: unknown };
      emitLocally(channel, envelope.data);
    } catch {
      // Ignore malformed messages from another Redis user/application.
      logRealtimeDegradation();
    }
  };
  const readyHandler = () => {
    void resubscribeActive(subscriber).catch(() => logRealtimeDegradation());
  };

  subscriber.on("message", messageHandler);
  subscriber.on("ready", readyHandler);
  current.boundSubscriber = subscriber;
  current.messageHandler = messageHandler;
  current.readyHandler = readyHandler;
  return true;
}

async function subscribeRedisChannel(channel: string, provided?: Redis): Promise<void> {
  const current = state();
  const existing = current.subscribeOperations.get(channel);
  if (existing) return existing;

  const operation = (async () => {
    try {
      const subscriber = provided ?? (await getRedisSubscriber());
      if (!subscriber) return;
      const changedSubscriber = bindSubscriber(subscriber);
      const channels = changedSubscriber
        ? [...current.references.keys()]
        : [channel];
      await subscriber.subscribe(...channels.map(redisChannel));

      // The SSE stream may have closed while Redis was connecting.
      if (!current.references.has(channel)) {
        await subscriber.unsubscribe(redisChannel(channel));
        return;
      }
      for (const activeChannel of channels) {
        if (current.references.has(activeChannel)) {
          current.redisChannels.add(activeChannel);
        }
      }
    } catch {
      logRealtimeDegradation();
    } finally {
      current.subscribeOperations.delete(channel);
    }
  })();

  current.subscribeOperations.set(channel, operation);
  return operation;
}

export async function publish(channel: string, data: unknown): Promise<void> {
  assertChannel(channel);
  const current = state();
  let payload: string;
  try {
    payload = JSON.stringify({ data });
  } catch {
    // Non-serializable values cannot cross instances, but same-instance SSE
    // listeners can still receive them without breaking the API write path.
    logRealtimeDegradation();
    emitLocally(channel, data);
    return;
  }

  const publisher = await getRedisPublisher();
  if (!publisher) {
    emitLocally(channel, data);
    return;
  }

  try {
    await publisher.publish(redisChannel(channel), payload);
  } catch {
    logRealtimeDegradation();
    emitLocally(channel, data);
  }
}

/** Subscribe to one channel and receive an idempotent unsubscribe callback. */
export async function subscribe(
  channel: string,
  listener: Listener,
): Promise<() => void> {
  assertChannel(channel);
  const current = state();
  current.bus.on(channel, listener);
  current.references.set(channel, (current.references.get(channel) ?? 0) + 1);
  await subscribeRedisChannel(channel);

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    current.bus.off(channel, listener);
    const remaining = (current.references.get(channel) ?? 1) - 1;
    if (remaining > 0) {
      current.references.set(channel, remaining);
      return;
    }

    current.references.delete(channel);
    current.redisChannels.delete(channel);
    const subscriber = current.boundSubscriber;
    if (subscriber) {
      void subscriber.unsubscribe(redisChannel(channel)).catch(() => logRealtimeDegradation());
    }
  };
}

/** Channel name for group chats (space) or direct messages (dm). */
export function chatChannel(
  tenantId: string,
  kind: "space" | "dm",
  id: string,
): string {
  return `chat:${tenantId}:${kind}:${id}`;
}

/** Channel name for one live session's chat. */
export function liveChannel(tenantId: string, sessionId: string): string {
  return `live:${tenantId}:${sessionId}`;
}

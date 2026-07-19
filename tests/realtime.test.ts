import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const redisMocks = vi.hoisted(() => ({
  getRedisPublisher: vi.fn(),
  getRedisSubscriber: vi.fn(),
}));

vi.mock("@/lib/redis", () => redisMocks);

import { publish, subscribe, chatChannel } from "@/lib/realtime";

describe("realtime pub/sub", () => {
  beforeEach(() => {
    redisMocks.getRedisPublisher.mockResolvedValue(null);
    redisMocks.getRedisSubscriber.mockResolvedValue(null);
    vi.clearAllMocks();
  });

  it("delivers local fallback events to subscribers", async () => {
    const listener = vi.fn();
    const unsubscribe = await subscribe("test:channel", listener);
    await publish("test:channel", { message: "hallo" });
    expect(listener).toHaveBeenCalledWith({ message: "hallo" });
    unsubscribe();
  });

  it("stops delivering after unsubscribe", async () => {
    const listener = vi.fn();
    const unsubscribe = await subscribe("test:channel2", listener);
    unsubscribe();
    await publish("test:channel2", { message: "x" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("isolates channels by tenant, kind and id", async () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubscribeA = await subscribe(chatChannel("t1", "space", "s1"), a);
    const unsubscribeB = await subscribe(chatChannel("t2", "space", "s1"), b);
    await publish(chatChannel("t1", "space", "s1"), { n: 1 });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    unsubscribeA();
    unsubscribeB();
  });

  it("uses Redis to distribute events and releases the subscription", async () => {
    class FakeSubscriber extends EventEmitter {
      subscribe = vi.fn(async () => 1);
      unsubscribe = vi.fn(async () => 0);
    }
    const subscriber = new FakeSubscriber();
    const publisher = {
      publish: vi.fn(async (channel: string, payload: string) => {
        subscriber.emit("message", channel, payload);
        return 1;
      }),
    };
    redisMocks.getRedisSubscriber.mockResolvedValue(subscriber);
    redisMocks.getRedisPublisher.mockResolvedValue(publisher);

    const listener = vi.fn();
    const unsubscribe = await subscribe("distributed:channel", listener);
    await publish("distributed:channel", { message: "across-instances" });

    expect(subscriber.subscribe).toHaveBeenCalledWith(
      "aera:realtime:v1:distributed:channel",
    );
    expect(publisher.publish).toHaveBeenCalledWith(
      "aera:realtime:v1:distributed:channel",
      JSON.stringify({ data: { message: "across-instances" } }),
    );
    expect(listener).toHaveBeenCalledWith({ message: "across-instances" });

    unsubscribe();
    expect(subscriber.unsubscribe).toHaveBeenCalledWith(
      "aera:realtime:v1:distributed:channel",
    );
  });

  it("falls back to same-instance delivery when Redis publish fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    redisMocks.getRedisPublisher.mockResolvedValue({
      publish: vi.fn(async () => {
        throw new Error("redis unavailable");
      }),
    });

    const listener = vi.fn();
    const unsubscribe = await subscribe("fallback:channel", listener);
    await publish("fallback:channel", 42);
    expect(listener).toHaveBeenCalledWith(42);
    unsubscribe();
  });
});

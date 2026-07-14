import { describe, it, expect, vi } from "vitest";
import { publish, subscribe, chatChannel } from "@/lib/realtime";

describe("realtime pub/sub", () => {
  it("delivers published events to subscribers", () => {
    const listener = vi.fn();
    const unsub = subscribe("test:channel", listener);
    publish("test:channel", { message: "hallo" });
    expect(listener).toHaveBeenCalledWith({ message: "hallo" });
    unsub();
  });

  it("stops delivering after unsubscribe", () => {
    const listener = vi.fn();
    const unsub = subscribe("test:channel2", listener);
    unsub();
    publish("test:channel2", { message: "x" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("isolates channels (tenant/kind/id)", () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = subscribe(chatChannel("t1", "space", "s1"), a);
    const unsubB = subscribe(chatChannel("t2", "space", "s1"), b);
    publish(chatChannel("t1", "space", "s1"), { n: 1 });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    unsubA();
    unsubB();
  });

  it("supports multiple subscribers on one channel", () => {
    const a = vi.fn();
    const b = vi.fn();
    const u1 = subscribe("multi", a);
    const u2 = subscribe("multi", b);
    publish("multi", 42);
    expect(a).toHaveBeenCalledWith(42);
    expect(b).toHaveBeenCalledWith(42);
    u1();
    u2();
  });
});

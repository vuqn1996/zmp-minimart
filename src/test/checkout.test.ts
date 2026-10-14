import { describe, expect, it, vi } from "vitest";
import { CheckoutSDK, EventName, events } from "zmp-sdk-modern/apis";

import { openCheckout, selectCheckoutPaymentMethod, subscribeToCheckoutResume } from "../checkout.js";

describe("Checkout resume lifecycle", () => {
  it("does not accumulate real SDK listeners across resubscriptions or remove another subscriber", () => {
    const eventNames = [EventName.OpenApp, EventName.PaymentDone, EventName.PaymentClose];
    const initialListeners = new Map(eventNames.map((event) => [event, events.listeners(event)]));
    const bridge = Object.getOwnPropertyDescriptor(window, "ZaloJavaScriptInterface");
    const acknowledge = vi.fn();
    Object.defineProperty(window, "ZaloJavaScriptInterface", {
      value: { jsH5EventCallback: acknowledge }, configurable: true,
    });
    const onResume = vi.fn();
    const otherResume = vi.fn();
    const unsubscribeOther = subscribeToCheckoutResume(otherResume, events, undefined);
    let unsubscribe = subscribeToCheckoutResume(onResume, events, undefined);

    try {
      for (let i = 0; i < 99; i++) {
        unsubscribe();
        unsubscribe = subscribeToCheckoutResume(onResume, events, undefined);
      }
      for (const event of eventNames) {
        expect(events.listenerCount(event)).toBe(initialListeners.get(event)!.length + 2);
      }
      events.emit(EventName.PaymentDone, "diagnostic-event", {});
      expect(onResume).toHaveBeenCalledExactlyOnceWith("checkout");
      expect(otherResume).toHaveBeenCalledExactlyOnceWith("checkout");
      expect(acknowledge).toHaveBeenCalledTimes(2);

      unsubscribe();
      events.emit(EventName.PaymentDone, "diagnostic-event-2", {});
      expect(onResume).toHaveBeenCalledTimes(1);
      expect(otherResume).toHaveBeenCalledTimes(2);
      unsubscribeOther();
      for (const event of eventNames) {
        expect(events.listeners(event)).toEqual(initialListeners.get(event));
      }
    } finally {
      unsubscribe();
      unsubscribeOther();
      // Restore only this test's listeners, including when the regression fails.
      for (const event of eventNames) {
        for (const listener of events.listeners(event)) {
          if (!initialListeners.get(event)!.includes(listener)) events.off(event, listener);
        }
      }
      if (bridge) Object.defineProperty(window, "ZaloJavaScriptInterface", bridge);
      else Reflect.deleteProperty(window, "ZaloJavaScriptInterface");
    }
  });

  it("rejects native COD when the quote allows only ZaloPay", async () => {
    Object.defineProperty(window, "ZaloJavaScriptInterface", { value: {}, configurable: true });
    vi.spyOn(CheckoutSDK, "selectPaymentMethod").mockResolvedValue({ method: "COD_SANDBOX", isCustom: false } as never);
    try { await expect(selectCheckoutPaymentMethod(["ZALOPAY"])).rejects.toThrow("Giỏ có bia"); }
    finally { Reflect.deleteProperty(window, "ZaloJavaScriptInterface"); }
  });
  it("does not open the picker when no payment method is available", async () => {
    const picker = vi.spyOn(CheckoutSDK, "selectPaymentMethod");
    await expect(selectCheckoutPaymentMethod([])).rejects.toThrow();
    expect(picker).not.toHaveBeenCalled();
  });
  it("uses the local sandbox method when the native bridge is unavailable in development", async () => {
    const selectPaymentMethod = vi.spyOn(CheckoutSDK, "selectPaymentMethod");
    await expect(selectCheckoutPaymentMethod()).resolves.toEqual({
      paymentMethod: "ZALOPAY",
      checkoutMethod: { id: "ZALOPAY_SANDBOX", isCustom: false },
    });
    expect(selectPaymentMethod).not.toHaveBeenCalled();
  });

  it("uses the SDK-selected method when creating a checkout", async () => {
    Object.defineProperty(window, "ZaloJavaScriptInterface", { value: {}, configurable: true });
    const selectPaymentMethod = vi.spyOn(CheckoutSDK, "selectPaymentMethod").mockResolvedValue({
      method: "COD_SANDBOX",
      isCustom: false,
    } as never);

    await expect(selectCheckoutPaymentMethod()).resolves.toEqual({
      paymentMethod: "COD",
      checkoutMethod: { id: "COD_SANDBOX", isCustom: false },
    });
    expect(selectPaymentMethod).toHaveBeenCalledWith({});
    delete (window as { ZaloJavaScriptInterface?: unknown }).ZaloJavaScriptInterface;
  });

  it("passes the backend-signed selected channel to native checkout unchanged", async () => {
    const createOrder = vi.spyOn(CheckoutSDK, "createOrder").mockResolvedValue({ orderId: "provider-1" } as never);

    await expect(
      openCheckout({
        amount: 56_000,
        item: [{ id: "101", amount: 56_000 }],
        desc: "Đơn hàng T8-1",
        extradata: '{"internalReference":"ref-1"}',
        method: '{"id":"ZALOPAY_SANDBOX","isCustom":false}',
        mac: "mac",
      }),
    ).resolves.toBe("provider-1");

    expect(createOrder).toHaveBeenCalledWith({
      amount: 56_000,
      item: [{ id: "101", amount: 56_000 }],
      desc: "Đơn hàng T8-1",
      extradata: '{"internalReference":"ref-1"}',
      method: '{"id":"ZALOPAY_SANDBOX","isCustom":false}',
      mac: "mac",
    });
  });

  it("treats provider events as a reason to refresh server state", () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const source = {
      on: vi.fn((event: string, listener: (...args: unknown[]) => void) => listeners.set(event, listener)),
      off: vi.fn((event: string) => listeners.delete(event)),
      listeners: (event: string) => {
        const listener = listeners.get(event);
        return listener ? [listener] : [];
      },
    };
    const visibilityListeners = new Set<() => void>();
    const visibility = {
      visibilityState: "hidden",
      addEventListener: vi.fn((_event: "visibilitychange", listener: () => void) => {
        visibilityListeners.add(listener);
      }),
      removeEventListener: vi.fn((_event: "visibilitychange", listener: () => void) => {
        visibilityListeners.delete(listener);
      }),
    };
    const onResume = vi.fn();

    const unsubscribe = subscribeToCheckoutResume(onResume, source, visibility);
    listeners.get("h5.event.open.mp")?.({ path: "/" });
    expect(onResume).not.toHaveBeenCalled();
    listeners.get("h5.event.open.mp")?.({ path: "/orders?orderId=provider-1" });
    expect(onResume).toHaveBeenCalledWith("checkout");
    listeners.get("action.payment.done")?.();
    expect(onResume).toHaveBeenCalledWith("checkout");
    const closeError = { code: -1 };
    const closeResult = { returnCode: 0, zmpOrderId: "provider-1" };
    listeners.get("action.payment.close")?.(closeError, closeResult);
    expect(onResume).toHaveBeenLastCalledWith("close", { error: closeError, result: closeResult });

    visibility.visibilityState = "visible";
    visibilityListeners.forEach((listener) => listener());
    expect(onResume).toHaveBeenLastCalledWith("visibility");

    unsubscribe();
    expect(source.off).toHaveBeenCalledTimes(3);
    expect(visibility.removeEventListener).toHaveBeenCalledOnce();
  });
});

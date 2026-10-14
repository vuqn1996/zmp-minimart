import { CheckoutSDK, EventName, events } from "zmp-sdk-modern/apis";

import type { CheckoutPayload } from "./api.js";

export interface SelectedCheckoutMethod {
  paymentMethod: "ZALOPAY" | "COD";
  checkoutMethod: { id: string; isCustom: false };
}

export async function selectCheckoutPaymentMethod(allowedPaymentMethods?: Array<"COD" | "ZALOPAY">): Promise<SelectedCheckoutMethod> {
  if (allowedPaymentMethods?.length === 0) throw new Error("Hiện không có phương thức thanh toán phù hợp. Vui lòng cập nhật giỏ hàng.");
  if (import.meta.env.DEV && !Reflect.has(window, "ZaloJavaScriptInterface")) {
    return {
      paymentMethod: allowedPaymentMethods && !allowedPaymentMethods.includes("ZALOPAY") ? "COD" : "ZALOPAY",
      checkoutMethod: { id: allowedPaymentMethods && !allowedPaymentMethods.includes("ZALOPAY") ? "COD_SANDBOX" : "ZALOPAY_SANDBOX", isCustom: false },
    };
  }
  const selected = await CheckoutSDK.selectPaymentMethod({});
  if (selected.isCustom || (selected.method !== "ZALOPAY" && selected.method !== "ZALOPAY_SANDBOX" && selected.method !== "COD" && selected.method !== "COD_SANDBOX")) {
    throw new Error("Phương thức thanh toán chưa được cửa hàng hỗ trợ");
  }
  const method = selected.method.startsWith("COD") ? "COD" : "ZALOPAY";
  if (allowedPaymentMethods && !allowedPaymentMethods.includes(method)) throw new Error("Giỏ có bia chỉ hỗ trợ ZaloPay. Bỏ bia để chọn COD.");
  return {
    paymentMethod: selected.method.startsWith("COD") ? "COD" : "ZALOPAY",
    checkoutMethod: { id: selected.method, isCustom: false },
  };
}

export async function openCheckout(payload: CheckoutPayload): Promise<string> {
  const result = await CheckoutSDK.createOrder({
    amount: payload.amount,
    item: payload.item,
    desc: payload.desc,
    extradata: payload.extradata,
    ...(payload.method ? { method: payload.method } : {}),
    mac: payload.mac,
  });
  return result.orderId;
}

export type CheckoutResumeReason = "checkout" | "close" | "visibility";

export interface CheckoutCloseHint {
  error: unknown;
  result: unknown;
}

interface CheckoutEventSource {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  off(event: string, listener: (...args: unknown[]) => void): unknown;
  listeners(event: string): ((...args: unknown[]) => void)[];
}

interface VisibilitySource {
  visibilityState: string;
  addEventListener(event: "visibilitychange", listener: () => void): void;
  removeEventListener(event: "visibilitychange", listener: () => void): void;
}

/**
 * Provider events are only navigation hints. Callers must refresh order state
 * from the server; they must never infer PAID from these client-side events.
 */
export function subscribeToCheckoutResume(
  onResume: (reason: CheckoutResumeReason, hint?: CheckoutCloseHint) => void,
  eventSource: CheckoutEventSource = events as CheckoutEventSource,
  visibilitySource: VisibilitySource | undefined =
    typeof document === "undefined" ? undefined : document,
  redirectPath = "/orders",
): () => void {
  const listen = (event: string, listener: (...args: unknown[]) => void) => {
    eventSource.on(event, listener);
    // SDK on() appends a wrapper; off() needs that registered function, not its input.
    const registered = eventSource.listeners(event);
    const registeredListener = registered[registered.length - 1] ?? listener;
    return () => eventSource.off(event, registeredListener);
  };
  const onPaymentResume = () => onResume("checkout");
  // Checkout SDK emits `(error, checkTransactionResult)` here. Both are only
  // navigation hints: the backend remains the sole payment authority.
  const onPaymentClose = (error: unknown, result: unknown) => onResume("close", { error, result });
  const onOpenApp = (data: unknown) => {
    const path =
      typeof data === "object" && data !== null && "path" in data
        ? (data as { path?: unknown }).path
        : undefined;
    if (typeof path === "string" && path.includes(redirectPath)) onResume("checkout");
  };
  const onVisibilityChange = () => {
    if (visibilitySource?.visibilityState === "visible") onResume("visibility");
  };

  const unsubscribeOpenApp = listen(EventName.OpenApp, onOpenApp);
  const unsubscribePaymentDone = listen(EventName.PaymentDone, onPaymentResume);
  const unsubscribePaymentClose = listen(EventName.PaymentClose, onPaymentClose);
  visibilitySource?.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    unsubscribeOpenApp();
    unsubscribePaymentDone();
    unsubscribePaymentClose();
    visibilitySource?.removeEventListener("visibilitychange", onVisibilityChange);
  };
}

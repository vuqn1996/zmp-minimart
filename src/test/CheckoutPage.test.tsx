import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import type { CheckoutQuote, CustomerApi } from "../api.js";
import { CheckoutPage } from "../checkout/CheckoutPage.js";

const quote: CheckoutQuote = {
  currency: "VND",
  lines: [{
    skuId: "22222222-2222-4222-8222-222222222222",
    skuCode: "MILO-L",
    productName: "Milo Thức Uống Lúa Mạch",
    skuName: "Size L",
    imageUrl: null,
    quantity: 1,
    available: true,
    unitPriceVnd: "28000",
    listUnitPriceVnd: "28000",
    saleUnitPriceVnd: "28000",
    discountVnd: "0",
    lineTotalVnd: "28000",
    offerId: null,
  }],
  itemsSubtotalVnd: "28000",
  itemsDiscountVnd: "0",
  orderDiscountVnd: "0",
  deliveryFeeVnd: "16000",
  deliveryDiscountVnd: "0",
  totalDiscountVnd: "0",
  totalVnd: "44000",
  vouchers: [],
  offerProducts: [],
  appliedVoucher: null,
  promotionRevision: "2026-08-28T08:00:00.000Z",
  quoteExpiresAt: "2099-08-28T08:05:00.000Z",
  quoteToken: "signed-token-long-enough-for-checkout",
};

const address = {
  id: "33333333-3333-4333-8333-333333333333",
  recipientName: "Nguyễn A",
  phone: "0900000000",
  line1: "4 Ngõ 82 Duy Tân",
  province: "Hà Nội",
  isDefault: true,
};

function checkoutProps(
  api: CustomerApi,
  overrides: Partial<ComponentProps<typeof CheckoutPage>> = {},
): ComponentProps<typeof CheckoutPage> {
  return {
    api,
    branch: { id: "11111111-1111-4111-8111-111111111111", code: "Q1", name: "Quận 1" },
    addresses: [address],
    selectedAddressId: address.id,
    fulfillment: "DELIVERY",
    busy: false,
    cartQuantities: { "22222222-2222-4222-8222-222222222222": 1 },
    onBack: vi.fn(),
    onAddresses: vi.fn(),
    onFulfillment: vi.fn(),
    onQuantity: vi.fn(),
    onCheckout: vi.fn(),
    ...overrides,
  };
}

describe("mobile checkout page", () => {
  it("keeps degraded checkout on delivery COD and disables pickup", async () => {
    const api = { checkoutQuote: vi.fn(async () => quote) } as unknown as CustomerApi;
    const onCheckout = vi.fn();
    render(<CheckoutPage {...checkoutProps(api, {
      catalogState: {
        source: "backend",
        stale: true,
        lastSuccessfulAt: "2026-09-06T02:55:00.000Z",
        deliveryFeeVnd: "16000",
        branch: { id: "11111111-1111-4111-8111-111111111111", code: "Q1", name: "Quận 1" },
        freshness: "DEGRADED",
        revision: "12",
        snapshotAt: "2026-09-06T02:55:00.000Z",
        ageSeconds: 300,
        allowedPaymentMethods: ["COD"],
        canAddToCart: true,
      },
      onCheckout,
    })} />);

    await screen.findByText("Tóm tắt đơn hàng");
    expect(screen.getByText("Giá đã gồm VAT")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Nhận tại cửa hàng" })).toBeDisabled();
    expect(screen.queryByRole("radio", { name: "ZaloPay" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đặt mua" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Đặt mua" }));
    expect(onCheckout).toHaveBeenCalled();
  });

  it("keeps payment selection in Checkout SDK, not the cart checkout", async () => {
    const api = { checkoutQuote: vi.fn(async () => quote) } as unknown as CustomerApi;
    const onFulfillment = vi.fn();
    render(<CheckoutPage {...checkoutProps(api, { onFulfillment })} />);

    expect(await screen.findByRole("heading", { name: "Thanh toán" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "ZaloPay" })).not.toBeInTheDocument();
    expect(screen.queryByText("Thanh toán khi nhận hàng")).not.toBeInTheDocument();
    expect(screen.getAllByText("4 Ngõ 82 Duy Tân, Hà Nội").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Mã giảm giá")).not.toBeInTheDocument();
    expect(api.checkoutQuote).toHaveBeenLastCalledWith(expect.not.objectContaining({ voucherCode: expect.anything() }));
    fireEvent.click(screen.getByRole("radio", { name: "Nhận tại cửa hàng" }));
    expect(onFulfillment).toHaveBeenCalledWith("PICKUP");
  });

  it("uses the branch fulfillment capability for a pickup-only store", async () => {
    const api = { checkoutQuote: vi.fn(async () => quote) } as unknown as CustomerApi;
    render(<CheckoutPage {...checkoutProps(api, {
      branch: { id: "100002", code: "100002", name: "Cửa hàng Thủ Đức", fulfillmentMethods: ["PICKUP"] },
      fulfillment: "PICKUP",
    })} />);

    expect(await screen.findByRole("radio", { name: "Giao tận nơi" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Nhận tại cửa hàng" })).toBeEnabled();
  });

  it("sends the customer order note at checkout", async () => {
    const api = { checkoutQuote: vi.fn(async () => quote) } as unknown as CustomerApi;
    const onCheckout = vi.fn();
    render(<CheckoutPage {...checkoutProps(api, { onCheckout })} />);

    await screen.findByText("Tóm tắt đơn hàng");
    fireEvent.change(screen.getByLabelText("Ghi chú đơn hàng"), { target: { value: "Giao sau 18 giờ" } });
    fireEvent.click(screen.getByRole("button", { name: "Đặt mua" }));

    expect(onCheckout).toHaveBeenCalledWith(expect.objectContaining({
      quoteToken: quote.quoteToken,
      note: "Giao sau 18 giờ",
    }));
  });

  it("opens address editing and validates then snapshots an invoice request", async () => {
    const api = { checkoutQuote: vi.fn(async () => quote) } as unknown as CustomerApi;
    const onCheckout = vi.fn();
    const onSaveInvoiceProfile = vi.fn(async () => undefined);
    render(<CheckoutPage {...checkoutProps(api, {
      onCheckout,
      onSaveInvoiceProfile,
    })} />);

    await screen.findByText("Tóm tắt đơn hàng");
    fireEvent.click(screen.getByRole("button", { name: "Thay đổi" }));
    expect(await screen.findByRole("heading", { name: "Sửa địa chỉ" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hủy" }));

    fireEvent.click(screen.getByRole("checkbox", { name: "Yêu cầu hóa đơn điện tử" }));
    fireEvent.click(await screen.findByRole("button", { name: "Lưu yêu cầu" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("địa chỉ và email hợp lệ");
    fireEvent.change(screen.getByLabelText("Tên hộ kinh doanh / công ty"), { target: { value: "Công ty cửa hàng" } });
    fireEvent.change(screen.getByLabelText("Mã số thuế"), { target: { value: "0101234567" } });
    fireEvent.change(screen.getByLabelText("Địa chỉ đăng ký"), { target: { value: "Hà Nội" } });
    fireEvent.change(screen.getByLabelText("Email nhận hóa đơn"), { target: { value: "invoice@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu yêu cầu" }));
    await waitFor(() => expect(onSaveInvoiceProfile).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: "Đã nhập thông tin · Sửa" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Yêu cầu hóa đơn điện tử" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Đặt mua" }));
    expect(onCheckout).toHaveBeenCalledWith(expect.objectContaining({
      quoteToken: quote.quoteToken,
      invoiceRequest: {
        kind: "BUSINESS",
        legalName: "Công ty cửa hàng",
        taxCode: "0101234567",
        registeredAddress: "Hà Nội",
        email: "invoice@example.com",
      },
    }));
  });

  it("turns the invoice toggle off when an empty form sheet is dismissed", async () => {
    const api = { checkoutQuote: vi.fn(async () => quote) } as unknown as CustomerApi;
    render(<CheckoutPage {...checkoutProps(api)} />);

    await screen.findByText("Tóm tắt đơn hàng");
    const toggle = screen.getByRole("checkbox", { name: "Yêu cầu hóa đơn điện tử" });
    fireEvent.click(toggle);
    const invoiceSheet = screen.getAllByRole("presentation").find((node) => node.querySelector("form.invoice-sheet"));
    expect(invoiceSheet).toBeDefined();
    fireEvent.click(invoiceSheet!);

    await waitFor(() => expect(toggle).not.toBeChecked());
  });

  it("adds an eligible offer and refreshes the server-authoritative total", async () => {
    const offeredQuote: CheckoutQuote = {
      ...quote,
      offerProducts: [{
        offerId: "offer-1",
        skuId: "55555555-5555-4555-8555-555555555555",
        productName: "Bánh quy cửa hàng",
        skuName: "Gói nhỏ",
        imageUrl: null,
        listUnitPriceVnd: "30000",
        offerPriceVnd: "20000",
        availableQuantity: 5,
        eligible: true,
        reasonCode: "AVAILABLE",
      }],
    };
    const refreshed = { ...offeredQuote, totalVnd: "64000" };
    const api = {
      checkoutQuote: vi.fn().mockResolvedValueOnce(offeredQuote).mockResolvedValue(refreshed),
    } as unknown as CustomerApi;
    const onQuantity = vi.fn(async () => true);
    render(<CheckoutPage {...checkoutProps(api, { onQuantity })} />);

    fireEvent.click(await screen.findByRole("button", { name: "Thêm Bánh quy cửa hàng" }));
    expect(onQuantity).toHaveBeenCalledWith("55555555-5555-4555-8555-555555555555", 1);
    await waitFor(() => expect(api.checkoutQuote).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(document.querySelector(".checkout-bar strong")?.textContent).toContain("64.000"));
  });

  it("reveals a delete button on swipe and removes only after tapping and confirming it", async () => {
    const api = { checkoutQuote: vi.fn(async () => quote) } as unknown as CustomerApi;
    const onQuantity = vi.fn(async () => true);
    render(<CheckoutPage {...checkoutProps(api, { onQuantity })} />);

    const quantity = await screen.findByRole("spinbutton", { name: "Số lượng Milo Thức Uống Lúa Mạch" });
    fireEvent.change(quantity, { target: { value: "3" } });
    fireEvent.blur(quantity);
    await waitFor(() => expect(onQuantity).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222", 3));
    await waitFor(() => expect(api.checkoutQuote).toHaveBeenLastCalledWith(expect.objectContaining({
      lines: [{ skuId: "22222222-2222-4222-8222-222222222222", quantity: 3 }],
    })));

    const line = quantity.closest("article")!;
    fireEvent.touchStart(line, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchMove(line, { touches: [{ clientX: 160, clientY: 100 }] });
    expect(line.querySelector(".checkout-line-content")).toHaveStyle({ transform: "translate3d(-40px, 0, 0)" });
    fireEvent.touchEnd(line, { changedTouches: [{ clientX: 160, clientY: 100 }] });
    expect(line.querySelector(".checkout-line-content")).toHaveStyle({ transform: "translate3d(-80px, 0, 0)" });
    expect(line.querySelector(".checkout-line-swipe-label .zaui-icon")).toBeInTheDocument();
    expect(onQuantity).not.toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222", 0);

    fireEvent.touchStart(line, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchMove(line, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(line, { changedTouches: [{ clientX: 100, clientY: 100 }] });
    expect(line.querySelector(".checkout-line-content")).toHaveStyle({ transform: "translate3d(-80px, 0, 0)" });
    expect(onQuantity).not.toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222", 0);
    expect(line).not.toHaveClass("checkout-line-removing");

    fireEvent.click(screen.getByRole("button", { name: "Xóa Milo Thức Uống Lúa Mạch bằng vuốt" }));
    expect(screen.getByRole("dialog")).toHaveClass("zaui-modal-content");
    expect(onQuantity).not.toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222", 0);
    fireEvent.click(screen.getByRole("button", { name: "Xóa sản phẩm" }));
    expect(line).toHaveClass("checkout-line-removing");
    expect(onQuantity).not.toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222", 0);
    await waitFor(() => expect(onQuantity).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222", 0));
  });

  it("restores a swiped line when confirmed removal fails", async () => {
    const api = { checkoutQuote: vi.fn(async () => quote) } as unknown as CustomerApi;
    const onQuantity = vi.fn(async () => false);
    render(<CheckoutPage {...checkoutProps(api, { onQuantity })} />);
    const line = (await screen.findByRole("spinbutton", { name: "Số lượng Milo Thức Uống Lúa Mạch" })).closest("article")!;
    fireEvent.touchStart(line, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchMove(line, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(line, { changedTouches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.click(screen.getByRole("button", { name: "Xóa Milo Thức Uống Lúa Mạch bằng vuốt" }));
    fireEvent.click(screen.getByRole("button", { name: "Xóa sản phẩm" }));
    expect(line).toHaveClass("checkout-line-removing");
    await waitFor(() => expect(onQuantity).toHaveBeenCalledWith(quote.lines[0]!.skuId, 0));
    await waitFor(() => expect(line).not.toHaveClass("checkout-line-removing"));
  });

  it("confirms removal inside the app from the visible Xóa button", async () => {
    const api = { checkoutQuote: vi.fn(async () => quote) } as unknown as CustomerApi;
    const onQuantity = vi.fn(async () => true);
    const nativeConfirm = vi.spyOn(window, "confirm").mockImplementation(() => { throw new Error("native confirmation must not open"); });
    render(<CheckoutPage {...checkoutProps(api, { onQuantity })} />);
    const remove = await screen.findByRole("button", { name: "Xóa Milo Thức Uống Lúa Mạch" });
    fireEvent.click(remove);
    expect(nativeConfirm).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("zaui-modal-content");
    expect(dialog.closest(".zaui-modal-wrapper")).toBeInTheDocument();
    expect(screen.getByText("Xóa sản phẩm?")).toBeVisible();
    expect(screen.getByText("Milo Thức Uống Lúa Mạch", { selector: ".checkout-remove-confirm strong" })).toBeVisible();
    expect(onQuantity).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
    expect(onQuantity).not.toHaveBeenCalled();
    fireEvent.click(remove);
    fireEvent.click(screen.getByRole("button", { name: "Xóa sản phẩm" }));
    await waitFor(() => expect(onQuantity).toHaveBeenCalledWith(quote.lines[0]!.skuId, 0));
    nativeConfirm.mockRestore();
  });

  it("disables ordering for an expired quote and shows inline quote failures", async () => {
    const expiredApi = {
      checkoutQuote: vi.fn(async () => ({ ...quote, quoteExpiresAt: "2020-01-01T00:00:00.000Z" })),
    } as unknown as CustomerApi;
    const view = render(<CheckoutPage {...checkoutProps(expiredApi)} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Đặt mua" })).toBeDisabled());
    expect(screen.getByRole("alert")).toHaveTextContent("Báo giá đã hết hạn");

    view.unmount();
    const failingApi = {
      checkoutQuote: vi.fn(async () => { throw new Error("Không thể đồng bộ giá mới"); }),
    } as unknown as CustomerApi;
    render(<CheckoutPage {...checkoutProps(failingApi)} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể đồng bộ giá mới");
    expect(screen.queryByRole("button", { name: "Đặt mua" })).not.toBeInTheDocument();
  });
});

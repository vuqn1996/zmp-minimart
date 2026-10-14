import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpCustomerApi } from "../api.js";

const { getAccessToken, nativeStorage } = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  nativeStorage: {
    getItem: vi.fn<(key: string) => string | null>((key) => key === "shop_customer_session" ? "stale-session" : null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

vi.mock("zmp-sdk-modern/apis", () => ({ getAccessToken, nativeStorage }));

describe("customer Zalo login", () => {
  it("requires explicit login after confirmed deletion even when the pending marker is gone", async () => {
    nativeStorage.getItem.mockImplementation((key) => key === "shop_explicit_login_required" ? "1" : null);
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(new HttpCustomerApi().profile()).rejects.toThrow("Cá nhân");
    expect(fetch).not.toHaveBeenCalled();
    nativeStorage.getItem.mockImplementation((key) => key === "shop_customer_session" ? "stale-session" : null);
  });
  it("never recreates an account while a deletion request is unresolved", async () => {
    nativeStorage.getItem.mockImplementation((key) => key === "shop_data_deletion_pending_request" ? "request-id" : "stale-session");
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Expired" }), { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    await expect(new HttpCustomerApi().profile()).rejects.toThrow("Expired");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]![0])).toContain("/me");
    nativeStorage.getItem.mockImplementation((key) => key === "shop_customer_session" ? "stale-session" : null);
  });
  it("saves the deletion request ID before posting and never retries an ambiguous response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(new HttpCustomerApi().requestDataDeletion("request-id")).rejects.toThrow();
    expect(nativeStorage.setItem).toHaveBeenCalledWith("shop_data_deletion_pending_request", "request-id");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("sends the explicit privacy notice version with a new session", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ accessToken: "new-session", customer: { id: "1" } }), { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    await new HttpCustomerApi().login({ privacyNoticeVersion: "zalo-permissions-v1" });
    expect(JSON.parse(fetch.mock.calls[0]![1].body).privacyNoticeVersion).toBe("zalo-permissions-v1");
  });
  it("resolves backend campaign images to the configured backend origin", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      products: [], categories: [], catalogState: {},
      banners: [{ id: "banner-1", title: "Ưu đãi", imagePath: "/api/customer/banner-images/banner-1?v=abc", target: { type: "CATEGORY", categoryPath: ["Đồ ăn"] } }],
      campaigns: [{ id: "campaign-1", title: "Tháng mới", images: { headerPath: "/api/customer/campaign-images/campaign-1/header?v=h", popupPath: "/api/customer/campaign-images/campaign-1/popup?v=p", iconPath: "/api/customer/campaign-images/campaign-1/icon?v=i" }, productIds: ["10"] }],
    }), { status: 200 })));
    const catalog = await new HttpCustomerApi("https://api.example.com").catalog("100001");
    expect(catalog.banners?.[0]?.imageUrl).toBe("https://api.example.com/api/customer/banner-images/banner-1?v=abc");
    expect(catalog.campaigns?.[0]?.images).toEqual({
      headerUrl: "https://api.example.com/api/customer/campaign-images/campaign-1/header?v=h",
      popupUrl: "https://api.example.com/api/customer/campaign-images/campaign-1/popup?v=p",
      iconUrl: "https://api.example.com/api/customer/campaign-images/campaign-1/icon?v=i",
    });
  });
  it("recovers a transient catalog read but never repeats an ambiguous checkout write", async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError("network disconnected"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ branches: [] }), { status: 200 }))
      .mockRejectedValueOnce(new TypeError("network disconnected"));
    vi.stubGlobal("fetch", fetch);
    const api = new HttpCustomerApi();
    await expect(api.branches()).resolves.toEqual({ branches: [] });
    expect(fetch).toHaveBeenCalledTimes(2);
    await expect(api.retryCheckout("order-1", "attempt-1")).rejects.toThrow("Chưa nhận được xác nhận");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("recovers a temporary gateway error on reads without retrying validation failures", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response("gateway unavailable", { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ branches: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "Chi nhánh không hợp lệ" }), { status: 400 }));
    vi.stubGlobal("fetch", fetch);
    const api = new HttpCustomerApi();
    await expect(api.branches()).resolves.toEqual({ branches: [] });
    await expect(api.branches()).rejects.toThrow("Chi nhánh không hợp lệ");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("requests the lightweight order-list response", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ orders: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetch);

    await expect(new HttpCustomerApi("https://api.example.com").orders()).resolves.toEqual({ orders: [] });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/customer/orders?summary=1"), expect.any(Object));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    Reflect.deleteProperty(window, "ZaloJavaScriptInterface");
  });

  it("re-verifies the current Zalo account instead of trusting a saved customer session", async () => {
    Reflect.set(window, "ZaloJavaScriptInterface", {});
    getAccessToken.mockResolvedValue("current-zalo-access-token");
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      accessToken: "fresh-session",
      customer: { id: "customer-1", displayName: "Nguyễn Văn A", avatarUrl: "https://example.com/avatar.jpg" },
    }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);

    const result = await new HttpCustomerApi().login();

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/customer/session"), expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ accessToken: "current-zalo-access-token" }),
    }));
    expect(result.customer.displayName).toBe("Nguyễn Văn A");
    expect(nativeStorage.setItem).toHaveBeenCalledWith("shop_customer_session", "fresh-session");
  });

  it("restores the backend customer and saved address when a new bundle has no local session", async () => {
    nativeStorage.getItem.mockReturnValueOnce(null);
    getAccessToken.mockResolvedValue("current-zalo-access-token");
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/customer/session") && init?.method === "POST") {
        return new Response(JSON.stringify({
          accessToken: "fresh-session",
          customer: { id: "customer-1", displayName: "Nguyễn Văn A", phone: "0900000000" },
        }), { status: 201, headers: { "content-type": "application/json" } });
      }
      if (url.endsWith("/api/customer/address") && (init?.headers as Record<string, string>)?.authorization === "Bearer fresh-session") {
        return new Response(JSON.stringify({
          address: {
            id: "default",
            recipientName: "Nguyễn Văn A",
            phone: "0900000000",
            line1: "12 Đường Hạnh Phúc",
            ward: "Phường Minh Khai",
            province: "Tỉnh Tuyên Quang",
            isDefault: true,
          },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ message: "Phiên đăng nhập đã hết hạn" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetch);

    const api = new HttpCustomerApi("https://api.example.com");

    await expect(api.profile()).resolves.toMatchObject({ id: "customer-1" });
    await expect(api.addresses()).resolves.toMatchObject({
      addresses: [expect.objectContaining({ line1: "12 Đường Hạnh Phúc" })],
    });
    expect(nativeStorage.setItem).toHaveBeenCalledWith("shop_customer_session", "fresh-session");
  });

  it("recovers a saved address when the stored backend session has expired", async () => {
    getAccessToken.mockResolvedValue("current-zalo-access-token");
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/api/customer/me")) return new Response(JSON.stringify({ message: "Phiên đăng nhập đã hết hạn" }), { status: 401 });
      if (path.endsWith("/api/customer/session") && init?.method === "POST") {
        return new Response(JSON.stringify({ accessToken: "renewed-session", customer: { id: "customer-1" } }), { status: 201 });
      }
      if (path.endsWith("/api/customer/address")) {
        return new Response(JSON.stringify({ address: { id: "default", recipientName: "Nguyễn Văn A", phone: "0900000000", line1: "12 Đường Hạnh Phúc", ward: "Xã Đồng Văn", province: "Tỉnh Tuyên Quang", isDefault: true } }), { status: 200 });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetch);

    const api = new HttpCustomerApi("https://api.example.com");
    await expect(api.profile()).resolves.toMatchObject({ id: "customer-1" });
    await expect(api.addresses()).resolves.toMatchObject({ addresses: [expect.objectContaining({ line1: "12 Đường Hạnh Phúc" })] });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/customer/address"), expect.objectContaining({
      headers: expect.objectContaining({ authorization: "Bearer renewed-session" }),
    }));
  });

  it("renews an expired session before retrying a rejected address save", async () => {
    getAccessToken.mockResolvedValue("current-zalo-access-token");
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/api/customer/session")) {
        return new Response(JSON.stringify({ accessToken: "renewed-session", customer: { id: "customer-1" } }), { status: 201 });
      }
      if (path.endsWith("/api/customer/address") && init?.method === "PUT") {
        const authorized = (init.headers as Record<string, string>).authorization === "Bearer renewed-session";
        return new Response(JSON.stringify(authorized ? { address: { id: "default" } } : { message: "Phiên đăng nhập đã hết hạn" }), { status: authorized ? 200 : 401 });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetch);

    await expect(new HttpCustomerApi("https://api.example.com").createAddress({
      recipientName: "Nguyễn Văn A", phone: "0900000000", line1: "12 Đường Hạnh Phúc",
      ward: "Xã Đồng Văn", province: "Tỉnh Tuyên Quang", isDefault: true,
    })).resolves.toMatchObject({ address: { id: "default" } });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining("/api/customer/address"), expect.objectContaining({
      method: "PUT", headers: expect.objectContaining({ authorization: "Bearer renewed-session" }),
    }));
  });

  it("clears the saved backend session on logout", () => {
    const api = new HttpCustomerApi();

    api.logout();

    expect(nativeStorage.removeItem).toHaveBeenCalledWith("shop_customer_session");
  });

  it("stops before backend login when Zalo does not issue an access token", async () => {
    Reflect.set(window, "ZaloJavaScriptInterface", {});
    getAccessToken.mockResolvedValue("");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(new HttpCustomerApi().login()).rejects.toThrow(
      "Không thể lấy quyền tài khoản Zalo. Hãy mở lại Mini App và cấp quyền hồ sơ.",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the backend business error instead of reporting a connection failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "BRANCH_UNAVAILABLE",
      message: "Chi nhánh chưa sẵn sàng",
    }), { status: 409, headers: { "content-type": "application/json" } })));

    await expect(new HttpCustomerApi("https://api.example.com").checkoutQuote({
      branchId: "100001",
      fulfillmentMethod: "PICKUP",
      lines: [{ skuId: "123", quantity: 1 }],
    })).rejects.toThrow("Chi nhánh chưa sẵn sàng");
  });

  it("asks backend to classify location without paying for an address suggestion", async () => {
    const response = {
      serviceAssignment: { status: "IN_AREA", branchId: "100001", assignedAt: "2026-09-12T00:00:00.000Z" },
      needsRefresh: false,
    };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetch);

    await expect(new HttpCustomerApi("https://api.example.com").reverseGeocode({
      locationToken: "one-time-token",
      accessToken: "zalo-token",
      includeAddressSuggestion: false,
    })).resolves.toEqual(response);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/customer/address/reverse-geocode"), expect.objectContaining({
      body: JSON.stringify({ locationToken: "one-time-token", accessToken: "zalo-token", includeAddressSuggestion: false }),
    }));
  });

  it("shows a backend validation issue instead of reporting a connection failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "validation_failed",
      issues: [{ path: ["paymentMethod"], message: "COD áp dụng khi nhận tại cửa hàng" }],
    }), { status: 400, headers: { "content-type": "application/json" } })));

    await expect(new HttpCustomerApi("https://api.example.com").checkoutQuote({
      branchId: "100001",
      fulfillmentMethod: "PICKUP",
      lines: [{ skuId: "123", quantity: 1 }],
    })).rejects.toThrow("COD áp dụng khi nhận tại cửa hàng");
  });

  it("normalizes the minimal backend quote for the checkout screen", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      currency: "VND",
      lines: [{
        skuId: "123",
        skuCode: "SKU-123",
        productName: "Nước lọc TH 500ml (chai)",
        skuName: "Nước lọc TH 500ml (chai)",
        imageUrl: null,
        quantity: 2,
        unitPriceVnd: "6500.00",
        lineTotalVnd: "13000.00",
      }],
      deliveryFeeVnd: "0.00",
      totalVnd: "13000.00",
      quoteExpiresAt: "2099-01-01T00:00:00.000Z",
      quoteToken: "signed-token-long-enough-for-checkout",
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const quote = await new HttpCustomerApi("https://api.example.com").checkoutQuote({
      branchId: "100001",
      fulfillmentMethod: "PICKUP",
      lines: [{ skuId: "123", quantity: 2 }],
    });

    expect(quote).toMatchObject({
      itemsSubtotalVnd: "13000.00",
      itemsDiscountVnd: "0",
      offerProducts: [],
      vouchers: [],
    });
    expect(quote.lines[0]).toMatchObject({
      available: true,
      listUnitPriceVnd: "6500.00",
      saleUnitPriceVnd: "6500.00",
      discountVnd: "0",
      offerId: null,
    });
  });

  it("normalizes the minimal backend order without rendering NaN totals", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      order: {
        id: "order-1",
        code: "T8-0001",
        status: "PENDING_PAYMENT",
        operationalStatus: "CONFIRMED",
        paymentStatus: "PENDING",
        paymentMethod: "ZALOPAY",
        fulfillmentMethod: "DELIVERY",
        totalVnd: "8000.00",
        deliveryFeeVnd: "0.00",
        createdAt: "2026-09-09T09:06:51.000Z",
        canCancel: false,
        branch: { id: "100001", code: "100001", name: "Chi nhánh Quận 1" },
        lines: [{ skuId: "101", quantity: 1, unitPriceVnd: "8000.00" }],
      },
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const { order } = await new HttpCustomerApi("https://api.example.com").order("order-1");

    expect(order.itemsSubtotalVnd).toBe("8000.00");
    expect(order.lines?.[0]).toMatchObject({
      id: "101",
      skuCode: "101",
      productName: "Sản phẩm",
      skuName: "Sản phẩm",
      lineTotalVnd: "8000.00",
    });
  });

  it("preserves the saved address fields returned by backend", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      address: {
        id: "default",
        recipientName: "Nguyễn Văn A",
        phone: "0900000000",
        address: "78 Phố Duy Tân, Phường Cầu Giấy, Thành phố Hà Nội",
        line1: "78 Phố Duy Tân",
        ward: "Phường Cầu Giấy",
        province: "Thành phố Hà Nội",
        isDefault: true,
      },
    }), { status: 200, headers: { "content-type": "application/json" } })));

    await expect(new HttpCustomerApi("https://api.example.com").addresses()).resolves.toEqual({
      addresses: [{
        id: "default",
        recipientName: "Nguyễn Văn A",
        phone: "0900000000",
        line1: "78 Phố Duy Tân",
        ward: "Phường Cầu Giấy",
        province: "Thành phố Hà Nội",
        isDefault: true,
      }],
    });
  });
});

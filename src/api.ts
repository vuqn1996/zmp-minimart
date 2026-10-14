import { getAccessToken } from "zmp-sdk-modern/apis";
import { SHOP } from "./config.js";
import { miniAppStorage } from "./storage.js";

export type OrderStatus = "DRAFT" | "PENDING_PAYMENT" | "CONFIRMED" | "DELIVERING" | "COMPLETED" | "CANCELLED";

export const DATA_DELETION_LOGIN_REQUIRED_KEY = "shop_explicit_login_required";
export const DATA_DELETION_PENDING_KEY = "shop_data_deletion_pending_request";

export interface DataDeletionRequest {
  id: string;
  status: "PENDING_REVIEW" | "COMPLETED" | "COMPLETED_WITH_RETENTION";
  requestedAt: string; completedAt: string | null; retainedSummary: string | null;
}

const CUSTOMER_SESSION_STORAGE_KEY = "shop_customer_session";

export interface CustomerProfile {
  id: string;
  displayName?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  invoiceProfile?: InvoiceRequest | null;
  serviceAssignment?: ServiceAssignment;
  needsRefresh?: boolean;
}

export type FulfillmentMethod = "DELIVERY" | "PICKUP";
export type ServiceAssignmentStatus = "IN_AREA" | "OUT_OF_AREA" | "UNAVAILABLE";

export interface ServiceAssignment {
  status: ServiceAssignmentStatus;
  branchId: string | null;
  assignedAt: string | null;
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  fulfillmentMethods?: FulfillmentMethod[];
}

export interface Address {
  id: string;
  recipientName: string;
  phone: string;
  line1: string;
  ward?: string | null;
  district?: string | null;
  province: string;
  isDefault: boolean;
  serviceability?: ServiceAssignment & { needsRefresh?: boolean };
}

export type LocationResolution = {
  serviceAssignment?: ServiceAssignment;
  needsRefresh?: boolean;
  address?: string;
  province?: string;
  ward?: string;
};

export interface CatalogState {
  source: string;
  stale: boolean;
  lastSuccessfulAt: string | null;
  deliveryFeeVnd: string;
  branch: Branch;
  freshness?: "FRESH" | "DEGRADED" | "EXPIRED";
  snapshotAt?: string | null;
  ageSeconds?: number | null;
  allowedPaymentMethods?: Array<"COD" | "ZALOPAY">;
  canAddToCart?: boolean;
  revision?: string | null;
}

export interface CatalogSku {
  id: string;
  code: string;
  name: string;
  priceVnd: string;
  availableQuantity: number;
  active: boolean;
}

export interface CatalogProduct {
  salePolicy?: "STANDARD" | "BEER";
  id: string;
  name: string;
  brandSortName?: string | null;
  slug: string;
  description?: string | null;
  categoryName: string;
  categoryPath?: string[];
  recommended: boolean;
  imageUrl: string | null;
  images?: Array<{ url: string }>;
  minimumPriceVnd: string;
  skus: CatalogSku[];
}

export interface CatalogCategory {
  id: string;
  name: string;
  parentId: string | null;
  rank: number | null;
}

export interface CatalogBanner {
  id: string;
  title: string;
  imageUrl: string;
  target: { type: "PRODUCT"; productId: string } | { type: "CATEGORY"; categoryPath: string[] };
}

export interface CatalogCampaign {
  id: string;
  title: string;
  images: {
    headerUrl?: string;
    popupUrl?: string;
    iconUrl?: string;
  };
  productIds: string[];
}

export interface CustomerOrder {
  id: string;
  code: string;
  status: OrderStatus;
  operationalStatus?: OrderStatus;
  paymentStatus: string;
  paymentMethod: "ZALOPAY" | "COD" | null;
  fulfillmentMethod: "DELIVERY" | "PICKUP";
  totalVnd: string;
  itemsSubtotalVnd: string;
  deliveryFeeVnd: string;
  createdAt: string;
  canCancel: boolean;
  canRetryCheckout?: boolean;
  paymentExpiresAt?: string | null;
  latestCheckoutAttempt?: {
    id: string;
    status: string;
  } | null;
  reorderedFromOrderId?: string | null;
  branch: Branch;
  syncStatus?: string | null;
  syncStatusUpdatedAt?: string | null;
  syncLastError?: string | null;
  catalogRevision?: string | null;
  catalogSnapshotAt?: string | null;
  lines?: Array<{
    id: string;
    skuId: string;
    productName: string;
    skuName: string;
    skuCode: string;
    imageUrl?: string | null;
    quantity: number;
    unitPriceVnd: string;
    lineTotalVnd: string;
  }>;
}

export interface CheckoutPayload {
  amount: number;
  item: Array<Record<string, unknown>>;
  desc: string;
  extradata: string;
  method?: string | { id: string; isCustom: false };
  mac: string;
}

export type InvoiceRequest =
  | { kind: "BUSINESS"; legalName: string; taxCode: string; registeredAddress: string; email: string }
  | { kind: "INDIVIDUAL"; fullName: string; address: string; email: string; taxCode?: string; personalId?: string };

export interface CheckoutQuoteVoucher {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discountTarget: "ITEMS" | "DELIVERY";
  discountVnd: string;
  minItemsSubtotalVnd: string;
  eligible: boolean;
  reasonCode: string;
}

export interface CheckoutQuote {
  allowedPaymentMethods?: Array<"COD" | "ZALOPAY">;
  paymentRestriction?: "BEER_REQUIRES_ZALOPAY" | null;
  currency: "VND";
  lines: Array<{
    skuId: string;
    skuCode: string;
    productName: string;
    skuName: string;
    imageUrl: string | null;
    quantity: number;
    available: boolean;
    unitPriceVnd: string;
    listUnitPriceVnd: string;
    saleUnitPriceVnd: string;
    discountVnd: string;
    lineTotalVnd: string;
    offerId: string | null;
  }>;
  itemsSubtotalVnd: string;
  itemsDiscountVnd: string;
  orderDiscountVnd: string;
  deliveryFeeVnd: string;
  deliveryDiscountVnd: string;
  totalDiscountVnd: string;
  totalVnd: string;
  vouchers: CheckoutQuoteVoucher[];
  offerProducts: Array<{
    offerId: string;
    skuId: string;
    productName: string;
    skuName: string;
    imageUrl: string | null;
    listUnitPriceVnd: string;
    offerPriceVnd: string;
    availableQuantity: number;
    eligible: boolean;
    reasonCode: string;
  }>;
  appliedVoucher: CheckoutQuoteVoucher | null;
  promotionRevision: string;
  quoteExpiresAt: string;
  quoteToken: string;
}

export interface CheckoutSession {
  provider: "ZALO_CHECKOUT";
  attemptId?: string;
  requestPayload: CheckoutPayload;
}

export interface CustomerApi {
  login(input?: { privacyNoticeVersion: string }): Promise<{ accessToken: string; customer: CustomerProfile }>;
  logout(): void;
  dataDeletionRequest(): Promise<{ request: DataDeletionRequest | null }>;
  requestDataDeletion(clientRequestId: string): Promise<{ request: DataDeletionRequest }>;
  branches(): Promise<{ branches: Branch[] }>;
  catalog(branchId: string): Promise<{ products: CatalogProduct[]; categories?: CatalogCategory[]; banners?: CatalogBanner[]; campaigns?: CatalogCampaign[]; catalogState: CatalogState }>;
  cart(branchId: string): Promise<{ cart: { id: string | null; branch: Branch; lines: Array<{ skuId: string; quantity: number }> } }>;
  saveCart(branchId: string, lines: Array<{ skuId: string; quantity: number }>): Promise<unknown>;
  profile(): Promise<CustomerProfile>;
  updateProfile(data: { displayName?: string; phone?: string; invoiceProfile?: InvoiceRequest | null }): Promise<CustomerProfile | void>;
  linkZaloPhone(data: { code: string; accessToken: string }): Promise<CustomerProfile>;
  reverseGeocode(data: { locationToken: string; accessToken: string; includeAddressSuggestion?: boolean }): Promise<LocationResolution>;
  addresses(): Promise<{ addresses: Address[] }>;
  createAddress(data: Omit<Address, "id">): Promise<unknown>;
  updateAddress(addressId: string, data: Partial<Omit<Address, "id">>): Promise<unknown>;
  deleteAddress(addressId: string): Promise<void>;
  orders(): Promise<{ orders: CustomerOrder[] }>;
  order(orderId: string): Promise<{ order: CustomerOrder }>;
  cancelOrder(orderId: string): Promise<{ order: CustomerOrder }>;
  retryCheckout(orderId: string, clientAttemptId: string): Promise<CheckoutSession>;
  bindCheckout(orderId: string, providerOrderId: string, attemptId?: string): Promise<void>;
  checkoutQuote(data: {
    branchId: string;
    fulfillmentMethod: "DELIVERY" | "PICKUP";
    lines: Array<{ skuId: string; quantity: number }>;
    voucherCode?: string;
  }): Promise<CheckoutQuote>;
  createOrder(data: {
    branchId: string;
    fulfillmentMethod: "DELIVERY" | "PICKUP";
    paymentMethod: "ZALOPAY" | "COD";
    checkoutMethod?: { id: string; isCustom: false };
    addressId?: string;
    quoteToken: string;
    note?: string;
    voucherCode?: string;
    invoiceRequest?: InvoiceRequest;
    reorderedFromOrderId?: string;
    idempotencyKey: string;
  }): Promise<{
    order: CustomerOrder;
    checkout?: CheckoutSession;
  }>;
}

async function zaloAccessToken(): Promise<string> {
  if (import.meta.env.DEV && !Reflect.has(window, "ZaloJavaScriptInterface")) {
    return "mock:zalo-local:Khách hàng";
  }
  const accessToken = await getAccessToken({});
  if (!accessToken)
    throw new Error(
      "Không thể lấy quyền tài khoản Zalo. Hãy mở lại Mini App và cấp quyền hồ sơ.",
    );
  return accessToken;
}

export class HttpCustomerApi implements CustomerApi {
  private token = miniAppStorage.getItem(CUSTOMER_SESSION_STORAGE_KEY);

  constructor(
    private readonly origin = SHOP.apiUrl,
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const readOnly = (init.method ?? "GET") === "GET";
    const send = async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), readOnly ? 10_000 : 30_000);
      try {
        const response = await this.fetcher(`${this.origin}${path}`, {
          ...init,
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
            ...init.headers,
          },
        });
        const value = response.status === 204 ? {} : await response.json().catch((error: unknown) => {
          if (response.ok) throw error;
          return {};
        });
        return { response, value };
      } finally {
        clearTimeout(timer);
      }
    };
    let result: Awaited<ReturnType<typeof send>>;
    let retried = false;
    try {
      result = await send();
    } catch {
      if (!readOnly) throw new Error("Chưa nhận được xác nhận từ cửa hàng. Vui lòng kiểm tra đơn hàng trước khi thử lại.");
      retried = true;
      await new Promise((resolve) => setTimeout(resolve, 500));
      result = await send().catch(() => { throw new Error("Chưa thể kết nối cửa hàng. Vui lòng kiểm tra mạng và thử lại."); });
    }
    if (readOnly && !retried && [502, 503, 504].includes(result.response.status)) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      result = await send().catch(() => result);
    }
    const { response } = result;
    const value = result.value as T & {
      error?: string | { message?: string };
      message?: string;
      issues?: Array<{ message?: string }>;
    };
    if (!response.ok) {
      const message = value.message
        ?? (typeof value.error === "object" ? value.error?.message : undefined)
        ?? value.issues?.find((issue) => typeof issue.message === "string")?.message
        ?? "Không thể kết nối cửa hàng";
      throw Object.assign(new Error(message), { status: response.status });
    }
    return value;
  }

  private normalizeOrder(value: CustomerOrder & { operationalStatus?: OrderStatus }): CustomerOrder {
    const lines = value.lines?.map((line) => {
      const lineTotal = Number(line.unitPriceVnd) * Number(line.quantity);
      return {
        ...line,
        id: line.id ?? line.skuId,
        skuCode: line.skuCode ?? line.skuId,
        productName: line.productName || "Sản phẩm",
        skuName: line.skuName || line.productName || "Sản phẩm",
        lineTotalVnd: line.lineTotalVnd ?? (Number.isFinite(lineTotal) ? lineTotal.toFixed(2) : "0.00"),
      };
    });
    const itemsSubtotal = Number(value.totalVnd) - Number(value.deliveryFeeVnd);
    const operationalStatus = value.operationalStatus ?? value.status;
    const awaitingZaloPayment = value.paymentMethod === "ZALOPAY"
      && ["PENDING", "FAILED", "RECONCILING"].includes(value.paymentStatus)
      && operationalStatus !== "CANCELLED";
    return {
      ...value,
      status: awaitingZaloPayment ? "PENDING_PAYMENT" : operationalStatus,
      itemsSubtotalVnd: value.itemsSubtotalVnd
        ?? (Number.isFinite(itemsSubtotal) ? itemsSubtotal.toFixed(2) : "0.00"),
      ...(lines ? { lines } : {}),
    };
  }

  async login(input?: { privacyNoticeVersion: string }) {
    if ((miniAppStorage.getItem(DATA_DELETION_PENDING_KEY) || miniAppStorage.getItem(DATA_DELETION_LOGIN_REQUIRED_KEY)) && !input) throw new Error("Vui lòng kiểm tra yêu cầu xóa dữ liệu trong Cá nhân trước khi đăng nhập lại");
    this.logout();
    const result = await this.request<{ accessToken: string; customer: CustomerProfile }>(
      "/api/customer/session",
      { method: "POST", body: JSON.stringify({ accessToken: await zaloAccessToken(), ...input }) },
    );
    this.token = result.accessToken;
    miniAppStorage.setItem(CUSTOMER_SESSION_STORAGE_KEY, result.accessToken);
    return result;
  }

  private async withSessionRefresh<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (reason) {
      if (!(reason instanceof Error && "status" in reason && reason.status === 401)) throw reason;
      if (miniAppStorage.getItem(DATA_DELETION_PENDING_KEY)) { this.logout(); throw reason; }
      await this.login();
      return operation();
    }
  }

  logout() {
    this.token = null;
    miniAppStorage.removeItem(CUSTOMER_SESSION_STORAGE_KEY);
  }

  dataDeletionRequest() {
    return this.request<{ request: DataDeletionRequest | null }>("/api/customer/privacy/deletion");
  }
  requestDataDeletion(clientRequestId: string) {
    miniAppStorage.setItem(DATA_DELETION_PENDING_KEY, clientRequestId);
    return this.request<{ request: DataDeletionRequest }>("/api/customer/privacy/deletion", { method: "POST", body: JSON.stringify({ clientRequestId }) });
  }

  branches() {
    return this.request<{ branches: Branch[] }>("/api/customer/branches");
  }
  async catalog(branchId: string) {
    const response = await this.request<{
      products: CatalogProduct[];
      categories?: CatalogCategory[];
      banners?: Array<Omit<CatalogBanner, "imageUrl"> & { imagePath: string }>;
      campaigns?: Array<Omit<CatalogCampaign, "images"> & { images: { headerPath?: string; popupPath?: string; iconPath?: string } }>;
      catalogState: CatalogState;
    }>(`/api/customer/catalog?branchId=${encodeURIComponent(branchId)}`);
    const { banners, campaigns, ...catalog } = response;
    const absolute = (path: string) => new URL(path, this.origin || window.location.origin).toString();
    return {
      ...catalog,
      ...(banners ? { banners: banners.map(({ imagePath, ...banner }) => ({
        ...banner,
        imageUrl: absolute(imagePath),
      })) } : {}),
      ...(campaigns ? { campaigns: campaigns.map((campaign) => ({
        ...campaign,
        images: {
          ...(campaign.images.headerPath ? { headerUrl: absolute(campaign.images.headerPath) } : {}),
          ...(campaign.images.popupPath ? { popupUrl: absolute(campaign.images.popupPath) } : {}),
          ...(campaign.images.iconPath ? { iconUrl: absolute(campaign.images.iconPath) } : {}),
        },
      })) } : {}),
    };
  }
  cart(branchId: string) {
    const stored = miniAppStorage.getItem(`shop_cart:${branchId}`);
    const lines = (() => {
      try { return JSON.parse(stored ?? "[]") as Array<{ skuId: string; quantity: number }>; } catch { return []; }
    })();
    return Promise.resolve({ cart: { id: null as string | null, branch: { id: branchId, code: branchId, name: "" }, lines } });
  }
  saveCart(branchId: string, lines: Array<{ skuId: string; quantity: number }>) {
    miniAppStorage.setItem(`shop_cart:${branchId}`, JSON.stringify(lines));
    return Promise.resolve({ saved: true });
  }
  async profile() {
    if (!this.token) return this.login().then(({ customer }) => customer);
    try {
      return await this.request<CustomerProfile>("/api/customer/me");
    } catch (reason) {
      if (reason instanceof Error && "status" in reason && reason.status === 401) {
        if (miniAppStorage.getItem(DATA_DELETION_PENDING_KEY)) { this.logout(); throw reason; }
        return (await this.login()).customer;
      }
      throw reason;
    }
  }
  updateProfile(data: { displayName?: string; phone?: string; invoiceProfile?: InvoiceRequest | null }) {
    return this.request<CustomerProfile>("/api/customer/me", { method: "PATCH", body: JSON.stringify(data) });
  }
  linkZaloPhone(data: { code: string; accessToken: string }) {
    return this.request<CustomerProfile>("/api/customer/session/phone", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
  reverseGeocode(data: { locationToken: string; accessToken: string; includeAddressSuggestion?: boolean }) {
    return this.withSessionRefresh(() => this.request<LocationResolution>("/api/customer/address/reverse-geocode", {
      method: "POST",
      body: JSON.stringify(data),
    }));
  }
  addresses(): Promise<{ addresses: Address[] }> {
    return this.withSessionRefresh(() => this.request<{ address: (Address & { address: string }) | null; serviceability?: Address["serviceability"] }>("/api/customer/address"))
      .then(({ address, serviceability }) => ({ addresses: address ? [{
        id: address.id,
        recipientName: address.recipientName,
        phone: address.phone,
        line1: address.line1 ?? address.address,
        ...(address.ward ? { ward: address.ward } : {}),
        ...(address.district ? { district: address.district } : {}),
        province: address.province ?? "",
        isDefault: address.isDefault,
        ...(serviceability ?? address.serviceability ? { serviceability: serviceability ?? address.serviceability } : {}),
      }] : [] }));
  }
  createAddress(data: Omit<Address, "id">) {
    return this.withSessionRefresh(() => this.request("/api/customer/address", { method: "PUT", body: JSON.stringify({ recipientName: data.recipientName, phone: data.phone, line1: data.line1, ward: data.ward, province: data.province }) }));
  }
  updateAddress(addressId: string, data: Partial<Omit<Address, "id">>) {
    if (addressId !== "default" || !data.recipientName || !data.phone || !data.line1 || !data.ward || !data.province) return Promise.reject(new Error("Chỉ có thể cập nhật địa chỉ mặc định"));
    return this.withSessionRefresh(() => this.request("/api/customer/address", { method: "PUT", body: JSON.stringify({ recipientName: data.recipientName, phone: data.phone, line1: data.line1, ward: data.ward, province: data.province }) }));
  }
  deleteAddress(addressId: string) {
    void addressId;
    return Promise.reject(new Error("Địa chỉ mặc định được quản lý trong hồ sơ cửa hàng"));
  }
  orders() {
    return this.request<{ orders: Array<CustomerOrder & { operationalStatus?: OrderStatus }> }>("/api/customer/orders?summary=1")
      .then(({ orders }) => ({ orders: orders.map((order) => this.normalizeOrder(order)) }));
  }
  order(orderId: string) {
    return this.request<{ order: CustomerOrder & { operationalStatus?: OrderStatus } }>(`/api/customer/orders/${orderId}`)
      .then(({ order }) => ({ order: this.normalizeOrder(order) }));
  }
  cancelOrder(orderId: string) {
    return this.request<{ order: CustomerOrder & { operationalStatus?: OrderStatus } }>(`/api/customer/orders/${orderId}/cancel`, { method: "POST", body: "{}" })
      .then(({ order }) => ({ order: this.normalizeOrder(order) }));
  }
  retryCheckout(orderId: string, clientAttemptId: string) {
    return this.request<{ checkout: CheckoutSession }>(`/api/customer/orders/${orderId}/checkout`, {
      method: "POST",
      body: JSON.stringify({ clientAttemptId }),
    }).then(({ checkout }) => checkout);
  }
  bindCheckout(orderId: string, providerOrderId: string, attemptId?: string) {
    return this.request(`/api/customer/orders/${orderId}/checkout/bind`, {
      method: "POST",
      body: JSON.stringify({ providerOrderId, ...(attemptId ? { attemptId } : {}) }),
    }).then(() => undefined);
  }
  checkoutQuote(data: Parameters<CustomerApi["checkoutQuote"]>[0]) {
    return this.request<CheckoutQuote>("/api/customer/checkout/quote", {
      method: "POST",
      body: JSON.stringify(data),
    }).then((quote) => ({
      ...quote,
      itemsSubtotalVnd: quote.itemsSubtotalVnd
        ?? quote.lines.reduce((total, line) => total + Number(line.lineTotalVnd), 0).toFixed(2),
      itemsDiscountVnd: quote.itemsDiscountVnd ?? "0",
      orderDiscountVnd: quote.orderDiscountVnd ?? "0",
      deliveryDiscountVnd: quote.deliveryDiscountVnd ?? "0",
      totalDiscountVnd: quote.totalDiscountVnd ?? "0",
      vouchers: quote.vouchers ?? [],
      offerProducts: quote.offerProducts ?? [],
      appliedVoucher: quote.appliedVoucher ?? null,
      promotionRevision: quote.promotionRevision ?? "none",
      lines: quote.lines.map((line) => ({
        ...line,
        available: line.available ?? true,
        listUnitPriceVnd: line.listUnitPriceVnd ?? line.unitPriceVnd,
        saleUnitPriceVnd: line.saleUnitPriceVnd ?? line.unitPriceVnd,
        discountVnd: line.discountVnd ?? "0",
        offerId: line.offerId ?? null,
      })),
    }));
  }
  createOrder(data: Parameters<CustomerApi["createOrder"]>[0]) {
    return this.request<Awaited<ReturnType<CustomerApi["createOrder"]>>>("/api/customer/orders", {
      method: "POST",
      body: JSON.stringify(data),
    }).then((result) => ({ ...result, order: this.normalizeOrder(result.order) }));
  }
}

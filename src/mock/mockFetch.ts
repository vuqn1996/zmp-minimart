import branches from "./branches.json";
import campaigns from "./campaigns.json";
import products from "./products.json";

/**
 * In-browser fake backend used when `template.apiUrl` in app-config.json is empty.
 * It implements the same endpoints your server must provide (see README), keeps state
 * in memory only, and resets when the Mini App is reopened.
 */

type Json = Record<string, unknown>;
type Line = { skuId: string; quantity: number };

const DELIVERY_FEE = 15000;
const VOUCHER = {
  id: "voucher-welcome",
  code: "CHAOBAN",
  name: "Giảm 10.000đ cho đơn đầu tiên",
  description: "Áp dụng cho đơn hàng từ 50.000đ",
  discountTarget: "ITEMS",
  discountVnd: "10000",
  minItemsSubtotalVnd: "50000",
};

const customer = {
  id: "customer-demo",
  displayName: "Khách hàng (Demo)",
  phone: "0900000000",
  avatarUrl: null,
  invoiceProfile: null as unknown,
  serviceAssignment: { status: "UNAVAILABLE", branchId: null as string | null, assignedAt: null as string | null },
};
let address: Json | null = null;
let deletionRequest: Json | null = null;
const orders: Json[] = [];

function findSku(skuId: string) {
  for (const product of products) {
    const sku = product.skus.find((item) => item.id === skuId);
    if (sku) return { product, sku };
  }
  return undefined;
}

function quote(body: Json) {
  const lines = ((body.lines as Line[] | undefined) ?? []).flatMap((line) => {
    const found = findSku(line.skuId);
    if (!found) return [];
    const price = Number(found.sku.priceVnd);
    return [{
      skuId: line.skuId,
      skuCode: found.sku.code,
      productName: found.product.name,
      skuName: found.sku.name,
      imageUrl: found.product.imageUrl,
      quantity: line.quantity,
      available: found.sku.availableQuantity >= line.quantity,
      unitPriceVnd: String(price),
      listUnitPriceVnd: String(price),
      saleUnitPriceVnd: String(price),
      discountVnd: "0",
      lineTotalVnd: String(price * line.quantity),
      offerId: null,
    }];
  });
  const subtotal = lines.reduce((total, line) => total + Number(line.lineTotalVnd), 0);
  const eligible = subtotal >= Number(VOUCHER.minItemsSubtotalVnd);
  const voucher = { ...VOUCHER, eligible, reasonCode: eligible ? "ELIGIBLE" : "MIN_SUBTOTAL_NOT_MET" };
  const applied = eligible && body.voucherCode === VOUCHER.code ? voucher : null;
  const discount = applied ? Number(VOUCHER.discountVnd) : 0;
  const deliveryFee = body.fulfillmentMethod === "PICKUP" ? 0 : DELIVERY_FEE;
  return {
    currency: "VND",
    lines,
    itemsSubtotalVnd: String(subtotal),
    itemsDiscountVnd: String(discount),
    orderDiscountVnd: "0",
    deliveryFeeVnd: String(deliveryFee),
    deliveryDiscountVnd: "0",
    totalDiscountVnd: String(discount),
    totalVnd: String(subtotal - discount + deliveryFee),
    vouchers: [voucher],
    offerProducts: [],
    appliedVoucher: applied,
    promotionRevision: "mock",
    quoteExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    quoteToken: "mock-quote",
  };
}

function route(method: string, url: URL, body: Json): [number, unknown] {
  const path = url.pathname.replace(/^.*\/api\/customer/, "");
  const key = `${method} ${path}`;

  if (key === "POST /session") return [200, { accessToken: "mock-session", customer }];
  if (key === "GET /me" || key === "POST /session/phone") return [200, customer];
  if (key === "PATCH /me") return [200, Object.assign(customer, body)];
  if (key === "GET /privacy/deletion") return [200, { request: deletionRequest }];
  if (key === "POST /privacy/deletion") {
    deletionRequest ??= { id: body.clientRequestId, status: "PENDING_REVIEW", requestedAt: new Date().toISOString(), completedAt: null, retainedSummary: null };
    return [200, { request: deletionRequest }];
  }
  if (key === "GET /branches") return [200, { branches }];
  if (key === "GET /catalog") {
    const branch = branches.find((item) => item.id === url.searchParams.get("branchId")) ?? branches[0];
    return [200, {
      products,
      campaigns,
      catalogState: {
        source: "mock",
        stale: false,
        lastSuccessfulAt: new Date().toISOString(),
        deliveryFeeVnd: String(DELIVERY_FEE),
        branch,
        freshness: "FRESH",
        canAddToCart: true,
        allowedPaymentMethods: ["COD", "ZALOPAY"],
        revision: "mock",
      },
    }];
  }
  if (key === "GET /address") return [200, { address, serviceability: customer.serviceAssignment }];
  if (key === "PUT /address") {
    address = { id: "default", isDefault: true, ...body };
    return [200, { address }];
  }
  if (key === "POST /address/reverse-geocode") {
    customer.serviceAssignment = { status: "IN_AREA", branchId: branches[0]!.id, assignedAt: new Date().toISOString() };
    return [200, {
      serviceAssignment: customer.serviceAssignment,
      needsRefresh: false,
      ...(body.includeAddressSuggestion === false ? {} : {
        address: "1 Công xã Paris, Phường Sài Gòn, Thành phố Hồ Chí Minh",
        province: "Thành phố Hồ Chí Minh",
        ward: "Phường Sài Gòn",
      }),
    }];
  }
  if (key === "POST /checkout/quote") return [200, quote(body)];
  if (key === "GET /orders") return [200, { orders }];
  if (key === "POST /orders") {
    const priced = quote(body);
    const order = {
      id: `order-${Date.now()}`,
      code: `DH-${1000 + orders.length + 1}`,
      status: "CONFIRMED",
      // ponytail: no real ZaloPay in mock mode; plug in your backend to get a signed checkout payload.
      paymentStatus: "UNPAID",
      paymentMethod: body.paymentMethod,
      fulfillmentMethod: body.fulfillmentMethod,
      totalVnd: priced.totalVnd,
      itemsSubtotalVnd: priced.itemsSubtotalVnd,
      deliveryFeeVnd: priced.deliveryFeeVnd,
      createdAt: new Date().toISOString(),
      canCancel: true,
      branch: branches.find((item) => item.id === body.branchId) ?? branches[0],
      lines: priced.lines.map((line, index) => ({ id: `line-${index}`, ...line })),
    };
    orders.unshift(order);
    return [200, { order }];
  }
  const orderMatch = /^\/orders\/([^/]+)(\/cancel)?$/.exec(path);
  const order = orders.find((item) => item.id === orderMatch?.[1]);
  if (orderMatch && !order) return [404, { message: "Không tìm thấy đơn hàng" }];
  if (order && method === "GET" && !orderMatch?.[2]) return [200, { order }];
  if (order && method === "POST" && orderMatch?.[2]) {
    Object.assign(order, { status: "CANCELLED", canCancel: false });
    return [200, { order }];
  }
  return [404, { message: `Mock API chưa hỗ trợ ${key}` }];
}

export const mockFetch: typeof fetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input), "https://mock.local");
  const body = typeof init.body === "string" && init.body ? JSON.parse(init.body) as Json : {};
  const [status, data] = route(init.method ?? "GET", url, body);
  await new Promise((resolve) => setTimeout(resolve, 150));
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
};

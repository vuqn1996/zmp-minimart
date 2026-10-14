import { HttpCustomerApi } from "../api.js";
import { mockFetch } from "../mock/mockFetch.js";

describe("mock backend", () => {
  it("prices a cart, applies the voucher and lists the created order", async () => {
    const api = new HttpCustomerApi("", mockFetch);
    const { branches } = await api.branches();
    const branchId = branches[0]!.id;
    const lines = [{ skuId: "sku-danisa-454g", quantity: 1 }];
    const quote = await api.checkoutQuote({ branchId, fulfillmentMethod: "DELIVERY", lines, voucherCode: "CHAOBAN" });
    expect(quote.totalVnd).toBe(String(135000 - 10000 + 15000));
    const { order } = await api.createOrder({ branchId, fulfillmentMethod: "DELIVERY", paymentMethod: "COD", quoteToken: quote.quoteToken, voucherCode: "CHAOBAN", idempotencyKey: "k" });
    expect((await api.orders()).orders.map(({ id }) => id)).toContain(order.id);
    expect((await api.cancelOrder(order.id)).order.status).toBe("CANCELLED");
  });
});

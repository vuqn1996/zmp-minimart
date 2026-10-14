import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSwipeable } from "react-swipeable";
import { Button, Icon, Modal, Sheet, Spinner } from "zmp-ui";

import type {
  Address,
  Branch,
  CheckoutQuote,
  CatalogState,
  CustomerApi,
  CustomerProfile,
  InvoiceRequest,
} from "../api.js";
import markUrl from "../assets/mark.svg";
import { AddressEditorSheet } from "../address/AddressEditorSheet.js";
import { InvoiceProfileEditor } from "../invoice/InvoiceProfileEditor.js";

const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });

interface CheckoutSubmission {
  allowedPaymentMethods?: Array<"COD" | "ZALOPAY">;
  quoteToken: string;
  note?: string;
  invoiceRequest?: InvoiceRequest;
}

function lineSignature(lines: Array<{ skuId: string; quantity: number }>): string {
  return lines.slice().sort((left, right) => left.skuId.localeCompare(right.skuId)).map((line) => `${line.skuId}:${line.quantity}`).join("|");
}

function CheckoutLine({
  line,
  onQuantity,
  onRequestRemove,
}: {
  line: CheckoutQuote["lines"][number];
  onQuantity: (skuId: string, quantity: number) => Promise<boolean>;
  onRequestRemove: (line: CheckoutQuote["lines"][number], remove: () => void) => void;
}) {
  const [swipeX, setSwipeX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState(false);
  const revealed = useRef(false);
  const removalTimer = useRef<number | null>(null);
  useEffect(() => () => { if (removalTimer.current !== null) window.clearTimeout(removalTimer.current); }, []);

  function removeAfterFade(): void {
    if (removing) return;
    setRemoving(true);
    removalTimer.current = window.setTimeout(() => {
      removalTimer.current = null;
      void onQuantity(line.skuId, 0).then((saved) => { if (!saved) setRemoving(false); }, () => setRemoving(false));
    }, window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 200);
  }

  const swipeHandlers = useSwipeable({
    delta: 8,
    onSwiping: ({ dir, absX }) => {
      if (dir !== "Left" && dir !== "Right") return;
      setDragging(true);
      setSwipeX(dir === "Left" ? Math.min(80, (revealed.current ? 80 : 0) + absX) : Math.max(0, (revealed.current ? 80 : 0) - absX));
    },
    onSwipedLeft: () => {
      setDragging(false);
      revealed.current = true;
      setSwipeX(80);
    },
    onSwipedRight: () => { revealed.current = false; setDragging(false); setSwipeX(0); },
  });

  return (
    <article className={`checkout-line${removing ? " checkout-line-removing" : ""}`} data-swipe-back-ignore {...swipeHandlers} onTouchCancel={() => { setDragging(false); setSwipeX(revealed.current ? 80 : 0); }}>
      <button className="checkout-line-swipe-label" type="button" aria-label={`Xóa ${line.productName} bằng vuốt`} aria-hidden={!revealed.current} tabIndex={revealed.current ? 0 : -1} onClick={() => onRequestRemove(line, removeAfterFade)}><Icon icon="zi-delete" /></button>
      <div className="checkout-line-content" style={{ transform: `translate3d(-${swipeX}px, 0, 0)`, transition: dragging ? "none" : undefined }}>
        <img src={line.imageUrl ?? markUrl} alt="" />
        <div><strong>{line.productName}</strong><small>{line.skuName} · {line.skuCode}</small>{Number(line.discountVnd) > 0 && <span className="sale-price"><s>{money.format(Number(line.listUnitPriceVnd))}</s> {money.format(Number(line.saleUnitPriceVnd))}</span>}</div>
        <div className="checkout-line-tail"><b>{money.format(Number(line.lineTotalVnd))}</b><div className="compact-stepper"><button aria-label={`Giảm ${line.productName}`} onClick={() => void onQuantity(line.skuId, line.quantity - 1)}>−</button><input key={`${line.skuId}:${line.quantity}`} aria-label={`Số lượng ${line.productName}`} type="number" min="0" inputMode="numeric" defaultValue={line.quantity} onBlur={(event) => { const quantity = Number(event.currentTarget.value); if (Number.isSafeInteger(quantity) && quantity >= 0 && quantity !== line.quantity) void onQuantity(line.skuId, quantity); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><button aria-label={`Tăng ${line.productName}`} onClick={() => void onQuantity(line.skuId, line.quantity + 1)}>+</button></div><button className="checkout-line-remove" type="button" aria-label={`Xóa ${line.productName}`} onClick={() => onRequestRemove(line, removeAfterFade)}>Xóa</button></div>
      </div>
    </article>
  );
}

export function CheckoutPage({
  api,
  profile = null,
  branch,
  addresses,
  selectedAddressId,
  fulfillment,
  busy,
  cartQuantities,
  quoteLines,
  catalogState,
  enforceServiceArea = true,
  onBack,
  onAddresses,
  onFulfillment,
  onQuantity,
  onCheckout,
  onSaveInvoiceProfile = async () => {},
}: {
  api: CustomerApi;
  profile?: CustomerProfile | null;
  branch: Branch;
  addresses: Address[];
  selectedAddressId: string | null;
  fulfillment: "DELIVERY" | "PICKUP";
  busy: boolean;
  cartQuantities: Record<string, number>;
  quoteLines?: Array<{ skuId: string; quantity: number }>;
  catalogState?: CatalogState | null;
  enforceServiceArea?: boolean;
  onBack: () => void;
  onAddresses: (addresses: Address[]) => void;
  onFulfillment: (method: "DELIVERY" | "PICKUP") => void;
  onQuantity: (skuId: string, quantity: number) => Promise<boolean> | boolean | void;
  onCheckout: (submission: CheckoutSubmission) => void;
  onSaveInvoiceProfile?: (invoice: InvoiceRequest) => Promise<void>;
}) {
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteExpired, setQuoteExpired] = useState(false);
  const [invoiceSheetOpen, setInvoiceSheetOpen] = useState(false);
  const [addressEditorOpen, setAddressEditorOpen] = useState(false);
  const [lineToRemove, setLineToRemove] = useState<{ line: CheckoutQuote["lines"][number]; remove: () => void } | null>(null);
  const [invoiceEnabled, setInvoiceEnabled] = useState(() => Boolean(profile?.invoiceProfile));
  const [invoiceRequest, setInvoiceRequest] = useState<InvoiceRequest | null>(() => profile?.invoiceProfile ?? null);
  const [note, setNote] = useState("");
  const requestRef = useRef(0);
  const loadedQuoteKeyRef = useRef<string | null>(null);
  const requestedLines = useMemo(
    () => quoteLines ?? Object.entries(cartQuantities).map(([skuId, quantity]) => ({ skuId, quantity })),
    [quoteLines, cartQuantities],
  );
  const quoteKey = `${branch.id}|${fulfillment}|${lineSignature(requestedLines)}`;

  const loadQuote = useCallback(async (lines = requestedLines) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    loadedQuoteKeyRef.current = `${branch.id}|${fulfillment}|${lineSignature(lines)}`;
    setQuoteLoading(true);
    setQuoteError(null);
    setQuoteExpired(false);
    try {
      const next = await api.checkoutQuote({
        branchId: branch.id,
        fulfillmentMethod: fulfillment,
        lines,
      });
      if (requestRef.current !== requestId) return;
      setQuote(next);
    } catch (reason) {
      if (requestRef.current !== requestId) return;
      setQuote(null);
      setQuoteError(reason instanceof Error ? reason.message : "Không thể xác minh đơn hàng");
    } finally {
      if (requestRef.current === requestId) setQuoteLoading(false);
    }
  }, [api, branch.id, fulfillment, requestedLines]);

  useEffect(() => {
    if (loadedQuoteKeyRef.current === quoteKey) return;
    void loadQuote();
    // Cart changes deliberately retrigger a server-authoritative quote.
  }, [loadQuote, quoteKey]);

  useEffect(() => {
    if (!quote) return;
    const delay = new Date(quote.quoteExpiresAt).getTime() - Date.now();
    if (delay <= 0) {
      setQuoteExpired(true);
      return;
    }
    const timeout = window.setTimeout(() => setQuoteExpired(true), Math.min(delay, 2_147_483_647));
    return () => window.clearTimeout(timeout);
  }, [quote]);

  useEffect(() => {
    if (!profile?.invoiceProfile || invoiceRequest) return;
    setInvoiceRequest(profile.invoiceProfile);
    setInvoiceEnabled(true);
  }, [invoiceRequest, profile?.invoiceProfile]);

  const selectedAddress = addresses.find((address) => address.id === selectedAddressId)
    ?? addresses.find((address) => address.isDefault)
    ?? addresses[0];
  const allowedPaymentMethods = useMemo(
    () => quote?.allowedPaymentMethods ?? catalogState?.allowedPaymentMethods ?? ["COD", "ZALOPAY"],
    [quote?.allowedPaymentMethods, catalogState?.allowedPaymentMethods],
  );
  const deliveryAllowed = branch.fulfillmentMethods?.includes("DELIVERY") ?? true;
  const pickupAllowed = branch.fulfillmentMethods?.includes("PICKUP") ?? allowedPaymentMethods.includes("ZALOPAY");
  const addressServiceable = !enforceServiceArea || !selectedAddress?.serviceability || (
    selectedAddress.serviceability.status === "IN_AREA" &&
    selectedAddress.serviceability.branchId === branch.id &&
    !selectedAddress.serviceability.needsRefresh
  );
  const canCheckout = Boolean(
    quote &&
    !quoteLoading &&
    !quoteExpired &&
    !quoteError &&
    allowedPaymentMethods.length > 0 &&
    (fulfillment === "PICKUP" || (deliveryAllowed && selectedAddress && addressServiceable)) &&
    (!invoiceEnabled || invoiceRequest) &&
    !(fulfillment === "PICKUP" && !pickupAllowed),
  );

  async function changeQuantity(skuId: string, quantity: number): Promise<boolean> {
    const saved = await onQuantity(skuId, quantity);
    if (saved === false) return false;
    const next = Object.fromEntries(requestedLines.map((line) => [line.skuId, line.quantity]));
    if (quantity <= 0) delete next[skuId];
    else next[skuId] = quantity;
    if (Object.keys(next).length > 0) await loadQuote(Object.entries(next).map(([id, nextQuantity]) => ({ skuId: id, quantity: nextQuantity })));
    return true;
  }

  return (
    <section className="checkout-page">
      <header className="checkout-header">
        <button onClick={onBack} aria-label="Quay lại"><Icon icon="zi-chevron-left" /></button>
        <div><h1>Thanh toán</h1><span>{branch.name}</span></div>
      </header>

      <div className="checkout-content">
        <section className="checkout-card fulfillment-card" aria-labelledby="checkout-fulfillment">
          <h2 id="checkout-fulfillment">Cách nhận hàng</h2>
          <div className="segmented-choice">
            <label className={deliveryAllowed ? "" : "disabled"}><input aria-label="Giao tận nơi" type="radio" name="fulfillment" checked={fulfillment === "DELIVERY"} disabled={!deliveryAllowed} onChange={() => onFulfillment("DELIVERY")} /><Icon icon="zi-location" /><span>Giao tận nơi<small>{deliveryAllowed ? "Đến địa chỉ của bạn" : "Cửa hàng này chỉ hỗ trợ nhận tại chỗ"}</small></span></label>
            <label className={pickupAllowed ? "" : "disabled"}><input aria-label="Nhận tại cửa hàng" type="radio" name="fulfillment" checked={fulfillment === "PICKUP"} disabled={!pickupAllowed} onChange={() => onFulfillment("PICKUP")} /><Icon icon="zi-location" /><span>Nhận tại cửa hàng<small>{pickupAllowed ? branch.name : "Tạm khóa trong lúc cập nhật danh mục"}</small></span></label>
          </div>
        </section>

        {fulfillment === "DELIVERY" && (
          <section className="checkout-card address-card">
            <div className="checkout-card-heading"><h2>Địa chỉ giao hàng</h2>{selectedAddress && <button onClick={() => setAddressEditorOpen(true)}>Thay đổi</button>}</div>
            {selectedAddress ? (
              <div className="address-summary"><span><Icon icon="zi-location-solid" /></span><div><strong>{selectedAddress.recipientName} · {selectedAddress.phone}</strong><p>{[selectedAddress.line1, selectedAddress.ward, selectedAddress.district, selectedAddress.province].filter(Boolean).join(", ")}</p></div></div>
            ) : (
              <div className="checkout-empty-inline"><p>Chưa có địa chỉ giao hàng.</p><Button size="small" onClick={() => setAddressEditorOpen(true)}>Thêm địa chỉ</Button></div>
            )}
            {selectedAddress && <button className="invoice-edit" type="button" onClick={() => setAddressEditorOpen(true)}>Kiểm tra / dùng lại vị trí hiện tại</button>}
            {selectedAddress && !addressServiceable && <div className="checkout-inline-alert" role="alert"><Icon icon="zi-warning" /><span>Địa chỉ này chưa thuộc khu vực của cửa hàng hiện tại. Hãy cập nhật địa chỉ hoặc vị trí.</span></div>}
          </section>
        )}

        {quoteLoading && !quote ? (
          <div className="checkout-skeleton" role="status" aria-label="Đang tính đơn hàng"><span /><span /><span /></div>
        ) : quote ? (
          <>
            <section className="checkout-card product-summary-card">
              <div className="checkout-card-heading"><h2>Tóm tắt đơn hàng</h2><span>{quote.lines.length} sản phẩm</span></div>
              {quote.lines.map((line) => <CheckoutLine key={line.skuId} line={line} onQuantity={changeQuantity} onRequestRemove={(selected, remove) => setLineToRemove({ line: selected, remove })} />)}
            </section>

            <section className="checkout-card order-note-card">
              <label>Ghi chú đơn hàng
                <textarea value={note} maxLength={500} rows={3} placeholder="Ví dụ: Giao sau 18 giờ" onChange={(event) => setNote(event.target.value)} />
              </label>
            </section>

            {quote.offerProducts.length > 0 && (
              <section className="checkout-section offer-section">
                <h2>Thêm ưu đãi trước khi đặt món</h2>
                <div className="offer-rail">
                  {quote.offerProducts.map((offer) => (
                    <article key={offer.offerId} className="offer-card">
                      <img src={offer.imageUrl ?? markUrl} alt="" />
                      <strong>{offer.productName}</strong><small>{offer.skuName}</small>
                      <div><span><b>{money.format(Number(offer.offerPriceVnd))}</b><s>{money.format(Number(offer.listUnitPriceVnd))}</s></span><button disabled={!offer.eligible} aria-label={`Thêm ${offer.productName}`} onClick={() => void changeQuantity(offer.skuId, (cartQuantities[offer.skuId] ?? 0) + 1)}>+</button></div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section className="checkout-card invoice-toggle-card">
              <div><span><Icon icon="zi-note" /></span><div><strong>Yêu cầu hóa đơn điện tử</strong><small>Thông tin mặc định được lưu trong tài khoản</small></div></div>
              <label className="switch"><input aria-label="Yêu cầu hóa đơn điện tử" type="checkbox" checked={invoiceEnabled} onChange={(event) => { setInvoiceEnabled(event.target.checked); if (event.target.checked) setInvoiceSheetOpen(true); else setInvoiceRequest(null); }} /><span /></label>
              {invoiceEnabled && invoiceRequest && <button className="invoice-edit" onClick={() => setInvoiceSheetOpen(true)}>Đã nhập thông tin · Sửa</button>}
            </section>

            <section className="checkout-card bill-card">
              <h2>Chi tiết hóa đơn</h2>
              <small className="vat-included-note">Giá đã gồm VAT</small>
              <p><span>Tạm tính</span><b>{money.format(Number(quote.itemsSubtotalVnd))}</b></p>
              {Number(quote.itemsDiscountVnd) > 0 && <p className="discount-row"><span>Giảm giá sản phẩm</span><b>−{money.format(Number(quote.itemsDiscountVnd))}</b></p>}
              {Number(quote.orderDiscountVnd) > 0 && <p className="discount-row"><span>Giảm giá đơn hàng</span><b>−{money.format(Number(quote.orderDiscountVnd))}</b></p>}
              <p><span>Phí giao hàng</span><b>{money.format(Number(quote.deliveryFeeVnd))}</b></p>
              {Number(quote.deliveryDiscountVnd) > 0 && <p className="discount-row"><span>Giảm phí giao</span><b>−{money.format(Number(quote.deliveryDiscountVnd))}</b></p>}
              <p className="bill-total"><span>Tổng thanh toán</span><b>{money.format(Number(quote.totalVnd))}</b></p>
            </section>

          </>
        ) : null}

        {(quoteError || quoteExpired) && <div className="checkout-inline-alert" role="alert"><Icon icon="zi-warning" /><span>{quoteExpired ? "Báo giá đã hết hạn. Vui lòng cập nhật lại." : quoteError}</span><button onClick={() => void loadQuote()}>Thử lại</button></div>}
      </div>

      {quote?.paymentRestriction === "BEER_REQUIRES_ZALOPAY" && <p className="checkout-inline-alert" role="status">Giỏ có bia chỉ hỗ trợ ZaloPay. Bỏ bia để chọn COD.</p>}
      {quote && allowedPaymentMethods.length === 0 && <p className="checkout-inline-alert" role="alert">Hiện không có phương thức thanh toán phù hợp. Hãy cập nhật giỏ hàng.</p>}
      {quote && (
        <footer className="checkout-bar">
          <div><small>Tổng thanh toán</small><strong>{money.format(Number(quote.totalVnd))}</strong></div>
          <Button loading={busy} disabled={busy || !canCheckout} onClick={() => onCheckout({
            quoteToken: quote.quoteToken,
            allowedPaymentMethods: allowedPaymentMethods as Array<"COD" | "ZALOPAY">,
            ...(note.trim() ? { note: note.trim() } : {}),
            ...(invoiceEnabled && invoiceRequest ? { invoiceRequest } : {}),
          })}>Đặt mua</Button>
        </footer>
      )}

      <AddressEditorSheet visible={addressEditorOpen} address={selectedAddress ?? null} profile={profile} api={api} onClose={() => setAddressEditorOpen(false)} onAddresses={onAddresses} />
      <Sheet visible={invoiceSheetOpen} title="Yêu cầu hóa đơn điện tử" onClose={() => { setInvoiceSheetOpen(false); setInvoiceEnabled(Boolean(invoiceRequest ?? profile?.invoiceProfile)); }} autoHeight>
        <InvoiceProfileEditor
          value={invoiceRequest ?? profile?.invoiceProfile}
          submitLabel="Lưu yêu cầu"
          onSave={async (invoice) => {
            await onSaveInvoiceProfile(invoice);
            setInvoiceRequest(invoice);
            setInvoiceSheetOpen(false);
          }}
        />
      </Sheet>
      <Modal className="checkout-remove-modal" visible={Boolean(lineToRemove)} title="Xóa sản phẩm?" onClose={() => setLineToRemove(null)} unmountOnClose>
        {lineToRemove && <div className="checkout-remove-confirm">
          <p>Xóa <strong>{lineToRemove.line.productName}</strong> khỏi giỏ hàng?</p>
          <div className="checkout-remove-actions">
            <Button fullWidth variant="secondary" onClick={() => setLineToRemove(null)}>Hủy</Button>
            <Button fullWidth type="danger" onClick={() => {
              lineToRemove.remove();
              setLineToRemove(null);
            }}>Xóa sản phẩm</Button>
          </div>
        </div>}
      </Modal>
      {quoteLoading && quote && <div className="quote-refreshing" role="status"><Spinner visible /><span>Đang cập nhật tổng tiền…</span></div>}
    </section>
  );
}

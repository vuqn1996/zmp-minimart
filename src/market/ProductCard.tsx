import { Icon } from "zmp-ui";

import type { CatalogProduct } from "../api.js";
import markUrl from "../assets/mark.svg";

interface ProductCardProps {
  product: CatalogProduct;
  quantity: number;
  cartQuantities?: Readonly<Record<string, number>>;
  variant?: "list" | "grid";
  quantityControlsOpen?: boolean;
  formatMoney: (value: number) => string;
  onOpen: (productId: string) => void;
  onQuantityChange: (skuId: string, quantity: number) => void;
  onQuantityControlsOpen?: () => void;
}

export function ProductCard({
  product,
  quantity,
  cartQuantities,
  variant = "list",
  quantityControlsOpen = false,
  formatMoney,
  onOpen,
  onQuantityChange,
  onQuantityControlsOpen,
}: ProductCardProps) {
  const sku = product.skus.find((item) => item.availableQuantity > 0);
  if (!sku) return null;
  const hasVariants = product.skus.length > 1;
  const selectedSkus = hasVariants ? product.skus.filter((item) => (cartQuantities?.[item.id] ?? 0) > 0) : [];
  const adjustableSku = hasVariants ? (selectedSkus.length === 1 ? selectedSkus[0] : null) : sku;
  const actionAriaLabel = `${hasVariants ? (adjustableSku && quantity > 0 ? "Chỉnh số lượng" : "Chọn") : "Thêm"} ${product.name}`;
  const openQuantityControls = () => onQuantityControlsOpen?.();
  const stepperOpen = Boolean(adjustableSku && quantity > 0 && quantityControlsOpen);

  return (
    <article className={`product-card product-card-${variant}`}>
      <div className="product-media">
        <button className="product-open" onClick={() => onOpen(product.id)} aria-label={`Xem ${product.name}`}>
          <div className="product-image">
            {product.imageUrl
              ? <img src={product.imageUrl} alt={product.name} loading="lazy" decoding="async" />
              : <img className="brand-placeholder" src={markUrl} alt="" loading="lazy" decoding="async" />}
          </div>
        </button>
        <div className="product-actions">
          {!adjustableSku ? (
            <button
              className={`product-quantity-control ${quantity > 0 ? "product-quantity-badge" : "product-add-button"}`}
              onClick={() => onOpen(product.id)}
              aria-label={actionAriaLabel}
            >
              {quantity > 0 ? quantity : <Icon icon="zi-plus" />}
            </button>
          ) : (
            <div className={`card-stepper stepper${stepperOpen ? " card-stepper-open" : ""}${quantity === 0 ? " card-stepper-empty" : ""}`} aria-label={`Số lượng ${product.name}`}>
              <button aria-label={`Giảm ${product.name}`} aria-hidden={!stepperOpen} tabIndex={stepperOpen ? 0 : -1} disabled={!stepperOpen} onClick={() => { onQuantityChange(adjustableSku.id, quantity - 1); openQuantityControls(); }}>−</button>
              <span className="card-stepper-count" aria-hidden={!stepperOpen}>{quantity}</span>
              <button
                className="card-stepper-action product-quantity-control"
                aria-label={stepperOpen ? `Tăng ${product.name}` : actionAriaLabel}
                onClick={() => {
                  if (stepperOpen) onQuantityChange(adjustableSku.id, quantity + 1);
                  else if (quantity === 0) { onQuantityChange(adjustableSku.id, 1); openQuantityControls(); }
                  else openQuantityControls();
                }}
              >
                <span className="card-stepper-collapsed" aria-hidden="true">{quantity > 0 ? quantity : <Icon icon="zi-plus" />}</span>
                <span className="card-stepper-expanded" aria-hidden="true"><Icon icon="zi-plus" /></span>
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="product-copy">
        <button className="product-name" onClick={() => onOpen(product.id)}><h3>{product.name}</h3></button>
        <div className="price-row">
          <strong>{formatMoney(Number(product.minimumPriceVnd))}</strong>
          <small>Đã gồm VAT</small>
        </div>
      </div>
    </article>
  );
}

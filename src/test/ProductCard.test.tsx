import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CatalogProduct } from "../api.js";
import { ProductCard } from "../market/ProductCard.js";

const product: CatalogProduct = {
  id: "product-1",
  name: "Sản phẩm không bán được",
  slug: "san-pham-khong-ban-duoc",
  categoryName: "Thực phẩm",
  recommended: false,
  imageUrl: null,
  minimumPriceVnd: "10000",
  skus: [],
};

describe("ProductCard", () => {
  it("does not render products without an available SKU", () => {
    const { rerender } = render(
      <ProductCard product={product} quantity={0} formatMoney={String} onOpen={vi.fn()} onQuantityChange={vi.fn()} />,
    );
    expect(screen.queryByRole("article")).not.toBeInTheDocument();

    rerender(
      <ProductCard
        product={{ ...product, skus: [{ id: "sku-1", code: "SKU-1", name: "Mặc định", priceVnd: "10000", availableQuantity: 0, active: true }] }}
        quantity={0}
        formatMoney={String}
        onOpen={vi.fn()}
        onQuantityChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("renders with grid and list variants", () => {
    const sellableProduct: CatalogProduct = {
      ...product,
      skus: [{ id: "sku-1", code: "SKU-1", name: "Mặc định", priceVnd: "10000", availableQuantity: 5, active: true }],
    };

    const { rerender } = render(
      <ProductCard
        product={sellableProduct}
        quantity={0}
        variant="grid"
        formatMoney={String}
        onOpen={vi.fn()}
        onQuantityChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("article")).toHaveClass("product-card-grid");
    expect(screen.getByText("Đã gồm VAT")).toBeInTheDocument();

    rerender(
      <ProductCard
        product={sellableProduct}
        quantity={0}
        variant="list"
        formatMoney={String}
        onOpen={vi.fn()}
        onQuantityChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("article")).toHaveClass("product-card-list");
  });

  it("uses an image-overlay quantity badge that opens the stepper", () => {
    const onQuantityChange = vi.fn();
    const onQuantityControlsOpen = vi.fn();
    const sellableProduct: CatalogProduct = {
      ...product,
      name: "Mì Indomie",
      skus: [{ id: "sku-1", code: "SKU-1", name: "Mặc định", priceVnd: "10000", availableQuantity: 24, active: true }],
    };
    const { rerender } = render(
      <ProductCard product={sellableProduct} quantity={0} variant="grid" formatMoney={String} onOpen={vi.fn()} onQuantityChange={onQuantityChange} onQuantityControlsOpen={onQuantityControlsOpen} />,
    );

    const action = () => screen.getByRole("article").querySelector(".product-actions")!;
    const stepper = action().querySelector(".card-stepper")!;
    expect(stepper).toHaveClass("card-stepper-empty");
    expect(stepper).not.toHaveClass("card-stepper-open");
    expect(action().parentElement).toHaveClass("product-media");
    expect(action().closest(".product-open")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Thêm Mì Indomie" }));
    expect(onQuantityChange).toHaveBeenCalledWith("sku-1", 1);
    expect(onQuantityControlsOpen).toHaveBeenCalledTimes(1);

    rerender(
      <ProductCard product={sellableProduct} quantity={12} quantityControlsOpen variant="grid" formatMoney={String} onOpen={vi.fn()} onQuantityChange={onQuantityChange} onQuantityControlsOpen={onQuantityControlsOpen} />,
    );
    expect(action().querySelector(".card-stepper")).toBe(stepper);
    expect(stepper).toHaveClass("card-stepper-open");
    expect(action()).toHaveTextContent("12");
    expect(screen.queryByRole("button", { name: "Thêm Mì Indomie" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tăng Mì Indomie" }));
    expect(onQuantityChange).toHaveBeenLastCalledWith("sku-1", 13);
    fireEvent.click(screen.getByRole("button", { name: "Giảm Mì Indomie" }));
    expect(onQuantityChange).toHaveBeenLastCalledWith("sku-1", 11);

    rerender(
      <ProductCard product={sellableProduct} quantity={12} variant="grid" formatMoney={String} onOpen={vi.fn()} onQuantityChange={onQuantityChange} onQuantityControlsOpen={onQuantityControlsOpen} />,
    );
    expect(action().querySelector(".card-stepper")).toBe(stepper);
    expect(stepper).not.toHaveClass("card-stepper-open");
    expect(screen.getByRole("button", { name: "Thêm Mì Indomie" })).toHaveTextContent("12");
    expect(screen.queryByRole("button", { name: "Tăng Mì Indomie" })).not.toBeInTheDocument();
  });

  it("keeps the plus button and opens the quick view when several units are available", () => {
    const onOpen = vi.fn();
    render(
      <ProductCard
        product={{
          ...product,
          name: "Mì Indomie",
          skus: [
            { id: "pack", code: "PACK", name: "Gói", priceVnd: "5000", availableQuantity: 24, active: true },
            { id: "carton", code: "CARTON", name: "Thùng", priceVnd: "120000", availableQuantity: 1, active: true },
          ],
        }}
        quantity={0}
        formatMoney={String}
        onOpen={onOpen}
        onQuantityChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Chọn Mì Indomie" }));
    expect(onOpen).toHaveBeenCalledWith("product-1");
  });

  it("lets a selected product variant be removed from the product list", () => {
    const onOpen = vi.fn();
    const onQuantityChange = vi.fn();
    const onQuantityControlsOpen = vi.fn();
    const multiPackProduct: CatalogProduct = {
      ...product,
      name: "Mì Indomie",
      skus: [
        { id: "pack", code: "PACK", name: "Gói", priceVnd: "5000", availableQuantity: 24, active: true },
        { id: "carton", code: "CARTON", name: "Thùng", priceVnd: "120000", availableQuantity: 4, active: true },
      ],
    };
    const renderCard = (quantityControlsOpen: boolean) => (
      <ProductCard
        product={multiPackProduct}
        quantity={1}
        cartQuantities={{ carton: 1 }}
        quantityControlsOpen={quantityControlsOpen}
        formatMoney={String}
        onOpen={onOpen}
        onQuantityChange={onQuantityChange}
        onQuantityControlsOpen={onQuantityControlsOpen}
      />
    );
    const { rerender } = render(renderCard(false));

    fireEvent.click(screen.getByRole("button", { name: "Chỉnh số lượng Mì Indomie" }));
    expect(onQuantityControlsOpen).toHaveBeenCalledOnce();
    rerender(renderCard(true));
    fireEvent.click(screen.getByRole("button", { name: "Tăng Mì Indomie" }));
    expect(onQuantityChange).toHaveBeenCalledWith("carton", 2);
    fireEvent.click(screen.getByRole("button", { name: "Giảm Mì Indomie" }));
    expect(onQuantityChange).toHaveBeenCalledWith("carton", 0);
    expect(onOpen).not.toHaveBeenCalled();
  });
});

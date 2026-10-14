import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, Input } from "zmp-ui";

import type { CatalogProduct } from "../api.js";
import { miniAppStorage } from "../storage.js";
import { ProductCard } from "./ProductCard.js";
import { compareCatalogProducts } from "./catalogSort.js";

const SEARCH_HISTORY_STORAGE_KEY = "shop_search_history_v1";
const SEARCH_HISTORY_LIMIT = 5;

function readSearchHistory(): string[] {
  try {
    const saved = JSON.parse(miniAppStorage.getItem(SEARCH_HISTORY_STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(saved)
      ? saved.filter((item): item is string => typeof item === "string" && item.trim() !== "").slice(0, SEARCH_HISTORY_LIMIT)
      : [];
  } catch {
    return [];
  }
}

interface SearchOverlayProps {
  visible: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (query: string) => void;
  products: CatalogProduct[];
  cart: Record<string, number>;
  formatMoney: (value: number) => string;
  onOpenProduct: (productId: string) => void;
  onQuantityChange: (skuId: string, quantity: number) => void;
  activeQuantityCard?: string | null;
  onOpenQuantityControls?: (cardKey: string) => void;
  bestSellingProducts?: CatalogProduct[];
}

export function SearchOverlay({
  visible,
  onClose,
  query,
  onQueryChange,
  products,
  cart,
  formatMoney,
  onOpenProduct,
  onQuantityChange,
  activeQuantityCard,
  onOpenQuantityControls,
  bestSellingProducts = [],
}: SearchOverlayProps) {
  const inputRef = useRef<{ focus: () => void } | null>(null);
  const [searchHistory, setSearchHistory] = useState(readSearchHistory);

  const saveSearch = useCallback((value: string): void => {
    const term = value.trim();
    if (!term) return;
    setSearchHistory((previous) => {
      const next = [term, ...previous.filter((item) => item.localeCompare(term, "vi", { sensitivity: "accent" }) !== 0)].slice(0, SEARCH_HISTORY_LIMIT);
      miniAppStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        saveSearch(query);
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible, onClose, query, saveSearch]);

  const trimmedQuery = query.trim();
  const matchingProducts = useMemo(() => {
    if (!trimmedQuery) return [];
    const lower = trimmedQuery.toLocaleLowerCase("vi");
    return products.filter((product) =>
      product.name.toLocaleLowerCase("vi").includes(lower),
    ).sort(compareCatalogProducts);
  }, [products, trimmedQuery]);

  if (!visible) return null;

  return (
    <div className="search-overlay" role="dialog" aria-modal="true" aria-label="Tìm kiếm sản phẩm">
      <header className="search-overlay-header">
        <div className="search-overlay-input">
          <Input
            ref={inputRef as never}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Tìm kiếm sản phẩm…"
            aria-label="Nhập từ khóa tìm kiếm"
            clearable
            autoFocus
            prefix={
              <button
                type="button"
                className="search-overlay-back"
                onMouseDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  saveSearch(query);
                  onClose();
                }}
                aria-label="Đóng tìm kiếm"
              >
                <Icon icon="zi-chevron-left" />
              </button>
            }
          />
        </div>
      </header>

      <div className="search-overlay-body">
        {trimmedQuery === "" ? (
          <div className="search-suggestions">
            {searchHistory.length > 0 && (
              <div className="search-suggestion-section">
                <h3>Tìm kiếm gần đây</h3>
                <div className="search-category-pills">
                  {searchHistory.map((term) => (
                    <button
                      key={term}
                      className="category-pill"
                      onClick={() => onQueryChange(term)}
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {bestSellingProducts.length > 0 && (
              <div className="search-suggestion-section">
                <h3>Sản phẩm bán chạy</h3>
                <div className="product-list">
                  {bestSellingProducts.map((product) => {
                    const quantity = product.skus.reduce((total, sku) => total + (cart[sku.id] ?? 0), 0);
                    return (
                      <ProductCard
                        key={product.id}
                        variant="list"
                        product={product}
                        quantity={quantity}
                        cartQuantities={cart}
                        formatMoney={formatMoney}
                        onOpen={(productId) => {
                          saveSearch(query);
                          onOpenProduct(productId);
                        }}
                        onQuantityChange={onQuantityChange}
                        quantityControlsOpen={activeQuantityCard === `search-suggestion:${product.id}`}
                        onQuantityControlsOpen={() => onOpenQuantityControls?.(`search-suggestion:${product.id}`)}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="search-results">
            {matchingProducts.length > 0 ? (
              <>
                <p className="search-result-count">
                  Tìm thấy <strong>{matchingProducts.length}</strong> sản phẩm
                </p>
                <div className="product-list">
                  {matchingProducts.map((product) => {
                    const quantity = product.skus.reduce((total, sku) => total + (cart[sku.id] ?? 0), 0);
                    return (
                      <ProductCard
                        key={product.id}
                        variant="list"
                        product={product}
                        quantity={quantity}
                        cartQuantities={cart}
                        formatMoney={formatMoney}
                        onOpen={(productId) => {
                          saveSearch(query);
                          onOpenProduct(productId);
                        }}
                        onQuantityChange={onQuantityChange}
                        quantityControlsOpen={activeQuantityCard === `search:${product.id}`}
                        onQuantityControlsOpen={() => onOpenQuantityControls?.(`search:${product.id}`)}
                      />
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="empty-state compact">
                <Icon icon="zi-search" />
                <h2>Không tìm thấy sản phẩm</h2>
                <p>Không có món nào khớp với &ldquo;{trimmedQuery}&rdquo;. Thử từ khóa khác.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

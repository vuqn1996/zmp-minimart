import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BottomNavigation,
  Button,
  Avatar,
  Icon,
  Page,
} from "zmp-ui";

import type { Branch, CustomerProfile } from "../api.js";
import markUrl from "../assets/mark.svg";
import { SHOP } from "../config.js";
import { BranchSelector } from "./BranchSelector.js";
import { usePresence } from "../usePresence.js";

export type MarketView = "home" | "cart" | "orders" | "account";

interface MarketLayoutProps {
  view: MarketView;
  branch?: Branch | undefined;
  branches: Branch[];
  branchSelectorOpen: boolean;
  locationManaged?: boolean;
  catalogControlsVisible?: boolean;
  onOpenBranchSelector: () => void;
  onSelectBranch: (branch: Branch) => void;
  onCloseBranchSelector: () => void;
  query?: string;
  cartCount: number;
  cartItemTypes: number;
  cartTotal: string;
  cartPreviewOpen: boolean;
  onOpenCartPreview: () => void;
  error: string | null;
  pageMotion?: "back" | "cart-exit" | null;
  onQueryChange?: (query: string) => void;
  onDismissError: () => void;
  onSelectView: (view: MarketView) => void;
  profile: CustomerProfile | null;
  children: ReactNode;
}

export function MarketLayout({
  view,
  branch,
  branches,
  branchSelectorOpen,
  locationManaged = false,
  onOpenBranchSelector,
  onSelectBranch,
  onCloseBranchSelector,
  cartCount,
  cartItemTypes,
  cartTotal,
  cartPreviewOpen,
  onOpenCartPreview,
  error,
  pageMotion = null,
  onDismissError,
  onSelectView,
  profile,
  children,
}: MarketLayoutProps) {
  const showsCatalogHeader = view === "home";
  const showsMarketHeader = view !== "cart";
  const hasBottomNav = view !== "cart" || cartCount === 0;
  const cartNavigationIcon = (
    <span className="bottom-nav-cart-icon">
      <Icon icon="zi-inbox" />
      {cartItemTypes > 0 && <b className="bottom-nav-cart-badge" aria-hidden="true">{cartItemTypes}</b>}
    </span>
  );
  const [bottomNavHidden, setBottomNavHidden] = useState(false);
  const noticePresence = usePresence(Boolean(error), 140);
  const cartPresence = usePresence(cartCount > 0 && view === "home" && !cartPreviewOpen, 120);
  const lastError = useRef(error);
  const lastCart = useRef({ count: cartCount, total: cartTotal });
  if (error) lastError.current = error;
  if (cartCount > 0) lastCart.current = { count: cartCount, total: cartTotal };

  useEffect(() => {
    if (view !== "home" || !hasBottomNav) {
      setBottomNavHidden(false);
      return;
    }
    let previousScrollTop = document.body.scrollTop;
    const updateBottomNavigation = () => {
      const scrollTop = document.body.scrollTop;
      if (scrollTop <= 8) setBottomNavHidden(false);
      else if (scrollTop - previousScrollTop >= 12) setBottomNavHidden(true);
      else if (previousScrollTop - scrollTop >= 4) setBottomNavHidden(false);
      previousScrollTop = scrollTop;
    };
    window.addEventListener("scroll", updateBottomNavigation, { passive: true });
    document.addEventListener("scroll", updateBottomNavigation, { capture: true, passive: true });
    return () => {
      window.removeEventListener("scroll", updateBottomNavigation);
      document.removeEventListener("scroll", updateBottomNavigation, true);
    };
  }, [hasBottomNav, view]);

  return (
    <Page
      className={`app-shell app-shell-${view}${!hasBottomNav ? " no-bottom-nav" : ""}${bottomNavHidden ? " bottom-nav-hidden" : ""}`}
      name={view}
      resetScroll={false}
      hideScrollbar
    >
      {showsMarketHeader && <header className="market-header compact">
        <div className="market-header-main">
          <img src={markUrl} alt="" />
          <button className="shop-identity" onClick={onOpenBranchSelector}>
            <strong>{SHOP.shopName}</strong>
            <span>{branch?.name ?? "Chọn chi nhánh để xem hàng"} · {locationManaged ? "nhấn để cập nhật vị trí" : "giá và tồn kho theo chi nhánh"}</span>
          </button>
          <Icon icon="zi-chevron-right" />
        </div>
      </header>}

      {noticePresence.mounted && (
        <div className={`notice motion-notice${noticePresence.active && error ? " motion-visible" : ""}`} role="alert" aria-hidden={!error}>
          <span>{lastError.current}</span>
          <Button
            className="notice-close"
            type="danger"
            variant="tertiary"
            size="small"
            icon={<Icon icon="zi-close" />}
            onClick={onDismissError}
            disabled={!error}
            aria-label="Đóng thông báo"
          />
        </div>
      )}

      <main className={`content${showsCatalogHeader ? " catalog-content" : ""}${view === "cart" ? " checkout-content-shell" : ""}${pageMotion ? ` page-motion-${pageMotion}` : ""}`}>{children}</main>

      <BranchSelector
        branches={branches}
        selectedBranchId={branch?.id}
        visible={branchSelectorOpen}
        required={!branch}
        onSelect={onSelectBranch}
        onClose={onCloseBranchSelector}
      />

      {cartPresence.mounted && (
        <button className={`floating-cart motion-floating-cart${cartPresence.active && cartCount > 0 && view === "home" && !cartPreviewOpen ? " motion-visible" : ""}`} onClick={onOpenCartPreview} aria-label={`Đặt mua ${lastCart.current.count} sản phẩm trong giỏ`} aria-hidden={!(cartCount > 0 && view === "home" && !cartPreviewOpen)} disabled={!(cartCount > 0 && view === "home" && !cartPreviewOpen)}>
          <span className="floating-cart-count"><Icon icon="zi-inbox" />{lastCart.current.count}</span>
          <strong>{lastCart.current.total}</strong>
          <span>Đặt mua <Icon icon="zi-chevron-right" /></span>
        </button>
      )}

      {hasBottomNav && <nav className={`bottom-nav-shell${bottomNavHidden ? " bottom-nav-hidden" : ""}`} aria-label="Điều hướng chính">
        <BottomNavigation
          activeKey={view === "orders" ? "account" : view}
          zIndex={10}
        >
          <BottomNavigation.Item key="home" itemKey="home" icon={<Icon icon="zi-home" />} activeIcon={<Icon icon="zi-home" />} label="Trang chủ" onClick={() => onSelectView("home")} />
          <BottomNavigation.Item key="cart" itemKey="cart" icon={cartNavigationIcon} activeIcon={cartNavigationIcon} label="Thanh toán" onClick={() => onSelectView("cart")} />
          <BottomNavigation.Item
            key="account"
            itemKey="account"
            aria-label="Cá nhân"
            icon={profile ? <Avatar className="bottom-nav-avatar" size={24} {...(profile.avatarUrl ? { src: profile.avatarUrl } : {})}>{profile.displayName?.slice(0, 1) ?? "8"}</Avatar> : <Icon icon="zi-user" />}
            activeIcon={profile ? <Avatar className="bottom-nav-avatar" size={24} {...(profile.avatarUrl ? { src: profile.avatarUrl } : {})}>{profile.displayName?.slice(0, 1) ?? "8"}</Avatar> : <Icon icon="zi-user-solid" />}
            label="Cá nhân"
            onClick={() => onSelectView("account")}
          />
        </BottomNavigation>
      </nav>}
    </Page>
  );
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type TouchEvent as ReactTouchEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSwipeable } from "react-swipeable";
import { Avatar, Button, Icon, Input, Sheet, Spinner } from "zmp-ui";
import type { Address, Branch, CatalogCampaign, CatalogCategory, CatalogProduct, CatalogState, CustomerApi, CustomerOrder, CustomerProfile, InvoiceRequest, OrderStatus } from "./api.js";
import { DATA_DELETION_LOGIN_REQUIRED_KEY, DATA_DELETION_PENDING_KEY, HttpCustomerApi } from "./api.js";
import { openCheckout, selectCheckoutPaymentMethod, subscribeToCheckoutResume } from "./checkout.js";
import { createClientId } from "./clientId.js";
import { normalizeCartQuantity, normalizeRestoredCart } from "./cart.js";
import { MarketLayout, type MarketView } from "./market/MarketLayout.js";
import { ProductCard } from "./market/ProductCard.js";
import { CampaignIcons, CampaignPopup, HomeCampaignBanners } from "./market/HomeBanners.js";
import { compareCatalogProducts } from "./market/catalogSort.js";
import { CategorySelector, categoryIconFor, type CategoryTreeNode } from "./market/CategorySelector.js";
import { SearchOverlay } from "./market/SearchOverlay.js";
import { BRANCH_STORAGE_KEY, readRememberedBranch, rememberBranch, resolveSelectedBranch } from "./branch.js";
import { getZaloLocationPermission, getZaloLoginPermission, isZaloLocationDenied, openZaloLocationPermissionSettings, requestZaloLocation, requestZaloPhoneToken, requestZaloUserInfo } from "./zaloUser.js";
import { CheckoutPage } from "./checkout/CheckoutPage.js";
import { InvoiceProfileEditor } from "./invoice/InvoiceProfileEditor.js";
import { ProductImageViewer } from "./market/ProductImageViewer.js";
import { AddressEditorSheet } from "./address/AddressEditorSheet.js";
import { PRIVACY_NOTICE_VERSION, type AccountInfoSection } from "./legal/appInfo.js";
import { DataDeletionPanel } from "./legal/DataDeletionPanel.js";
import { TermsSheet } from "./legal/TermsSheet.js";
import markUrl from "./assets/mark.svg";
import { SHOP } from "./config.js";
import { mockFetch } from "./mock/mockFetch.js";
import emptyCartUrl from "./assets/empty-cart.svg";
import deliveryTruckUrl from "./assets/delivery-truck.svg";
import { miniAppStorage } from "./storage.js";
import { usePresence } from "./usePresence.js";
import { isBackSwipe, SWIPE_BACK_MIN_DISTANCE_PX } from "./swipeBack.js";

type View = MarketView;
type Cart = Record<string, number>;
type CatalogViewMode = "grid" | "list";
type CatalogGroupingMode = "category" | "brand";
const CATALOG_BATCH_SIZE = 40;
const NOTICE_DURATION_MS = 5_000;
const CATALOG_VIEW_MODE_KEY = "shop_catalog_view_mode";
const QUANTITY_CONTROLS_TIMEOUT_MS = 2_000;
const HOME_DOUBLE_TAP_WINDOW_MS = 500;
const PENDING_ORDER_STORAGE_KEY = "shop_pending_order";
const ADULT_CONFIRMATION_SESSION_KEY = "shop_adult_confirmation_v1";
const CAMPAIGN_POPUP_DATE_KEY = "shop_campaign_popup_date_v1";
// Temporarily disabled for development and testing.
const SERVICE_AREA_ENFORCEMENT_ENABLED = false;
const LOCATION_DENIED_STORAGE_KEY = "shop_location_denied_v1";
type OrderFilter = "ALL" | OrderStatus;
const ORDER_FILTERS: ReadonlyArray<{ id: OrderFilter; label: string }> = [
  { id: "PENDING_PAYMENT", label: "Chờ thanh toán" },
  { id: "DRAFT", label: "Phiếu tạm" },
  { id: "CONFIRMED", label: "Đã xác nhận" },
  { id: "DELIVERING", label: "Đang giao hàng" },
  { id: "COMPLETED", label: "Hoàn thành" },
  { id: "CANCELLED", label: "Đã huỷ" },
  { id: "ALL", label: "Tất cả" },
];
const OPEN_ORDER_STATUSES = new Set<OrderStatus>([
  "PENDING_PAYMENT",
  "DRAFT",
  "CONFIRMED",
  "DELIVERING",
]);
const ACCOUNT_ORDER_FILTERS: ReadonlyArray<{
  id: "PENDING_PAYMENT" | "CONFIRMED" | "DELIVERING" | "COMPLETED";
  label: string;
  icon: "zi-inbox" | "zi-clock-1" | "zi-check-circle" | "zi-close-circle" | null;
}> = [
  { id: "PENDING_PAYMENT", label: "Chờ thanh toán", icon: "zi-inbox" },
  { id: "CONFIRMED", label: "Đã xác nhận", icon: "zi-check-circle" },
  { id: "DELIVERING", label: "Đang giao hàng", icon: null },
  { id: "COMPLETED", label: "Hoàn thành", icon: "zi-check-circle" },
];

function latestOrderFilter(orders: CustomerOrder[]): OrderFilter {
  const latest = orders.filter((order) => OPEN_ORDER_STATUSES.has(order.status)).reduce<CustomerOrder | undefined>((current, order) => {
    const currentUpdatedAt = current ? Date.parse(current.syncStatusUpdatedAt ?? current.createdAt) : Number.NEGATIVE_INFINITY;
    const orderUpdatedAt = Date.parse(order.syncStatusUpdatedAt ?? order.createdAt);
    return orderUpdatedAt > currentUpdatedAt ? order : current;
  }, undefined);
  return ORDER_FILTERS.find((filter) => filter.id === latest?.status)?.id ?? "ALL";
}

function visibleCatalogProducts(products: CatalogProduct[]): CatalogProduct[] {
  return products.flatMap((product) => {
    const path = productCategoryPath(product);
    if (isHiddenCategory(path) || (isAgeRestrictedCategory(path) && !path.some(isBeerCategory))) return [];
    const skus = product.skus
      .map((sku) => ({ ...sku, availableQuantity: normalizeCartQuantity(sku.availableQuantity) }))
      .filter((sku) => sku.availableQuantity > 0);
    return skus.length > 0 ? [{
      ...product,
      skus,
      minimumPriceVnd: skus.reduce((minimum, sku) => Number(sku.priceVnd) < Number(minimum) ? sku.priceVnd : minimum, skus[0]!.priceVnd),
    }] : [];
  });
}

function normalizedCategory(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi").replace(/đ/g, "d");
}

function isBeerCategory(name: string): boolean {
  const normalized = normalizedCategory(name);
  return /^bia(?=\s|\(|$)/.test(normalized)
    && !/(^|\s)(ruou|thuoc)(?=\s|\(|$)/.test(normalized);
}

function isHiddenCategory(path: string[]): boolean {
  return path.some((name) => {
    const normalized = normalizedCategory(name);
    return /(^|\s)thuoc\s+la(?=\s|\(|$)/.test(normalized)
      || /(^|\s)ruou(?=\s|\(|$)/.test(normalized) && !/(^|\s)bia(?=\s|\(|$)/.test(normalized);
  });
}

function isAgeRestrictedCategory(path: string[]): boolean {
  return path.some((name) => isBeerCategory(name)
    || /(^|\s)(bia|do\s+uong\s+co\s+con)(?=\s|\(|$)/.test(normalizedCategory(name)));
}

function visibleCategoryTree(nodes: CategoryTreeNode[]): CategoryTreeNode[] {
  return nodes.filter((node) => !isHiddenCategory(node.path))
    .map((node) => ({ ...node, children: visibleCategoryTree(node.children) }))
    .filter((node) => !isAgeRestrictedCategory(node.path)
      || node.path.some(isBeerCategory) || node.children.length > 0);
}

function readAdultConfirmation(): boolean {
  try {
    return window.sessionStorage.getItem(ADULT_CONFIRMATION_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function productCategoryPath(product: CatalogProduct): string[] {
  return product.categoryPath?.length ? product.categoryPath : [product.categoryName];
}

function categoryTreeFromProducts(products: CatalogProduct[]): CategoryTreeNode[] {
  const roots: CategoryTreeNode[] = [];
  for (const product of products) {
    let nodes = roots;
    const path: string[] = [];
    for (const name of productCategoryPath(product).slice(0, 3)) {
      path.push(name);
      let node = nodes.find((candidate) => candidate.name === name);
      if (!node) {
        node = { name, path: [...path], children: [] };
        nodes.push(node);
      }
      nodes = node.children;
    }
  }
  const sortNodes = (nodes: CategoryTreeNode[]) => {
    nodes.sort((left, right) => left.name.localeCompare(right.name, "vi"));
    nodes.forEach((node) => sortNodes(node.children));
  };
  sortNodes(roots);
  return roots;
}

function categoryTree(categories: CatalogCategory[] | undefined, products: CatalogProduct[]): CategoryTreeNode[] {
  if (!categories?.length) return categoryTreeFromProducts(products);
  const byParent = new Map<string | null, CatalogCategory[]>();
  const ids = new Set(categories.map((category) => category.id));
  for (const category of categories) {
    const parentId = category.parentId && ids.has(category.parentId) && category.parentId !== category.id
      ? category.parentId
      : null;
    const siblings = byParent.get(parentId) ?? [];
    siblings.push(category);
    byParent.set(parentId, siblings);
  }
  const sortCategories = (siblings: CatalogCategory[]) => siblings.sort(
    (left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER)
      || left.name.localeCompare(right.name, "vi")
      || Number(left.id) - Number(right.id),
  );
  const build = (parentId: string | null, path: string[]): CategoryTreeNode[] => sortCategories(byParent.get(parentId) ?? [])
    .map((category) => ({
      name: category.name,
      path: [...path, category.name],
      rank: category.rank,
      children: path.length < 2 ? build(category.id, [...path, category.name]) : [],
    }));
  return build(null, []);
}

function categorySectionId(path: string[]) {
  return `catalog-level-three-${encodeURIComponent(path.slice(0, 3).join("\u0001"))}`;
}

function brandSectionId(category: string, brand: string | null) {
  return `catalog-brand-${encodeURIComponent(`${category}\u0001${brand ?? "\u0000"}`)}`;
}

function dashboardCategoryId(path: string[]) {
  return `dashboard-category-${encodeURIComponent(path.join("\u0001"))}`;
}

function orderCategoryProducts(products: CatalogProduct[], children: CategoryTreeNode[]): CatalogProduct[] {
  const groups = new Map<string, CatalogProduct[]>();
  for (const product of products) {
    const key = productCategoryPath(product).slice(0, 3).join("\u0001");
    const group = groups.get(key) ?? [];
    group.push(product);
    groups.set(key, group);
  }
  const position = (name: string | undefined, nodes: CategoryTreeNode[]) => {
    const index = nodes.findIndex((node) => node.name === name);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  return [...groups.entries()].sort(([left], [right]) => {
    const leftPath = left.split("\u0001");
    const rightPath = right.split("\u0001");
    const levelTwo = position(leftPath[1], children) - position(rightPath[1], children);
    if (levelTwo) return levelTwo;
    const leftChildren = children.find((node) => node.name === leftPath[1])?.children ?? [];
    const rightChildren = children.find((node) => node.name === rightPath[1])?.children ?? [];
    return position(leftPath[2], leftChildren) - position(rightPath[2], rightChildren)
      || left.localeCompare(right, "vi");
  }).flatMap(([, group]) => group.sort(compareCatalogProducts));
}

function productDescriptionNode(node: Node, key: string): ReactNode {
  if (node.nodeType === 3) return node.textContent;
  if (node.nodeType !== 1) return null;
  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  if (["script", "style", "template", "noscript"].includes(tag)) return null;
  const children = Array.from(element.childNodes).map((child, index) => productDescriptionNode(child, `${key}-${index}`));
  if (/^h[1-6]$/.test(tag)) return <h3 key={key}>{children}</h3>;
  if (tag === "p") return <p key={key}>{children}</p>;
  if (tag === "strong" || tag === "b") return <strong key={key}>{children}</strong>;
  if (tag === "em" || tag === "i") return <em key={key}>{children}</em>;
  if (tag === "br") return <br key={key} />;
  if (tag === "ul" || tag === "ol" || tag === "li") {
    const Tag = tag;
    return <Tag key={key}>{children}</Tag>;
  }
  return <span key={key}>{children}</span>;
}

function ProductDescription({ value }: { value: string | null | undefined }) {
  if (!value?.trim()) return null;
  const body = new DOMParser().parseFromString(value, "text/html").body;
  if (!body.textContent?.trim()) return null;
  return (
    <section className="product-description" aria-labelledby="product-description-title">
      <h2 id="product-description-title">Mô tả sản phẩm</h2>
      <div className="product-description-content">
        {Array.from(body.childNodes).map((node, index) => productDescriptionNode(node, String(index)))}
      </div>
    </section>
  );
}

function viewFromPath(pathname: string): View {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "orders") return "orders";
  const candidate = segments.at(-1);
  return candidate === "cart" || candidate === "orders" || candidate === "account"
    ? candidate
    : "home";
}

function pathForView(view: View): string {
  return view === "home" ? "/" : `/${view}`;
}

const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });
const vietnamDate = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

function statusLabel(status: string): string {
  return (
    {
      DRAFT: "Phiếu tạm",
      PENDING_PAYMENT: "Chờ thanh toán",
      CONFIRMED: "Đã xác nhận",
      DELIVERING: "Đang giao hàng",
      COMPLETED: "Hoàn thành",
      CANCELLED: "Đã huỷ",
      PENDING: "Chưa thanh toán",
      PAID: "Đã thanh toán",
      PROCESSING: "Đang xác minh",
      RECONCILING: "Đang xác minh",
      REVIEW_REQUIRED: "Cần kiểm tra",
      TEST: "Hệ thống đã nhận đơn thử nghiệm",
      ACCEPTED: "Đã tiếp nhận",
      PENDING_REVIEW: "Hệ thống chờ duyệt",
      QUEUED: "Hệ thống đang xếp hàng",
      SUBMIT_UNCERTAIN: "Hệ thống cần đối soát",
      SUBMITTED: "Đã gửi hệ thống bán hàng",
      REJECTED: "Hệ thống từ chối",
      FAILED: "Thanh toán thất bại",
    }[status] ?? status
  );
}

function checkoutExpiryLabel(value: string, now: number): string | null {
  const remaining = new Date(value).getTime() - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  const seconds = Math.ceil(remaining / 1_000);
  const minutes = Math.floor(seconds / 60);
  return `Bạn còn ${minutes}:${String(seconds % 60).padStart(2, "0")} để thanh toán`;
}

function checkoutErrorMessage(reason: unknown, fallback: string): string | null {
  let message = fallback;
  if (reason instanceof Error && reason.message) {
    message = reason.message;
  } else if (
    typeof reason === "object" &&
    reason !== null &&
    "message" in reason &&
    typeof reason.message === "string" &&
    reason.message
  ) {
    message = reason.message;
  }
  return message === "The user rejected! (clicked the negative button)" ? null : message;
}

export function App({ api: providedApi }: { api?: CustomerApi }) {
  const ownedApiRef = useRef<CustomerApi | null>(null);
  if (!ownedApiRef.current) ownedApiRef.current = new HttpCustomerApi(SHOP.apiUrl, SHOP.apiUrl ? undefined : mockFetch);
  const api = providedApi ?? ownedApiRef.current;
  const location = useLocation();
  const navigate = useNavigate();
  const [view, setView] = useState<View>(() => viewFromPath(location.pathname));
  const [termsOpen, setTermsOpen] = useState(false);
  useEffect(() => { if (view !== "account") setTermsOpen(false); }, [view]);
  const [infoSection, setInfoSection] = useState<AccountInfoSection>("terms");
  const [pageMotion, setPageMotion] = useState<"back" | "cart-exit" | null>(null);
  const pageMotionTimerRef = useRef<number | null>(null);
  const cartExitTimerRef = useRef<number | null>(null);
  const swipeBackPendingRef = useRef(false);
  const emptyCartSavePendingRef = useRef(false);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [campaigns, setCampaigns] = useState<CatalogCampaign[]>([]);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [campaignPopupOpen, setCampaignPopupOpen] = useState(false);
  const [appVisible, setAppVisible] = useState(() => document.visibilityState !== "hidden");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | undefined>();
  const [branchSelectorOpen, setBranchSelectorOpen] = useState(false);
  const [branchLoading, setBranchLoading] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationConfirmationOpen, setLocationConfirmationOpen] = useState(false);
  const locationAttemptedRef = useRef(false);
  const branchRequestRef = useRef(0);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("ALL");
  const [orderDetail, setOrderDetail] = useState<CustomerOrder | null>(null);
  const [orderDetailLoading, setOrderDetailLoading] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [cart, setCart] = useState<Cart>({});
  const [reorderedFromOrderId, setReorderedFromOrderId] = useState<string | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [selectedSkuId, setSelectedSkuId] = useState<string | null>(null);
  const [detailQuantity, setDetailQuantity] = useState<{ skuId: string; quantity: number } | null>(null);
  const [quickViewProductId, setQuickViewProductId] = useState<string | null>(null);
  const [catalogCategories, setCatalogCategories] = useState<CatalogCategory[]>([]);
  const [category, setCategory] = useState("Tất cả");
  const [catalogGroupingMode, setCatalogGroupingMode] = useState<CatalogGroupingMode>("category");
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [levelTwoCategory, setLevelTwoCategory] = useState("Tất cả");
  const [activeLevelTwoCategory, setActiveLevelTwoCategory] = useState("Tất cả");
  const [levelThreeCategory, setLevelThreeCategory] = useState("Tất cả");
  const [categorySelectorOpen, setCategorySelectorOpen] = useState(false);
  const [adultContentConfirmed, setAdultContentConfirmed] = useState(readAdultConfirmation);
  const [pendingAgeRestrictedPath, setPendingAgeRestrictedPath] = useState<string[] | null>(null);
  const pendingCampaignRef = useRef<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(CATALOG_BATCH_SIZE);
  const [catalogScrollRequest, setCatalogScrollRequest] = useState(0);
  const [cartPreviewOpen, setCartPreviewOpen] = useState(false);
  const catalogLoadSentinelRef = useRef<HTMLDivElement | null>(null);
  const levelTwoTabsRef = useRef<HTMLElement | null>(null);
  const activeLevelTwoTabRef = useRef<HTMLButtonElement | null>(null);
  const pendingCatalogSectionRef = useRef<string[] | null>(null);
  const pendingCatalogBrandRef = useRef<{ category: string; brand: string | null } | null>(null);
  const catalogTouchStartRef = useRef<{ x: number; y: number; ignored: boolean } | null>(null);
  const quantityControlsTimerRef = useRef<number | null>(null);
  const [activeQuantityCard, setActiveQuantityCard] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginBusy, setLoginBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalogWarning, setCatalogWarning] = useState<string | null>(null);
  const [catalogState, setCatalogState] = useState<CatalogState | null>(null);
  const [fulfillment, setFulfillment] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const cartRef = useRef<Cart>({});
  const checkoutSubmittingRef = useRef(false);
  const activeCheckoutOrderIdRef = useRef<string | null>(null);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const savedHomeScrollRef = useRef(0);
  const savedCampaignScrollRef = useRef(0);
  const lastHomeTapRef = useRef<number | null>(null);
  const [catalogViewMode, setCatalogViewMode] = useState<CatalogViewMode>(() => {
    const saved = miniAppStorage.getItem(CATALOG_VIEW_MODE_KEY);
    if (saved === "grid" || saved === "list") return saved;
    return "grid";
  });

  const toggleCatalogViewMode = useCallback(() => {
    setCatalogViewMode((prev) => {
      const next = prev === "grid" ? "list" : "grid";
      miniAppStorage.setItem(CATALOG_VIEW_MODE_KEY, next);
      return next;
    });
  }, []);

  const openQuantityControls = useCallback((cardKey: string) => {
    if (quantityControlsTimerRef.current !== null) window.clearTimeout(quantityControlsTimerRef.current);
    setActiveQuantityCard(cardKey);
    quantityControlsTimerRef.current = window.setTimeout(() => {
      setActiveQuantityCard(null);
      quantityControlsTimerRef.current = null;
    }, QUANTITY_CONTROLS_TIMEOUT_MS);
  }, []);

  useEffect(() => () => {
    if (quantityControlsTimerRef.current !== null) window.clearTimeout(quantityControlsTimerRef.current);
  }, []);

  useEffect(() => {
    if (!activeQuantityCard) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(".product-actions")) return;
      if (quantityControlsTimerRef.current !== null) window.clearTimeout(quantityControlsTimerRef.current);
      quantityControlsTimerRef.current = null;
      setActiveQuantityCard(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress, true);
  }, [activeQuantityCard]);

  const selectView = useCallback(
    (next: View) => {
      const now = Date.now();
      const resetHome = next === "home" && view === "home" && lastHomeTapRef.current !== null
        && now - lastHomeTapRef.current <= HOME_DOUBLE_TAP_WINDOW_MS;
      lastHomeTapRef.current = next === "home" && view === "home" && !resetHome ? now : null;
      setSearchOpen(false);
      if (next === "home") setActiveCampaignId(null);
      if (resetHome) {
        pendingCatalogSectionRef.current = null;
        pendingCatalogBrandRef.current = null;
        setCategory("Tất cả");
        setCatalogGroupingMode("category");
        setSelectedBrand(null);
        setLevelTwoCategory("Tất cả");
        setActiveLevelTwoCategory("Tất cả");
        setLevelThreeCategory("Tất cả");
        setVisibleLimit(CATALOG_BATCH_SIZE);
        setQuery("");
      }
      if (view === "home" && next !== "home") {
        savedHomeScrollRef.current = activeCampaignId ? savedCampaignScrollRef.current : document.body.scrollTop;
      }
      setView(next);
      const path = pathForView(next);
      navigate(path);
      if (next === "home") {
        const scrollTop = view === "home" ? (activeCampaignId ? savedCampaignScrollRef.current : 0) : savedHomeScrollRef.current;
        requestAnimationFrame(() => {
          document.body.scrollTop = scrollTop;
        });
      } else {
        document.body.scrollTop = 0;
      }
    },
    [activeCampaignId, navigate, view],
  );

  const selectOrderDetail = useCallback(
    (orderId: string) => {
      setView("orders");
      navigate(`/orders/${orderId}`);
      document.body.scrollTop = 0;
    },
    [navigate],
  );

  const startPageEntrance = useCallback(() => {
    if (pageMotionTimerRef.current !== null) window.clearTimeout(pageMotionTimerRef.current);
    setPageMotion("back");
    pageMotionTimerRef.current = window.setTimeout(() => {
      setPageMotion(null);
      pageMotionTimerRef.current = null;
    }, window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 80 : 190);
  }, []);

  useEffect(() => () => {
    if (pageMotionTimerRef.current !== null) window.clearTimeout(pageMotionTimerRef.current);
    if (cartExitTimerRef.current !== null) window.clearTimeout(cartExitTimerRef.current);
  }, []);

  const navigateBack = useCallback((fallback: string, animate = false) => {
    if (termsOpen) {
      setTermsOpen(false);
      return;
    }
    if (imageViewerOpen) {
      setImageViewerOpen(false);
      return;
    }
    if (searchOpen) {
      setSearchOpen(false);
      setQuery("");
      return;
    }
    if (categorySelectorOpen) {
      setCategorySelectorOpen(false);
      return;
    }
    if (branchSelectorOpen && view !== "account") {
      setBranchSelectorOpen(false);
      return;
    }
    if (view === "home" && activeCampaignId) {
      setActiveCampaignId(null);
      if (animate) startPageEntrance();
      requestAnimationFrame(() => { document.body.scrollTop = savedCampaignScrollRef.current; });
      return;
    }
    if (animate && view === "home") return;
    if (animate && location.pathname === fallback && location.key === "default") return;
    if (animate) swipeBackPendingRef.current = true;
    if (location.key === "default") navigate(fallback, { replace: true });
    else navigate(-1);
  }, [activeCampaignId, branchSelectorOpen, categorySelectorOpen, imageViewerOpen, location.key, location.pathname, navigate, searchOpen, startPageEntrance, termsOpen, view]);

  const swipeBackHandlers = useSwipeable({
    delta: SWIPE_BACK_MIN_DISTANCE_PX,
    onSwipedRight: ({ absX, absY, event, initial }) => {
      if (!isBackSwipe(initial[0], absX, absY)) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [data-swipe-back-ignore]")) return;
      navigateBack(view === "account" ? "/account" : "/", true);
    },
  });

  useEffect(() => {
    if (!loading && !profile && view === "orders") {
      const returnOrderId = location.pathname.split("/").filter(Boolean)[1];
      navigate(`/account?return=orders${returnOrderId ? `&orderId=${encodeURIComponent(returnOrderId)}` : ""}`, { replace: true });
    }
  }, [loading, profile, view, location.pathname, navigate]);

  const orderFiltersRef = useRef<HTMLElement | null>(null);

  const handleOrderFilterSwipe = useCallback((direction: "LEFT" | "RIGHT") => {
    const currentIndex = ORDER_FILTERS.findIndex((filter) => filter.id === orderFilter);
    if (currentIndex === -1) return;
    if (direction === "LEFT" && currentIndex < ORDER_FILTERS.length - 1) {
      const next = ORDER_FILTERS[currentIndex + 1];
      if (next) setOrderFilter(next.id);
    } else if (direction === "RIGHT" && currentIndex > 0) {
      const previous = ORDER_FILTERS[currentIndex - 1];
      if (previous) setOrderFilter(previous.id);
    }
  }, [orderFilter]);

  const orderSwipeHandlers = useSwipeable({
    onSwipedLeft: () => {
      handleOrderFilterSwipe("LEFT");
    },
    onSwipedRight: ({ initial, absX, absY }) => {
      if (isBackSwipe(initial[0], absX, absY)) return;
      handleOrderFilterSwipe("RIGHT");
    },
    delta: 30,
    preventScrollOnSwipe: false,
    trackMouse: false,
  });

  useEffect(() => {
    if (view === "orders" && orderFiltersRef.current) {
      const activeBtn = orderFiltersRef.current.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
      if (activeBtn && typeof activeBtn.scrollIntoView === "function") {
        activeBtn.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest", inline: "center" });
      }
    }
  }, [orderFilter, view]);

  useLayoutEffect(() => {
    setView(viewFromPath(location.pathname));
    if (swipeBackPendingRef.current) {
      swipeBackPendingRef.current = false;
      startPageEntrance();
    }
  }, [location.key, location.pathname, location.search, startPageEntrance]);
  useEffect(() => { cartRef.current = cart; }, [cart]);
  useEffect(() => {
    if (!error) return;
    const timeout = window.setTimeout(() => setError(null), NOTICE_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [error]);

  async function refreshOrders(): Promise<void> {
    const result = await api.orders();
    setOrders(result.orders);
  }

  const customerGenerationRef = useRef(0);
  const loadCustomerData = useCallback(async (
    currentProfile: CustomerProfile | null,
    guestDraft?: { branchId: string; cart: Cart },
  ): Promise<void> => {
    const generation = customerGenerationRef.current;
    const branchResult = await api.branches();
    if (generation !== customerGenerationRef.current) return;
    const deletionUnresolved = !currentProfile && Boolean(miniAppStorage.getItem(DATA_DELETION_PENDING_KEY));
    if (deletionUnresolved) {
      for (const branch of branchResult.branches) miniAppStorage.removeItem(`shop_cart:${branch.id}`);
      miniAppStorage.removeItem("shop_search_history_v1");
      miniAppStorage.removeItem(PENDING_ORDER_STORAGE_KEY);
      setError("Yêu cầu xóa dữ liệu đang cần đối chiếu. Vào Cá nhân → Thông tin cửa hàng và chính sách → Bảo vệ dữ liệu cá nhân để xem mã và liên hệ cửa hàng.");
    }
    const remembered = readRememberedBranch(currentProfile?.id);
    const guestBranch = branchResult.branches.find((branch) => branch.id === guestDraft?.branchId);
    const initialBranch = guestBranch ?? resolveSelectedBranch(branchResult.branches, remembered);
    setProfile(currentProfile);
    setBranches(branchResult.branches);
    setSelectedBranch(initialBranch);
    setBranchSelectorOpen(false);
    if (initialBranch && currentProfile) rememberBranch(initialBranch, currentProfile.id);
    const guestCartLines = guestBranch && guestDraft
      ? Object.entries(guestDraft.cart).map(([skuId, quantity]) => ({ skuId, quantity }))
      : undefined;
    const [catalog, cartLines, addressResult, orderResult] = await Promise.all([
      initialBranch ? api.catalog(initialBranch.id) : Promise.resolve(null),
      initialBranch
        ? deletionUnresolved ? [] : guestCartLines ?? api.cart(initialBranch.id).then(({ cart }) => cart.lines)
        : Promise.resolve([]),
      currentProfile ? api.addresses() : Promise.resolve({ addresses: [] }),
      currentProfile ? api.orders() : Promise.resolve({ orders: [] }),
    ]);
    if (generation !== customerGenerationRef.current) return;
    if (currentProfile) {
      setAddresses(addressResult.addresses);
      setSelectedAddressId(
        addressResult.addresses.find((address) => address.isDefault)?.id
          ?? addressResult.addresses[0]?.id
          ?? null,
      );
      setOrders(orderResult.orders);
      setOrderFilter(latestOrderFilter(orderResult.orders));
    }
    if (!initialBranch || !catalog) {
      if (branchResult.branches.length === 0) setError("Chưa có chi nhánh bán hàng khả dụng");
      return;
    }
    const availableProducts = visibleCatalogProducts(catalog.products);
    setCatalogWarning(null);
    setCatalogState(catalog.catalogState);
    setCatalogCategories(catalog.categories ?? []);
    setCampaigns(catalog.campaigns ?? []);
    setProducts(availableProducts);
    const restored = normalizeRestoredCart(
      cartLines,
      new Map(availableProducts.flatMap((product) => product.skus.map((sku) => [sku.id, sku.availableQuantity]))),
    );
    setCart(restored.cart);
    if (restored.changed) {
      await api.saveCart(initialBranch.id, Object.entries(restored.cart).map(([skuId, quantity]) => ({ skuId, quantity })));
    }
    if (initialBranch.fulfillmentMethods && !initialBranch.fulfillmentMethods.includes("DELIVERY")) setFulfillment("PICKUP");
  }, [api]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const permission = await getZaloLoginPermission();
        if (permission !== "granted") api.logout();
        const currentProfile = permission === "granted" ? await api.profile().catch(() => null) : null;
        if (active) await loadCustomerData(currentProfile);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Không thể mở cửa hàng");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [api, loadCustomerData]);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    let checking = false;
    const syncPermission = async () => {
      if (checking || document.visibilityState === "hidden") return;
      checking = true;
      try {
        if (await getZaloLoginPermission() === "granted" || !active) return;
        api.logout();
        setProfile(null);
        setAddresses([]);
        setOrders([]);
        setOrderDetail(null);
        setSelectedAddressId(null);
      } finally {
        checking = false;
      }
    };
    const onVisibilityChange = () => { void syncPermission(); };
    window.addEventListener("focus", onVisibilityChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      window.removeEventListener("focus", onVisibilityChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [api, profile]);

  const clearPersonalData = (completed: boolean) => {
    customerGenerationRef.current += 1;
    api.logout();
    for (const branch of branches) miniAppStorage.removeItem(`shop_cart:${branch.id}`);
    if (profile) miniAppStorage.removeItem(`${BRANCH_STORAGE_KEY}:${profile.id}`);
    miniAppStorage.removeItem("shop_search_history_v1");
    miniAppStorage.removeItem(PENDING_ORDER_STORAGE_KEY);
    miniAppStorage.setItem(DATA_DELETION_LOGIN_REQUIRED_KEY, "1");
    if (completed) miniAppStorage.removeItem(DATA_DELETION_PENDING_KEY);
    setProfile(null); setAddresses([]); setOrders([]); setOrderDetail(null);
    setSelectedAddressId(null); setReorderedFromOrderId(null); setCart({}); cartRef.current = {};
    setQuickViewProductId(null); setSelectedSkuId(null); setQuery("");
    if (completed) setError("Yêu cầu xóa dữ liệu đã được hệ thống xử lý. Các phiên đăng nhập đã bị vô hiệu hóa.");
    else setError("Phiên đã bị vô hiệu hóa. Hãy dùng mã yêu cầu để kiểm tra với cửa hàng; chưa thể kết luận dữ liệu đã được xóa.");
    selectView("account");
  };

  const login = useCallback(async (nextView: View = "account"): Promise<void> => {
    if (loginBusy) return;
    setLoginBusy(true);
    setError(null);
    let sessionCreated = false;
    try {
      await requestZaloUserInfo();
      const phoneToken = await requestZaloPhoneToken();
      await api.login({ privacyNoticeVersion: PRIVACY_NOTICE_VERSION });
      sessionCreated = true;
      if (miniAppStorage.getItem(DATA_DELETION_PENDING_KEY)) {
        const deletion = await api.dataDeletionRequest();
        if (!deletion.request) miniAppStorage.removeItem(DATA_DELETION_PENDING_KEY);
      }
      await loadCustomerData(
        await api.linkZaloPhone(phoneToken),
        selectedBranch ? { branchId: selectedBranch.id, cart: cartRef.current } : undefined,
      );
      miniAppStorage.removeItem(DATA_DELETION_LOGIN_REQUIRED_KEY);
      selectView(nextView);
      const returnOrderId = new URLSearchParams(location.search).get("orderId");
      if (nextView === "orders" && returnOrderId) navigate(`/orders/${encodeURIComponent(returnOrderId)}`);
    } catch (reason) {
      if (sessionCreated) api.logout();
      setError(reason instanceof Error ? reason.message : "Không thể đăng nhập bằng Zalo");
    } finally {
      setLoginBusy(false);
    }
  }, [api, loadCustomerData, loginBusy, selectView, selectedBranch, location.search, navigate]);

  useLayoutEffect(() => {
    if (!selectedBranch || loading || branchLoading) return;
    let active = true;
    let running = false;
    const branchId = selectedBranch.id;
    const requestId = branchRequestRef.current;
    const refresh = async () => {
      if (running || document.visibilityState === "hidden") return;
      running = true;
      try {
        const catalog = await api.catalog(branchId);
        if (active && branchRequestRef.current === requestId) {
          const availableProducts = visibleCatalogProducts(catalog.products);
          const restored = normalizeRestoredCart(
            Object.entries(cartRef.current).map(([skuId, quantity]) => ({ skuId, quantity })),
            new Map(availableProducts.flatMap((product) => product.skus.map((sku) => [sku.id, sku.availableQuantity]))),
          );
          if (restored.changed) {
            cartRef.current = restored.cart;
            setCart(restored.cart);
            await api.saveCart(branchId, Object.entries(restored.cart).map(([skuId, quantity]) => ({ skuId, quantity })));
          }
          setProducts(availableProducts);
          setCatalogCategories(catalog.categories ?? []);
          setCampaigns(catalog.campaigns ?? []);
          setCatalogState(catalog.catalogState);
          setCatalogWarning(null);
        }
      } catch {
        if (active && branchRequestRef.current === requestId) {
          setCatalogWarning("Chưa cập nhật được sản phẩm. Đang hiển thị dữ liệu gần nhất.");
        }
      } finally {
        running = false;
      }
    };
    const resume = () => { void refresh(); };
    const timer = window.setInterval(resume, 15_000);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [api, selectedBranch, loading, branchLoading]);

  const switchBranch = useCallback(async (branch: Branch): Promise<void> => {
    const requestId = branchRequestRef.current + 1;
    branchRequestRef.current = requestId;
    rememberBranch(branch, profile?.id);
    setSelectedBranch(branch);
    setBranchSelectorOpen(false);
    setBranchLoading(true);
    setError(null);
    setProducts([]);
    setCampaigns([]);
    setActiveCampaignId(null);
    setCampaignPopupOpen(false);
    setCatalogCategories([]);
    setCatalogWarning(null);
    setCart({});
    setFulfillment(branch.fulfillmentMethods && !branch.fulfillmentMethods.includes("DELIVERY") ? "PICKUP" : "DELIVERY");
    setCategory("Tất cả");
    setLevelTwoCategory("Tất cả");
    setActiveLevelTwoCategory("Tất cả");
    setLevelThreeCategory("Tất cả");
    setCategorySelectorOpen(false);
    setVisibleLimit(CATALOG_BATCH_SIZE);
    setSelectedSkuId(null);
    try {
      const [catalog, cartResult] = await Promise.all([api.catalog(branch.id), api.cart(branch.id)]);
      if (branchRequestRef.current !== requestId) return;
      const availableProducts = visibleCatalogProducts(catalog.products);
      setCatalogWarning(null);
      setCatalogState(catalog.catalogState);
      setCatalogCategories(catalog.categories ?? []);
      setCampaigns(catalog.campaigns ?? []);
      setProducts(availableProducts);
      const restored = normalizeRestoredCart(
        cartResult.cart.lines,
        new Map(availableProducts.flatMap((product) => product.skus.map((sku) => [sku.id, sku.availableQuantity]))),
      );
      setCart(restored.cart);
      if (restored.changed) {
        await api.saveCart(branch.id, Object.entries(restored.cart).map(([skuId, quantity]) => ({ skuId, quantity })));
      }
    } catch (reason) {
      if (branchRequestRef.current === requestId) {
        setError(reason instanceof Error ? reason.message : "Không thể tải chi nhánh");
      }
    } finally {
      if (branchRequestRef.current === requestId) setBranchLoading(false);
    }
  }, [api, profile?.id]);

  const updateLocation = useCallback(async (openSettings = false): Promise<void> => {
    if (!profile || locationBusy) return;
    setLocationBusy(true);
    setError(null);
    try {
      if (openSettings) await openZaloLocationPermissionSettings();
      const token = await requestZaloLocation();
      const result = await api.reverseGeocode({ ...token, includeAddressSuggestion: false });
      if (!result.serviceAssignment) throw new Error("Hệ thống chưa trả về khu vực phục vụ");
      miniAppStorage.removeItem(LOCATION_DENIED_STORAGE_KEY);
      const nextProfile = { ...profile, serviceAssignment: result.serviceAssignment, needsRefresh: result.needsRefresh ?? false };
      setProfile(nextProfile);
      const branch = branches.find((item) => item.id === result.serviceAssignment?.branchId);
      if (branch && branch.id !== selectedBranch?.id) await switchBranch(branch);
      if (branch && result.serviceAssignment.status === "IN_AREA") setLocationConfirmationOpen(true);
    } catch (reason) {
      if (isZaloLocationDenied(reason)) {
        miniAppStorage.setItem(LOCATION_DENIED_STORAGE_KEY, "1");
        setError("Bạn chưa chia sẻ vị trí. Bạn vẫn có thể xem và thêm hàng; cần bật vị trí trước khi thanh toán.");
      } else {
        setError(reason instanceof Error ? reason.message : "Không thể xác định khu vực phục vụ");
      }
    } finally {
      setLocationBusy(false);
    }
  }, [api, branches, locationBusy, profile, selectedBranch?.id, switchBranch]);

  const retryLocation = useCallback(async (): Promise<void> => {
    const denied = Boolean(miniAppStorage.getItem(LOCATION_DENIED_STORAGE_KEY))
      || await getZaloLocationPermission() === "denied";
    await updateLocation(denied);
  }, [updateLocation]);

  useEffect(() => {
    if (!SERVICE_AREA_ENFORCEMENT_ENABLED) return;
    if (!profile?.serviceAssignment || locationAttemptedRef.current) return;
    if (profile.serviceAssignment.status !== "UNAVAILABLE" && !profile.needsRefresh) return;
    locationAttemptedRef.current = true;
    void getZaloLocationPermission().then((permission) => {
      if (permission === "denied") {
        miniAppStorage.setItem(LOCATION_DENIED_STORAGE_KEY, "1");
        return;
      }
      void updateLocation();
    });
  }, [profile?.needsRefresh, profile?.serviceAssignment, updateLocation]);

  useEffect(
    () =>
      subscribeToCheckoutResume((reason) => {
        const activeOrderId = activeCheckoutOrderIdRef.current;
        if (activeOrderId && reason !== "visibility") {
          activeCheckoutOrderIdRef.current = null;
          checkoutSubmittingRef.current = false;
          setBusy(false);
          setCart({});
          if (reason === "close") selectOrderDetail(activeOrderId);
        }
        void api
          .orders()
          .then((result) => {
            setOrders(result.orders);
            if (reason === "checkout") {
              setOrderFilter(latestOrderFilter(result.orders));
              selectView("orders");
            }
          })
          .catch(() => {
            // Initial and manual order loading retain their own visible errors.
          });
      }),
    [api, selectOrderDetail, selectView],
  );

  const skuById = useMemo(
    () => new Map(products.flatMap((product) => product.skus.map((sku) => [sku.id, { product, sku }]))),
    [products],
  );
  const displayOrderLine = useCallback((line: NonNullable<CustomerOrder["lines"]>[number]) => {
    const catalogLine = skuById.get(line.skuId);
    if (!catalogLine) return line;
    return {
      ...line,
      productName: !line.productName || line.productName === "Sản phẩm" ? catalogLine.product.name : line.productName,
      skuName: !line.skuName || line.skuName === "Sản phẩm" ? catalogLine.sku.name : line.skuName,
      imageUrl: line.imageUrl ?? catalogLine.product.imageUrl,
    };
  }, [skuById]);
  const quoteLines = useMemo(
    () => Object.entries(cart).map(([skuId, quantity]) => ({ skuId, quantity })),
    [cart],
  );
  const cartCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
  const categoryGroups = useMemo(() => visibleCategoryTree(categoryTree(catalogCategories, products)), [catalogCategories, products]);
  const availableCategoryPathKeys = useMemo(() => {
    const paths = new Set<string>();
    products.forEach((product) => {
      const path = productCategoryPath(product).slice(0, 3);
      path.forEach((_, index) => paths.add(path.slice(0, index + 1).join("\u0001")));
    });
    return paths;
  }, [products]);
  const browsableProducts = useMemo(
    () => adultContentConfirmed
      ? products
      : products.filter((product) => !isAgeRestrictedCategory(productCategoryPath(product))),
    [adultContentConfirmed, products],
  );
  const brandOptionsByCategory = useMemo(() => {
    const options = new Map<string, Map<string, string | null>>();
    for (const product of browsableProducts) {
      const categoryName = productCategoryPath(product)[0];
      if (!categoryName) continue;
      const brand = product.brandSortName?.trim() || null;
      const brands = options.get(categoryName) ?? new Map<string, string | null>();
      brands.set(brand ?? "\u0000", brand);
      options.set(categoryName, brands);
    }
    return new Map([...options].map(([categoryName, brands]) => [categoryName, [...brands.values()].sort((left, right) => {
      if (left === null) return 1;
      if (right === null) return -1;
      return left.localeCompare(right, "vi");
    })]));
  }, [browsableProducts]);
  const levelTwoCategories = useMemo(() => {
    if (category === "Tất cả") return [];
    return categoryGroups.find((group) => group.name === category)?.children.map((child) => child.name) ?? [];
  }, [category, categoryGroups]);
  const showsLevelTwoTabs = catalogGroupingMode === "category" && levelTwoCategories.length >= 2;
  const toggleCatalogGroupingMode = useCallback(() => {
    const nextMode: CatalogGroupingMode = catalogGroupingMode === "category" ? "brand" : "category";
    pendingCatalogSectionRef.current = null;
    pendingCatalogBrandRef.current = null;
    setSelectedBrand(null);
    if (nextMode === "brand") {
      setLevelTwoCategory("Tất cả");
      setLevelThreeCategory("Tất cả");
      setActiveLevelTwoCategory(categoryGroups.find((group) => group.name === category)?.children[0]?.name ?? "Tất cả");
    }
    setCatalogGroupingMode(nextMode);
  }, [catalogGroupingMode, category, categoryGroups]);
  const matchingProducts = useMemo(() => browsableProducts.filter((product) => {
    const path = productCategoryPath(product);
    return (category === "Tất cả" || path[0] === category)
      && product.name.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi"));
  }), [browsableProducts, category, query]);
  const categorizedProducts = useMemo(() => category === "Tất cả" || query.trim() || catalogGroupingMode === "brand"
    ? [...matchingProducts].sort(compareCatalogProducts)
    : orderCategoryProducts(matchingProducts, categoryGroups.find((group) => group.name === category)?.children ?? []),
  [catalogGroupingMode, category, categoryGroups, matchingProducts, query]);
  const selectLevelTwoCategory = useCallback((name: string) => {
    lastHomeTapRef.current = null;
    if (!adultContentConfirmed && isAgeRestrictedCategory([category, name])) {
      setPendingAgeRestrictedPath([category, name]);
      return;
    }
    pendingCatalogSectionRef.current = [category, name];
    setCatalogScrollRequest((current) => current + 1);
    setLevelTwoCategory(name);
    setActiveLevelTwoCategory(name);
    setLevelThreeCategory("Tất cả");
    const index = categorizedProducts.findIndex((product) => productCategoryPath(product)[1] === name);
    if (index >= 0) setVisibleLimit((current) => Math.max(current, index + CATALOG_BATCH_SIZE));
  }, [adultContentConfirmed, category, categorizedProducts]);
  useLayoutEffect(() => {
    const tabs = levelTwoTabsRef.current;
    const activeTab = activeLevelTwoTabRef.current;
    if (!showsLevelTwoTabs || !tabs || !activeTab) return;
    const tabsRect = tabs.getBoundingClientRect();
    const activeTabRect = activeTab.getBoundingClientRect();
    const left = Math.max(0, tabs.scrollLeft + activeTabRect.left - tabsRect.left - (tabs.clientWidth - activeTabRect.width) / 2);
    tabs.scrollLeft = left;
  }, [activeLevelTwoCategory, showsLevelTwoTabs, view]);
  const handleCatalogTouchStart = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    pendingCatalogSectionRef.current = null;
    const touch = event.touches[0];
    if (!touch) return;
    catalogTouchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      ignored: event.target instanceof Element && Boolean(event.target.closest(".product-quantity-control, .card-stepper, input, [data-swipe-tab-ignore]")),
    };
  }, []);
  const handleCatalogTouchEnd = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    if (catalogGroupingMode === "brand") return;
    const start = catalogTouchStartRef.current;
    catalogTouchStartRef.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch || start.ignored) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 40 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    const currentIndex = levelTwoCategories.indexOf(activeLevelTwoCategory);
    const next = levelTwoCategories[currentIndex + (deltaX < 0 ? 1 : -1)];
    if (next) selectLevelTwoCategory(next);
  }, [activeLevelTwoCategory, catalogGroupingMode, levelTwoCategories, selectLevelTwoCategory]);
  const visibleProducts = useMemo(() => categorizedProducts.slice(0, visibleLimit), [categorizedProducts, visibleLimit]);
  const catalogCategoryNames = [...new Set(visibleProducts.map((product) => product.categoryName))];
  const visibleProductGroups = useMemo(() => {
    if (category === "Tất cả" || query.trim()) return [];
    const groups = new Map<string, { key: string; title: string; products: CatalogProduct[] }>();
    for (const product of visibleProducts) {
      if (catalogGroupingMode === "brand") {
        const brand = product.brandSortName?.trim();
        const key = brand ? `brand:${brand}` : "brand:other";
        const group = groups.get(key) ?? { key, title: brand || "Khác", products: [] };
        group.products.push(product);
        groups.set(key, group);
        continue;
      }
      const path = productCategoryPath(product);
      const title = path[2] ?? path[1] ?? path[0]!;
      const key = path.slice(0, 3).join("\u0001");
      const group = groups.get(key) ?? { key, title, products: [] };
      group.products.push(product);
      groups.set(key, group);
    }
    return [...groups.values()];
  }, [catalogGroupingMode, category, query, visibleProducts]);
  const showsLevelThreeGroups = visibleProductGroups.length > 0;
  const dashboardCategoryGroups = useMemo(() => {
    const groups = new Map<string, { path: string[]; title: string; products: CatalogProduct[] }>();
    for (const product of browsableProducts) {
      const path = productCategoryPath(product);
      const key = path.join("\u0001");
      const group = groups.get(key) ?? { path, title: path.at(-1) ?? product.categoryName, products: [] };
      group.products.push(product);
      groups.set(key, group);
    }
    return [...groups.values()].map((group) => ({
      ...group,
      products: [...group.products].sort((left, right) => Number(right.recommended) - Number(left.recommended)).slice(0, 3),
    }));
  }, [browsableProducts]);
  const scrollCatalogSection = useCallback((section: HTMLElement) => {
    const stickyBottom = Math.max(0, ...[".market-header", ".menu-tools", ".level-two-tabs"]
      .map((selector) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().bottom ?? 0));
    let scroller: HTMLElement | null = section.parentElement;
    while (scroller && scroller.scrollHeight <= scroller.clientHeight + 1) scroller = scroller.parentElement;
    const currentTop = scroller?.scrollTop ?? document.body.scrollTop;
    const top = Math.max(0, currentTop + section.getBoundingClientRect().top - stickyBottom - 8);
    if (scroller) scroller.scrollTop = top;
    else document.body.scrollTop = top;
  }, []);
  useLayoutEffect(() => {
    const path = pendingCatalogSectionRef.current;
    if (!path || path[0] !== category) return;
    const section = path[2]
      ? document.getElementById(categorySectionId(path))
      : Array.from(document.querySelectorAll<HTMLElement>("[data-level-two-category]"))
        .find((heading) => heading.dataset.levelTwoCategory === path[1]);
    if (!section) return;
    scrollCatalogSection(section);
  }, [catalogGroupingMode, category, catalogScrollRequest, levelTwoCategory, levelThreeCategory, scrollCatalogSection, visibleProductGroups]);
  useLayoutEffect(() => {
    const pending = pendingCatalogBrandRef.current;
    if (!pending || pending.category !== category) return;
    const section = document.getElementById(brandSectionId(pending.category, pending.brand));
    if (!section) return;
    scrollCatalogSection(section);
    pendingCatalogBrandRef.current = null;
  }, [category, catalogScrollRequest, scrollCatalogSection, visibleProductGroups]);
  useEffect(() => {
    if (!showsLevelTwoTabs) return;
    const syncLevelTwoTab = (event?: Event) => {
      if (pendingCatalogSectionRef.current) return;
      const stickyBottom = Math.max(0, ...[".market-header", ".menu-tools", ".level-two-tabs"]
        .map((selector) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().bottom ?? 0));
      const headings = Array.from(document.querySelectorAll<HTMLElement>("[data-level-two-category]"));
      const current = headings.reduce<HTMLElement | undefined>((active, heading) => (
        heading.getBoundingClientRect().top <= stickyBottom + 8 ? heading : active
      ), undefined) ?? headings[0];
      const nextLevelTwo = current?.dataset.levelTwoCategory;
      if (nextLevelTwo) {
        setActiveLevelTwoCategory((currentLevelTwo) => currentLevelTwo === nextLevelTwo ? currentLevelTwo : nextLevelTwo);
        if (event && nextLevelTwo !== activeLevelTwoCategory) {
          setLevelTwoCategory((currentLevelTwo) => currentLevelTwo === nextLevelTwo ? currentLevelTwo : nextLevelTwo);
          if (nextLevelTwo !== levelTwoCategory) setLevelThreeCategory("Tất cả");
        }
      }
    };
    syncLevelTwoTab();
    const page = document.querySelector<HTMLElement>(".app-shell-home");
    const startWheel = () => { pendingCatalogSectionRef.current = null; };
    window.addEventListener("scroll", syncLevelTwoTab, { passive: true });
    document.addEventListener("scroll", syncLevelTwoTab, true);
    page?.addEventListener("wheel", startWheel, { passive: true });
    return () => {
      window.removeEventListener("scroll", syncLevelTwoTab);
      document.removeEventListener("scroll", syncLevelTwoTab, true);
      page?.removeEventListener("wheel", startWheel);
    };
  }, [activeLevelTwoCategory, levelThreeCategory, levelTwoCategory, showsLevelTwoTabs, visibleProductGroups]);
  const displayedCategory = category;
  const displayedCategoryIcon = category === "Tất cả" ? undefined : categoryIconFor(category);
  const isDashboard = category === "Tất cả" && query.trim() === "";
  const activeCampaign = campaigns.find((campaign) => campaign.id === activeCampaignId);
  const toolbarIcon = activeCampaign ? activeCampaign.images.iconUrl : displayedCategoryIcon;
  const activeCampaignProducts = activeCampaign?.productIds.flatMap((id) => {
    const product = products.find((candidate) => candidate.id === id);
    return product ? [product] : [];
  }) ?? [];
  useEffect(() => {
    const update = () => setAppVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (!activeCampaignId) return;
    const current = campaigns.find((campaign) => campaign.id === activeCampaignId);
    if (current?.productIds.some((id) => products.some((product) => product.id === id))) return;
    setActiveCampaignId(null);
    setError("Campaign hiện không còn sản phẩm.");
  }, [activeCampaignId, campaigns, products]);
  useEffect(() => {
    if (!appVisible || loading || branchLoading || view !== "home" || !selectedBranch || !isDashboard || activeCampaignId || campaignPopupOpen || !campaigns.some((campaign) => campaign.images.popupUrl)) return;
    const today = vietnamDate();
    if (miniAppStorage.getItem(CAMPAIGN_POPUP_DATE_KEY) === today) return;
    miniAppStorage.setItem(CAMPAIGN_POPUP_DATE_KEY, today);
    setCampaignPopupOpen(true);
  }, [activeCampaignId, appVisible, branchLoading, campaignPopupOpen, campaigns, isDashboard, loading, selectedBranch, view]);
  const selectBrand = useCallback((nextCategory: string, brand: string | null) => {
    lastHomeTapRef.current = null;
    setActiveCampaignId(null);
    const nextProducts = products
      .filter((product) => productCategoryPath(product)[0] === nextCategory)
      .sort(compareCatalogProducts);
    const targetIndex = nextProducts.findIndex((product) => (product.brandSortName?.trim() || null) === brand);
    pendingCatalogSectionRef.current = null;
    pendingCatalogBrandRef.current = targetIndex >= 0 ? { category: nextCategory, brand } : null;
    setCatalogGroupingMode("brand");
    setCategory(nextCategory);
    setSelectedBrand(brand);
    setLevelTwoCategory("Tất cả");
    setActiveLevelTwoCategory(categoryGroups.find((group) => group.name === nextCategory)?.children[0]?.name ?? "Tất cả");
    setLevelThreeCategory("Tất cả");
    setVisibleLimit(Math.max(CATALOG_BATCH_SIZE, targetIndex + CATALOG_BATCH_SIZE));
    setCatalogScrollRequest((current) => current + 1);
    setCategorySelectorOpen(false);
  }, [categoryGroups, products]);
  const selectCategoryPath = useCallback((path: string[]) => {
    lastHomeTapRef.current = null;
    setActiveCampaignId(null);
    const nextCategory = path[0] ?? "Tất cả";
    const nextLevelTwoCategory = path[1] ?? "Tất cả";
    const nextLevelThreeCategory = path[2] ?? "Tất cả";
    const nextProducts = nextCategory === "Tất cả" ? [] : orderCategoryProducts(
      products.filter((product) => productCategoryPath(product)[0] === nextCategory),
      categoryGroups.find((group) => group.name === nextCategory)?.children ?? [],
    );
    const targetIndex = nextProducts.findIndex((product) => {
      const productPath = productCategoryPath(product);
      return productPath[1] === nextLevelTwoCategory
        && (nextLevelThreeCategory === "Tất cả" || productPath[2] === nextLevelThreeCategory);
    });
    if (path.length > 1) setCatalogGroupingMode("category");
    pendingCatalogSectionRef.current = targetIndex >= 0 ? path : null;
    pendingCatalogBrandRef.current = null;
    setCategory(nextCategory);
    setSelectedBrand(null);
    setLevelTwoCategory(nextLevelTwoCategory);
    setActiveLevelTwoCategory(nextLevelTwoCategory !== "Tất cả"
      ? nextLevelTwoCategory
      : categoryGroups.find((group) => group.name === nextCategory)?.children[0]?.name ?? "Tất cả");
    setLevelThreeCategory(nextLevelThreeCategory);
    setVisibleLimit(Math.max(CATALOG_BATCH_SIZE, targetIndex + CATALOG_BATCH_SIZE));
    setCategorySelectorOpen(false);
    if (nextLevelTwoCategory === "Tất cả" && nextLevelThreeCategory === "Tất cả") {
      const page = document.querySelector<HTMLElement>(".app-shell-home");
      if (page) page.scrollTop = 0;
      else document.body.scrollTop = 0;
    }
  }, [categoryGroups, products]);
  const requestCategoryPath = useCallback((path: string[]) => {
    if (!adultContentConfirmed && isAgeRestrictedCategory(path)) {
      setCategorySelectorOpen(false);
      setPendingAgeRestrictedPath(path);
      return;
    }
    selectCategoryPath(path);
  }, [adultContentConfirmed, selectCategoryPath]);
  const confirmAdultContent = () => {
    if (!pendingAgeRestrictedPath) return;
    try {
      window.sessionStorage.setItem(ADULT_CONFIRMATION_SESSION_KEY, "1");
    } catch {
      // The current mounted app still retains the confirmation.
    }
    setAdultContentConfirmed(true);
    if (pendingCampaignRef.current) {
      savedCampaignScrollRef.current = document.body.scrollTop;
      setActiveCampaignId(pendingCampaignRef.current);
      pendingCampaignRef.current = null;
      document.body.scrollTop = 0;
    } else selectCategoryPath(pendingAgeRestrictedPath);
    setPendingAgeRestrictedPath(null);
  };
  const selectedProduct = products.find((product) => product.id === quickViewProductId);
  const selectedOrderId = view === "orders" && location.pathname.split("/").filter(Boolean)[0] === "orders"
    ? location.pathname.split("/").filter(Boolean)[1]
    : undefined;
  const filteredOrders = orderFilter === "ALL"
    ? orders
    : orders.filter((order) => order.status === orderFilter);
  const pendingPaymentOrders = useMemo(
    () => orders
      .filter((order) => order.paymentMethod === "ZALOPAY" && order.paymentStatus !== "PAID" && order.canRetryCheckout)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [orders],
  );
  const pendingPaymentOrder = pendingPaymentOrders[0];
  const paymentReminderVisible = Boolean(pendingPaymentOrder && !(view === "orders" && selectedOrderId));
  const paymentReminderPresence = usePresence(paymentReminderVisible, 140);
  const lastPaymentReminder = useRef({ order: pendingPaymentOrder, count: pendingPaymentOrders.length });
  if (pendingPaymentOrder) lastPaymentReminder.current = { order: pendingPaymentOrder, count: pendingPaymentOrders.length };
  const cartLines = Object.entries(cart)
    .map(([skuId, quantity]) => ({ ...skuById.get(skuId)!, quantity }))
    .filter((line) => line.product && line.sku);
  const subtotal = cartLines.reduce(
    (sum, line) => sum + Number(line.sku.priceVnd) * line.quantity,
    0,
  );

  useEffect(() => {
    if (!selectedOrderId) {
      setOrderDetail(null);
      setOrderDetailLoading(false);
      return;
    }
    if (loading || !profile) return;
    let active = true;
    setOrderDetail(null);
    setOrderDetailLoading(true);
    void api.order(selectedOrderId)
      .then(({ order }) => {
        if (active) setOrderDetail(order);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        if (reason instanceof Error && "status" in reason && reason.status === 404) {
          setOrders((current) => current.filter((order) => order.id !== selectedOrderId));
          navigate("/orders", { replace: true });
        } else {
          setError(reason instanceof Error ? reason.message : "Không thể tải chi tiết đơn hàng");
        }
      })
      .finally(() => {
        if (active) setOrderDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, loading, navigate, profile, selectedOrderId]);

  useEffect(() => {
    if (!orderDetail?.canRetryCheckout || !orderDetail.paymentExpiresAt) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [orderDetail?.canRetryCheckout, orderDetail?.paymentExpiresAt]);

  useEffect(() => {
    if (view !== "orders" || loading || !profile) return;
    let active = true;
    let running = false;
    const refresh = async () => {
      if (running || document.visibilityState === "hidden") return;
      running = true;
      try {
        if (selectedOrderId) {
          const { order } = await api.order(selectedOrderId);
          if (active) {
            setOrderDetail(order);
            setOrders((current) => current.map((item) => item.id === order.id ? order : item));
          }
        } else {
          const result = await api.orders();
          if (active) setOrders(result.orders);
        }
      } catch (reason) {
        if (active && selectedOrderId && reason instanceof Error && "status" in reason && reason.status === 404) {
          setOrderDetail(null);
          setOrders((current) => current.filter((order) => order.id !== selectedOrderId));
          navigate("/orders", { replace: true });
        }
      } finally {
        running = false;
      }
    };
    const resume = () => { void refresh(); };
    const timer = window.setInterval(resume, 15_000);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [api, loading, navigate, profile, selectedOrderId, view]);

  useEffect(() => {
    const sentinel = catalogLoadSentinelRef.current;
    if (
      !sentinel
      || typeof IntersectionObserver === "undefined"
      || view !== "home"
      || isDashboard
      || visibleProducts.length >= categorizedProducts.length
    ) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisibleLimit((current) => Math.min(current + CATALOG_BATCH_SIZE, categorizedProducts.length));
        }
      },
      { rootMargin: "280px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [categorizedProducts.length, isDashboard, view, visibleProducts.length]);

  async function setQuantity(skuId: string, quantity: number): Promise<boolean> {
    if (!selectedBranch) return false;
    if (emptyCartSavePendingRef.current) return false;
    if (SERVICE_AREA_ENFORCEMENT_ENABLED && profile?.serviceAssignment?.status === "OUT_OF_AREA") {
      setError("Vị trí hiện tại nằm ngoài khu vực phục vụ. Bạn có thể xem sản phẩm nhưng chưa thể thêm vào giỏ.");
      return false;
    }
    if (catalogState?.canAddToCart === false) {
      setError("Danh mục đang quá cũ; hệ thống sẽ mở lại giỏ khi cập nhật xong");
      return false;
    }
    const available = skuById.get(skuId)?.sku.availableQuantity ?? 0;
    const safeQuantity = normalizeCartQuantity(Math.max(0, Math.min(quantity, available)));
    if (quantity > available) setError("Số lượng đã vượt quá tồn kho khả dụng");
    const previous = cart;
    const next = { ...cart };
    if (safeQuantity <= 0) delete next[skuId];
    else next[skuId] = safeQuantity;
    const leavingEmptyCart = view === "cart" && Object.keys(next).length === 0;
    if (leavingEmptyCart) emptyCartSavePendingRef.current = true;
    else setCart(next);
    try {
      await api.saveCart(selectedBranch.id, Object.entries(next).map(([id, value]) => ({ skuId: id, quantity: value })));
      if (leavingEmptyCart) {
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
          setCart(next);
          selectView("home");
          startPageEntrance();
        } else {
          setPageMotion("cart-exit");
          cartExitTimerRef.current = window.setTimeout(() => {
            cartExitTimerRef.current = null;
            setCart(next);
            selectView("home");
            startPageEntrance();
          }, 90);
        }
      }
      return true;
    } catch (reason) {
      if (!leavingEmptyCart) setCart(previous);
      setError(reason instanceof Error ? reason.message : "Không thể lưu giỏ hàng");
      return false;
    } finally {
      emptyCartSavePendingRef.current = false;
    }
  }

  function updateAddresses(next: Address[]): void {
    setAddresses(next);
    setSelectedAddressId(next.find((address) => address.isDefault)?.id ?? next[0]?.id ?? null);
  }

  function openProduct(productId: string): void {
    setSearchOpen(false);
    const skuId = products.find((product) => product.id === productId)?.skus.find((sku) => sku.availableQuantity > 0)?.id ?? null;
    setSelectedSkuId(skuId);
    setDetailQuantity(skuId ? { skuId, quantity: 1 } : null);
    setQuickViewProductId(productId);
  }

  function openCampaign(campaign: CatalogCampaign): void {
    if (!campaign.productIds.length) return;
    const restricted = campaign.productIds
      .map((id) => products.find((product) => product.id === id))
      .find((product) => product && isAgeRestrictedCategory(productCategoryPath(product)));
    if (!adultContentConfirmed && restricted) {
      pendingCampaignRef.current = campaign.id;
      setPendingAgeRestrictedPath(productCategoryPath(restricted));
      return;
    }
    savedCampaignScrollRef.current = document.body.scrollTop;
    setActiveCampaignId(campaign.id);
    document.body.scrollTop = 0;
  }

  function closeProduct(): void {
    setDetailQuantity(null);
    setImageViewerOpen(false);
    setQuickViewProductId(null);
  }

  async function checkout(checkoutInput: {
    quoteToken: string;
    allowedPaymentMethods?: Array<"COD" | "ZALOPAY">;
    note?: string;
    invoiceRequest?: InvoiceRequest;
  }): Promise<void> {
    if (checkoutSubmittingRef.current) return;
    if (!profile?.phone) {
      setError("Hãy cập nhật số điện thoại trước khi đặt hàng");
      selectView("account");
      return;
    }
    const address = addresses.find((item) => item.id === selectedAddressId)
      ?? addresses.find((item) => item.isDefault)
      ?? addresses[0];
    if (fulfillment === "DELIVERY" && !address) {
      setError("Hãy thêm địa chỉ giao hàng trước khi đặt hàng");
      selectView("account");
      return;
    }
    checkoutSubmittingRef.current = true;
    setBusy(true);
    setError(null);
    let checkoutOrderId: string | null = null;
    try {
      const hasBeer = cartLines.some((line) => line.product.salePolicy === "BEER" || productCategoryPath(line.product).some(isBeerCategory));
      const allowed = (checkoutInput.allowedPaymentMethods ?? catalogState?.allowedPaymentMethods ?? ["COD", "ZALOPAY"]).filter((method) => !hasBeer || method === "ZALOPAY") as Array<"COD" | "ZALOPAY">;
      const selectedMethod = await selectCheckoutPaymentMethod(allowed);
      if (!allowed.includes(selectedMethod.paymentMethod)) throw new Error("Giỏ có bia chỉ hỗ trợ ZaloPay. Bỏ bia để chọn COD.");
      const orderRequest = {
        branchId: selectedBranch?.id ?? "",
        fulfillmentMethod: fulfillment,
        paymentMethod: selectedMethod.paymentMethod,
        checkoutMethod: selectedMethod.checkoutMethod,
        quoteToken: checkoutInput.quoteToken,
        ...(checkoutInput.note ? { note: checkoutInput.note } : {}),
        ...(checkoutInput.invoiceRequest ? { invoiceRequest: checkoutInput.invoiceRequest } : {}),
        ...(address && fulfillment === "DELIVERY" ? { addressId: address.id } : {}),
      };
      const intent = JSON.stringify({
        branchId: orderRequest.branchId,
        fulfillmentMethod: orderRequest.fulfillmentMethod,
        paymentMethod: orderRequest.paymentMethod,
        addressId: "addressId" in orderRequest ? orderRequest.addressId : null,
        note: orderRequest.note ?? "",
        lines: cartLines.map((line) => [line.sku.id, line.quantity]).sort(([left], [right]) => String(left).localeCompare(String(right))),
      });
      let idempotencyKey = createClientId();
      try {
        const pending = JSON.parse(miniAppStorage.getItem(PENDING_ORDER_STORAGE_KEY) ?? "null") as { intent?: unknown; idempotencyKey?: unknown } | null;
        if (pending?.intent === intent && typeof pending.idempotencyKey === "string") idempotencyKey = pending.idempotencyKey;
      } catch {
        // Replace invalid local state below.
      }
      miniAppStorage.setItem(PENDING_ORDER_STORAGE_KEY, JSON.stringify({ intent, idempotencyKey }));
      const reorderSourceOrderId = reorderedFromOrderId;
      if (reorderSourceOrderId) setReorderedFromOrderId(null);
      const result = await api.createOrder({
        ...orderRequest,
        ...(reorderSourceOrderId ? { reorderedFromOrderId: reorderSourceOrderId } : {}),
        idempotencyKey,
      });
      await api.saveCart(orderRequest.branchId, []);
      miniAppStorage.removeItem(PENDING_ORDER_STORAGE_KEY);
      await refreshOrders();
      const checkoutSession = result.checkout
        // The backend creates the merchant order first. Both Platform COD and ZaloPay
        // then open the same native Checkout SDK flow from an attempt.
        ?? (result.order.paymentStatus === "PENDING" && result.order.paymentMethod
          ? await api.retryCheckout(result.order.id, createClientId())
          : undefined);
      if (!checkoutSession) {
        setCart({});
        selectView("orders");
        return;
      }
      checkoutOrderId = result.order.id;
      activeCheckoutOrderIdRef.current = checkoutOrderId;
      const providerOrderId = await openCheckout(checkoutSession.requestPayload);
      await api.bindCheckout(result.order.id, providerOrderId, checkoutSession.attemptId);
      await refreshOrders();
    } catch (reason) {
      if (checkoutOrderId && activeCheckoutOrderIdRef.current === checkoutOrderId) {
        activeCheckoutOrderIdRef.current = null;
        setCart({});
        selectOrderDetail(checkoutOrderId);
      }
      setError(checkoutErrorMessage(reason, "Không thể tạo đơn"));
    } finally {
      if (!activeCheckoutOrderIdRef.current) {
        checkoutSubmittingRef.current = false;
        setBusy(false);
      }
    }
  }

  async function saveInvoiceProfile(invoiceProfile: InvoiceRequest): Promise<void> {
    const next = await api.updateProfile({ invoiceProfile });
    setProfile(next ?? await api.profile());
  }

  async function retryOrderPayment(orderId: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const checkout = await api.retryCheckout(orderId, createClientId());
      activeCheckoutOrderIdRef.current = orderId;
      const providerOrderId = await openCheckout(checkout.requestPayload);
      await api.bindCheckout(orderId, providerOrderId, checkout.attemptId);
      await refreshOrders();
      const result = await api.order(orderId);
      setOrderDetail(result.order);
    } catch (reason) {
      if (activeCheckoutOrderIdRef.current === orderId) activeCheckoutOrderIdRef.current = null;
      setError(checkoutErrorMessage(reason, "Không thể mở lại thanh toán"));
    } finally {
      if (!activeCheckoutOrderIdRef.current) setBusy(false);
    }
  }

  async function cancelOrder(order: CustomerOrder): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const { order: cancelled } = await api.cancelOrder(order.id);
      setOrderDetail(cancelled);
      await refreshOrders();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể hủy đơn");
    } finally {
      setBusy(false);
    }
  }

  async function reorder(order: CustomerOrder): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const restoredCart = (order.lines ?? []).reduce<Cart>((next, line) => {
        const quantity = normalizeCartQuantity((next[line.skuId] ?? 0) + line.quantity);
        if (quantity > 0) next[line.skuId] = quantity;
        return next;
      }, {});
      const lines = Object.entries(restoredCart).map(([skuId, quantity]) => ({ skuId, quantity }));
      if (lines.length === 0) throw new Error("Không thể khôi phục sản phẩm của đơn này");
      if (SERVICE_AREA_ENFORCEMENT_ENABLED && profile?.serviceAssignment && profile.serviceAssignment.branchId !== order.branch.id)
        throw new Error("Hãy cập nhật vị trí trước khi đặt lại đơn từ cửa hàng khác");
      await api.saveCart(order.branch.id, lines);
      setReorderedFromOrderId(order.id);
      if (selectedBranch?.id === order.branch.id) {
        setCart(restoredCart);
      } else {
        const branch = branches.find((item) => item.id === order.branch.id);
        if (!branch) throw new Error("Chi nhánh của đơn này không còn bán hàng");
        await switchBranch(branch);
      }
      selectView("cart");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể đặt lại đơn");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="boot" aria-label="Đang mở cửa hàng">
        <img src={markUrl} alt="" />
        <Spinner visible />
        <p>Đang mở cửa hàng…</p>
      </main>
    );
  }

  return (
    <div className="app-gesture-surface" {...swipeBackHandlers}>
    <MarketLayout
      view={view}
      branch={selectedBranch}
      branches={branches}
      branchSelectorOpen={branchSelectorOpen && view !== "account"}
      locationManaged={SERVICE_AREA_ENFORCEMENT_ENABLED && Boolean(profile?.serviceAssignment)}
      onOpenBranchSelector={() => {
        if (view === "account") selectView("home");
        if (SERVICE_AREA_ENFORCEMENT_ENABLED && profile?.serviceAssignment) void retryLocation();
        else setBranchSelectorOpen(true);
      }}
      onSelectBranch={(branch) => void switchBranch(branch)}
      onCloseBranchSelector={() => setBranchSelectorOpen(false)}
      query={query}
      cartCount={cartCount}
      cartItemTypes={cartLines.length}
      cartTotal={money.format(subtotal)}
      cartPreviewOpen={cartPreviewOpen}
      pageMotion={pageMotion}
      onOpenCartPreview={() => setCartPreviewOpen(true)}
      error={error}
      onQueryChange={setQuery}
      onDismissError={() => setError(null)}
      onSelectView={selectView}
      profile={profile}
    >
        {branchLoading && (
          <div className="branch-loading" role="status"><Spinner visible /><span>Đang tải hàng tại {selectedBranch?.name}…</span></div>
        )}
        {catalogWarning && !branchLoading && view === "home" && (
          <div className="catalog-warning-banner" role="status">
            <Icon icon="zi-warning" />
            <span>{catalogWarning}</span>
          </div>
        )}
        {catalogState?.freshness === "DEGRADED" && !branchLoading && view === "home" && (
          <div className="catalog-warning-banner" role="status"><Icon icon="zi-warning" /><span>Danh mục đang chờ cập nhật; chỉ hỗ trợ thanh toán khi nhận hàng.</span></div>
        )}
        {catalogState?.freshness === "EXPIRED" && !branchLoading && view === "home" && (
          <div className="catalog-warning-banner" role="alert"><Icon icon="zi-warning" /><span>Danh mục đang tạm gián đoạn; bạn vẫn có thể xem nhưng chưa thể thêm món vào giỏ.</span></div>
        )}
        {SERVICE_AREA_ENFORCEMENT_ENABLED && profile?.serviceAssignment?.status === "OUT_OF_AREA" && !branchLoading && view === "home" && (
          <div className="catalog-warning-banner" role="alert"><Icon icon="zi-location" /><span>Bạn đang ngoài khu vực phục vụ. Danh mục chỉ để tham khảo; chưa thể thêm hàng hoặc thanh toán.</span></div>
        )}
        {SERVICE_AREA_ENFORCEMENT_ENABLED && profile?.serviceAssignment?.status === "UNAVAILABLE" && !branchLoading && view === "home" && (
          <div className="catalog-warning-banner" role="status"><Icon icon="zi-location" /><span>Chưa xác định được khu vực. Bạn có thể thêm hàng và sẽ cần bật vị trí trước khi thanh toán.</span></div>
        )}
        {!selectedBranch && !branchLoading && view !== "account" && (
          <div className="branch-required empty-state" role="status">
            <Icon icon="zi-location" />
            <h2>Chọn chi nhánh để bắt đầu</h2>
            <Button onClick={() => setBranchSelectorOpen(true)}>Chọn chi nhánh</Button>
          </div>
        )}
        {selectedBranch && !branchLoading && (
          <>
        {view === "home" && <>
            <div className="menu-tools">
              <div className="menu-filter-row">
                <button
                  className="category-menu-btn"
                  aria-label={`Chọn danh mục: ${activeCampaign?.title ?? displayedCategory}`}
                  aria-expanded={categorySelectorOpen}
                  onClick={() => setCategorySelectorOpen(true)}
                >
                  {toolbarIcon
                    ? <img className="category-menu-icon" src={toolbarIcon} alt="" aria-hidden="true" />
                    : <Icon icon="zi-list-2" />}
                  <span className="category-menu-name">
                    {activeCampaign?.title ?? (category === "Tất cả" ? "Danh mục" : displayedCategory)}
                  </span>
                </button>
                <div className="menu-tools-actions">
                  <button
                    type="button"
                    className="view-mode-button"
                    aria-label={catalogViewMode === "grid" ? "Chuyển sang dạng danh sách" : "Chuyển sang dạng lưới"}
                    title={catalogViewMode === "grid" ? "Dạng danh sách" : "Dạng lưới"}
                    onClick={toggleCatalogViewMode}
                  >
                    <Icon icon={catalogViewMode === "grid" ? "zi-list-1" : "zi-grid-solid"} />
                  </button>
                  <button
                    className="search-button"
                    aria-label="Tìm sản phẩm"
                    onClick={() => setSearchOpen(true)}
                  >
                    <Icon icon="zi-search" />
                  </button>
                </div>
              </div>
            </div>
            <CategorySelector
              groups={categoryGroups}
              availablePathKeys={availableCategoryPathKeys}
              selectedPath={activeCampaign || category === "Tất cả"
                ? []
                : catalogGroupingMode === "brand"
                  ? [category]
                  : [category, ...(levelTwoCategory === "Tất cả" ? [] : [levelTwoCategory]), ...(levelThreeCategory === "Tất cả" ? [] : [levelThreeCategory])]}
              groupingMode={catalogGroupingMode}
              brandOptionsByCategory={brandOptionsByCategory}
              selectedBrand={selectedBrand}
              visible={categorySelectorOpen}
              onClose={() => setCategorySelectorOpen(false)}
              onSelect={requestCategoryPath}
              onSelectBrand={selectBrand}
              onToggleGroupingMode={toggleCatalogGroupingMode}
            />
            {searchOpen && <SearchOverlay
              visible={searchOpen}
              onClose={() => {
                setSearchOpen(false);
                setQuery("");
              }}
              query={query}
              onQueryChange={(nextQuery) => {
                setQuery(nextQuery);
                setVisibleLimit(CATALOG_BATCH_SIZE);
              }}
              products={browsableProducts}
              cart={cart}
              formatMoney={(value) => money.format(value)}
              onOpenProduct={(productId) => {
                setSearchOpen(false);
                openProduct(productId);
              }}
              onQuantityChange={(skuId, nextQuantity) => void setQuantity(skuId, nextQuantity)}
              activeQuantityCard={activeQuantityCard}
              onOpenQuantityControls={openQuantityControls}
              bestSellingProducts={browsableProducts.filter((product) => product.recommended).slice(0, 6)}
            />}
        </>}
        {view === "home" && activeCampaign && (
          <section className="catalog campaign-product-page" aria-labelledby="campaign-product-title">
            <header className="campaign-product-header">
              {activeCampaign.images.headerUrl && <img src={activeCampaign.images.headerUrl} alt="" />}
              <div><h1 id="campaign-product-title">{activeCampaign.title}</h1><span>{activeCampaignProducts.length} sản phẩm</span></div>
            </header>
            <div className={`product-list product-list-${catalogViewMode}`}>
              {activeCampaignProducts.map((product) => {
                const quantity = product.skus.reduce((total, sku) => total + (cart[sku.id] ?? 0), 0);
                return <ProductCard
                  key={product.id}
                  variant={catalogViewMode}
                  product={product}
                  quantity={quantity}
                  cartQuantities={cart}
                  quantityControlsOpen={activeQuantityCard === `campaign:${product.id}`}
                  formatMoney={(value) => money.format(value)}
                  onOpen={openProduct}
                  onQuantityChange={(skuId, nextQuantity) => void setQuantity(skuId, nextQuantity)}
                  onQuantityControlsOpen={() => openQuantityControls(`campaign:${product.id}`)}
                />;
              })}
            </div>
          </section>
        )}
        {view === "home" && !activeCampaign && (
          <>
            {showsLevelTwoTabs && (
              <nav className="level-two-tabs" aria-label={`Danh mục con ${category}`} ref={levelTwoTabsRef}>
                {levelTwoCategories.map((name) => (
                  <button
                    key={name}
                    type="button"
                  className={activeLevelTwoCategory === name ? "active" : ""}
                  aria-pressed={activeLevelTwoCategory === name}
                  onClick={() => selectLevelTwoCategory(name)}
                  ref={activeLevelTwoCategory === name ? activeLevelTwoTabRef : null}
                >{name}</button>
                ))}
              </nav>
            )}
            <section
              className="catalog"
              aria-label="Sản phẩm"
              onTouchStart={showsLevelTwoTabs ? handleCatalogTouchStart : undefined}
              onTouchEnd={showsLevelTwoTabs ? handleCatalogTouchEnd : undefined}
            >
              {isDashboard && <HomeCampaignBanners campaigns={campaigns} paused={campaignPopupOpen} onSelect={openCampaign} />}
              {isDashboard && <CampaignIcons campaigns={campaigns} onSelect={openCampaign} />}
              {isDashboard ? dashboardCategoryGroups.map((group) => (
                <section className="dashboard-category" aria-labelledby={dashboardCategoryId(group.path)} key={group.path.join("\u0001")}>
                  <div className="section-heading catalog-category-heading">
                    <h2 id={dashboardCategoryId(group.path)}>{group.title}</h2>
                    <button className="show-more-products" type="button" aria-label={`Xem thêm ${group.title}`} onClick={() => requestCategoryPath(group.path)}>&gt;&gt;</button>
                  </div>
                  <div className={`product-list product-list-${catalogViewMode}`}>
                    {group.products.map((product) => {
                      const quantity = product.skus.reduce((total, item) => total + (cart[item.id] ?? 0), 0);
                      return (
                        <ProductCard
                          key={product.id}
                          variant={catalogViewMode}
                          product={product}
                          quantity={quantity}
                          cartQuantities={cart}
                          formatMoney={(value) => money.format(value)}
                          onOpen={openProduct}
                          onQuantityChange={(skuId, nextQuantity) => void setQuantity(skuId, nextQuantity)}
                          quantityControlsOpen={activeQuantityCard === `dashboard:${product.id}`}
                          onQuantityControlsOpen={() => openQuantityControls(`dashboard:${product.id}`)}
                        />
                      );
                    })}
                  </div>
                </section>
              )) : visibleProducts.length === 0 ? (
                <div className="empty-state compact"><Icon icon="zi-search" /><h2>Không tìm thấy sản phẩm</h2><p>Thử từ khóa hoặc danh mục khác.</p></div>
              ) : showsLevelThreeGroups ? <div className="catalog-sections catalog-product-list">
                {visibleProductGroups.map((group) => <section className="catalog-section" key={group.key}>
                  {catalogGroupingMode === "brand"
                    ? <h2 className="catalog-brand-heading" id={brandSectionId(category, group.key === "brand:other" ? null : group.title)}>{group.title}</h2>
                    : <h2 className="catalog-level-three-heading" data-level-two-category={group.key.split("\u0001")[1]} id={categorySectionId(group.key.split("\u0001"))}>{group.title}</h2>}
                  <div className={`product-list product-list-${catalogViewMode}`}>
                    {group.products.map((product) => {
                      const quantity = product.skus.reduce((total, sku) => total + (cart[sku.id] ?? 0), 0);
                      return <ProductCard
                        key={product.id}
                        variant={catalogViewMode}
                        product={product}
                        quantity={quantity}
                        cartQuantities={cart}
                        quantityControlsOpen={activeQuantityCard === `catalog:${product.id}`}
                        formatMoney={(value) => money.format(value)}
                        onOpen={openProduct}
                        onQuantityChange={(skuId, nextQuantity) => void setQuantity(skuId, nextQuantity)}
                        onQuantityControlsOpen={() => openQuantityControls(`catalog:${product.id}`)}
                      />;
                    })}
                  </div>
                </section>)}
              </div> : <div className={`product-list product-list-${catalogViewMode} catalog-product-list`}>
                {catalogCategoryNames.map((name) => <h2 className="visually-hidden" key={name}>{name}</h2>)}
                {visibleProducts.map((product) => {
                  const quantity = product.skus.reduce((total, sku) => total + (cart[sku.id] ?? 0), 0);
                  return <ProductCard
                    key={product.id}
                    variant={catalogViewMode}
                    product={product}
                    quantity={quantity}
                    cartQuantities={cart}
                    quantityControlsOpen={activeQuantityCard === `catalog:${product.id}`}
                    formatMoney={(value) => money.format(value)}
                    onOpen={openProduct}
                    onQuantityChange={(skuId, nextQuantity) => void setQuantity(skuId, nextQuantity)}
                    onQuantityControlsOpen={() => openQuantityControls(`catalog:${product.id}`)}
                  />;
                })}
              </div>}
              {!isDashboard && matchingProducts.length > visibleProducts.length && (
                <div ref={catalogLoadSentinelRef} className="catalog-load-sentinel" aria-label="Đang tải thêm sản phẩm">
                  <Spinner visible />
                </div>
              )}
            </section>
          </>
        )}

        {view === "cart" && (
          cartLines.length === 0 ? (
            <section className="checkout-page checkout-empty-page">
              <header className="checkout-header"><button onClick={() => navigateBack("/")} aria-label="Quay lại"><Icon icon="zi-chevron-left" /></button><div><h1>Thanh toán</h1><span>{selectedBranch.name}</span></div></header>
              <div className="empty-state cart-empty-state cart-empty-order-state">
                <img className="cart-empty-illustration" src={emptyCartUrl} alt="" />
                <h2>Bạn chưa có sản phẩm nào để <span style={{ whiteSpace: "nowrap" }}>thanh toán</span></h2>
                <p>Khám phá các sản phẩm nổi bật và bắt đầu trải nghiệm mua sắm ngay hôm nay</p>
                <button type="button" className="cart-empty-shop" onClick={() => selectView("home")}>Mua hàng</button>
              </div>
            </section>
          ) : !profile ? (
            <section className="checkout-page checkout-empty-page">
              <header className="checkout-header"><button onClick={() => navigateBack("/")} aria-label="Quay lại"><Icon icon="zi-chevron-left" /></button><div><h1>Thanh toán</h1><span>{selectedBranch.name}</span></div></header>
              <div className="empty-state cart-empty-state">
                <Icon icon="zi-user" />
                <h2>Vui lòng đăng nhập để không bị gián đoạn mua hàng</h2>
                <Button loading={loginBusy} onClick={() => { selectView("account"); navigate("/account?return=cart"); }}>Đăng nhập bằng Zalo</Button>
              </div>
            </section>
          ) : SERVICE_AREA_ENFORCEMENT_ENABLED && profile.serviceAssignment && (profile.serviceAssignment.status !== "IN_AREA" || profile.needsRefresh) ? (
            <section className="checkout-page checkout-empty-page">
              <header className="checkout-header"><button onClick={() => navigateBack("/")} aria-label="Quay lại"><Icon icon="zi-chevron-left" /></button><div><h1>Xác nhận khu vực</h1><span>{selectedBranch.name}</span></div></header>
              <div className="empty-state cart-empty-state">
                <Icon icon="zi-location" />
                <h2>{profile.serviceAssignment.status === "OUT_OF_AREA" ? "Ngoài khu vực phục vụ" : "Cần vị trí để thanh toán"}</h2>
                <p>{profile.serviceAssignment.status === "OUT_OF_AREA" ? "Hãy cập nhật lại nếu vị trí hiện tại chưa chính xác." : "Zalo sẽ mở yêu cầu chia sẻ vị trí để chọn cửa hàng phù hợp."}</p>
                <Button loading={locationBusy} onClick={() => void retryLocation()}>Dùng vị trí hiện tại</Button>
              </div>
            </section>
          ) : (
            <CheckoutPage
              api={api}
              profile={profile}
              branch={selectedBranch}
              addresses={addresses}
              selectedAddressId={selectedAddressId}
              fulfillment={fulfillment}
              busy={busy}
              cartQuantities={cart}
              quoteLines={quoteLines}
              catalogState={catalogState}
              enforceServiceArea={SERVICE_AREA_ENFORCEMENT_ENABLED}
              onBack={() => navigateBack("/")}
              onAddresses={updateAddresses}
              onFulfillment={(next) => {
                setFulfillment(next);
              }}
              onQuantity={setQuantity}
              onCheckout={(submission) => void checkout(submission)}
              onSaveInvoiceProfile={saveInvoiceProfile}
            />
          )
        )}

        {view === "orders" && (
          selectedOrderId ? (
            <section className="page order-detail-page">
              <button className="page-back" onClick={() => navigateBack("/orders")} aria-label="Quay lại danh sách đơn hàng">
                <Icon icon="zi-chevron-left" /> Đơn hàng
              </button>
              {orderDetailLoading && <div className="order-detail-loading" role="status"><Spinner visible /><span>Đang tải đơn hàng…</span></div>}
              {orderDetail && !orderDetailLoading && (
                <>
                  <h1>Chi tiết đơn {orderDetail.code}</h1>
                  <article className="order-card order-detail-card">
                    <div className="order-detail-header">
                      <div className="order-heading"><strong>{orderDetail.code}</strong></div>
                      <div className="order-detail-meta">
                        <span className={`status status-${orderDetail.status.toLowerCase()}`}>{statusLabel(orderDetail.status)}</span>
                        <time>{new Date(orderDetail.createdAt).toLocaleString("vi-VN")}</time>
                      </div>
                    </div>
                    <p className="branch-context"><Icon icon="zi-location" /> {orderDetail.branch.name}</p>
                    <div className="order-status-lanes">
                      <p><span>Thanh toán</span><strong>{statusLabel(orderDetail.paymentStatus)}</strong></p>
                      <p><span>Giao nhận</span><strong>{statusLabel(orderDetail.operationalStatus ?? orderDetail.status)}</strong></p>
                    </div>
                    {orderDetail.lines?.map((sourceLine) => {
                      const line = displayOrderLine(sourceLine);
                      return <div className="order-line-summary" key={line.id}>
                        <img src={line.imageUrl ?? markUrl} alt={line.productName} />
                        <span>{line.productName}<small>{line.skuName} · ×{line.quantity}</small></span>
                        <strong>{money.format(Number(line.lineTotalVnd))}</strong>
                      </div>;
                    })}
                    <div className="order-breakdown">
                      <p><span>Tiền hàng</span><strong>{money.format(Number(orderDetail.itemsSubtotalVnd))}</strong></p>
                      <p><span>Phí giao hàng</span><strong>{money.format(Number(orderDetail.deliveryFeeVnd))}</strong></p>
                      <p><span>Hình thức nhận</span><strong>{orderDetail.fulfillmentMethod === "DELIVERY" ? "Giao tận nơi" : "Nhận tại cửa hàng"}</strong></p>
                      <p><span>Thanh toán qua</span><strong>{orderDetail.paymentMethod === "COD" ? "Tiền mặt khi nhận hàng" : orderDetail.paymentMethod === "ZALOPAY" ? "ZaloPay" : "Chưa xác định"}</strong></p>
                      <p className="order-detail-total"><span>Tổng cộng</span><strong>{money.format(Number(orderDetail.totalVnd))}</strong></p>
                    </div>
                    {orderDetail.canRetryCheckout && orderDetail.paymentExpiresAt && (
                      <p role="status">{checkoutExpiryLabel(orderDetail.paymentExpiresAt, clock) ?? "Đang cập nhật trạng thái thanh toán"}</p>
                    )}
                    {orderDetail.paymentMethod === "ZALOPAY" && orderDetail.canRetryCheckout && (
                      <div className="order-card-actions">
                        <Button size="small" disabled={busy} onClick={() => void retryOrderPayment(orderDetail.id)}>
                          Thanh toán lại
                        </Button>
                      </div>
                    )}
                    {orderDetail.canCancel && (
                      <div className="order-card-actions">
                        <Button size="small" disabled={busy} variant="secondary" onClick={() => void cancelOrder(orderDetail)}>
                          Hủy đơn
                        </Button>
                      </div>
                    )}
                    {["CANCELLED", "COMPLETED"].includes(orderDetail.status) && (
                      <div className="order-card-actions">
                        <Button size="small" disabled={busy} variant="secondary" onClick={() => void reorder(orderDetail)}>
                          Đặt lại
                        </Button>
                      </div>
                    )}
                  </article>
                </>
              )}
            </section>
          ) : (
            <section className="page orders-page">
              <header className="orders-page-heading">
                <h1>Đơn hàng của bạn</h1>
              </header>
              <nav className="order-filters" ref={orderFiltersRef} aria-label="Lọc đơn hàng theo trạng thái">
                {ORDER_FILTERS.map((filter) => {
                  const count = filter.id === "ALL"
                    ? orders.length
                    : orders.filter((order) => order.status === filter.id).length;
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      aria-label={`${filter.label}: ${count} đơn`}
                      aria-pressed={orderFilter === filter.id}
                      onClick={() => setOrderFilter(filter.id)}
                    >
                      {filter.label}<span>{count}</span>
                    </button>
                  );
                })}
              </nav>
              <div className="order-swipe-area" {...orderSwipeHandlers}>
                <div className="order-list">
                  {orders.length === 0 ? <div className="empty-state"><h2>Chưa có đơn hàng</h2></div> : filteredOrders.length === 0 ? <div className="empty-state compact"><h2>Không có đơn ở trạng thái này</h2></div> : filteredOrders.map((order) => (
                    <article className="order-card" key={order.id}>
                      <button className="order-card-open" onClick={() => navigate(`/orders/${order.id}`)} aria-label={`Xem chi tiết đơn ${order.code}`}>
                        <div className="order-heading"><strong>{order.code}</strong><time>{new Date(order.createdAt).toLocaleString("vi-VN")}</time></div>
                        <p className="branch-context"><Icon icon="zi-location" /> {order.branch.name}</p>
                        <span className={`status status-${order.status.toLowerCase()}`}>{statusLabel(order.status)}</span>
                        {order.lines?.map((sourceLine) => {
                          const line = displayOrderLine(sourceLine);
                          return <div className="order-line-summary" key={line.id}>
                            <img src={line.imageUrl ?? markUrl} alt={line.productName} />
                            <span>{line.productName}<small>{line.skuName} · ×{line.quantity}</small></span>
                            <strong>{money.format(Number(line.lineTotalVnd))}</strong>
                          </div>;
                        })}
                        <div className="order-total-row"><span>{order.fulfillmentMethod === "DELIVERY" ? "Giao tận nơi" : "Nhận tại cửa hàng"}</span><b>{money.format(Number(order.totalVnd))}</b><Icon icon="zi-chevron-right" /></div>
                      </button>
                      {order.canCancel && (
                        <div className="order-card-actions">
                          <Button size="small" variant="secondary" disabled={busy} onClick={() => void cancelOrder(order)}>
                            Hủy đơn
                          </Button>
                        </div>
                      )}
                      {["CANCELLED", "COMPLETED"].includes(order.status) && (
                        <div className="order-card-actions">
                          <Button size="small" variant="secondary" disabled={busy} onClick={() => void reorder(order)}>
                            Đặt lại
                          </Button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            </section>
          )
        )}

          </>
        )}
        {view === "account" && (
          <AccountPage
            profile={profile}
            addresses={addresses}
            orders={orders}
            api={api}
            initialSection={(() => {
              const section = new URLSearchParams(location.search).get("section");
              return section === "profile" || section === "addresses" ? section : "menu";
            })()}
            loginBusy={loginBusy}
            onLogin={() => void login(new URLSearchParams(location.search).get("return") === "cart" ? "cart" : new URLSearchParams(location.search).get("return") === "orders" ? "orders" : "account")}
            onBack={() => navigateBack("/account")}
            onOpenInfo={(section) => { setInfoSection(section); setTermsOpen(true); }}
            onOrders={(filter) => {
              if (!profile) { selectView("account"); navigate("/account?return=orders"); return; }
              setOrderFilter(filter ?? latestOrderFilter(orders));
              selectView("orders");
            }}
            onOpenProfile={() => navigate("/account?section=profile")}
            onProfile={setProfile}
            onSaveInvoiceProfile={saveInvoiceProfile}
            onAddresses={updateAddresses}
          />
        )}
        {paymentReminderPresence.mounted && lastPaymentReminder.current.order && (
          <aside className={`floating-payment-reminder${paymentReminderPresence.active && paymentReminderVisible ? " motion-visible" : ""}`} aria-hidden={!paymentReminderVisible}>
            <button
              type="button"
              onClick={() => selectOrderDetail(lastPaymentReminder.current.order!.id)}
              aria-label={`Mở đơn ${lastPaymentReminder.current.order.code} để thanh toán lại`}
              disabled={!paymentReminderVisible}
            >
              <span className="floating-payment-reminder-icon">
                <Icon icon="zi-clock-1" />
                {lastPaymentReminder.current.count > 1 && (
                  <b className="floating-payment-reminder-count">{lastPaymentReminder.current.count}</b>
                )}
              </span>
              <span className="floating-payment-reminder-copy">
                <strong>Chưa thanh toán</strong>
                <small>{lastPaymentReminder.current.count > 1 ? `${lastPaymentReminder.current.count} đơn đang chờ` : lastPaymentReminder.current.order.code} · Chạm để thanh toán lại</small>
              </span>
              <Icon icon="zi-chevron-right" />
            </button>
          </aside>
        )}
      </MarketLayout>
      {view === "account" && <TermsSheet visible={termsOpen} initialSection={infoSection} branches={branches} onClose={() => setTermsOpen(false)} >{termsOpen && infoSection !== "support" && <DataDeletionPanel api={api} authenticated={Boolean(profile)} onCompleted={() => clearPersonalData(true)} onSessionLost={() => clearPersonalData(false)} />}</TermsSheet>}
      <CampaignPopup
        campaigns={campaigns}
        visible={campaignPopupOpen && view === "home"}
        onClose={() => setCampaignPopupOpen(false)}
        onSelect={(campaign) => { setCampaignPopupOpen(false); openCampaign(campaign); }}
      />
      <Sheet
        visible={Boolean(pendingAgeRestrictedPath)}
        title="Xác nhận độ tuổi"
        className="age-confirmation-sheet"
        maskClosable={false}
        swipeToClose={false}
        onClose={() => { pendingCampaignRef.current = null; setPendingAgeRestrictedPath(null); }}
        autoHeight
        unmountOnClose
      >
        <section className="age-confirmation" aria-label="Xác nhận đủ 18 tuổi">
          <h2 className="visually-hidden">Xác nhận độ tuổi</h2>
          <span className="age-confirmation-icon" aria-hidden="true">18+</span>
          <p>Bạn cần đủ 18 tuổi để xem danh mục này.</p>
          <div className="age-confirmation-actions">
            <Button fullWidth onClick={confirmAdultContent}>Tôi đã đủ 18 tuổi</Button>
            <Button fullWidth variant="secondary" onClick={() => { pendingCampaignRef.current = null; setPendingAgeRestrictedPath(null); }}>Quay lại</Button>
          </div>
        </section>
      </Sheet>
      <Sheet
        visible={cartPreviewOpen}
        title="Sản phẩm đã chọn"
        className="cart-preview-sheet"
        onClose={() => setCartPreviewOpen(false)}
        autoHeight
      >
        <section className="cart-preview-content" aria-label="Sản phẩm đã chọn">
          <div className="cart-preview-lines">
            {cartLines.map((line) => (
              <button
                type="button"
                className="cart-preview-line"
                key={line.sku.id}
                aria-label={`Xem chi tiết ${line.product.name}`}
                onClick={() => openProduct(line.product.id)}
              >
                <img src={line.product.imageUrl ?? markUrl} alt={line.product.name} />
                <div>
                  <strong>{line.product.name}</strong>
                  <small>{line.sku.name} · ×{line.quantity}</small>
                </div>
                <b>{money.format(Number(line.sku.priceVnd) * line.quantity)}</b>
              </button>
            ))}
          </div>
          <footer className="cart-preview-footer">
            <span>Tạm tính</span>
            <strong>{money.format(subtotal)}</strong>
            <Button fullWidth onClick={() => {
              setCartPreviewOpen(false);
              selectView("cart");
            }}>Xem giỏ hàng</Button>
          </footer>
        </section>
      </Sheet>
      <Sheet
        visible={Boolean(selectedProduct)}
        height="85vh"
        className="product-quick-view-sheet"
        maskClassName="product-quick-view-mask"
        onClose={closeProduct}
        unmountOnClose
      >
      {selectedProduct && (() => {
        const sku = selectedProduct.skus.find((item) => item.id === selectedSkuId) ?? selectedProduct.skus[0];
        const quantity = sku && detailQuantity?.skuId === sku.id ? detailQuantity.quantity : 1;
        return (
            <section className="product-quick-view" aria-labelledby="product-title">
              <header className="product-quick-view-header">
                <span>{selectedProduct.categoryName}</span>
                <button type="button" onClick={closeProduct} aria-label={`Đóng chi tiết ${selectedProduct.name}`}>
                  <Icon icon="zi-close" />
                </button>
              </header>
              <div className="product-quick-view-scroll">
                <button
                  type="button"
                  className="product-quick-view-image"
                  onClick={() => setImageViewerOpen(true)}
                  aria-label={`Phóng to ảnh ${selectedProduct.name}`}
                >
                  {selectedProduct.imageUrl ? <img src={selectedProduct.imageUrl} alt={selectedProduct.name} /> : <img className="brand-placeholder" src={markUrl} alt="" />}
                </button>
                <div className="product-quick-view-summary">
                  <div className="product-quick-view-title-row">
                    <h1 id="product-title">{selectedProduct.name}</h1>
                    <strong>{money.format(Number(sku?.priceVnd ?? selectedProduct.minimumPriceVnd))}</strong>
                  </div>
                  <ProductDescription value={selectedProduct.description} />
                  {selectedProduct.skus.length > 1 ? (
                    <div className="variant-options" aria-label="Chọn quy cách">
                      {selectedProduct.skus.map((item) => (
                        <button
                          key={item.id}
                          className={item.id === sku?.id ? "active" : ""}
                          onClick={() => {
                            setSelectedSkuId(item.id);
                            setDetailQuantity({ skuId: item.id, quantity: 1 });
                          }}
                          disabled={item.availableQuantity < 1}
                        >
                          <strong>{item.name}</strong>
                          <span>{item.availableQuantity > 0 ? money.format(Number(item.priceVnd)) : "Hết hàng"}</span>
                        </button>
                      ))}
                    </div>
                  ) : sku && <div className="product-variant"><span>Quy cách</span><strong>{sku.name}</strong></div>}
                </div>
              </div>
              <footer className="product-quick-view-actions">
                <div className="detail-stepper stepper" aria-label="Số lượng">
                  <Button type="neutral" variant="tertiary" size="small" icon={<Icon icon="zi-minus-circle" />} disabled={!sku || quantity <= 1} aria-label={`Giảm ${selectedProduct.name}`} onClick={() => sku && setDetailQuantity({ skuId: sku.id, quantity: quantity - 1 })} />
                  <span>{quantity}</span>
                  <Button type="neutral" variant="tertiary" size="small" icon={<Icon icon="zi-plus-circle" />} disabled={!sku || quantity >= sku.availableQuantity} aria-label={`Tăng ${selectedProduct.name}`} onClick={() => sku && setDetailQuantity({ skuId: sku.id, quantity: quantity + 1 })} />
                </div>
                <Button
                  className="detail-cart-cta"
                  size="large"
                  disabled={!sku || sku.availableQuantity < 1}
                  onClick={() => sku && void (async () => {
                    if (await setQuantity(sku.id, (cart[sku.id] ?? 0) + quantity)) closeProduct();
                  })()}
                >
                  Thêm vào giỏ · {money.format(Number(sku?.priceVnd ?? selectedProduct.minimumPriceVnd))}
                </Button>
              </footer>
            </section>
        );
      })()}
      </Sheet>
      {selectedProduct && <ProductImageViewer
        visible={imageViewerOpen}
        images={selectedProduct.images ?? []}
        fallbackImage={selectedProduct.imageUrl}
        productName={selectedProduct.name}
        onClose={() => setImageViewerOpen(false)}
      />}
      <Sheet visible={locationConfirmationOpen} title="Cửa hàng phục vụ bạn" onClose={() => setLocationConfirmationOpen(false)} autoHeight>
        <div className="branch-sheet-content">
          <p className="branch-sheet-help">Vị trí hiện tại phù hợp với <strong>{selectedBranch?.name}</strong>. Giỏ hàng vẫn được giữ riêng theo từng cửa hàng.</p>
          <Button fullWidth onClick={() => setLocationConfirmationOpen(false)}>Xác nhận</Button>
        </div>
      </Sheet>
    </div>
  );
}

function AccountPage({ profile, addresses, orders, api, initialSection, onOrders, onOpenProfile, onProfile, onSaveInvoiceProfile, onAddresses, onOpenInfo, onLogin, loginBusy, onBack }: {
  profile: CustomerProfile | null;
  addresses: Address[];
  orders: CustomerOrder[];
  api: CustomerApi;
  initialSection: "menu" | "profile" | "addresses";
  onOpenInfo: (section: AccountInfoSection) => void;
  onLogin: () => void;
  loginBusy: boolean;
  onBack: () => void;
  onOrders: (filter?: OrderFilter) => void;
  onOpenProfile: () => void;
  onProfile: (profile: CustomerProfile) => void;
  onSaveInvoiceProfile: (invoice: InvoiceRequest) => Promise<void>;
  onAddresses: (addresses: Address[]) => void;
}) {
  const [section, setSection] = useState<"menu" | "profile" | "addresses">(initialSection);
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [addressEditorOpen, setAddressEditorOpen] = useState(false);
  const [invoiceSheetOpen, setInvoiceSheetOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const savedAddress = addresses.find((address) => address.isDefault) ?? addresses[0];

  useLayoutEffect(() => setSection(initialSection), [initialSection]);

  async function shareZaloPhone(): Promise<void> {
    setPhoneBusy(true);
    setMessage(null);
    try {
      const token = await requestZaloPhoneToken();
      const next = await api.linkZaloPhone(token);
      setPhone(next.phone ?? "");
      onProfile(next);
      setMessage("Đã xác minh số điện thoại từ Zalo");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Không thể lấy số điện thoại từ Zalo");
    } finally {
      setPhoneBusy(false);
    }
  }

  function closeAddressEditor(): void {
    setAddressEditorOpen(false);
  }

  function openNewAddress(): void {
    setEditingAddress(null);
    setAddressEditorOpen(true);
  }

  function editAddress(address: Address): void {
    setEditingAddress(address);
    setAddressEditorOpen(true);
  }

  if (section === "menu" || !profile) {
    return (
      <section className="page account-page">
        <button className="account-summary" onClick={profile ? onOpenProfile : () => onOpenInfo("privacy")} aria-label={`Mở thông tin tài khoản của ${profile?.displayName ?? "Khách hàng"}`}>
          <Avatar size={56} {...(profile?.avatarUrl ? { src: profile.avatarUrl } : {})}>
            {profile?.displayName?.slice(0, 1) ?? "8"}
          </Avatar>
          <span><strong>{profile?.displayName ?? "Khách hàng"}</strong><small>{profile?.phone ?? "Chưa có số điện thoại"}</small></span>
          <Icon icon="zi-chevron-right" />
        </button>
        {!profile && <section className="login-notice" aria-label="Quyền đăng nhập Zalo">
          <p>Tên và ảnh đại diện giúp nhận diện tài khoản của bạn. Số điện thoại được dùng để xác minh tài khoản và liên hệ về đơn hàng. Thông tin được lưu trong hệ thống cửa hàng và chỉ được dùng cho các mục đích đã thông báo.</p>
          <button type="button" onClick={() => onOpenInfo("privacy")}>Đọc chính sách quyền riêng tư</button>
          <Button fullWidth loading={loginBusy} onClick={onLogin}>Đồng ý và đăng nhập bằng Zalo</Button>
        </section>}
        {profile && <section className="account-orders" aria-labelledby="account-orders-heading">
          <div className="account-orders-heading">
            <h2 id="account-orders-heading">Đơn hàng</h2>
            <button type="button" onClick={() => onOrders()} aria-label="Xem tất cả đơn hàng">Xem tất cả <Icon icon="zi-chevron-right" /></button>
          </div>
          <nav className="account-order-statuses" aria-label="Trạng thái đơn hàng">
            {ACCOUNT_ORDER_FILTERS.map((filter) => {
              const count = orders.filter((order) => order.status === filter.id).length;
              return <button key={filter.id} type="button" onClick={() => onOrders(filter.id)} aria-label={`${filter.label}: ${count} đơn`}>
                <span className="account-order-status-icon">{filter.icon ? <Icon icon={filter.icon} /> : <img src={deliveryTruckUrl} alt="" />}<b>{count}</b></span>
                <span>{filter.label}</span>
              </button>;
            })}
          </nav>
        </section>
        }
        <nav className="account-menu" aria-label="Menu cá nhân">
          {profile && <button onClick={onOpenProfile} aria-label="Thông tin cá nhân"><Icon icon="zi-user" /><span><strong>Thông tin cá nhân</strong><small>Tài khoản Zalo, hóa đơn và địa chỉ nhận hàng</small></span><Icon icon="zi-chevron-right" /></button>}
          <button type="button" onClick={() => onOpenInfo("overview")} aria-label="Thông tin cửa hàng và chính sách"><Icon icon="zi-info-circle" /><span><strong>Thông tin cửa hàng và chính sách</strong><small>Điều khoản, giao dịch và quyền riêng tư</small></span><Icon icon="zi-chevron-right" /></button>
          <button type="button" onClick={() => onOpenInfo("support")} aria-label="Hỗ trợ và liên hệ"><Icon icon="zi-call" /><span><strong>Hỗ trợ và liên hệ</strong></span><Icon icon="zi-chevron-right" /></button>
        </nav>
      </section>
    );
  }

  return (
    <section className="page account-page">
      <header className="account-detail-header"><button type="button" onClick={onBack} aria-label="Quay lại"><Icon icon="zi-chevron-left" /></button><h1>Thông tin cá nhân</h1></header>
      <section className="zalo-profile-card" aria-label="Tài khoản của bạn">
        <Avatar size={52} {...(profile?.avatarUrl ? { src: profile.avatarUrl } : {})}>
          {profile?.displayName?.slice(0, 1) ?? "Z"}
        </Avatar>
        <span>
          <strong>{profile?.displayName ?? "Khách Zalo"}</strong>
          <small>{profile?.phone ?? "Chưa có số điện thoại"}</small>
        </span>
        {!profile?.phone && (
          <Button
            size="small"
            loading={phoneBusy}
            prefixIcon={<Icon icon="zi-call" />}
            aria-label="Xác minh số điện thoại Zalo"
            onClick={() => void shareZaloPhone()}
          >
            Xác minh
          </Button>
        )}
      </section>
      {import.meta.env.DEV && (
        <form onSubmit={(event) => { event.preventDefault(); void api.updateProfile({ phone }).then(async () => { const next = await api.profile(); onProfile(next); setMessage("Đã lưu số điện thoại phát triển"); }); }}>
          <Input label="Số điện thoại kiểm thử cục bộ" aria-label="Số điện thoại kiểm thử cục bộ" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="090…" />
          <Button size="large" fullWidth htmlType="submit" variant="secondary">Lưu số kiểm thử</Button>
        </form>
      )}
      <div className="address-heading"><h2>Địa chỉ giao hàng</h2></div>
      {!savedAddress && <><p className="empty-address-message">Bạn chưa lưu địa chỉ nhận hàng.</p><Button variant="secondary" onClick={openNewAddress}>Thêm địa chỉ</Button></>}
      {savedAddress && (
        <address className="default-address">
          <div><strong>{savedAddress.recipientName}</strong><span className="default-badge">Địa chỉ nhận hàng</span></div>
          <span>{[savedAddress.line1, savedAddress.ward, savedAddress.district, savedAddress.province].filter(Boolean).join(", ")}</span>
          <small>{savedAddress.phone}</small>
          <div className="address-actions"><button type="button" onClick={() => void editAddress(savedAddress)}>Sửa</button></div>
        </address>
      )}
      <section className="choice-group invoice-profile-card" aria-labelledby="invoice-profile-heading">
        <h2 id="invoice-profile-heading">Thông tin hoá đơn</h2>
        <p>{profile?.invoiceProfile ? "Thông tin đã lưu sẽ được dùng khi bạn yêu cầu hóa đơn cho đơn hàng." : "Lưu thông tin để dùng khi bạn cần yêu cầu hóa đơn cho đơn hàng."}</p>
        <Button fullWidth variant="secondary" onClick={() => setInvoiceSheetOpen(true)}>
          {profile?.invoiceProfile ? "Cập nhật thông tin hóa đơn" : "Thông tin hóa đơn"}
        </Button>
      </section>
      <AddressEditorSheet
        visible={addressEditorOpen}
        address={editingAddress}
        profile={profile}
        api={api}
        onClose={closeAddressEditor}
        onAddresses={onAddresses}
        onSaved={setMessage}
      />
      <Sheet visible={invoiceSheetOpen} title="Thông tin hóa đơn" onClose={() => setInvoiceSheetOpen(false)} autoHeight>
        <InvoiceProfileEditor
          value={profile?.invoiceProfile}
          submitLabel={profile?.invoiceProfile ? "Cập nhật thông tin" : "Lưu thông tin"}
          onSave={async (invoice) => {
            await onSaveInvoiceProfile(invoice);
            setInvoiceSheetOpen(false);
          }}
        />
      </Sheet>
      {message && <p className="success-message">{message}</p>}
    </section>
  );
}

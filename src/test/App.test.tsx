import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App as ZaUIApp } from "zmp-ui";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../App.js";
import { HttpCustomerApi, type Address, type Branch, type CustomerApi, type CustomerOrder } from "../api.js";
import { BRANCH_STORAGE_KEY } from "../branch.js";
import { openCheckout, selectCheckoutPaymentMethod } from "../checkout.js";
import { getZaloLoginPermission, requestZaloLocation, requestZaloPhoneToken } from "../zaloUser.js";
import { miniAppStorage } from "../storage.js";

vi.mock("../checkout.js", async () => {
  const actual = await vi.importActual<typeof import("../checkout.js")>("../checkout.js");
  return {
    ...actual,
    openCheckout: vi.fn(async () => "provider-order"),
    selectCheckoutPaymentMethod: vi.fn(async () => ({
      paymentMethod: "COD" as const,
      checkoutMethod: { id: "COD_SANDBOX", isCustom: false as const },
    })),
  };
});

vi.mock("../zaloUser.js", () => ({
  getZaloLoginPermission: vi.fn(async () => "granted"),
  requestZaloUserInfo: vi.fn(async () => undefined),
  requestZaloPhoneToken: vi.fn(async () => ({ code: "phone-token", accessToken: "access-token" })),
  requestZaloLocation: vi.fn(async () => ({ locationToken: "location-token", accessToken: "access-token" })),
  isZaloLocationDenied: vi.fn(() => false),
  openZaloLocationPermissionSettings: vi.fn(async () => undefined),
  getZaloLocationPermission: vi.fn(async () => "unknown"),
}));

const branch = { id: "11111111-1111-4111-8111-111111111111", code: "Q1", name: "Cửa hàng Quận 1", address: "Địa chỉ chi nhánh thử nghiệm" };
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
const order: CustomerOrder = {
  id: "44444444-4444-4444-8444-444444444444",
  code: "T8-0001",
  status: "CONFIRMED",
  paymentStatus: "PAID",
  paymentMethod: "ZALOPAY" as const,
  fulfillmentMethod: "DELIVERY" as const,
  totalVnd: "160000",
  itemsSubtotalVnd: "145000",
  deliveryFeeVnd: "15000",
  createdAt: "2026-09-07T08:00:00.000Z",
  canCancel: false,
  branch,
  lines: [{
    id: "line-1",
    skuId: "11111111-1111-4111-8111-111111111111",
    productName: "Cà phê Arabica cửa hàng",
    skuName: "Túi 250g",
    skuCode: "T8-ARABICA-250",
    imageUrl: "https://example.com/coffee.jpg",
    quantity: 1,
    unitPriceVnd: "145000",
    lineTotalVnd: "145000",
  }],
};

function setWindowScroll(top: number): void {
  Object.defineProperty(window, "scrollY", { configurable: true, value: top });
  document.body.scrollTop = top;
  fireEvent.scroll(document.body);
}

function resetWindowScroll(): void {
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  document.body.scrollTop = 0;
}

function swipeRight(element: HTMLElement): void {
  const touch = (type: "touchstart" | "touchmove" | "touchend", clientX: number) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "touches", { value: type === "touchend" ? [] : [{ clientX, clientY: 100 }] });
    element.dispatchEvent(event);
  };
  touch("touchstart", 20);
  touch("touchmove", 100);
  touch("touchend", 100);
}

async function chooseBranch(): Promise<void> {
  await waitFor(() => expect(document.querySelector(".branch-picker-trigger")).not.toBeNull());
  fireEvent.click(document.querySelector<HTMLButtonElement>(".branch-picker-trigger")!);
  fireEvent.click(screen.getAllByRole("button", { name: "Chọn chi nhánh" }).at(-1)!);
  fireEvent.click(await screen.findByRole("button", { name: /Cửa hàng Quận 1/ }));
  fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
}

const api: CustomerApi = {
  login: async () => ({ accessToken: "token", customer: { id: "customer-1", phone: "0900000000" } }),
  logout: () => undefined,
  dataDeletionRequest: async () => ({ request: null }),
  requestDataDeletion: async () => { throw new Error("Not configured in this test"); },
  branches: async () => ({ branches: [branch] }),
  catalog: async () => ({
    catalogState: { source: "backend", stale: false, lastSuccessfulAt: "2026-08-26T08:00:00.000Z", deliveryFeeVnd: "15000", branch },
    products: [
      {
        id: "product-1",
        name: "Cà phê Arabica cửa hàng",
        slug: "ca-phe-arabica-tram-8",
        description: "<p>Một chiếc bánh xốp wafer.</p><h2 style=\"color:red\"><span>Thành phần</span></h2><p><strong>Vị socola:</strong> Bột mì, kem tươi.</p><p><em>Hướng dẫn sử dụng:</em> Dùng trực tiếp.</p>",
        categoryName: "Đồ uống",
        categoryPath: ["Thực phẩm & đồ uống", "Nước giải khát", "Đồ uống"],
        recommended: true,
        imageUrl: "https://example.com/coffee.jpg",
        minimumPriceVnd: "145000",
        skus: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            code: "T8-ARABICA-250",
            name: "Túi 250g",
            priceVnd: "145000",
            availableQuantity: 4,
            active: true,
          },
        ],
      },
      {
        id: "product-sold-out",
        name: "Sản phẩm đã hết hàng",
        slug: "san-pham-da-het-hang",
        categoryName: "Đồ uống",
        categoryPath: ["Thực phẩm & đồ uống", "Nước giải khát", "Đồ uống"],
        recommended: false,
        imageUrl: null,
        minimumPriceVnd: "20000",
        skus: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            code: "SOLD-OUT",
            name: "Mặc định",
            priceVnd: "20000",
            availableQuantity: 0,
            active: true,
          },
        ],
      },
      {
        id: "product-food",
        name: "Bánh mì cửa hàng",
        slug: "banh-mi-tram-8",
        categoryName: "Đồ ăn",
        categoryPath: ["Thực phẩm & đồ uống", "Đồ ăn"],
        recommended: false,
        imageUrl: null,
        minimumPriceVnd: "30000",
        skus: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            code: "FOOD",
            name: "Mặc định",
            priceVnd: "30000",
            availableQuantity: 2,
            active: true,
          },
        ],
      },
      {
        id: "product-regulated",
        name: "Bia cửa hàng",
        slug: "bia-tram-8",
        categoryName: "Bia",
        categoryPath: ["Đồ uống có cồn (18+)", "Bia"],
        recommended: true,
        imageUrl: null,
        minimumPriceVnd: "30000",
        skus: [
          {
            id: "66666666-6666-4666-8666-666666666666",
            code: "BEER",
            name: "Lon",
            priceVnd: "30000",
            availableQuantity: 5,
            active: true,
          },
        ],
      },
      {
        id: "product-alcoholic",
        name: "Nước lúa mạch cửa hàng",
        slug: "nuoc-lua-mach-tram-8",
        categoryName: "Bia",
        categoryPath: ["Đồ uống", "Đồ uống có cồn", "Bia"],
        recommended: true,
        imageUrl: null,
        minimumPriceVnd: "30000",
        skus: [
          {
            id: "77777777-7777-4777-8777-777777777777",
            code: "MALT",
            name: "Lon",
            priceVnd: "30000",
            availableQuantity: 5,
            active: true,
          },
        ],
      },
    ],
  }),
  cart: async () => ({ cart: { id: null, branch, lines: [] } }),
  saveCart: async (_branchId, lines) => ({ cart: { id: "cart-1", lines } }),
  checkoutQuote: async () => {
    throw new Error("Checkout quote is not used by this fixture");
  },
  profile: async () => ({ id: "customer-1", displayName: "Khách hàng", phone: "0900000000" }),
  addresses: async () => ({ addresses: [] }),
  orders: async () => ({ orders: [] }),
  createOrder: async () => {
    throw new Error("not used");
  },
  updateProfile: async () => undefined,
  linkZaloPhone: async () => ({ id: "customer-1", displayName: "Khách hàng", phone: "0900000000" }),
  reverseGeocode: async () => ({ address: "12 Đường Hạnh Phúc, Phường Minh Khai" }),
  createAddress: async () => undefined,
  updateAddress: async () => undefined,
  deleteAddress: async () => undefined,
  order: async () => { throw new Error("not used"); },
  cancelOrder: async () => { throw new Error("not used"); },
  retryCheckout: async () => { throw new Error("not used"); },
  bindCheckout: async () => undefined,
};

describe("customer Mini App", () => {
  it("returns directly to Personal from a profile deep link without a branch", async () => {
    render(<ZaUIApp theme="light"><MemoryRouter initialEntries={["/account?section=profile"]}><App api={api} /></MemoryRouter></ZaUIApp>);
    fireEvent.click(await screen.findByRole("button", { name: "Quay lại" }));
    expect(await screen.findByRole("button", { name: "Thông tin cửa hàng và chính sách" })).toBeInTheDocument();
  });
  it("clears account data and cart only after backend confirms deletion", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const logout = vi.fn();
    const requestDataDeletion = vi.fn(async (id: string) => ({ request: { id, status: "COMPLETED" as const, requestedAt: new Date().toISOString(), completedAt: new Date().toISOString(), retainedSummary: null } }));
    render(<ZaUIApp theme="light"><MemoryRouter><App api={{ ...api, logout, requestDataDeletion }} /></MemoryRouter></ZaUIApp>);
    fireEvent.click((await screen.findAllByRole("button", { name: "Thêm Cà phê Arabica cửa hàng" }))[0]!);
    fireEvent.click(screen.getByRole("button", { name: /Cá nhân$/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Thông tin cửa hàng và chính sách" }));
    fireEvent.click(screen.getByText("Bảo vệ dữ liệu cá nhân"));
    fireEvent.click(await screen.findByRole("button", { name: "Yêu cầu xóa dữ liệu" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận gửi yêu cầu" }));
    await waitFor(() => expect(logout).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Đóng thông tin" }));
    expect(await screen.findByRole("button", { name: "Đồng ý và đăng nhập bằng Zalo" })).toBeInTheDocument();
    expect(miniAppStorage.getItem("shop_data_deletion_pending_request")).toBeNull();
  });
  it("submits a real data deletion request only inside Personal privacy", async () => {
    const requestDataDeletion = vi.fn(async (clientRequestId: string) => ({ request: { id: clientRequestId, status: "PENDING_REVIEW" as const, requestedAt: new Date().toISOString(), completedAt: null, retainedSummary: null } }));
    const dataDeletionRequest = vi.fn(api.dataDeletionRequest);
    render(<ZaUIApp theme="light"><MemoryRouter><App api={{ ...api, dataDeletionRequest, requestDataDeletion }} /></MemoryRouter></ZaUIApp>);
    fireEvent.click(await screen.findByRole("button", { name: /Cá nhân$/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Thông tin cửa hàng và chính sách" }));
    expect(dataDeletionRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Bảo vệ dữ liệu cá nhân"));
    await waitFor(() => expect(dataDeletionRequest).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole("button", { name: "Yêu cầu xóa dữ liệu" }));
    expect(requestDataDeletion).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận gửi yêu cầu" }));
    expect(await screen.findByText(/Đang chờ rà soát/)).toBeInTheDocument();
    expect(requestDataDeletion).toHaveBeenCalledTimes(1);
  });

  it("keeps public information exclusively in Personal and lets guests read it without login", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    vi.mocked(getZaloLoginPermission).mockResolvedValue("denied");
    const login = vi.fn(api.login);
    render(<ZaUIApp theme="light"><MemoryRouter><App api={{ ...api, login }} /></MemoryRouter></ZaUIApp>);
    await screen.findByRole("button", { name: /Cá nhân$/ });
    expect(screen.queryByRole("button", { name: "Điều khoản và thỏa thuận sử dụng" })).not.toBeInTheDocument();
    expect(document.querySelector(".legal-entry")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Cá nhân$/ }));
    expect(screen.getByRole("button", { name: "Thông tin cửa hàng và chính sách" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Điều khoản sử dụng" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quyền riêng tư và dữ liệu" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thông tin cửa hàng và chính sách" }));
    const terms = await screen.findByRole("region", { name: "Thông tin cửa hàng và chính sách" });
    expect(within(terms).getByRole("heading", { name: "Thông tin doanh nghiệp" })).toBeInTheDocument();
    expect(terms.querySelector('[data-section="company"]')).not.toHaveAttribute("open");
    expect(within(terms).getByText("Điều kiện giao dịch và đặt hàng")).toBeInTheDocument();
    expect(within(terms).getByText("Bảo vệ dữ liệu cá nhân")).toBeInTheDocument();
    expect(terms.querySelector('[data-section="support"]')).toBeNull();
    act(() => swipeRight(terms));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Thông tin cửa hàng và chính sách" })).not.toBeInTheDocument());
    expect(document.querySelector(".app-shell-account")).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("opens public contact information before a guest chooses a branch", async () => {
    vi.mocked(getZaloLoginPermission).mockResolvedValue("denied");
    const login = vi.fn(api.login);
    render(<ZaUIApp theme="light"><MemoryRouter initialEntries={["/account"]}><App api={{ ...api, login }} /></MemoryRouter></ZaUIApp>);
    fireEvent.click(await screen.findByRole("button", { name: "Hỗ trợ và liên hệ" }));
    const terms = await screen.findByRole("region", { name: "Hỗ trợ và liên hệ" });
    expect(within(terms).getByText("1900000000")).toBeInTheDocument();
    expect(within(terms).getByRole("link", { name: "support@example.com" })).toHaveAttribute("href", "mailto:support@example.com");
    expect(within(terms).getByRole("link", { name: "Facebook cửa hàng" })).toHaveAttribute("href", "https://www.facebook.com/");
    expect(terms.querySelector('[data-section="company"]')).toBeNull();
    expect(login).not.toHaveBeenCalled();
  });

  it("opens privacy directly from the guest login explanation", async () => {
    vi.mocked(getZaloLoginPermission).mockResolvedValue("denied");
    render(<ZaUIApp theme="light"><MemoryRouter initialEntries={["/account"]}><App api={api} /></MemoryRouter></ZaUIApp>);
    fireEvent.click(await screen.findByRole("button", { name: "Đọc chính sách quyền riêng tư" }));
    const content = await screen.findByRole("region", { name: "Thông tin cửa hàng và chính sách" });
    expect(content.querySelector('[data-section="privacy"]')).toHaveAttribute("open");
  });

  it.each(["/", "/cart"])("does not expose legal entries on %s", async (path) => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(<ZaUIApp theme="light"><MemoryRouter initialEntries={[path]}><App api={api} /></MemoryRouter></ZaUIApp>);
    await screen.findByRole("button", { name: /Cá nhân$/ });
    expect(document.querySelector(".legal-entry")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Điều khoản sử dụng" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thông tin cửa hàng và chính sách" })).not.toBeInTheDocument();
  });

  it("opens a restricted campaign only after age confirmation", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const campaignApi: CustomerApi = { ...api, catalog: async () => ({
      ...(await api.catalog(branch.id)),
      campaigns: [{ id: "campaign-1", title: "Xem Bia cửa hàng", images: { headerUrl: "https://cdn.test/banner.png" }, productIds: ["product-regulated"] }],
    }) };
    render(<ZaUIApp theme="light"><MemoryRouter><App api={campaignApi} /></MemoryRouter></ZaUIApp>);
    fireEvent.click(await screen.findByRole("button", { name: "Xem Bia cửa hàng" }));
    expect(await screen.findByRole("heading", { name: "Xác nhận độ tuổi" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Xem Bia cửa hàng" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tôi đã đủ 18 tuổi" }));
    expect(await screen.findByRole("heading", { name: "Xem Bia cửa hàng" })).toBeInTheDocument();
    expect(screen.getByText("Bia cửa hàng")).toBeInTheDocument();
  });
  it("shows a campaign in the normal catalog layout and returns by edge swipe", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const campaignApi: CustomerApi = { ...api, catalog: async () => ({
      ...(await api.catalog(branch.id)),
      campaigns: [{ id: "campaign-1", title: "Sản phẩm mùa hè", images: { headerUrl: "https://cdn.test/summer-wide.png", iconUrl: "https://cdn.test/summer.png" }, productIds: ["product-1"] }],
    }) };
    render(<ZaUIApp theme="light"><MemoryRouter><App api={campaignApi} /></MemoryRouter></ZaUIApp>);

    const campaignButton = await within(await screen.findByRole("navigation", { name: "Danh mục campaign" })).findByRole("button", { name: "Sản phẩm mùa hè" });
    document.body.scrollTop = 120;
    fireEvent.click(campaignButton);
    expect(screen.getByRole("heading", { name: "Sản phẩm mùa hè" })).toBeInTheDocument();
    expect(document.querySelector(".campaign-product-page")).toHaveClass("catalog");
    expect(document.querySelector(".campaign-product-header img")).toHaveAttribute("src", "https://cdn.test/summer-wide.png");
    expect(screen.queryByRole("button", { name: "Quay lại Trang chủ" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Chuyển sang dạng danh sách" }));
    expect(document.querySelector(".campaign-product-page .product-list")).toHaveClass("product-list-list");
    fireEvent.click(screen.getByRole("button", { name: "Tìm sản phẩm" }));
    expect(screen.getByRole("dialog", { name: "Tìm kiếm sản phẩm" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Đóng tìm kiếm" }));
    await act(async () => swipeRight(document.querySelector<HTMLElement>(".app-gesture-surface")!));
    expect(screen.queryByRole("heading", { name: "Sản phẩm mùa hè" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chọn danh mục: Tất cả" })).toBeInTheDocument();
    await waitFor(() => expect(document.body.scrollTop).toBe(120));

    fireEvent.click(within(screen.getByRole("navigation", { name: "Danh mục campaign" })).getByRole("button", { name: "Sản phẩm mùa hè" }));
    fireEvent.click(screen.getByRole("button", { name: "Chọn danh mục: Sản phẩm mùa hè" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Chọn danh mục" })).getByRole("button", { name: "Trang chủ" }));
    expect(screen.queryByRole("heading", { name: "Sản phẩm mùa hè" })).not.toBeInTheDocument();
  });
  it("keeps an informational campaign banner noninteractive", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const campaignApi: CustomerApi = { ...api, catalog: async () => ({
      ...(await api.catalog(branch.id)),
      campaigns: [{ id: "campaign-2", title: "Ưu đãi hôm nay", images: { headerUrl: "https://cdn.test/food.png" }, productIds: [] }],
    }) };
    render(<ZaUIApp theme="light"><MemoryRouter><App api={campaignApi} /></MemoryRouter></ZaUIApp>);
    expect(await screen.findByLabelText("Ưu đãi hôm nay")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ưu đãi hôm nay" })).not.toBeInTheDocument();
  });
  it("shows the campaign popup once per Vietnam day", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const campaignApi: CustomerApi = { ...api, catalog: async () => ({
      ...(await api.catalog(branch.id)),
      campaigns: [{ id: "campaign-popup", title: "Popup hôm nay", images: { popupUrl: "https://cdn.test/popup.png" }, productIds: [] }],
    }) };
    const originalGet = miniAppStorage.getItem.bind(miniAppStorage);
    const originalSet = miniAppStorage.setItem.bind(miniAppStorage);
    let shownDate: string | null = null;
    vi.spyOn(miniAppStorage, "getItem").mockImplementation((key) => key === "shop_campaign_popup_date_v1" ? shownDate : originalGet(key));
    vi.spyOn(miniAppStorage, "setItem").mockImplementation((key, value) => {
      if (key === "shop_campaign_popup_date_v1") shownDate = value;
      else originalSet(key, value);
    });
    const first = render(<ZaUIApp theme="light"><MemoryRouter><App api={campaignApi} /></MemoryRouter></ZaUIApp>);
    expect(await screen.findByRole("dialog", { name: "Khuyến mại" })).toBeInTheDocument();
    expect(shownDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    fireEvent.click(screen.getByRole("button", { name: "Đóng popup" }));
    first.unmount();
    render(<ZaUIApp theme="light"><MemoryRouter><App api={campaignApi} /></MemoryRouter></ZaUIApp>);
    await screen.findByRole("button", { name: "Tìm sản phẩm" });
    expect(screen.queryByRole("dialog", { name: "Khuyến mại" })).not.toBeInTheDocument();
  });
  it("does not read native search history while browsing tabs with search closed", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    localStorage.setItem("shop_search_history_v1", JSON.stringify(["Cà phê"]));
    const readStorage = vi.spyOn(miniAppStorage, "getItem");
    try {
      render(<ZaUIApp theme="light"><MemoryRouter><App api={api} /></MemoryRouter></ZaUIApp>);
      await screen.findByRole("button", { name: "Tìm sản phẩm" });
      for (let i = 0; i < 10; i++) {
        fireEvent.click(await screen.findByRole("button", { name: /Cá nhân/ }));
        fireEvent.click(screen.getByRole("button", { name: /Trang chủ$/ }));
      }
      expect(readStorage.mock.calls.filter(([key]) => key === "shop_search_history_v1")).toHaveLength(0);
      fireEvent.click(screen.getByRole("button", { name: "Tìm sản phẩm" }));
      expect(screen.getByRole("button", { name: "Cà phê" })).toBeInTheDocument();
    } finally {
      readStorage.mockRestore();
    }
  });

  it("loads the current backend profile after creating the Zalo session", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(
      <ZaUIApp theme="light">
        <MemoryRouter initialEntries={["/account"]}>
          <App api={{
            ...api,
            login: async () => ({ accessToken: "token", customer: { id: "customer-1" } }),
            profile: async () => ({
              id: "customer-1",
              displayName: "Nguyễn Văn A",
              phone: "0900000000",
              avatarUrl: "https://example.com/zalo-avatar.jpg",
            }),
          }} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    expect(await screen.findByText("Nguyễn Văn A")).toBeInTheDocument();
    expect(screen.getByText("0900000000")).toBeInTheDocument();
  });

  it("signs in from the personal button, then replaces it with the Zalo avatar", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const login = vi.fn(async () => ({ accessToken: "token", customer: { id: "customer-1" } }));
    const linkZaloPhone = vi.fn(async () => ({ id: "customer-1", displayName: "Nguyễn Văn A", phone: "0912345678", avatarUrl: "https://example.com/zalo-avatar.jpg" }));
    const profile = vi.fn()
      .mockRejectedValueOnce(new Error("Chưa đăng nhập"))
      .mockResolvedValue({ id: "customer-1", displayName: "Nguyễn Văn A", phone: "0912345678", avatarUrl: "https://example.com/zalo-avatar.jpg" });
    render(
      <ZaUIApp theme="light">
        <MemoryRouter><App api={{ ...api, login, linkZaloPhone, profile }} /></MemoryRouter>
      </ZaUIApp>,
    );

    const personalButton = await screen.findByRole("button", { name: /Cá nhân$/ });
    expect(login).not.toHaveBeenCalled();
    expect(document.querySelector(".home-customer-card")).not.toBeInTheDocument();
    fireEvent.click(personalButton);
    expect(login).not.toHaveBeenCalled();
    expect(await screen.findByText(/Tên và ảnh đại diện/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Đồng ý và đăng nhập bằng Zalo" }));

    await waitFor(() => expect(login).toHaveBeenCalledTimes(1));
    expect(requestZaloPhoneToken).toHaveBeenCalledTimes(1);
    expect(vi.mocked(requestZaloPhoneToken).mock.invocationCallOrder[0]).toBeLessThan(login.mock.invocationCallOrder[0]!);
    expect(linkZaloPhone).toHaveBeenCalledWith({ code: "phone-token", accessToken: "access-token" });
    expect(await screen.findByText("Nguyễn Văn A")).toBeInTheDocument();
    expect(document.querySelector(".bottom-nav-avatar img")).toHaveAttribute("src", "https://example.com/zalo-avatar.jpg");
  });

  it("returns to guest when Zalo profile access is revoked", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const logout = vi.fn();
    vi.mocked(getZaloLoginPermission)
      .mockResolvedValueOnce("granted")
      .mockResolvedValue("denied");
    render(
      <ZaUIApp theme="light">
        <MemoryRouter><App api={{
          ...api,
          logout,
          profile: async () => ({
            id: "customer-1",
            displayName: "Nguyễn Văn A",
            avatarUrl: "https://example.com/zalo-avatar.jpg",
          }),
        }} /></MemoryRouter>
      </ZaUIApp>,
    );

    await waitFor(() => expect(document.querySelector(".bottom-nav-avatar img")).toHaveAttribute("src", "https://example.com/zalo-avatar.jpg"));
    fireEvent.focus(window);

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(document.querySelector(".bottom-nav-avatar")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cá nhân$/ })).toBeInTheDocument();
  });

  it("lets a signed-out customer browse and add products without requesting login", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const branches = vi.fn(api.branches);
    const catalog = vi.fn(api.catalog);
    const saveCart = vi.fn(api.saveCart);
    const login = vi.fn(api.login);
    const checkoutQuote = vi.fn(api.checkoutQuote);
    const profile = vi.fn()
      .mockRejectedValueOnce(new Error("Chưa đăng nhập"))
      .mockResolvedValue({ id: "customer-1", displayName: "Khách hàng", phone: "0900000000" });
    render(
      <ZaUIApp theme="light">
        <MemoryRouter><App api={{
          ...api,
          branches,
          catalog,
          saveCart,
          login,
          profile,
          checkoutQuote,
        }} /></MemoryRouter>
      </ZaUIApp>,
    );

    const add = (await screen.findAllByRole("button", { name: "Thêm Cà phê Arabica cửa hàng" }))[0]!;
    expect(branches).toHaveBeenCalledTimes(1);
    expect(catalog).toHaveBeenCalledWith(branch.id);
    expect(screen.getByRole("button", { name: /Cá nhân$/ })).toBeInTheDocument();

    fireEvent.click(add);
    await waitFor(() => expect(saveCart).toHaveBeenCalledWith(branch.id, [{
      skuId: "11111111-1111-4111-8111-111111111111",
      quantity: 1,
    }]));

    fireEvent.click(screen.getByRole("button", { name: /Thanh toán$/ }));
    const checkoutLogin = await screen.findByRole("button", { name: "Đăng nhập bằng Zalo" });
    expect(screen.getByRole("heading", { name: "Vui lòng đăng nhập để không bị gián đoạn mua hàng" })).toBeInTheDocument();
    expect(screen.queryByText("Giỏ hàng của bạn vẫn được giữ nguyên.")).not.toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
    expect(checkoutQuote).not.toHaveBeenCalled();
    fireEvent.click(checkoutLogin);
    expect(login).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Đồng ý và đăng nhập bằng Zalo" }));
    await waitFor(() => expect(login).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("heading", { name: "Thanh toán" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Bạn chưa có sản phẩm nào để thanh toán" })).not.toBeInTheDocument();
  });

  it("lets a first-time signed-out customer choose a branch", async () => {
    render(
      <ZaUIApp theme="light">
        <MemoryRouter><App api={{
          ...api,
          profile: async () => { throw new Error("Chưa đăng nhập"); },
        }} /></MemoryRouter>
      </ZaUIApp>,
    );

    await chooseBranch();
    expect(await screen.findByRole("button", { name: "Tìm sản phẩm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cá nhân$/ })).toBeInTheDocument();
  });

  it("restores a returning customer's last branch without prompting", async () => {
    localStorage.setItem(`${BRANCH_STORAGE_KEY}:customer-1`, branch.id);
    render(<ZaUIApp theme="light"><MemoryRouter><App api={api} /></MemoryRouter></ZaUIApp>);

    expect(await screen.findByRole("heading", { name: "Đồ uống" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Huỷ" })).not.toBeInTheDocument();
  });

  it("loads a signed-in customer's saved address even before a branch is chosen", async () => {
    const addresses = vi.fn(async () => ({ addresses: [{
      id: "default", recipientName: "Nguyễn Văn A", phone: "0900000000",
      line1: "12 Đường Hạnh Phúc", ward: "Xã Đồng Văn", province: "Tỉnh Tuyên Quang", isDefault: true,
    }] }));
    render(<ZaUIApp theme="light"><MemoryRouter><App api={{ ...api, addresses }} /></MemoryRouter></ZaUIApp>);

    await chooseBranch();
    await waitFor(() => expect(addresses).toHaveBeenCalledTimes(1));
  });

  it("returns each bottom tab to its root when pressed", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(
      <ZaUIApp theme="light">
        <MemoryRouter initialEntries={["/account?section=profile"]}>
          <App api={api} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    expect(await screen.findByRole("heading", { name: "Thông tin cá nhân" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Cá nhân$/ }));
    expect(await screen.findByRole("button", { name: "Mở thông tin tài khoản của Khách hàng" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Thanh toán$/ }));
    expect(await screen.findByRole("heading", { name: "Bạn chưa có sản phẩm nào để thanh toán" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Trang chủ$/ }));
    expect(await screen.findByRole("heading", { name: "Đồ uống" })).toBeInTheDocument();
  });

  it("returns a category listing to the Home dashboard on the second Home tap", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(<ZaUIApp theme="light"><MemoryRouter><App api={api} /></MemoryRouter></ZaUIApp>);

    fireEvent.click(await screen.findByRole("button", { name: /^Chọn danh mục:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Thực phẩm & đồ uống" }));
    expect(screen.getByRole("button", { name: "Chọn danh mục: Thực phẩm & đồ uống" })).toBeInTheDocument();

    const home = screen.getByRole("button", { name: /Trang chủ$/ });
    fireEvent.click(home);
    expect(screen.getByRole("button", { name: "Chọn danh mục: Thực phẩm & đồ uống" })).toBeInTheDocument();
    fireEvent.click(home);
    expect(screen.getByRole("button", { name: "Chọn danh mục: Tất cả" })).toBeInTheDocument();
    expect(document.querySelector(".dashboard-category")).toBeInTheDocument();
  });

  it.each(["Thanh toán", "Cá nhân"])("requires one Home navigation and two more Home taps from %s", async (tab) => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(<ZaUIApp theme="light"><MemoryRouter><App api={api} /></MemoryRouter></ZaUIApp>);

    fireEvent.click(await screen.findByRole("button", { name: /^Chọn danh mục:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Thực phẩm & đồ uống" }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`${tab}$`) }));
    expect(document.querySelector(".app-shell")).toHaveClass(tab === "Thanh toán" ? "app-shell-cart" : "app-shell-account");

    fireEvent.click(screen.getByRole("button", { name: /Trang chủ$/ }));
    expect(screen.getByRole("button", { name: "Chọn danh mục: Thực phẩm & đồ uống" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Trang chủ$/ }));
    expect(screen.getByRole("button", { name: "Chọn danh mục: Thực phẩm & đồ uống" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Trang chủ$/ }));
    expect(screen.getByRole("button", { name: "Chọn danh mục: Tất cả" })).toBeInTheDocument();
    expect(document.querySelector(".dashboard-category")).toBeInTheDocument();
  });

  it("restores only the body scroll position until the active tab is pressed again", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    render(<ZaUIApp theme="light"><MemoryRouter><App api={api} /></MemoryRouter></ZaUIApp>);

    await screen.findByRole("heading", { name: "Đồ uống" });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 1_963 });
    document.body.scrollTop = 180;
    fireEvent.scroll(document.body);
    fireEvent.click(screen.getByRole("button", { name: /Thanh toán$/ }));
    expect(await screen.findByRole("heading", { name: "Bạn chưa có sản phẩm nào để thanh toán" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Trang chủ$/ }));
    await waitFor(() => expect(document.body.scrollTop).toBe(180));
    expect(scrollTo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Trang chủ$/ }));
    await waitFor(() => expect(document.body.scrollTop).toBe(0));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("keeps a floating reminder for an unpaid ZaloPay order", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const pendingOrder = {
      ...order,
      status: "PENDING_PAYMENT" as const,
      paymentStatus: "PENDING",
      canRetryCheckout: true,
      paymentExpiresAt: "2099-01-01T00:00:00.000Z",
    };
    const orderDetail = vi.fn(async () => ({ order: pendingOrder }));
    render(
      <ZaUIApp theme="light">
        <MemoryRouter initialEntries={["/"]}>
          <App api={{ ...api, orders: async () => ({ orders: [pendingOrder] }), order: orderDetail }} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    const reminder = await screen.findByRole("button", { name: `Mở đơn ${pendingOrder.code} để thanh toán lại` });
    expect(reminder).toBeInTheDocument();
    fireEvent.click(reminder);
    expect(await screen.findByRole("heading", { name: `Chi tiết đơn ${pendingOrder.code}` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thanh toán lại" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `Mở đơn ${pendingOrder.code} để thanh toán lại` })).not.toBeInTheDocument();
  });

  it("submits an order only once while Checkout SDK is opening", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const createOrder = vi.fn(() => new Promise<never>(() => undefined));
    const checkoutApi: CustomerApi = {
      ...api,
      cart: async () => ({ cart: { id: "cart-1", branch, lines: [{ skuId: "11111111-1111-4111-8111-111111111111", quantity: 1 }] } }),
      addresses: async () => ({ addresses: [{ id: "33333333-3333-4333-8333-333333333333", recipientName: "Nguyễn A", phone: "0900000000", line1: "1 cửa hàng", province: "Quận 1", isDefault: true }] }),
      checkoutQuote: async () => ({
        currency: "VND", lines: [{ skuId: "11111111-1111-4111-8111-111111111111", skuCode: "T8-ARABICA-250", productName: "Cà phê Arabica cửa hàng", skuName: "Túi 250g", imageUrl: null, quantity: 1, available: true, unitPriceVnd: "145000", listUnitPriceVnd: "145000", saleUnitPriceVnd: "145000", discountVnd: "0", lineTotalVnd: "145000", offerId: null }],
        itemsSubtotalVnd: "145000", itemsDiscountVnd: "0", orderDiscountVnd: "0", deliveryFeeVnd: "15000", deliveryDiscountVnd: "0", totalDiscountVnd: "0", totalVnd: "160000", vouchers: [], offerProducts: [], appliedVoucher: null, promotionRevision: "1", quoteExpiresAt: "2099-01-01T00:00:00.000Z", quoteToken: "signed-token-long-enough-for-checkout",
      }),
      createOrder,
    };
    render(<ZaUIApp theme="light"><MemoryRouter initialEntries={["/cart"]}><App api={checkoutApi} /></MemoryRouter></ZaUIApp>);

    const submit = await screen.findByRole("button", { name: "Đặt mua" });
    fireEvent.change(screen.getByLabelText("Ghi chú đơn hàng"), { target: { value: "Gọi trước khi giao" } });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1));
    expect(createOrder).toHaveBeenCalledWith(expect.objectContaining({ note: "Gọi trước khi giao" }));
  });

  it("reuses the order idempotency key after an ambiguous backend response", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    vi.mocked(selectCheckoutPaymentMethod).mockResolvedValue({
      paymentMethod: "COD",
      checkoutMethod: { id: "COD", isCustom: false },
    });
    const createdOrder: CustomerOrder = {
      ...order,
      paymentMethod: "COD",
      paymentStatus: "PENDING",
      canCancel: true,
    };
    const createOrder = vi.fn()
      .mockRejectedValueOnce(new Error("Mất kết nối sau khi gửi đơn"))
      .mockResolvedValueOnce({ order: createdOrder });
    const checkoutApi: CustomerApi = {
      ...api,
      cart: async () => ({ cart: { id: "cart-1", branch, lines: [{ skuId: "11111111-1111-4111-8111-111111111111", quantity: 1 }] } }),
      addresses: async () => ({ addresses: [{ id: "default", recipientName: "Nguyễn A", phone: "0900000000", line1: "1 cửa hàng", province: "Quận 1", isDefault: true }] }),
      checkoutQuote: async () => ({
        currency: "VND", lines: [{ skuId: "11111111-1111-4111-8111-111111111111", skuCode: "T8-ARABICA-250", productName: "Cà phê Arabica cửa hàng", skuName: "Túi 250g", imageUrl: null, quantity: 1, available: true, unitPriceVnd: "145000", listUnitPriceVnd: "145000", saleUnitPriceVnd: "145000", discountVnd: "0", lineTotalVnd: "145000", offerId: null }],
        itemsSubtotalVnd: "145000", itemsDiscountVnd: "0", orderDiscountVnd: "0", deliveryFeeVnd: "15000", deliveryDiscountVnd: "0", totalDiscountVnd: "0", totalVnd: "160000", vouchers: [], offerProducts: [], appliedVoucher: null, promotionRevision: "1", quoteExpiresAt: "2099-01-01T00:00:00.000Z", quoteToken: "signed-token-long-enough-for-checkout",
      }),
      createOrder,
    };
    render(<ZaUIApp theme="light"><MemoryRouter initialEntries={["/cart"]}><App api={checkoutApi} /></MemoryRouter></ZaUIApp>);

    fireEvent.click(await screen.findByRole("button", { name: "Đặt mua" }));
    expect(await screen.findByText("Mất kết nối sau khi gửi đơn")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Đặt mua" }));
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(2));

    expect(createOrder.mock.calls[0]?.[0].idempotencyKey).toBe(
      createOrder.mock.calls[1]?.[0].idempotencyKey,
    );
  });

  it("keeps the payment screen visible and locked while native ZaloPay is open", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    vi.mocked(selectCheckoutPaymentMethod).mockResolvedValueOnce({
      paymentMethod: "ZALOPAY",
      checkoutMethod: { id: "ZALOPAY_SANDBOX", isCustom: false },
    });
    const pendingOrder = { ...order, status: "PENDING_PAYMENT" as const, paymentStatus: "PENDING", canRetryCheckout: true };
    const retryCheckout = vi.fn(async () => ({
      provider: "ZALO_CHECKOUT" as const,
      requestPayload: { amount: 160000, item: [], desc: "Thanh toán đơn T8-0001", extradata: "{}", method: "ZALOPAY", mac: "test-mac" },
    }));
    const bindCheckout = vi.fn(async () => undefined);
    const saveCart = vi.fn(api.saveCart);
    const checkoutApi: CustomerApi = {
      ...api,
      saveCart,
      cart: async () => ({ cart: { id: "cart-1", branch, lines: [{ skuId: "11111111-1111-4111-8111-111111111111", quantity: 1 }] } }),
      addresses: async () => ({ addresses: [{ id: "33333333-3333-4333-8333-333333333333", recipientName: "Nguyễn A", phone: "0900000000", line1: "1 cửa hàng", province: "Quận 1", isDefault: true }] }),
      checkoutQuote: async () => ({
        currency: "VND", lines: [{ skuId: "11111111-1111-4111-8111-111111111111", skuCode: "T8-ARABICA-250", productName: "Cà phê Arabica cửa hàng", skuName: "Túi 250g", imageUrl: null, quantity: 1, available: true, unitPriceVnd: "145000", listUnitPriceVnd: "145000", saleUnitPriceVnd: "145000", discountVnd: "0", lineTotalVnd: "145000", offerId: null }],
        itemsSubtotalVnd: "145000", itemsDiscountVnd: "0", orderDiscountVnd: "0", deliveryFeeVnd: "15000", deliveryDiscountVnd: "0", totalDiscountVnd: "0", totalVnd: "160000", vouchers: [], offerProducts: [], appliedVoucher: null, promotionRevision: "1", quoteExpiresAt: "2099-01-01T00:00:00.000Z", quoteToken: "signed-token-long-enough-for-checkout",
      }),
      createOrder: async () => ({ order: pendingOrder }),
      retryCheckout,
      bindCheckout,
      order: async () => ({ order: pendingOrder }),
    };
    const page = render(<ZaUIApp theme="light"><MemoryRouter initialEntries={["/cart"]}><App api={checkoutApi} /></MemoryRouter></ZaUIApp>);

    fireEvent.click(await screen.findByRole("button", { name: "Đặt mua" }));

    await waitFor(() => expect(retryCheckout).toHaveBeenCalledWith(pendingOrder.id, expect.any(String)));
    expect(openCheckout).toHaveBeenCalled();
    await waitFor(() => expect(bindCheckout).toHaveBeenCalledWith(pendingOrder.id, "provider-order", undefined));
    expect(saveCart).toHaveBeenCalledWith(branch.id, []);
    expect(await screen.findByRole("heading", { name: "Thanh toán" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đặt mua" })).toBeDisabled();

    page.unmount();
    vi.mocked(openCheckout).mockRejectedValueOnce({
      message: "The user rejected! (clicked the negative button)",
    });
    render(<ZaUIApp theme="light"><MemoryRouter initialEntries={["/cart"]}><App api={checkoutApi} /></MemoryRouter></ZaUIApp>);
    fireEvent.click(await screen.findByRole("button", { name: "Đặt mua" }));
    expect(await screen.findByRole("heading", { name: `Chi tiết đơn ${pendingOrder.code}` })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Đặt mua" })).not.toBeInTheDocument();
    expect(bindCheckout).toHaveBeenCalledTimes(1);
  });

  it("refreshes visible products and images on resume without changing the cart", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    let updated = false;
    const saveCart = vi.fn(api.saveCart);
    const refreshingApi = { ...api, saveCart, catalog: async () => {
      const result = await api.catalog(branch.id);
      if (updated) result.products = [{ ...result.products[0]!, name: "Updated backend coffee", imageUrl: "https://example.com/new.png" }];
      return result;
    } };
    render(<ZaUIApp theme="light"><MemoryRouter><App api={refreshingApi} /></MemoryRouter></ZaUIApp>);
    await screen.findAllByText("Cà phê Arabica cửa hàng");
    updated = true;
    fireEvent.focus(window);
    expect((await screen.findAllByText("Updated backend coffee")).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("img", { name: "Updated backend coffee" })[0]).toHaveAttribute("src", "https://example.com/new.png");
    expect(screen.queryByText("Bánh mì cửa hàng")).not.toBeInTheDocument();
    expect(saveCart).not.toHaveBeenCalled();
  });

  it("returns Home when the open campaign disappears on catalog refresh", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    let removed = false;
    const campaignApi: CustomerApi = { ...api, catalog: async () => ({
      ...(await api.catalog(branch.id)),
      campaigns: removed ? [] : [{ id: "campaign-refresh", title: "Sản phẩm mùa hè", images: { headerUrl: "https://cdn.test/header.png" }, productIds: ["product-1"] }],
    }) };
    render(<ZaUIApp theme="light"><MemoryRouter><App api={campaignApi} /></MemoryRouter></ZaUIApp>);
    fireEvent.click(await screen.findByRole("button", { name: "Sản phẩm mùa hè" }));
    expect(await screen.findByRole("heading", { name: "Sản phẩm mùa hè" })).toBeInTheDocument();
    removed = true;
    fireEvent.focus(window);
    expect(await screen.findByText("Campaign hiện không còn sản phẩm.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sản phẩm mùa hè" })).not.toBeInTheDocument();
  });

  it("polls updates while open and retains the visible catalog on a failed refresh", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    let updated = false;
    let unavailable = false;
    const refreshingApi = { ...api, catalog: async () => {
      if (unavailable) throw new Error("Hệ thống unavailable");
      const result = await api.catalog(branch.id);
      if (updated) result.products = [{ ...result.products[0]!, name: "Automatically updated coffee" }];
      return result;
    } };
    const page = render(<ZaUIApp theme="light"><MemoryRouter><App api={refreshingApi} /></MemoryRouter></ZaUIApp>);
    await screen.findAllByText("Cà phê Arabica cửa hàng");
    // Re-enter the polling effect with fake timers after initial asynchronous loading.
    vi.useFakeTimers();
    try {
      const nextApi = { ...refreshingApi };
      page.rerender(<ZaUIApp theme="light"><MemoryRouter><App api={nextApi} /></MemoryRouter></ZaUIApp>);
      await act(async () => { await Promise.resolve(); });
      updated = true;
      await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
      expect(screen.getAllByText("Automatically updated coffee").length).toBeGreaterThan(0);
      unavailable = true;
      await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
      expect(screen.getAllByText("Automatically updated coffee").length).toBeGreaterThan(0);
      expect(screen.getByText("Chưa cập nhật được sản phẩm. Đang hiển thị dữ liệu gần nhất.")).toBeInTheDocument();
      page.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
  afterEach(() => {
    vi.mocked(getZaloLoginPermission).mockResolvedValue("granted");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: originalScrollIntoView });
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", { configurable: true, value: originalGetBoundingClientRect });
    if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
    else delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    resetWindowScroll();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("does not restart initial loading when the default API causes a render", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const login = vi.spyOn(HttpCustomerApi.prototype, "login").mockResolvedValue({
      accessToken: "token",
      customer: { id: "customer-1", phone: "0900000000" },
    });
    vi.spyOn(HttpCustomerApi.prototype, "branches").mockResolvedValue({ branches: [branch] });
    vi.spyOn(HttpCustomerApi.prototype, "profile").mockImplementation(api.profile);
    vi.spyOn(HttpCustomerApi.prototype, "catalog").mockImplementation(api.catalog);
    vi.spyOn(HttpCustomerApi.prototype, "cart").mockImplementation(api.cart);
    vi.spyOn(HttpCustomerApi.prototype, "addresses").mockImplementation(api.addresses);
    vi.spyOn(HttpCustomerApi.prototype, "orders").mockImplementation(api.orders);

    render(
      <ZaUIApp theme="light">
        <MemoryRouter>
          <App />
        </MemoryRouter>
      </ZaUIApp>,
    );

    expect((await screen.findAllByText("Cà phê Arabica cửa hàng")).length).toBeGreaterThan(0);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(login).not.toHaveBeenCalled();
  });

  it("shows the real catalog first and updates the persistent cart intent", async () => {
    render(
      <ZaUIApp theme="light">
        <MemoryRouter>
          <App api={api} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    await waitFor(() => expect(document.querySelector(".branch-picker-trigger")).not.toBeNull());
    fireEvent.click(document.querySelector<HTMLButtonElement>(".branch-picker-trigger")!);
    fireEvent.click(screen.getAllByRole("button", { name: "Chọn chi nhánh" }).at(-1)!);
    const branchOption = await screen.findByRole("button", { name: /Cửa hàng Quận 1/ });
    expect(branchOption.querySelector(".branch-list-option-copy strong")).toHaveTextContent("Cửa hàng Quận 1");
    expect(branchOption.querySelector(".branch-list-option-copy small")).toHaveTextContent("Địa chỉ chi nhánh thử nghiệm");
    expect(branchOption).not.toHaveTextContent("Q1");
    fireEvent.click(branchOption);
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
    expect((await screen.findAllByText("Cà phê Arabica cửa hàng")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Sản phẩm đã hết hàng")).not.toBeInTheDocument();
    expect(screen.queryByText("Bia cửa hàng")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Rượu bia & thuốc lá" })).not.toBeInTheDocument();
    expect(screen.queryByText("Nước lúa mạch cửa hàng")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Đồ uống có cồn" })).not.toBeInTheDocument();
    expect(screen.queryByText("Còn 4")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".zaui-icon").length).toBeGreaterThan(0);
    expect(screen.queryByText("⌂")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Món đề xuất" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Đồ uống" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Đồ ăn" })).toBeInTheDocument();
    expect(document.querySelectorAll(".zaui-bottom-navigation-item")).toHaveLength(3);
    expect(document.querySelector(".home-customer-card")).not.toBeInTheDocument();
    expect(screen.queryByText("Đơn hàng", { selector: ".zaui-bottom-navigation-item-label" })).not.toBeInTheDocument();
    expect(screen.getByText("Cá nhân", { selector: ".zaui-bottom-navigation-item-label" })).toBeInTheDocument();
    expect(document.querySelector(".bottom-nav-avatar")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /^thêm cà phê arabica cửa hàng$/i })[0]!);
    expect(await screen.findByText("Thanh toán", { selector: ".zaui-bottom-navigation-item-label" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /đặt mua 1 sản phẩm trong giỏ/i })).toBeInTheDocument();
  });

  it.each([["Bia"], ["Bia – Rượu (18+)", "Bia"]])("requires age confirmation for the beer path %j", async (...path) => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const response = await api.catalog(branch.id);
    const source = response.products.find((product) => product.id === "product-regulated")!;
    const beerApi: CustomerApi = { ...api, catalog: async () => ({
      ...response, products: [{ ...source, categoryName: "Bia", categoryPath: path }],
    }) };
    render(<ZaUIApp theme="light"><MemoryRouter><App api={beerApi} /></MemoryRouter></ZaUIApp>);
    fireEvent.click(await screen.findByRole("button", { name: /^Chọn danh mục:/ }));
    fireEvent.click(screen.getByRole("button", { name: path[0]! }));
    expect(await screen.findByRole("heading", { name: "Xác nhận độ tuổi" })).toBeInTheDocument();
    expect(screen.queryByText("Bia cửa hàng")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tôi đã đủ 18 tuổi" }));
    expect((await screen.findAllByText("Bia cửa hàng")).length).toBeGreaterThan(0);
  });

  it("confirms adulthood before entering beer and keeps wine and tobacco hidden after confirmation", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const response = await api.catalog(branch.id);
    const source = response.products.find((product) => product.id === "product-regulated")!;
    const restrictedApi: CustomerApi = { ...api, catalog: async () => ({
      ...response,
      categories: [
        { id: "alcohol", parentId: null, name: "Đồ uống có cồn (18+)", rank: 0 },
        { id: "beer", parentId: "alcohol", name: "Bia", rank: 0 },
        { id: "wine", parentId: "alcohol", name: "Rượu", rank: 1 },
        { id: "tobacco", parentId: null, name: "Thuốc lá (18+)", rank: 1 },
      ],
      products: [...response.products,
        { ...source, id: "wine", name: "Rượu cửa hàng", categoryName: "Rượu", categoryPath: ["Đồ uống có cồn (18+)", "Rượu"] },
        { ...source, id: "tobacco", name: "Thuốc lá cửa hàng", categoryName: "Thuốc lá (18+)", categoryPath: ["Thuốc lá (18+)"] },
        { ...source, id: "cider", name: "Cider cửa hàng", categoryName: "Đồ uống có cồn", categoryPath: ["Đồ uống có cồn"] },
      ],
    }) };
    render(<ZaUIApp theme="light"><MemoryRouter><App api={restrictedApi} /></MemoryRouter></ZaUIApp>);
    fireEvent.click(await screen.findByRole("button", { name: /^Chọn danh mục:/ }));
    expect(screen.queryByRole("button", { name: "Thuốc lá (18+)" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mở rộng Đồ uống có cồn (18+)" }));
    expect(screen.queryByRole("button", { name: "Rượu" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bia" }));
    expect(await screen.findByRole("heading", { name: "Xác nhận độ tuổi" })).toBeInTheDocument();
    expect(screen.queryByText("Bia cửa hàng")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Xác nhận độ tuổi" })).not.toBeInTheDocument());
    expect(screen.queryByText("Bia cửa hàng")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Chọn danh mục:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Bia" }));
    fireEvent.click(await screen.findByRole("button", { name: "Tôi đã đủ 18 tuổi" }));
    expect((await screen.findAllByText("Bia cửa hàng")).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Xác nhận độ tuổi" })).not.toBeInTheDocument());
    expect(screen.queryByText("Rượu cửa hàng")).not.toBeInTheDocument();
    expect(screen.queryByText("Thuốc lá cửa hàng")).not.toBeInTheDocument();
    expect(screen.queryByText("Cider cửa hàng")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Chọn danh mục:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Đồ uống có cồn (18+)" }));
    expect(screen.queryByRole("heading", { name: "Xác nhận độ tuổi" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tìm sản phẩm" }));
    fireEvent.change(screen.getByPlaceholderText("Tìm kiếm sản phẩm…"), { target: { value: "Cửa hàng" } });
    expect(screen.queryByText("Rượu cửa hàng")).not.toBeInTheDocument();
    expect(screen.queryByText("Thuốc lá cửa hàng")).not.toBeInTheDocument();
    expect(screen.queryByText("Cider cửa hàng")).not.toBeInTheDocument();
    expect((await screen.findAllByText("Bia cửa hàng")).length).toBeGreaterThan(0);
  });

  it("opens the selected products in a sheet from the floating cart", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(<ZaUIApp theme="light"><MemoryRouter><App api={api} /></MemoryRouter></ZaUIApp>);

    fireEvent.click((await screen.findAllByRole("button", { name: "Thêm Cà phê Arabica cửa hàng" }))[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Đặt mua 1 sản phẩm trong giỏ" }));

    const preview = screen.getByLabelText("Sản phẩm đã chọn");
    expect(within(preview).getByText("Cà phê Arabica cửa hàng")).toBeInTheDocument();
    expect(within(preview).getByText("Túi 250g · ×1")).toBeInTheDocument();
    expect(preview.closest(".zaui-sheet")?.querySelector<HTMLElement>(".zaui-sheet-wrapper")?.style.zIndex).toBe("");
    expect(screen.queryByRole("button", { name: "Đặt mua 1 sản phẩm trong giỏ" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xem giỏ hàng" }));
    expect(await screen.findByRole("heading", { name: "Thanh toán" })).toBeInTheDocument();
  });

  it("shows the number of selected product types on the payment tab", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(<ZaUIApp theme="light"><MemoryRouter><App api={api} /></MemoryRouter></ZaUIApp>);

    fireEvent.click((await screen.findAllByRole("button", { name: "Thêm Cà phê Arabica cửa hàng" }))[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Tăng Cà phê Arabica cửa hàng" }));

    expect(screen.getByLabelText("Số lượng Cà phê Arabica cửa hàng")).toHaveTextContent("2");
    expect(document.querySelector(".bottom-nav-cart-badge")).toHaveTextContent("1");
  });

  it("opens a selected cart product in its existing detail sheet", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(<ZaUIApp theme="light"><MemoryRouter><App api={api} /></MemoryRouter></ZaUIApp>);

    fireEvent.click((await screen.findAllByRole("button", { name: "Thêm Cà phê Arabica cửa hàng" }))[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Đặt mua 1 sản phẩm trong giỏ" }));
    fireEvent.click(screen.getByRole("button", { name: "Xem chi tiết Cà phê Arabica cửa hàng" }));

    const closeProduct = await screen.findByRole("button", { name: "Đóng chi tiết Cà phê Arabica cửa hàng" });
    expect(closeProduct.closest(".zaui-sheet")?.querySelector<HTMLElement>(".zaui-sheet-wrapper")?.style.zIndex).toBe("");
    fireEvent.click(closeProduct);
    await waitFor(() => expect(screen.getByRole("button", { name: "Xem giỏ hàng" })).toBeVisible());
  });

  it("groups the catalog and loads the next batch when its scroll sentinel enters view", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    let onIntersect: IntersectionObserverCallback | undefined;
    class TestIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        onIntersect = callback;
      }

      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
    const manyProducts = Array.from({ length: 45 }, (_, index) => ({
      id: `product-${index}`,
      name: `Sản phẩm ${index + 1}`,
      slug: `san-pham-${index + 1}`,
      categoryName: "Đồ uống",
      recommended: false,
      imageUrl: null,
      minimumPriceVnd: "10000",
      skus: [{
        id: `sku-${index}`,
        code: `SKU-${index}`,
        name: "Mặc định",
        priceVnd: "10000",
        availableQuantity: 1,
        active: true,
      }],
    }));
    const manyProductsApi: CustomerApi = {
      ...api,
      catalog: async () => ({
        catalogState: { source: "backend", stale: false, lastSuccessfulAt: "2026-08-26T08:00:00.000Z", deliveryFeeVnd: "15000", branch },
        products: manyProducts,
      }),
    };

    render(
      <ZaUIApp theme="light">
        <MemoryRouter>
          <App api={manyProductsApi} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /^Chọn danh mục:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Đồ uống" }));
    await screen.findByLabelText("Đang tải thêm sản phẩm");
    expect(document.querySelectorAll(".product-card")).toHaveLength(40);
    expect(screen.queryByRole("button", { name: "Xem thêm sản phẩm" })).not.toBeInTheDocument();
    await waitFor(() => expect(onIntersect).toBeTypeOf("function"));
    await act(async () => {
      onIntersect?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    await waitFor(() => expect(document.querySelectorAll(".product-card")).toHaveLength(45));
  });

  it("opens the category dropdown and filters the product list", async () => {
    render(
      <ZaUIApp theme="light">
        <MemoryRouter>
          <App api={api} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    await chooseBranch();
    fireEvent.click(await screen.findByRole("button", { name: /^Chọn danh mục:/ }));
    expect(screen.getByRole("button", { name: "Trang chủ" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mở rộng Thực phẩm & đồ uống" }));
    fireEvent.click(await screen.findByRole("button", { name: "Đồ ăn" }));

    expect(screen.getByRole("button", { name: "Chọn danh mục: Thực phẩm & đồ uống" })).toBeInTheDocument();
    expect(screen.getByText("Bánh mì cửa hàng")).toBeInTheDocument();
    expect(screen.getAllByText("Cà phê Arabica cửa hàng").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /^Chọn danh mục:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Thực phẩm & đồ uống" }));

    expect(screen.getByRole("button", { name: "Chọn danh mục: Thực phẩm & đồ uống" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: /Danh mục con/ })).queryByRole("button", { name: "Tất cả" })).not.toBeInTheDocument();
    expect(screen.getByText("Bánh mì cửa hàng")).toBeInTheDocument();
    expect(screen.getAllByText("Cà phê Arabica cửa hàng").length).toBeGreaterThan(0);
  });

  it("shows the selected root category icon in the category button", async () => {
    const source = (await api.catalog(branch.id)).products[0]!;
    const catalogApi = { ...api, catalog: async () => ({
      catalogState: (await api.catalog(branch.id)).catalogState,
      categories: [{ id: "stationery", name: "Văn phòng phẩm", parentId: null, rank: 1 }],
      products: [{
        ...source,
        categoryName: "Văn phòng phẩm",
        categoryPath: ["Văn phòng phẩm"],
      }],
    }) };
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(<ZaUIApp theme="light"><MemoryRouter><App api={catalogApi} /></MemoryRouter></ZaUIApp>);

    fireEvent.click(await screen.findByRole("button", { name: /^Chọn danh mục:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Văn phòng phẩm" }));

    const categoryButton = await screen.findByRole("button", { name: "Chọn danh mục: Văn phòng phẩm" });
    expect(categoryButton.querySelector<HTMLImageElement>(".category-menu-icon")?.src).toContain("category-stationery");
  });

  it("switches a level-one catalog between category and POS brand groups", async () => {
    const source = (await api.catalog(branch.id)).products[0]!;
    const catalogApi = { ...api, catalog: async () => ({
      catalogState: (await api.catalog(branch.id)).catalogState,
      categories: [
        { id: "food", name: "Thực phẩm", parentId: null, rank: 1 },
        { id: "drinks", name: "Đồ uống", parentId: "food", rank: 1 },
        { id: "snacks", name: "Đồ ăn", parentId: "food", rank: 2 },
        { id: "household", name: "Gia dụng", parentId: null, rank: 2 },
        { id: "cleaning", name: "Đồ vệ sinh", parentId: "household", rank: 1 },
      ],
      products: [
        { ...source, id: "beta", name: "Bánh Beta", brandSortName: "Beta", categoryName: "Đồ uống", categoryPath: ["Thực phẩm", "Đồ uống"], skus: [{ ...source.skus[0]!, id: "beta-sku" }] },
        { ...source, id: "alpha-b", name: "Bánh Alpha", brandSortName: "Alpha", categoryName: "Đồ ăn", categoryPath: ["Thực phẩm", "Đồ ăn"], skus: [{ ...source.skus[0]!, id: "alpha-b-sku" }] },
        { ...source, id: "alpha-a", name: "Bánh A", brandSortName: "Alpha", categoryName: "Đồ uống", categoryPath: ["Thực phẩm", "Đồ uống"], skus: [{ ...source.skus[0]!, id: "alpha-a-sku" }] },
        { ...source, id: "other", name: "Bánh Không Hãng", brandSortName: null, categoryName: "Đồ ăn", categoryPath: ["Thực phẩm", "Đồ ăn"], skus: [{ ...source.skus[0]!, id: "other-sku" }] },
        { ...source, id: "home", name: "Nước rửa", brandSortName: "Clean", categoryName: "Đồ vệ sinh", categoryPath: ["Gia dụng", "Đồ vệ sinh"], skus: [{ ...source.skus[0]!, id: "home-sku" }] },
      ],
    }) };
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(<ZaUIApp theme="light"><MemoryRouter><App api={catalogApi} /></MemoryRouter></ZaUIApp>);

    await screen.findByRole("button", { name: "Chọn danh mục: Tất cả" });
    fireEvent.click(screen.getByRole("button", { name: "Chọn danh mục: Tất cả" }));
    const groupingButton = screen.getByRole("button", { name: "Chuyển sang nhóm theo Thương hiệu" });
    expect(groupingButton.querySelector("img[src*='group-by-category']")).toBeInTheDocument();
    fireEvent.click(groupingButton);
    fireEvent.click(screen.getByRole("button", { name: "Mở rộng Thực phẩm" }));
    expect(screen.getByRole("button", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Beta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Khác" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    expect(screen.queryByRole("navigation", { name: /Danh mục con/ })).not.toBeInTheDocument();
    expect(Array.from(document.querySelectorAll(".catalog-brand-heading")).map((heading) => heading.textContent))
      .toEqual(["Alpha", "Beta", "Khác"]);
    expect(document.querySelectorAll(".catalog .product-card")).toHaveLength(4);
    expect(Array.from(document.querySelectorAll(".catalog .product-card h3")).map((heading) => heading.textContent))
      .toEqual(["Bánh A", "Bánh Alpha", "Bánh Beta", "Bánh Không Hãng"]);
    fireEvent.click(screen.getByRole("button", { name: "Chọn danh mục: Thực phẩm" }));
    fireEvent.click(screen.getByRole("button", { name: "Chuyển sang nhóm theo Danh mục" }));
    fireEvent.click(screen.getByRole("button", { name: "Thực phẩm" }));
    expect(screen.getByRole("navigation", { name: /Danh mục con/ })).toBeInTheDocument();
    expect(document.querySelector(".catalog-brand-heading")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Chọn danh mục: Thực phẩm" }));
    fireEvent.click(screen.getByRole("button", { name: "Chuyển sang nhóm theo Thương hiệu" }));
    fireEvent.click(screen.getByRole("button", { name: "Gia dụng" }));
    expect(Array.from(document.querySelectorAll(".catalog-brand-heading")).map((heading) => heading.textContent)).toEqual(["Clean"]);

    fireEvent.click(screen.getByRole("button", { name: "Chọn danh mục: Gia dụng" }));
    fireEvent.click(screen.getByRole("button", { name: "Chuyển sang nhóm theo Danh mục" }));
    fireEvent.click(screen.getByRole("button", { name: "Thực phẩm" }));
    fireEvent.click(screen.getByRole("button", { name: "Chọn danh mục: Thực phẩm" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Chọn danh mục" })).getByRole("button", { name: "Đồ uống" }));
    expect(screen.getByRole("navigation", { name: /Danh mục con/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nhóm theo Danh mục" })).not.toBeInTheDocument();
  });

  it("shows the three-level tree and groups a level-two tab by level three", async () => {
    render(
      <ZaUIApp theme="light">
        <MemoryRouter>
          <App api={api} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    await chooseBranch();
    const categoryBtn = await screen.findByRole("button", { name: /^Chọn danh mục:/ });
    expect(categoryBtn).toBeInTheDocument();
    fireEvent.click(categoryBtn);
    expect(await screen.findByText("Thực phẩm & đồ uống")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mở rộng Thực phẩm & đồ uống" }));
    expect(screen.getByRole("button", { name: "Nước giải khát" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Đồ uống" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Mở rộng Nước giải khát" }));
    expect(screen.getAllByRole("button", { name: "Đồ uống" })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Thực phẩm & đồ uống" }));
    const headings = Array.from(document.querySelectorAll(".catalog-level-three-heading")).map((heading) => heading.textContent);
    expect(headings).toEqual(expect.arrayContaining(["Đồ ăn", "Đồ uống"]));
    fireEvent.click(screen.getByRole("navigation", { name: /Danh mục con/ }).querySelector("button:last-child")!);
    expect(Array.from(document.querySelectorAll(".catalog-level-three-heading")).map((heading) => heading.textContent)).toEqual(expect.arrayContaining(["Đồ ăn", "Đồ uống"]));
  });

  it("omits the all tab and follows the level-two section while scrolling", async () => {
    let drinkTop = 300;
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value() {
        if (this.classList.contains("catalog-level-three-heading")) {
          return { top: this.dataset.levelTwoCategory === "Nước giải khát" ? drinkTop : 80 } as DOMRect;
        }
        if (this.classList.contains("level-two-tabs")) return { bottom: 158 } as DOMRect;
        return { top: 0, bottom: 0 } as DOMRect;
      },
    });
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(<ZaUIApp theme="light"><MemoryRouter><App api={api} /></MemoryRouter></ZaUIApp>);

    fireEvent.click(await screen.findByRole("button", { name: /^Chọn danh mục:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Thực phẩm & đồ uống" }));
    const tabs = await screen.findByRole("navigation", { name: /Danh mục con/ });
    expect(within(tabs).queryByRole("button", { name: "Tất cả" })).not.toBeInTheDocument();
    expect(within(tabs).getByRole("button", { name: "Đồ ăn" })).toHaveAttribute("aria-pressed", "true");

    drinkTop = 120;
    fireEvent.scroll(document);
    expect(within(tabs).getByRole("button", { name: "Nước giải khát" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps a selected level-two tab active through its scroll and accepts a touch swipe", async () => {
    let drinkTop = 300;
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value() {
        if (this.classList.contains("catalog-level-three-heading")) {
          return { top: this.dataset.levelTwoCategory === "Nước giải khát" ? drinkTop : 80 } as DOMRect;
        }
        if (this.classList.contains("level-two-tabs")) return { bottom: 158 } as DOMRect;
        return { top: 0, bottom: 0 } as DOMRect;
      },
    });
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(<ZaUIApp theme="light"><MemoryRouter><App api={api} /></MemoryRouter></ZaUIApp>);

    fireEvent.click(await screen.findByRole("button", { name: /^Chọn danh mục:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Thực phẩm & đồ uống" }));
    const tabs = await screen.findByRole("navigation", { name: /Danh mục con/ });
    const page = document.querySelector<HTMLElement>(".app-shell-home")!;
    Object.defineProperty(page, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(page, "clientHeight", { configurable: true, value: 500 });
    Object.defineProperty(page, "scrollTop", { configurable: true, writable: true, value: 0 });
    fireEvent.click(within(tabs).getByRole("button", { name: "Nước giải khát" }));
    expect(page.scrollTop).toBeGreaterThan(0);
    drinkTop = 120;
    fireEvent.scroll(document);
    expect(within(tabs).getByRole("button", { name: "Nước giải khát" })).toHaveAttribute("aria-pressed", "true");

    drinkTop = 300;
    fireEvent.touchStart(document.querySelector<HTMLElement>(".catalog")!, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(document.querySelector<HTMLElement>(".catalog")!, { changedTouches: [{ clientX: 200, clientY: 100 }] });
    expect(within(tabs).getByRole("button", { name: "Đồ ăn" })).toHaveAttribute("aria-pressed", "true");
  });

  it("reaches a level-two section beyond the first batch and follows its level-three groups", async () => {
    const source = (await api.catalog(branch.id)).products[0]!;
    const catalogApi = { ...api, catalog: async () => ({
      catalogState: (await api.catalog(branch.id)).catalogState,
      categories: [
        { id: "root", name: "Kiểm tra", parentId: null, rank: 1 },
        { id: "first", name: "Nhóm đầu", parentId: "root", rank: 1 },
        { id: "second", name: "Nhóm sau", parentId: "root", rank: 2 },
        { id: "leaf-a", name: "Loại A", parentId: "second", rank: 1 },
        { id: "leaf-b", name: "Loại B", parentId: "second", rank: 2 },
      ],
      products: [
        ...Array.from({ length: 45 }, (_, index) => ({
          ...source, id: `first-${index}`, name: `Z ${index}`, categoryPath: ["Kiểm tra", "Nhóm đầu"],
          skus: [{ ...source.skus[0]!, id: `first-sku-${index}` }],
        })),
        ...["Loại A", "Loại B"].map((leaf, index) => ({
          ...source, id: `second-${index}`, name: `A ${index}`, categoryPath: ["Kiểm tra", "Nhóm sau", leaf],
          skus: [{ ...source.skus[0]!, id: `second-sku-${index}` }],
        })),
      ],
    }) };
    let secondTop = 300;
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value() {
        if (this.classList.contains("catalog-level-three-heading")) {
          return { top: this.dataset.levelTwoCategory === "Nhóm sau" ? secondTop : 80 } as DOMRect;
        }
        if (this.classList.contains("level-two-tabs")) return { bottom: 158 } as DOMRect;
        return { top: 0, bottom: 0 } as DOMRect;
      },
    });
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(<ZaUIApp theme="light"><MemoryRouter><App api={catalogApi} /></MemoryRouter></ZaUIApp>);
    fireEvent.click(await screen.findByRole("button", { name: /^Chọn danh mục:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra" }));
    const tabs = screen.getByRole("navigation", { name: /Danh mục con/ });
    expect(document.querySelectorAll(".catalog .product-card")).toHaveLength(40);

    vi.spyOn(document.body, "scrollHeight", "get").mockReturnValue(1000);
    vi.spyOn(document.body, "clientHeight", "get").mockReturnValue(500);
    fireEvent.click(within(tabs).getByRole("button", { name: "Nhóm sau" }));
    expect(document.body.scrollTop).toBeGreaterThan(0);
    expect(document.querySelectorAll(".catalog .product-card")).toHaveLength(47);
    expect(Array.from(document.querySelectorAll(".catalog-level-three-heading")).map((heading) => heading.textContent))
      .toEqual(["Nhóm đầu", "Loại A", "Loại B"]);
    expect(within(tabs).getByRole("button", { name: "Nhóm sau" })).toHaveAttribute("aria-pressed", "true");

    secondTop = 120;
    fireEvent.scroll(document.querySelector(".app-shell-home")!);
    expect(within(tabs).getByRole("button", { name: "Nhóm sau" })).toHaveAttribute("aria-pressed", "true");
    secondTop = 300;
    fireEvent.touchStart(document.querySelector(".catalog")!, { touches: [{ clientX: 220, clientY: 300 }] });
    fireEvent.touchEnd(document.querySelector(".catalog")!, { changedTouches: [{ clientX: 220, clientY: 220 }] });
    fireEvent.scroll(document.querySelector(".app-shell-home")!);
    expect(within(tabs).getByRole("button", { name: "Nhóm đầu" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.touchStart(document.querySelector(".catalog")!, { touches: [{ clientX: 220, clientY: 300 }] });
    fireEvent.touchEnd(document.querySelector(".catalog")!, { changedTouches: [{ clientX: 80, clientY: 302 }] });
    expect(within(tabs).getByRole("button", { name: "Nhóm sau" })).toHaveAttribute("aria-pressed", "true");
  });

  it("centers the selected level-two tab after returning from checkout", async () => {
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value() {
        if (this.classList.contains("level-two-tabs")) return { left: 0, width: 300 } as DOMRect;
        return { left: this.textContent === "Nước giải khát" ? 220 : 16, width: 96 } as DOMRect;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get() { return this.classList.contains("level-two-tabs") ? 300 : 0; } });
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(<ZaUIApp theme="light"><MemoryRouter><App api={api} /></MemoryRouter></ZaUIApp>);

    fireEvent.click(await screen.findByRole("button", { name: /^Chọn danh mục:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Thực phẩm & đồ uống" }));
    const tabs = await screen.findByRole("navigation", { name: /Danh mục con/ });
    Object.defineProperty(tabs, "scrollLeft", { configurable: true, writable: true, value: 0 });
    const unsupportedScrollTo = vi.fn(() => { throw new DOMException("unsupported"); });
    Object.defineProperty(tabs, "scrollTo", { configurable: true, value: unsupportedScrollTo });
    const activeTab = within(tabs).getByRole("button", { pressed: true });
    fireEvent.click(within(tabs).getAllByRole("button").find((tab) => tab !== activeTab)!);

    await waitFor(() => expect(tabs.scrollLeft).toBeGreaterThan(0));
    expect(unsupportedScrollTo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Thanh toán$/ }));
    fireEvent.click(screen.getByRole("button", { name: /Trang chủ$/ }));
    const restoredTabs = await screen.findByRole("navigation", { name: /Danh mục con/ });
    expect(restoredTabs).not.toBe(tabs);
    await waitFor(() => expect(restoredTabs.scrollLeft).toBeGreaterThan(0));
  });

  it("uses the direct Inventory children instead of inferring nesting from products", async () => {
    const response = await api.catalog(branch.id);
    const catalogApi = {
      ...api,
      catalog: async () => ({
        ...response,
        products: [{
          ...response.products[0]!,
          categoryName: "Gia vị & đồ chấm",
          categoryPath: ["Đồ khô - Mì Gói", "Gia vị & đồ chấm"],
        }],
        categories: [
          { id: "1", name: "Đồ khô - Mì Gói", parentId: null, rank: 1 },
          { id: "2", name: "Gia vị & đồ chấm", parentId: "1", rank: 1 },
          { id: "3", name: "Lương khô", parentId: "1", rank: 2 },
          { id: "4", name: "Mì Phở Cháo Miến (GÓI)", parentId: "1", rank: 3 },
          { id: "5", name: "Mì Phở Cháo Miến (HỘP)", parentId: "1", rank: 4 },
        ],
      }),
    };
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(<ZaUIApp theme="light"><MemoryRouter><App api={catalogApi} /></MemoryRouter></ZaUIApp>);

    fireEvent.click(await screen.findByRole("button", { name: /^Chọn danh mục:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Mở rộng Đồ khô - Mì Gói" }));
    expect(screen.getByRole("button", { name: "Gia vị & đồ chấm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lương khô" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mì Phở Cháo Miến (GÓI)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mì Phở Cháo Miến (HỘP)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mở rộng Mì Phở Cháo Miến (GÓI)" })).not.toBeInTheDocument();
  });

  it("scrolls to a level-three group without hiding its sibling groups", async () => {
    const response = await api.catalog(branch.id);
    const source = response.products[0]!;
    let drinkTop = 450;
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value() {
        if (this.classList.contains("catalog-level-three-heading")) {
          return { top: this.dataset.levelTwoCategory === "Nước giải khát" ? drinkTop : 80 } as DOMRect;
        }
        if (this.classList.contains("level-two-tabs")) return { bottom: 158 } as DOMRect;
        return { top: 0, bottom: 0 } as DOMRect;
      },
    });
    const catalogApi = {
      ...api,
      catalog: async () => ({
        ...response,
        products: [
          source,
          {
            ...source,
            id: "second-level-three-product",
            name: "Nước ép cửa hàng",
            categoryName: "Nước ép",
            categoryPath: ["Thực phẩm & đồ uống", "Nước giải khát", "Nước ép"],
            skus: [{ ...source.skus[0]!, id: "second-level-three-sku" }],
          },
          {
            ...source,
            id: "second-level-two-product",
            name: "Cà phê cửa hàng",
            categoryName: "Cà phê",
            categoryPath: ["Thực phẩm & đồ uống", "Cà phê", "Cà phê"],
            skus: [{ ...source.skus[0]!, id: "second-level-two-sku" }],
          },
        ],
      }),
    };
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(<ZaUIApp theme="light"><MemoryRouter><App api={catalogApi} /></MemoryRouter></ZaUIApp>);

    fireEvent.click(await screen.findByRole("button", { name: /^Chọn danh mục:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Mở rộng Thực phẩm & đồ uống" }));
    fireEvent.click(screen.getByRole("button", { name: "Mở rộng Nước giải khát" }));
    const page = document.querySelector<HTMLElement>(".app-shell-home")!;
    Object.defineProperty(page, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(page, "clientHeight", { configurable: true, value: 500 });
    Object.defineProperty(page, "scrollTop", { configurable: true, writable: true, value: 120 });
    fireEvent.click(screen.getByRole("button", { name: "Đồ uống" }));

    await waitFor(() => expect(page.scrollTop).toBeGreaterThan(120));
    expect(Array.from(document.querySelectorAll(".catalog-level-three-heading")).map((heading) => heading.textContent))
      .toEqual(["Cà phê", "Đồ uống", "Nước ép"]);
    fireEvent.touchStart(document.querySelector(".catalog")!, { touches: [{ clientX: 100, clientY: 300 }] });
    fireEvent.touchEnd(document.querySelector(".catalog")!, { changedTouches: [{ clientX: 100, clientY: 200 }] });
    drinkTop = 300;
    fireEvent.scroll(page);
    const tabs = screen.getByRole("navigation", { name: /Danh mục con/ });
    expect(within(tabs).getByRole("button", { name: "Cà phê" })).toHaveAttribute("aria-pressed", "true");
  });

  it.each([
    { paths: [["Sữa"]] },
    { paths: [["Sữa", "Sữa tươi"]] },
    { paths: [["Sữa", "Sữa tươi", "Có đường"]] },
    { paths: [["Sữa", "Sữa tươi", "Có đường"], ["Sữa", "Sữa tươi", "Không đường"]] },
  ])("selects the root category for $paths", async ({ paths }) => {
    const response = await api.catalog(branch.id);
    const base = response.products[0]!;
    const catalogApi = { ...api, catalog: async () => ({
      ...response,
      products: paths.map((path, index) => ({ ...base,
        id: `singleton-product-${index}`,
        name: `Sản phẩm kiểm tra ${index}`,
        categoryName: path[path.length - 1]!,
        categoryPath: path,
        skus: [{ ...base.skus[0]!, id: `singleton-sku-${index}` }],
      })),
    }) };
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(<ZaUIApp theme="light"><MemoryRouter><App api={catalogApi} /></MemoryRouter></ZaUIApp>);
    await screen.findAllByText("Sản phẩm kiểm tra 0");
    fireEvent.click(screen.getByRole("button", { name: /^Chọn danh mục:/ }));
    const rootButton = screen.getByRole("button", { name: "Sữa" });
    fireEvent.click(rootButton);
    expect(screen.getByRole("button", { name: "Chọn danh mục: Sữa" })).toBeInTheDocument();
  });

  it("hides the bottom navigation while scrolling down and restores it on a slight upward scroll", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(
      <ZaUIApp theme="light">
        <MemoryRouter>
          <App api={api} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    await screen.findAllByText("Cà phê Arabica cửa hàng");
    fireEvent.click(screen.getAllByRole("button", { name: "Thêm Cà phê Arabica cửa hàng" })[0]!);
    expect(screen.getAllByLabelText("Tìm sản phẩm")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /^Chọn danh mục:/ })).toBeInTheDocument();
    expect(document.querySelector(".bottom-nav-shell")).not.toHaveClass("bottom-nav-hidden");
    expect(document.querySelector(".bottom-nav-shell .zaui-bottom-navigation")).not.toHaveClass("zaui-bottom-navigation-fixed");

    setWindowScroll(100);
    expect(document.querySelector(".menu-tools")).not.toHaveClass("catalog-controls-hidden");
    expect(document.querySelector(".bottom-nav-shell")).toHaveClass("bottom-nav-hidden");
    expect(document.querySelector(".app-shell")).toHaveClass("bottom-nav-hidden");
    expect(document.querySelector(".floating-cart")).toBeInTheDocument();

    setWindowScroll(94);
    expect(document.querySelector(".bottom-nav-shell")).not.toHaveClass("bottom-nav-hidden");
    expect(document.querySelector(".app-shell")).not.toHaveClass("bottom-nav-hidden");
    expect(screen.getAllByLabelText("Tìm sản phẩm")).toHaveLength(1);
  });

  it("opens full-screen search overlay on clicking search button, searches products, adds to cart, and closes", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(
      <ZaUIApp theme="light">
        <MemoryRouter>
          <App api={api} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    await screen.findAllByText("Cà phê Arabica cửa hàng");
    expect(document.querySelector(".search-overlay")).not.toBeInTheDocument();

    const searchBtn = screen.getByRole("button", { name: "Tìm sản phẩm" });
    fireEvent.click(searchBtn);

    const overlay = document.querySelector(".search-overlay") as HTMLElement;
    expect(overlay).toBeInTheDocument();
    const searchInput = within(overlay).getByLabelText("Nhập từ khóa tìm kiếm");
    expect(searchInput).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "Cà phê" } });
    expect(await within(overlay).findByText(/Tìm thấy/)).toBeInTheDocument();
    expect(within(overlay).getByText("Cà phê Arabica cửa hàng")).toBeInTheDocument();

    const addBtn = within(overlay).getByRole("button", { name: "Thêm Cà phê Arabica cửa hàng" });
    fireEvent.click(addBtn);

    expect(await screen.findByRole("button", { name: /Đặt mua 1 sản phẩm trong giỏ/ })).toBeInTheDocument();

    const backBtn = within(overlay).getByRole("button", { name: "Đóng tìm kiếm" });
    fireEvent.click(backBtn);

    expect(document.querySelector(".search-overlay")).not.toBeInTheDocument();
  });

  it("shows best sellers instead of categories and remembers a search", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(
      <ZaUIApp theme="light">
        <MemoryRouter>
          <App api={api} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    await screen.findAllByText("Cà phê Arabica cửa hàng");

    const searchBtn = screen.getByRole("button", { name: "Tìm sản phẩm" });
    fireEvent.click(searchBtn);

    const overlay = document.querySelector(".search-overlay") as HTMLElement;
    expect(overlay).toBeInTheDocument();

    expect(within(overlay).getByRole("heading", { name: "Sản phẩm bán chạy" })).toBeInTheDocument();
    expect(within(overlay).getByText("Cà phê Arabica cửa hàng")).toBeInTheDocument();
    expect(within(overlay).queryByRole("heading", { name: "Danh mục gợi ý" })).not.toBeInTheDocument();

    const searchInput = within(overlay).getByLabelText("Nhập từ khóa tìm kiếm");
    fireEvent.change(searchInput, { target: { value: "Cà phê" } });
    fireEvent.click(within(overlay).getByRole("button", { name: "Đóng tìm kiếm" }));
    expect(document.querySelector(".search-overlay")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tìm sản phẩm" }));
    const reopenedOverlay = document.querySelector(".search-overlay") as HTMLElement;
    expect(within(reopenedOverlay).getByRole("heading", { name: "Tìm kiếm gần đây" })).toBeInTheDocument();
    fireEvent.click(within(reopenedOverlay).getByRole("button", { name: "Cà phê" }));
    expect(await within(reopenedOverlay).findByText(/Tìm thấy/)).toBeInTheDocument();
  });

  it("shows the initial catalog as category groups", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(
      <ZaUIApp theme="light">
        <MemoryRouter>
          <App api={api} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    await screen.findAllByText("Cà phê Arabica cửa hàng");
    expect(document.querySelectorAll(".dashboard-category")).toHaveLength(2);
    expect(document.querySelectorAll(".catalog-product-list")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Chọn danh mục: Tất cả" })).toBeInTheDocument();
  });

  it("shows three products per category on the dashboard and opens that category", async () => {
    const source = (await api.catalog(branch.id)).products[0]!;
    const dashboardApi = { ...api, catalog: async () => ({
      catalogState: (await api.catalog(branch.id)).catalogState,
      products: [
        ...Array.from({ length: 4 }, (_, index) => ({
          ...source,
          id: `coffee-${index}`,
          name: `Cà phê ${index + 1}`,
          categoryName: "Cà phê",
          categoryPath: ["Thực phẩm", "Đồ uống", "Cà phê"],
          recommended: index === 3,
          skus: [{ ...source.skus[0]!, id: `coffee-sku-${index}` }],
        })),
        ...["Bánh quy", "Khoai tây"].map((name, index) => ({
          ...source,
          id: `snack-${index}`,
          name,
          categoryName: "Đồ ăn vặt",
          categoryPath: ["Thực phẩm", "Đồ ăn vặt"],
          skus: [{ ...source.skus[0]!, id: `snack-sku-${index}` }],
        })),
        ...["Nước rửa", "Khăn giấy"].map((name, index) => ({
          ...source,
          id: `household-${index}`,
          name,
          categoryName: "Đồ gia dụng",
          categoryPath: ["Đồ gia dụng"],
          skus: [{ ...source.skus[0]!, id: `household-sku-${index}` }],
        })),
      ],
    }) };
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(<ZaUIApp theme="light"><MemoryRouter><App api={dashboardApi} /></MemoryRouter></ZaUIApp>);

    const coffeeGroup = (await screen.findByRole("heading", { name: "Cà phê" })).closest(".dashboard-category") as HTMLElement;
    expect(coffeeGroup.querySelectorAll(".product-card")).toHaveLength(3);
    expect(coffeeGroup.querySelector(".product-card h3")?.textContent).toBe("Cà phê 4");
    expect(screen.getByRole("heading", { name: "Đồ ăn vặt" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Đồ gia dụng" })).toBeInTheDocument();

    fireEvent.click(within(coffeeGroup).getByRole("button", { name: "Xem thêm Cà phê" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Chọn danh mục: Thực phẩm" })).toBeInTheDocument());
    expect(document.querySelectorAll(".catalog .product-card")).toHaveLength(6);
  });

  it("opens product details in a quick-view sheet without leaving the catalog", async () => {
    const saveCart = vi.fn(api.saveCart);
    render(
      <ZaUIApp theme="light">
        <MemoryRouter>
          <App api={{ ...api, saveCart }} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    await chooseBranch();
    fireEvent.click((await screen.findAllByRole("button", { name: "Xem Cà phê Arabica cửa hàng" }))[0]!);

    expect((await screen.findAllByRole("heading", { name: "Cà phê Arabica cửa hàng" })).at(-1)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mô tả sản phẩm" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Thành phần" })).toBeInTheDocument();
    expect(screen.getByText("Vị socola:").tagName).toBe("STRONG");
    expect(screen.getByText("Hướng dẫn sử dụng:").tagName).toBe("EM");
    expect(screen.queryByText(/style=|<h2>/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đóng chi tiết Cà phê Arabica cửa hàng" })).toBeInTheDocument();
    expect(screen.getByLabelText("Số lượng")).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /Thêm vào giỏ/ })).toBeInTheDocument();
    expect(document.querySelector(".product-quick-view-sheet .zaui-sheet-content")).toBeInTheDocument();
    expect(document.querySelector(".market-header")).toBeInTheDocument();
    expect(document.querySelector(".bottom-nav-shell")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Đóng chi tiết Cà phê Arabica cửa hàng" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Đóng chi tiết Cà phê Arabica cửa hàng" })).not.toBeInTheDocument());
    await waitFor(() => expect(document.querySelector(".zaui-page")).not.toHaveClass("disable-scrolling"));
    expect(saveCart).not.toHaveBeenCalled();
  });

  it("adds the SKU selected from a grouped pack and carton product", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const saveCart = vi.fn(api.saveCart);
    render(
      <ZaUIApp theme="light">
        <MemoryRouter>
          <App api={{
            ...api,
            saveCart,
            catalog: async () => {
              const catalog = await api.catalog(branch.id);
              return {
                ...catalog,
                products: [{
                  ...catalog.products[0]!,
                  id: "indomie",
                  name: "Mì Indomie",
                  minimumPriceVnd: "5000",
                  skus: [
                    { id: "indomie-pack", code: "INDOMIE-PACK", name: "Gói", priceVnd: "5000", availableQuantity: 24, active: true },
                    { id: "indomie-carton", code: "INDOMIE-CARTON", name: "Thùng", priceVnd: "120000", availableQuantity: 1, active: true },
                  ],
                }],
              };
            },
          }} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    fireEvent.click((await screen.findAllByRole("button", { name: "Chọn Mì Indomie" }))[0]!);
    fireEvent.click(await screen.findByRole("button", { name: /Thùng/ }));
    fireEvent.click(screen.getByRole("button", { name: /Thêm vào giỏ/ }));

    await waitFor(() => expect(saveCart).toHaveBeenCalledWith(branch.id, [{ skuId: "indomie-carton", quantity: 1 }]));
    const card = Array.from(document.querySelectorAll<HTMLElement>(".catalog .product-card"))
      .find((item) => item.textContent?.includes("Mì Indomie"))!;
    fireEvent.click(within(card).getByRole("button", { name: "Chỉnh số lượng Mì Indomie" }));
    fireEvent.click(within(card).getByRole("button", { name: "Giảm Mì Indomie" }));
    await waitFor(() => expect(saveCart).toHaveBeenLastCalledWith(branch.id, []));
    expect(within(card).getByRole("button", { name: "Chọn Mì Indomie" })).toBeInTheDocument();
  });

  it("normalizes fractional cart quantities to whole items", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const saveCart = vi.fn(api.saveCart);
    render(
      <ZaUIApp theme="light">
        <MemoryRouter>
          <App api={{
            ...api,
            catalog: async () => {
              const catalog = await api.catalog(branch.id);
              return {
                ...catalog,
                products: catalog.products.map((product) => product.id === "product-1"
                  ? { ...product, skus: product.skus.map((sku) => ({ ...sku, availableQuantity: 1.2 })) }
                  : product),
              };
            },
            cart: async () => ({ cart: { id: "cart-1", branch, lines: [{ skuId: "11111111-1111-4111-8111-111111111111", quantity: 1.2 }] } }),
            saveCart,
          }} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    expect(await screen.findByRole("button", { name: "Đặt mua 1 sản phẩm trong giỏ" })).toBeInTheDocument();
    await waitFor(() => expect(saveCart).toHaveBeenCalledWith(branch.id, [{ skuId: "11111111-1111-4111-8111-111111111111", quantity: 1 }]));
  });

  it("opens an order from the order list and returns to the list", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const orderWithoutProductDetails: CustomerOrder = {
      ...order,
      lines: order.lines!.map((line) => ({ ...line, productName: "Sản phẩm", skuName: "Sản phẩm", imageUrl: null })),
    };
    const orderDetail = vi.fn(async () => ({ order: orderWithoutProductDetails }));
    render(
      <ZaUIApp theme="light">
        <MemoryRouter initialEntries={["/orders"]}>
          <App api={{ ...api, orders: async () => ({ orders: [orderWithoutProductDetails] }), order: orderDetail }} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    expect(await screen.findByAltText("Cà phê Arabica cửa hàng")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Xem chi tiết đơn T8-0001" }));
    expect(await screen.findByRole("heading", { name: "Chi tiết đơn T8-0001" })).toBeInTheDocument();
    expect(orderDetail).toHaveBeenCalledWith(order.id);
    expect(screen.getByText("Phí giao hàng")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Quay lại danh sách đơn hàng" }));
    expect(await screen.findByRole("heading", { name: "Đơn hàng của bạn" })).toBeInTheDocument();
  });

  it("keeps the cancelled badge and time in separate detail metadata rows", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const cancelledOrder: CustomerOrder = { ...order, status: "CANCELLED", paymentStatus: "CANCELLED" };
    render(
      <ZaUIApp theme="light">
        <MemoryRouter initialEntries={[`/orders/${cancelledOrder.id}`]}>
          <App api={{ ...api, orders: async () => ({ orders: [cancelledOrder] }), order: async () => ({ order: cancelledOrder }) }} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    const metadata = await screen.findByText("Đã huỷ", { selector: ".order-detail-meta .status" });
    expect(metadata.closest(".order-detail-meta")).toContainElement(screen.getByText(/7\/9\/2026/));
    expect(metadata.closest(".order-detail-header")).toContainElement(screen.getByText(cancelledOrder.code));
    expect(screen.getByRole("button", { name: "Đặt lại" }).closest(".order-card-actions")).toBeInTheDocument();
    expect(screen.queryByText("Tiếp nhận backend")).not.toBeInTheDocument();
  });

  it("shows the empty cart illustration and returns to shopping", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(
      <ZaUIApp theme="light">
        <MemoryRouter initialEntries={["/cart"]}><App api={api} /></MemoryRouter>
      </ZaUIApp>,
    );

    expect(await screen.findByRole("heading", { name: "Bạn chưa có sản phẩm nào để thanh toán" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Thanh toán" })).toBeInTheDocument();
    expect(document.querySelector(".cart-empty-illustration")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mua hàng" }));
    expect(await screen.findByRole("heading", { name: "Đồ uống" })).toBeInTheDocument();
  });

  it("returns to products after removing the last checkout product", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const skuId = "11111111-1111-4111-8111-111111111111";
    let finishSave!: () => void;
    const saveCart = vi.fn(async (...args: Parameters<CustomerApi["saveCart"]>) => {
      await new Promise<void>((resolve) => { finishSave = resolve; });
      return api.saveCart(...args);
    });
    render(<ZaUIApp theme="light"><MemoryRouter initialEntries={["/cart"]}><App api={{
      ...api,
      saveCart,
      cart: async () => ({ cart: { id: "cart-1", branch, lines: [{ skuId, quantity: 1 }] } }),
      checkoutQuote: async () => ({
        currency: "VND", lines: [{ skuId, skuCode: "T8-ARABICA-250", productName: "Cà phê Arabica cửa hàng", skuName: "Túi 250g", imageUrl: null, quantity: 1, available: true, unitPriceVnd: "145000", listUnitPriceVnd: "145000", saleUnitPriceVnd: "145000", discountVnd: "0", lineTotalVnd: "145000", offerId: null }],
        itemsSubtotalVnd: "145000", itemsDiscountVnd: "0", orderDiscountVnd: "0", deliveryFeeVnd: "15000", deliveryDiscountVnd: "0", totalDiscountVnd: "0", totalVnd: "160000", vouchers: [], offerProducts: [], appliedVoucher: null, promotionRevision: "1", quoteExpiresAt: "2099-01-01T00:00:00.000Z", quoteToken: "signed-token-long-enough-for-checkout",
      }),
    }} /></MemoryRouter></ZaUIApp>);

    fireEvent.click(await screen.findByRole("button", { name: "Xóa Cà phê Arabica cửa hàng" }));
    fireEvent.click(screen.getByRole("button", { name: "Xóa sản phẩm" }));
    await waitFor(() => expect(saveCart).toHaveBeenCalledWith(branch.id, []));
    expect(screen.getByRole("heading", { name: "Thanh toán" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Bạn chưa có sản phẩm nào để thanh toán" })).not.toBeInTheDocument();
    await act(async () => finishSave());
    expect(await screen.findByRole("heading", { name: "Đồ uống" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Bạn chưa có sản phẩm nào để thanh toán" })).not.toBeInTheDocument();
  });

  it("dismisses stock notices after five seconds", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(<ZaUIApp theme="light"><MemoryRouter><App api={api} /></MemoryRouter></ZaUIApp>);

    fireEvent.click((await screen.findAllByRole("button", { name: "Thêm Cà phê Arabica cửa hàng" }))[0]!);
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole("button", { name: "Tăng Cà phê Arabica cửa hàng" }));
      fireEvent.click(screen.getByRole("button", { name: "Tăng Cà phê Arabica cửa hàng" }));
      fireEvent.click(screen.getByRole("button", { name: "Tăng Cà phê Arabica cửa hàng" }));
      fireEvent.click(screen.getByRole("button", { name: "Tăng Cà phê Arabica cửa hàng" }));
      expect(screen.getByRole("alert")).toHaveTextContent("Số lượng đã vượt quá tồn kho khả dụng");

      act(() => vi.advanceTimersByTime(5_000));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows only POS lifecycle states in customer order filters", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const draftOrder: CustomerOrder = {
      ...order,
      id: "55555555-5555-4555-8555-555555555555",
      code: "T8-0002",
      status: "DRAFT",
      paymentStatus: "PENDING",
    };
    const deliveringOrder: CustomerOrder = {
      ...order,
      id: "66666666-6666-4666-8666-666666666666",
      code: "T8-0003",
      status: "DELIVERING",
    };
    const completedOrder: CustomerOrder = {
      ...order,
      id: "77777777-7777-4777-8777-777777777777",
      code: "T8-0004",
      status: "COMPLETED",
    };
    render(
      <ZaUIApp theme="light">
        <MemoryRouter initialEntries={["/orders"]}>
          <App api={{ ...api, orders: async () => ({ orders: [order, draftOrder, deliveringOrder, completedOrder] }) }} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    expect(await screen.findByRole("button", { name: "Phiếu tạm: 1 đơn" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Tất cả:/ }));
    expect(document.querySelector(".status-draft")).toHaveTextContent("Phiếu tạm");
    expect(screen.getByRole("button", { name: "Chờ thanh toán: 0 đơn" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Phiếu tạm: 1 đơn" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đã xác nhận: 1 đơn" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đang giao hàng: 1 đơn" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hoàn thành: 1 đơn" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đã huỷ: 0 đơn" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Đang chuẩn bị:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sẵn sàng giao\/nhận:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Đang cập nhật:/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hoàn thành: 1 đơn" }));
    expect(screen.getByRole("button", { name: "Xem chi tiết đơn T8-0004" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xem chi tiết đơn T8-0001" })).not.toBeInTheDocument();
  });

  it("does not smooth-scroll order filters when reduced motion is enabled", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(
      <ZaUIApp theme="light">
        <MemoryRouter initialEntries={["/orders"]}>
          <App api={{ ...api, orders: async () => ({ orders: [order] }) }} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    expect(await screen.findByRole("heading", { name: "Đơn hàng của bạn" })).toBeInTheDocument();
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" })));
  });

  it("swipes left and right to switch order status tabs", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(
      <ZaUIApp theme="light">
        <MemoryRouter initialEntries={["/orders"]}>
          <App api={{ ...api, orders: async () => ({ orders: [order] }) }} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    expect(await screen.findByRole("heading", { name: "Đơn hàng của bạn" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Đã xác nhận:/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { name: /đơn$/ }).at(-1)).toHaveAccessibleName(/^Tất cả:/);

    const swipeArea = document.querySelector(".order-swipe-area");
    expect(swipeArea).toBeInTheDocument();

    // Swipe right to switch to the previous POS status.
    fireEvent.touchStart(swipeArea!, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchMove(swipeArea!, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(swipeArea!, { changedTouches: [{ clientX: 200, clientY: 100 }] });

    expect(screen.getByRole("button", { name: /^Phiếu tạm:/ })).toHaveAttribute("aria-pressed", "true");

    // Swipe left to return to the most recently updated order status.
    fireEvent.touchStart(swipeArea!, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchMove(swipeArea!, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(swipeArea!, { changedTouches: [{ clientX: 100, clientY: 100 }] });

    expect(screen.getByRole("button", { name: /^Đã xác nhận:/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("opens the status tab of the most recently updated open order", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const latestDeliveringOrder: CustomerOrder = {
      ...order,
      id: "55555555-5555-4555-8555-555555555555",
      code: "T8-0002",
      status: "DELIVERING",
      syncStatusUpdatedAt: "2026-09-08T08:00:00.000Z",
    };
    render(
      <ZaUIApp theme="light">
        <MemoryRouter initialEntries={["/orders"]}>
          <App api={{ ...api, orders: async () => ({ orders: [order, latestDeliveringOrder] }) }} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    expect(await screen.findByRole("button", { name: "Đang giao hàng: 1 đơn" })).toHaveAttribute("aria-pressed", "true");
  });

  it("opens all orders when no order is still open", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const closedOrder: CustomerOrder = { ...order, status: "COMPLETED", syncStatusUpdatedAt: "2026-09-08T08:00:00.000Z" };
    render(
      <ZaUIApp theme="light">
        <MemoryRouter initialEntries={["/orders"]}>
          <App api={{ ...api, orders: async () => ({ orders: [closedOrder] }) }} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    expect(await screen.findByRole("button", { name: "Tất cả: 1 đơn" })).toHaveAttribute("aria-pressed", "true");
  });

  it("refreshes the matching customer status after POS updates an order", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const draftOrder: CustomerOrder = { ...order, status: "DRAFT" };
    const orders = vi.fn()
      .mockResolvedValueOnce({ orders: [draftOrder] })
      .mockResolvedValue({ orders: [{ ...draftOrder, status: "DELIVERING" as const }] });
    render(
      <ZaUIApp theme="light">
        <MemoryRouter initialEntries={["/orders"]}>
          <App api={{ ...api, orders }} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    expect(await screen.findByRole("button", { name: "Phiếu tạm: 1 đơn" })).toBeInTheDocument();
    await waitFor(() => {
      fireEvent.focus(window);
      expect(screen.getByRole("button", { name: "Đang giao hàng: 1 đơn" })).toBeInTheDocument();
    });
  });

  it("removes a deleted TEST order from the customer's open detail screen", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    let deleted = false;
    render(
      <ZaUIApp theme="light">
        <MemoryRouter initialEntries={[`/orders/${order.id}`]}>
          <App api={{
            ...api,
            orders: async () => ({ orders: deleted ? [] : [order] }),
            order: async () => {
              if (deleted) throw Object.assign(new Error("Không tìm thấy đơn hàng"), { status: 404 });
              return { order };
            },
          }} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    expect(await screen.findByRole("heading", { name: "Chi tiết đơn T8-0001" })).toBeInTheDocument();
    deleted = true;
    fireEvent.focus(window);
    expect(await screen.findByRole("heading", { name: "Đơn hàng của bạn" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xem chi tiết đơn T8-0001" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Chi tiết đơn T8-0001" })).not.toBeInTheDocument();
  });

  it("does not show the Checkout SDK cancellation message to customers", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const pendingOrder: CustomerOrder = { ...order, status: "PENDING_PAYMENT", paymentStatus: "PENDING", canRetryCheckout: true };
    vi.mocked(openCheckout).mockRejectedValueOnce({ message: "The user rejected! (clicked the negative button)" });
    const retryCheckout = vi.fn(async () => ({
      provider: "ZALO_CHECKOUT" as const,
      requestPayload: { amount: 160000, item: [], desc: "Thanh toán đơn T8-0001", extradata: "{}", method: "{}", mac: "test-mac" },
    }));
    render(
      <ZaUIApp theme="light">
        <MemoryRouter initialEntries={[`/orders/${pendingOrder.id}`]}>
          <App api={{ ...api, orders: async () => ({ orders: [pendingOrder] }), order: async () => ({ order: pendingOrder }), retryCheckout }} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    const retryButton = await screen.findByRole("button", { name: "Thanh toán lại" });
    await act(async () => { fireEvent.click(retryButton); });
    expect(retryCheckout).toHaveBeenCalledWith(pendingOrder.id, expect.any(String));
    await waitFor(() => expect(screen.queryByText("The user rejected! (clicked the negative button)")).not.toBeInTheDocument());
  });

  it("never offers ZaloPay retry for a cash-on-delivery order", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const codOrder: CustomerOrder = {
      ...order,
      status: "PENDING_PAYMENT",
      paymentStatus: "PENDING",
      paymentMethod: "COD",
      canRetryCheckout: true,
    };
    render(
      <ZaUIApp theme="light">
        <MemoryRouter initialEntries={[`/orders/${codOrder.id}`]}>
          <App api={{ ...api, orders: async () => ({ orders: [codOrder] }), order: async () => ({ order: codOrder }) }} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    await screen.findByText("Tiền mặt khi nhận hàng");
    expect(screen.queryByRole("button", { name: "Thanh toán lại" })).not.toBeInTheDocument();
  });

  it("cancels a pending COD order without placing its items back into the cart", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const pendingOrder: CustomerOrder = {
      ...order,
      paymentMethod: "COD",
      paymentStatus: "PENDING",
      canCancel: true,
    };
    const cancelledOrder: CustomerOrder = { ...pendingOrder, status: "CANCELLED", canCancel: false };
    const cancelOrder = vi.fn(async () => ({ order: cancelledOrder }));
    const saveCart = vi.fn(api.saveCart);
    render(
      <ZaUIApp theme="light">
        <MemoryRouter initialEntries={[`/orders/${pendingOrder.id}`]}>
          <App api={{
            ...api,
            cart: async () => ({ cart: { id: null, branch, lines: [] } }),
            orders: async () => ({ orders: [pendingOrder] }),
            order: async () => ({ order: pendingOrder }),
            cancelOrder,
            saveCart,
          }} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Hủy đơn" }));

    await waitFor(() => expect(cancelOrder).toHaveBeenCalledWith(pendingOrder.id));
    expect(saveCart).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Đặt lại" })).toBeInTheDocument();
  });

  it("restores a completed order to its branch cart and opens checkout", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const completedOrder: CustomerOrder = {
      ...order,
      status: "COMPLETED",
      paymentStatus: "PAID",
      canCancel: false,
    };
    const saveCart = vi.fn(api.saveCart);
    render(
      <ZaUIApp theme="light">
        <MemoryRouter initialEntries={[`/orders/${completedOrder.id}`]}>
          <App api={{
            ...api,
            cart: async () => ({ cart: { id: null, branch, lines: [] } }),
            orders: async () => ({ orders: [completedOrder] }),
            order: async () => ({ order: completedOrder }),
            saveCart,
          }} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Đặt lại" }));

    await waitFor(() => expect(saveCart).toHaveBeenCalledWith(branch.id, [{ skuId: "11111111-1111-4111-8111-111111111111", quantity: 1 }]));
    expect(await screen.findByRole("heading", { name: "Thanh toán" })).toBeInTheDocument();
  });

  it("does not keep a rejected reorder source on later checkout attempts", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    vi.mocked(selectCheckoutPaymentMethod).mockResolvedValue({
      paymentMethod: "COD",
      checkoutMethod: { id: "COD", isCustom: false },
    });
    const completedOrder: CustomerOrder = {
      ...order,
      status: "COMPLETED",
      paymentStatus: "PAID",
      canCancel: false,
    };
    const createOrder = vi.fn()
      .mockRejectedValueOnce(new Error("Đơn gốc không còn có thể đặt lại"))
      .mockResolvedValueOnce({ order });
    render(
      <ZaUIApp theme="light">
        <MemoryRouter initialEntries={[`/orders/${completedOrder.id}`]}>
          <App api={{
            ...api,
            cart: async () => ({ cart: { id: null, branch, lines: [] } }),
            addresses: async () => ({ addresses: [{ id: "default", recipientName: "Nguyễn A", phone: "0900000000", line1: "1 cửa hàng", province: "Quận 1", isDefault: true }] }),
            orders: async () => ({ orders: [completedOrder] }),
            order: async () => ({ order: completedOrder }),
            checkoutQuote: async () => ({
              currency: "VND", lines: [{ skuId: "11111111-1111-4111-8111-111111111111", skuCode: "T8-ARABICA-250", productName: "Cà phê Arabica cửa hàng", skuName: "Túi 250g", imageUrl: null, quantity: 1, available: true, unitPriceVnd: "145000", listUnitPriceVnd: "145000", saleUnitPriceVnd: "145000", discountVnd: "0", lineTotalVnd: "145000", offerId: null }],
              itemsSubtotalVnd: "145000", itemsDiscountVnd: "0", orderDiscountVnd: "0", deliveryFeeVnd: "15000", deliveryDiscountVnd: "0", totalDiscountVnd: "0", totalVnd: "160000", vouchers: [], offerProducts: [], appliedVoucher: null, promotionRevision: "1", quoteExpiresAt: "2099-01-01T00:00:00.000Z", quoteToken: "signed-token-long-enough-for-checkout",
            }),
            createOrder,
          }} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Đặt lại" }));
    fireEvent.click(await screen.findByRole("button", { name: "Đặt mua" }));
    expect(await screen.findByText("Đơn gốc không còn có thể đặt lại")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Đặt mua" }));
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(2));

    expect(createOrder.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ reorderedFromOrderId: completedOrder.id }));
    expect(createOrder.mock.calls[1]?.[0]).not.toHaveProperty("reorderedFromOrderId");
  });

  it("exposes accessible names for customer phone and address fields", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(
      <ZaUIApp theme="light">
        <MemoryRouter initialEntries={["/account"]}>
          <App api={api} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Thông tin cá nhân" }));
    expect(await screen.findByLabelText("Tài khoản của bạn")).toHaveTextContent("0900000000");
    expect(screen.getByRole("heading", { name: "Thông tin hoá đơn" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cập nhật từ Zalo" })).not.toBeInTheDocument();
    expect(await screen.findByLabelText("Số điện thoại kiểm thử cục bộ")).toBeInTheDocument();
    expect(screen.queryByLabelText("Người nhận")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thêm địa chỉ" }));
    expect(screen.getByLabelText("Người nhận")).toBeInTheDocument();
    expect(screen.getByLabelText("Số điện thoại nhận hàng")).toBeInTheDocument();
    expect(screen.getByLabelText("Số nhà, đường")).toBeInTheDocument();
    expect(screen.getByLabelText("Tỉnh / thành")).toBeInTheDocument();
    expect(screen.getByLabelText("Xã / phường / đặc khu")).toBeInTheDocument();
    expect(screen.queryByLabelText("Quận / huyện")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Dán thông tin địa chỉ nhanh")).not.toBeInTheDocument();
    const addressSheet = document.querySelector<HTMLElement>(".zaui-sheet-content");
    expect(addressSheet).not.toHaveClass("zaui-sheet-content-hug-content");
    expect(addressSheet?.style.height).not.toBe("");
    expect(document.querySelector(".address-editor-sheet .zaui-sheet-content")).toBeInTheDocument();
    const addressEditor = document.querySelector<HTMLFormElement>("form.address-editor");
    expect(addressEditor).toBeInTheDocument();
    const addressEditorFields = document.querySelector<HTMLElement>(".address-editor-fields");
    expect(addressEditorFields).toContainElement(screen.getByLabelText("Số nhà, đường"));
    expect(document.querySelector(".address-editor-sheet .zaui-sheet-content")).toContainElement(addressEditorFields!);
    expect(screen.getByRole("button", { name: /Dùng vị trí hiện tại/ })).toBeInTheDocument();
  });

  it("returns from personal information with an edge swipe without a redundant back button", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(<ZaUIApp theme="light"><MemoryRouter initialEntries={["/account"]}><App api={api} /></MemoryRouter></ZaUIApp>);

    fireEvent.click(await screen.findByRole("button", { name: "Thông tin cá nhân" }));
    expect(screen.queryByRole("button", { name: "Quay lại menu cá nhân" })).not.toBeInTheDocument();
    const gestureSurface = document.querySelector<HTMLElement>(".app-gesture-surface");
    expect(gestureSurface).not.toBeNull();
    await act(async () => swipeRight(gestureSurface!));

    expect(document.querySelector(".content")).toHaveClass("page-motion-back");
    expect(await screen.findByRole("button", { name: "Mở thông tin tài khoản của Khách hàng" })).toBeInTheDocument();
  });

  it("does not reopen checkout when swiping back from Home", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(<ZaUIApp theme="light"><MemoryRouter><App api={api} /></MemoryRouter></ZaUIApp>);

    await screen.findByRole("heading", { name: "Đồ uống" });
    fireEvent.click(screen.getByRole("button", { name: /Thanh toán$/ }));
    expect(await screen.findByRole("heading", { name: "Thanh toán" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Trang chủ$/ }));
    expect(await screen.findByRole("heading", { name: "Đồ uống" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Thanh toán$/ }));
    expect(await screen.findByRole("heading", { name: "Thanh toán" })).toBeInTheDocument();
    const gestureSurface = document.querySelector<HTMLElement>(".app-gesture-surface")!;
    await act(async () => swipeRight(gestureSurface));
    expect(await screen.findByRole("heading", { name: "Đồ uống" })).toBeInTheDocument();

    await act(async () => swipeRight(gestureSurface));
    expect(screen.getByRole("heading", { name: "Đồ uống" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Thanh toán" })).not.toBeInTheDocument();
  });

  it("shows unverified phone status and allows verifying phone under personal information", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const linkZaloPhone = vi.fn(async () => ({ id: "customer-1", displayName: "Khách hàng", phone: "0912345678" }));
    render(
      <ZaUIApp theme="light">
        <MemoryRouter initialEntries={["/account"]}>
          <App api={{
            ...api,
            profile: async () => ({ id: "customer-1", displayName: "Khách hàng" }),
            linkZaloPhone,
          }} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Thông tin cá nhân" }));
    expect(await screen.findByLabelText("Tài khoản của bạn")).toHaveTextContent("Chưa có số điện thoại");
    const verifyBtn = screen.getByRole("button", { name: "Xác minh số điện thoại Zalo" });
    expect(verifyBtn).toBeInTheDocument();
    fireEvent.click(verifyBtn);
    await waitFor(() => expect(linkZaloPhone).toHaveBeenCalled());
  });

  it("shows one saved delivery address with edit only", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(<ZaUIApp theme="light"><MemoryRouter initialEntries={["/account?section=addresses"]}>
      <App api={{ ...api, addresses: async () => ({ addresses: [
        { id: "default", recipientName: "Nguyễn Văn A", phone: "0900000000", line1: "78 Phố Duy Tân", ward: "Phường Cầu Giấy", province: "Thành phố Hà Nội", isDefault: true },
        { id: "legacy-extra", recipientName: "Không hiển thị", phone: "0900000001", line1: "Địa chỉ cũ", province: "Thành phố Hà Nội", isDefault: false },
      ] }) }} />
    </MemoryRouter></ZaUIApp>);

    expect(await screen.findByText("Nguyễn Văn A")).toBeInTheDocument();
    expect(screen.queryByText("Không hiển thị")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sửa" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thêm địa chỉ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Đặt mặc định" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xóa" })).not.toBeInTheDocument();
  });

  it("prefills a legacy saved address before editing", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(<ZaUIApp theme="light"><MemoryRouter initialEntries={["/account?section=addresses"]}>
      <App api={{ ...api, addresses: async () => ({ addresses: [{
        id: "default", recipientName: "Nguyễn Văn A", phone: "0900000000", line1: "Tòa nhà AC, Ngõ 78 Phố Duy Tân, Cầu Giấy, Hà Nội, Việt Nam", province: "", isDefault: true,
      }] }) }} />
    </MemoryRouter></ZaUIApp>);

    fireEvent.click(await screen.findByRole("button", { name: "Sửa" }));
    expect(await screen.findByLabelText("Người nhận")).toHaveValue("Nguyễn Văn A");
    expect(screen.getByLabelText("Số điện thoại nhận hàng")).toHaveValue("0900000000");
    expect(screen.getByLabelText("Số nhà, đường")).toHaveValue("Tòa nhà AC, Ngõ 78 Phố Duy Tân");
    await waitFor(() => expect(screen.getByLabelText("Tỉnh / thành")).toHaveValue("Thành phố Hà Nội"));
    expect(screen.getByLabelText("Xã / phường / đặc khu")).toHaveValue("Phường Cầu Giấy");
  });

  it.each(["Thay đổi", "Kiểm tra / dùng lại vị trí hiện tại"])("opens the saved address form from checkout through %s without leaving checkout", async (action) => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(<ZaUIApp theme="light"><MemoryRouter initialEntries={["/cart"]}>
      <App api={{ ...api,
        cart: async () => ({ cart: { id: "cart-1", branch, lines: [{ skuId: "11111111-1111-4111-8111-111111111111", quantity: 1 }] } }),
        addresses: async () => ({ addresses: [{ id: "default", recipientName: "Nguyễn Văn A", phone: "0900000000", line1: "78 Phố Duy Tân", ward: "Phường Cầu Giấy", province: "Thành phố Hà Nội", isDefault: true }] }),
      }} />
    </MemoryRouter></ZaUIApp>);

    document.body.scrollTop = 240;
    fireEvent.click(await screen.findByRole("button", { name: action }));
    expect(await screen.findByRole("heading", { name: "Sửa địa chỉ" })).toBeInTheDocument();
    expect(screen.getByLabelText("Người nhận")).toHaveValue("Nguyễn Văn A");
    await waitFor(() => expect(screen.getByLabelText("Tỉnh / thành")).toHaveValue("Thành phố Hà Nội"));
    expect(screen.getByRole("heading", { name: "Thanh toán" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Thông tin cá nhân" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
    expect(screen.getByRole("heading", { name: "Thanh toán" })).toBeInTheDocument();
    expect(document.body.scrollTop).toBe(240);
  });

  it("updates the delivery address in checkout without leaving the page", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    let savedAddress: Address = { id: "default", recipientName: "Nguyễn Văn A", phone: "0900000000", line1: "78 Phố Duy Tân", ward: "Phường Cầu Giấy", province: "Thành phố Hà Nội", isDefault: true };
    const updateAddress = vi.fn(async (_id: string, data: Parameters<CustomerApi["updateAddress"]>[1]) => {
      savedAddress = { ...savedAddress, ...data };
    });
    render(<ZaUIApp theme="light"><MemoryRouter initialEntries={["/cart"]}>
      <App api={{ ...api,
        cart: async () => ({ cart: { id: "cart-1", branch, lines: [{ skuId: "11111111-1111-4111-8111-111111111111", quantity: 1 }] } }),
        addresses: async () => ({ addresses: [savedAddress] }),
        updateAddress,
      }} />
    </MemoryRouter></ZaUIApp>);

    document.body.scrollTop = 240;
    fireEvent.click(await screen.findByRole("button", { name: "Thay đổi" }));
    const line1 = await screen.findByLabelText("Số nhà, đường");
    fireEvent.change(line1, { target: { value: "80 Phố Duy Tân" } });
    fireEvent.click(screen.getByRole("button", { name: /Lưu địa chỉ/ }));

    await waitFor(() => expect(updateAddress).toHaveBeenCalledWith("default", expect.objectContaining({ line1: "80 Phố Duy Tân" })));
    expect(await screen.findByText(/80 Phố Duy Tân/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Thanh toán" })).toBeInTheDocument();
    expect(document.body.scrollTop).toBe(240);
  });

  it("saves the electronic-invoice request from personal information", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const invoiceProfile = {
      kind: "BUSINESS" as const,
      legalName: "Hộ kinh doanh cửa hàng",
      taxCode: "0101234567",
      registeredAddress: "1 cửa hàng, Quận 1",
      email: "hoadon@example.com",
    };
    const updateProfile = vi.fn(async () => ({
      id: "customer-1",
      displayName: "Khách hàng",
      phone: "0900000000",
      invoiceProfile,
    }));
    render(<ZaUIApp theme="light"><MemoryRouter initialEntries={["/account"]}><App api={{ ...api, updateProfile }} /></MemoryRouter></ZaUIApp>);

    fireEvent.click(await screen.findByRole("button", { name: "Thông tin cá nhân" }));
    fireEvent.click(screen.getByRole("button", { name: "Thông tin hóa đơn" }));
    fireEvent.change(await screen.findByLabelText("Tên hộ kinh doanh / công ty"), { target: { value: invoiceProfile.legalName } });
    fireEvent.change(screen.getByLabelText("Mã số thuế"), { target: { value: invoiceProfile.taxCode } });
    fireEvent.change(screen.getByLabelText("Địa chỉ đăng ký"), { target: { value: invoiceProfile.registeredAddress } });
    fireEvent.change(screen.getByLabelText("Email nhận hóa đơn"), { target: { value: invoiceProfile.email } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu thông tin" }));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ invoiceProfile }));
    expect(await screen.findByRole("button", { name: "Cập nhật thông tin" })).toBeInTheDocument();
  });

  it("fills the address form from the backend's reverse-geocoded suggestion", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const reverseGeocode = vi.fn(async () => ({
      address: "Tòa nhà AC, Ngõ 78 Phố Duy Tân, Cầu Giấy, Hà Nội, Việt Nam",
      province: "Hà Nội",
      ward: "Dịch Vọng Hậu",
    }));
    render(<ZaUIApp theme="light"><MemoryRouter initialEntries={["/account?section=addresses"]}>
      <App api={{ ...api, reverseGeocode }} />
    </MemoryRouter></ZaUIApp>);

    fireEvent.click(await screen.findByRole("button", { name: "Thêm địa chỉ" }));
    fireEvent.click(await screen.findByRole("button", { name: /Dùng vị trí hiện tại/ }));

    await waitFor(() => expect(reverseGeocode).toHaveBeenCalledWith({
      locationToken: "location-token",
      accessToken: "access-token",
    }));
    await waitFor(() => expect(screen.getByLabelText("Số nhà, đường")).toHaveValue("Tòa nhà AC, Ngõ 78 Phố Duy Tân"));
    expect(screen.getByLabelText("Tỉnh / thành")).toHaveValue("Thành phố Hà Nội");
    expect(screen.getByLabelText("Xã / phường / đặc khu")).toHaveValue("Phường Cầu Giấy");
    expect(screen.queryByText(/Đã điền địa chỉ gợi ý/)).not.toBeInTheDocument();
  });

  it("keeps an address after getting a location, saving it, and reopening the app", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    let saved: Awaited<ReturnType<CustomerApi["addresses"]>>["addresses"][number] | null = null;
    const createAddress = vi.fn(async (data: Parameters<CustomerApi["createAddress"]>[0]) => {
      saved = { id: "default", ...data };
    });
    const customerApi = {
      ...api,
      reverseGeocode: async () => ({ address: "12 Đường Hạnh Phúc, Xã Đồng Văn, Tỉnh Tuyên Quang", province: "Tuyên Quang", ward: "Đồng Văn" }),
      addresses: async () => ({ addresses: saved ? [saved] : [] }),
      createAddress,
    };
    const renderAccount = () => render(<ZaUIApp theme="light"><MemoryRouter initialEntries={["/account?section=addresses"]}>
      <App api={customerApi} />
    </MemoryRouter></ZaUIApp>);

    const first = renderAccount();
    fireEvent.click(await screen.findByRole("button", { name: "Thêm địa chỉ" }));
    fireEvent.click(screen.getByRole("button", { name: /Dùng vị trí hiện tại/ }));
    await waitFor(() => expect(screen.getByLabelText("Tỉnh / thành")).toHaveValue("Tỉnh Tuyên Quang"));
    await waitFor(() => expect(screen.getByLabelText("Xã / phường / đặc khu")).toHaveValue("Xã Đồng Văn"));
    fireEvent.click(screen.getByRole("button", { name: /Hoàn thành/ }));
    await waitFor(() => expect(createAddress).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("button", { name: "Sửa" })).toBeInTheDocument();
    first.unmount();

    renderAccount();
    expect(await screen.findByText("12 Đường Hạnh Phúc, Xã Đồng Văn, Tỉnh Tuyên Quang")).toBeInTheDocument();
  });

  it("shows address errors inside the sheet and never reports an unconfirmed save", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const createAddress = vi.fn(async () => undefined);
    render(<ZaUIApp theme="light"><MemoryRouter initialEntries={["/account?section=addresses"]}>
      <App api={{ ...api, createAddress }} />
    </MemoryRouter></ZaUIApp>);

    fireEvent.click(await screen.findByRole("button", { name: "Thêm địa chỉ" }));
    fireEvent.click(screen.getByRole("button", { name: /Hoàn thành/ }));
    expect(createAddress).not.toHaveBeenCalled();
    expect(document.querySelector(".address-editor-actions")).toContainElement(screen.getByRole("alert"));

    const province = screen.getByLabelText("Tỉnh / thành");
    await waitFor(() => expect(province.querySelectorAll("option")).toHaveLength(35));
    fireEvent.change(province, { target: { value: "Tỉnh Tuyên Quang" } });
    fireEvent.change(screen.getByLabelText("Xã / phường / đặc khu"), { target: { value: "Xã Đồng Văn" } });
    fireEvent.change(screen.getByLabelText("Số nhà, đường"), { target: { value: "12 Đường Hạnh Phúc" } });
    fireEvent.click(screen.getByRole("button", { name: /Hoàn thành/ }));
    await waitFor(() => expect(createAddress).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toHaveTextContent("Chưa xác nhận được địa chỉ đã lưu");
    expect(screen.queryByText("Đã thêm địa chỉ")).not.toBeInTheDocument();
  });

  it("requires a current province and ward from the post-merger administrative list", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const createAddress = vi.fn(async () => undefined);
    render(<ZaUIApp theme="light"><MemoryRouter initialEntries={["/account?section=addresses"]}>
      <App api={{ ...api, createAddress }} />
    </MemoryRouter></ZaUIApp>);
    fireEvent.click(await screen.findByRole("button", { name: "Thêm địa chỉ" }));
    const province = await screen.findByLabelText("Tỉnh / thành");
    const ward = screen.getByLabelText("Xã / phường / đặc khu");
    expect(province).toHaveValue("");
    await waitFor(() => expect(province.querySelectorAll("option")).toHaveLength(35));
    expect(ward).toBeDisabled();
    fireEvent.change(province, { target: { value: "Tỉnh Tuyên Quang" } });
    expect(ward).toBeEnabled();
    expect(screen.getByRole("option", { name: "Xã Đồng Văn" })).toBeInTheDocument();
    fireEvent.change(ward, { target: { value: "Xã Đồng Văn" } });
    fireEvent.change(screen.getByLabelText("Số nhà, đường"), { target: { value: "12 Đường Hạnh Phúc" } });
    fireEvent.click(screen.getByRole("button", { name: /Hoàn thành/ }));
    await waitFor(() => expect(createAddress).toHaveBeenCalledWith({
      recipientName: "Khách hàng", phone: "0900000000", line1: "12 Đường Hạnh Phúc",
      province: "Tỉnh Tuyên Quang", ward: "Xã Đồng Văn", isDefault: true,
    }));
  });

  it("shows the backend error when adding an address is rejected", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const createAddress = vi.fn(async () => { throw new Error("Số điện thoại không hợp lệ"); });
    render(<ZaUIApp theme="light"><MemoryRouter initialEntries={["/account?section=addresses"]}>
      <App api={{ ...api, createAddress }} />
    </MemoryRouter></ZaUIApp>);
    fireEvent.click(await screen.findByRole("button", { name: "Thêm địa chỉ" }));
    const province = await screen.findByLabelText("Tỉnh / thành");
    await waitFor(() => expect(province.querySelectorAll("option")).toHaveLength(35));
    fireEvent.change(province, { target: { value: "Tỉnh Tuyên Quang" } });
    fireEvent.change(screen.getByLabelText("Xã / phường / đặc khu"), { target: { value: "Xã Đồng Văn" } });
    fireEvent.change(screen.getByLabelText("Số nhà, đường"), { target: { value: "12 Đường Hạnh Phúc" } });
    fireEvent.click(screen.getByRole("button", { name: /Hoàn thành/ }));

    expect(await screen.findByText("Số điện thoại không hợp lệ")).toBeInTheDocument();
  });

  it("opens orders and history from the personal menu", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(
      <ZaUIApp theme="light">
        <MemoryRouter initialEntries={["/account"]}>
          <App api={{ ...api, orders: async () => ({ orders: [order] }) }} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Xem tất cả đơn hàng" }));
    expect(await screen.findByRole("heading", { name: "Đơn hàng của bạn" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xem chi tiết đơn T8-0001" })).toBeInTheDocument();
  });

  it("opens confirmed orders from the personal status strip", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const codOrder: CustomerOrder = {
      ...order,
      id: "55555555-5555-4555-8555-555555555555",
      code: "T8-0002",
      status: "CONFIRMED",
      paymentStatus: "PENDING",
      paymentMethod: "COD",
    };
    render(
      <ZaUIApp theme="light">
        <MemoryRouter initialEntries={["/account"]}>
          <App api={{ ...api, orders: async () => ({ orders: [order, codOrder] }) }} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Đã xác nhận: 2 đơn" }));
    expect(await screen.findByRole("button", { name: "Xem chi tiết đơn T8-0001" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xem chi tiết đơn T8-0002" })).toBeInTheDocument();
  });

  it("opens delivering orders from the personal status strip", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const deliveringOrder: CustomerOrder = { ...order, id: "55555555-5555-4555-8555-555555555555", code: "T8-0002", status: "DELIVERING" };
    render(
      <ZaUIApp theme="light">
        <MemoryRouter initialEntries={["/account"]}>
          <App api={{ ...api, orders: async () => ({ orders: [order, deliveringOrder] }) }} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    expect((await screen.findByRole("button", { name: "Đang giao hàng: 1 đơn" })).querySelector("img")).toHaveAttribute("src", expect.stringContaining("delivery-truck.svg"));
    fireEvent.click(await screen.findByRole("button", { name: "Đang giao hàng: 1 đơn" }));
    expect(await screen.findByRole("button", { name: "Xem chi tiết đơn T8-0002" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xem chi tiết đơn T8-0001" })).not.toBeInTheDocument();
  });

  it("toggles product view mode between grid and list and persists the preference", async () => {
    localStorage.removeItem("shop_catalog_view_mode");
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(
      <ZaUIApp theme="light">
        <MemoryRouter>
          <App api={api} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    const toggleButton = await screen.findByRole("button", { name: "Chuyển sang dạng danh sách" });
    expect(toggleButton).toBeInTheDocument();
    expect(document.querySelector(".product-list")).toHaveClass("product-list-grid");
    expect(document.querySelector(".product-list .product-card")).toHaveClass("product-card-grid");

    fireEvent.click(toggleButton);

    expect(screen.getByRole("button", { name: "Chuyển sang dạng lưới" })).toBeInTheDocument();
    expect(document.querySelector(".product-list")).toHaveClass("product-list-list");
    expect(document.querySelector(".product-list .product-card")).toHaveClass("product-card-list");
    expect(localStorage.getItem("shop_catalog_view_mode")).toBe("list");

    fireEvent.click(screen.getByRole("button", { name: "Chuyển sang dạng lưới" }));

    expect(screen.getByRole("button", { name: "Chuyển sang dạng danh sách" })).toBeInTheDocument();
    expect(document.querySelector(".product-list")).toHaveClass("product-list-grid");
    expect(document.querySelector(".product-list .product-card")).toHaveClass("product-card-grid");
    expect(localStorage.getItem("shop_catalog_view_mode")).toBe("grid");
  });

  it("keeps the shared product quantity while switching catalog views", async () => {
    localStorage.removeItem("shop_catalog_view_mode");
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const saveCart = vi.fn(api.saveCart);
    render(
      <ZaUIApp theme="light">
        <MemoryRouter>
          <App api={{ ...api, saveCart }} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    const productCard = () => Array.from(document.querySelectorAll<HTMLElement>(".catalog .product-card"))
      .find((card) => card.textContent?.includes("Cà phê Arabica cửa hàng"))!;
    const productControls = () => within(productCard());
    const toggle = await screen.findByRole("button", { name: "Chuyển sang dạng danh sách" });

    fireEvent.click(productControls().getByRole("button", { name: "Thêm Cà phê Arabica cửa hàng" }));
    await waitFor(() => expect(saveCart).toHaveBeenLastCalledWith(branch.id, [{ skuId: "11111111-1111-4111-8111-111111111111", quantity: 1 }]));
    fireEvent.click(productControls().getByRole("button", { name: "Tăng Cà phê Arabica cửa hàng" }));
    await waitFor(() => expect(saveCart).toHaveBeenLastCalledWith(branch.id, [{ skuId: "11111111-1111-4111-8111-111111111111", quantity: 2 }]));

    const savesBeforeSwitch = saveCart.mock.calls.length;
    fireEvent.click(toggle);
    expect(productCard().querySelector(".card-stepper-count")).toHaveTextContent("2");
    expect(saveCart).toHaveBeenCalledTimes(savesBeforeSwitch);

    fireEvent.click(productControls().getByRole("button", { name: "Tăng Cà phê Arabica cửa hàng" }));
    await waitFor(() => expect(saveCart).toHaveBeenLastCalledWith(branch.id, [{ skuId: "11111111-1111-4111-8111-111111111111", quantity: 3 }]));
    fireEvent.click(screen.getByRole("button", { name: "Chuyển sang dạng lưới" }));
    expect(productCard().querySelector(".card-stepper-count")).toHaveTextContent("3");

    for (const quantity of [2, 1, 0]) {
      fireEvent.click(productControls().getByRole("button", { name: "Giảm Cà phê Arabica cửa hàng" }));
      await waitFor(() => expect(saveCart).toHaveBeenLastCalledWith(
        branch.id,
        quantity === 0 ? [] : [{ skuId: "11111111-1111-4111-8111-111111111111", quantity }],
      ));
    }

    fireEvent.click(screen.getByRole("button", { name: "Chuyển sang dạng danh sách" }));
    expect(productControls().getByRole("button", { name: "Thêm Cà phê Arabica cửa hàng" })).toBeInTheDocument();
  });

  it("restores list view mode when persisted in storage", async () => {
    localStorage.setItem("shop_catalog_view_mode", "list");
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(
      <ZaUIApp theme="light">
        <MemoryRouter>
          <App api={api} />
        </MemoryRouter>
      </ZaUIApp>,
    );

    const toggleButton = await screen.findByRole("button", { name: "Chuyển sang dạng lưới" });
    expect(toggleButton).toBeInTheDocument();
    expect(document.querySelector(".product-list")).toHaveClass("product-list-list");
    expect(document.querySelector(".product-list .product-card")).toHaveClass("product-card-list");
  });

  it("does not request a service-area location while enforcement is disabled", async () => {
    const haGiang: Branch = { id: "100001", code: "100001", name: "Cửa hàng Quận 1", fulfillmentMethods: ["DELIVERY", "PICKUP"] };
    sessionStorage.setItem(BRANCH_STORAGE_KEY, haGiang.id);
    const reverseGeocode = vi.fn(async () => ({
      serviceAssignment: { status: "IN_AREA" as const, branchId: haGiang.id, assignedAt: "2026-09-12T00:00:00.000Z" },
      needsRefresh: false,
    }));
    render(<ZaUIApp theme="light"><MemoryRouter><App api={{
      ...api,
      branches: async () => ({ branches: [haGiang] }),
      profile: async () => ({
        id: "customer-1",
        serviceAssignment: { status: "UNAVAILABLE", branchId: null, assignedAt: null },
        needsRefresh: false,
      }),
      reverseGeocode,
    }} /></MemoryRouter></ZaUIApp>);

    await screen.findAllByText("Cà phê Arabica cửa hàng");
    expect(requestZaloLocation).not.toHaveBeenCalled();
    expect(reverseGeocode).not.toHaveBeenCalled();
  });

  it("loads checkout for an out-of-area customer while enforcement is disabled", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    const checkoutQuote = vi.fn(async () => ({
      currency: "VND" as const, lines: [{ skuId: "11111111-1111-4111-8111-111111111111", skuCode: "T8-ARABICA-250", productName: "Cà phê Arabica cửa hàng", skuName: "Túi 250g", imageUrl: null, quantity: 1, available: true, unitPriceVnd: "145000", listUnitPriceVnd: "145000", saleUnitPriceVnd: "145000", discountVnd: "0", lineTotalVnd: "145000", offerId: null }],
      itemsSubtotalVnd: "145000", itemsDiscountVnd: "0", orderDiscountVnd: "0", deliveryFeeVnd: "15000", deliveryDiscountVnd: "0", totalDiscountVnd: "0", totalVnd: "160000", vouchers: [], offerProducts: [], appliedVoucher: null, promotionRevision: "1", quoteExpiresAt: "2099-01-01T00:00:00.000Z", quoteToken: "signed-token-long-enough-for-checkout",
    }));
    render(<ZaUIApp theme="light"><MemoryRouter initialEntries={["/cart"]}><App api={{
      ...api,
      profile: async () => ({
        id: "customer-1",
        serviceAssignment: { status: "OUT_OF_AREA", branchId: branch.id, assignedAt: null },
        needsRefresh: false,
      }),
      cart: async () => ({ cart: { id: null, branch, lines: [{ skuId: "11111111-1111-4111-8111-111111111111", quantity: 1 }] } }),
      checkoutQuote,
    }} /></MemoryRouter></ZaUIApp>);

    expect(await screen.findByRole("heading", { name: "Thanh toán" })).toBeInTheDocument();
    await waitFor(() => expect(checkoutQuote).toHaveBeenCalled());
  });

  it("does not expose service-area controls for an accepted location while disabled", async () => {
    sessionStorage.setItem(BRANCH_STORAGE_KEY, branch.id);
    render(<ZaUIApp theme="light"><MemoryRouter><App api={{
      ...api,
      profile: async () => ({
        id: "customer-1",
        serviceAssignment: { status: "IN_AREA", branchId: branch.id, assignedAt: "2026-09-12T00:00:00.000Z" },
        needsRefresh: false,
      }),
    }} /></MemoryRouter></ZaUIApp>);

    await screen.findAllByText("Cà phê Arabica cửa hàng");
    expect(requestZaloLocation).not.toHaveBeenCalled();
  });
});

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CategorySelector, type CategoryTreeNode } from "../market/CategorySelector.js";

const groups: CategoryTreeNode[] = [
  {
    name: "Đồ khô - Mì gói",
    path: ["Đồ khô - Mì gói"],
    children: [
      {
        name: "Mì Phở Cháo Miến",
        path: ["Đồ khô - Mì gói", "Mì Phở Cháo Miến"],
        children: [
          { name: "Mì gói", path: ["Đồ khô - Mì gói", "Mì Phở Cháo Miến", "Mì gói"], children: [] },
          { name: "Mì hộp", path: ["Đồ khô - Mì gói", "Mì Phở Cháo Miến", "Mì hộp"], children: [] },
        ],
      },
      { name: "Gia vị", path: ["Đồ khô - Mì gói", "Gia vị"], children: [] },
    ],
  },
  {
    name: "Đồ uống",
    path: ["Đồ uống"],
    children: [{ name: "Nước ngọt", path: ["Đồ uống", "Nước ngọt"], children: [] }],
  },
];
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

function renderSelector(overrides: Partial<React.ComponentProps<typeof CategorySelector>> = {}) {
  const props = {
    groups,
    selectedPath: [],
    visible: true,
    onSelect: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  return { ...render(<CategorySelector {...props} />), props };
}

describe("CategorySelector", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: originalScrollIntoView });
    document.body.style.overflow = "";
  });

  it("renders nothing when hidden", () => {
    renderSelector({ visible: false });
    expect(screen.queryByRole("dialog", { name: "Chọn danh mục" })).not.toBeInTheDocument();
  });

  it("paints the entering state before sliding the drawer open", () => {
    const { container } = renderSelector();
    const drawer = container.querySelector(".category-drawer-root")!;
    expect(drawer).toHaveClass("category-drawer--entering");
    act(() => vi.advanceTimersByTime(16));
    expect(drawer).toHaveClass("category-drawer--entering");
    act(() => vi.advanceTimersByTime(16));
    expect(drawer).toHaveClass("category-drawer--open");
  });

  it("renders a three-level tree and expands or collapses each branch", () => {
    renderSelector();
    expect(screen.getByRole("button", { name: "Đồ khô - Mì gói" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mì Phở Cháo Miến" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mở rộng Đồ khô - Mì gói" }));
    expect(screen.getByRole("button", { name: "Mì Phở Cháo Miến" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mì gói" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mở rộng Mì Phở Cháo Miến" }));
    expect(screen.getByRole("button", { name: "Mì gói" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mì hộp" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Thu gọn Đồ khô - Mì gói" }));
    expect(screen.queryByRole("button", { name: "Mì Phở Cháo Miến" })).not.toBeInTheDocument();
  });

  it("replaces level-two categories with brands inside their level-one category", () => {
    const onSelectBrand = vi.fn();
    renderSelector({
      groupingMode: "brand",
      brandOptionsByCategory: new Map([
        ["Đồ khô - Mì gói", ["Acecook", "Omachi", null]],
        ["Đồ uống", ["Coca-Cola"]],
      ]),
      selectedPath: ["Đồ khô - Mì gói"],
      selectedBrand: "Omachi",
      onSelectBrand,
      onToggleGroupingMode: vi.fn(),
    });

    expect(screen.getByRole("button", { name: "Chuyển sang nhóm theo Danh mục" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Mở rộng Đồ khô - Mì gói" }));
    expect(screen.getByRole("button", { name: "Acecook" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Omachi" })).toHaveClass("selected");
    expect(screen.getByRole("button", { name: "Khác" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mì Phở Cháo Miến" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Omachi" }));
    expect(onSelectBrand).toHaveBeenCalledWith("Đồ khô - Mì gói", "Omachi");
  });

  it("shows icons only for mapped root categories", () => {
    renderSelector({ groups: [
      { name: "Đồ uống đóng chai", path: ["Đồ uống đóng chai"], children: [] },
      { name: "Xúc Xích & Thịt Nguội", path: ["Xúc Xích & Thịt Nguội"], children: [] },
      { name: "Văn phòng phẩm", path: ["Văn phòng phẩm"], children: [] },
      { name: "Danh mục mới", path: ["Danh mục mới"], children: [] },
    ] });

    expect(screen.getByRole("button", { name: "Đồ uống đóng chai" }).querySelector("img"))
      .toHaveAttribute("src", expect.stringContaining("category-bottled-drinks"));
    expect(screen.getByRole("button", { name: "Xúc Xích & Thịt Nguội" }).querySelector("img"))
      .toHaveAttribute("src", expect.stringContaining("category-deli"));
    expect(screen.getByRole("button", { name: "Văn phòng phẩm" }).querySelector("img"))
      .toHaveAttribute("src", expect.stringContaining("category-stationery"));
    expect(screen.getByRole("button", { name: "Danh mục mới" }).querySelector("img")).toBeNull();
  });

  it("greys out empty categories at every level", () => {
    const onSelect = vi.fn();
    renderSelector({
      groups: [
        {
          name: "Có hàng",
          path: ["Có hàng"],
          children: [{
            name: "Nhóm có hàng",
            path: ["Có hàng", "Nhóm có hàng"],
            children: [
              { name: "Sản phẩm có hàng", path: ["Có hàng", "Nhóm có hàng", "Sản phẩm có hàng"], children: [] },
              { name: "Sản phẩm trống", path: ["Có hàng", "Nhóm có hàng", "Sản phẩm trống"], children: [] },
            ],
          }, {
            name: "Nhóm trống",
            path: ["Có hàng", "Nhóm trống"],
            children: [],
          }],
        },
        { name: "Danh mục trống", path: ["Danh mục trống"], children: [] },
      ],
      availablePathKeys: new Set([
        "Có hàng",
        "Có hàng\u0001Nhóm có hàng",
        "Có hàng\u0001Nhóm có hàng\u0001Sản phẩm có hàng",
      ]),
      onSelect,
    });

    expect(screen.getByRole("button", { name: "Danh mục trống" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Mở rộng Có hàng" }));
    expect(screen.getByRole("button", { name: "Nhóm trống" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Mở rộng Nhóm có hàng" }));
    expect(screen.getByRole("button", { name: "Sản phẩm trống" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Sản phẩm trống" }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps a manually expanded branch open when catalog data refreshes", () => {
    const { rerender } = renderSelector();
    fireEvent.click(screen.getByRole("button", { name: "Mở rộng Đồ khô - Mì gói" }));
    rerender(<CategorySelector groups={[...groups]} selectedPath={[]} visible onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Mì Phở Cháo Miến" })).toBeInTheDocument();
  });

  it("keeps the selected branch expanded and brings it back into view after reopening", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    const selectedPath = ["Đồ khô - Mì gói", "Mì Phở Cháo Miến", "Mì hộp"];
    const { rerender } = renderSelector();

    fireEvent.click(screen.getByRole("button", { name: "Mở rộng Đồ khô - Mì gói" }));
    fireEvent.click(screen.getByRole("button", { name: "Mở rộng Mì Phở Cháo Miến" }));
    rerender(<CategorySelector groups={groups} selectedPath={selectedPath} visible={false} onSelect={vi.fn()} onClose={vi.fn()} />);
    act(() => vi.advanceTimersByTime(300));
    rerender(<CategorySelector groups={groups} selectedPath={selectedPath} visible onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Mì hộp" })).toHaveClass("selected");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
  });

  it("does not jump back to a selected level-three node when another branch expands", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    renderSelector({ selectedPath: ["Đồ khô - Mì gói", "Mì Phở Cháo Miến", "Mì hộp"] });

    expect(screen.getByRole("button", { name: "Mì hộp" })).toBeInTheDocument();
    scrollIntoView.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Mở rộng Đồ uống" }));

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("selects the exact category path for any level", () => {
    const onSelect = vi.fn();
    renderSelector({ onSelect });
    fireEvent.click(screen.getByRole("button", { name: "Mở rộng Đồ khô - Mì gói" }));
    fireEvent.click(screen.getByRole("button", { name: "Mở rộng Mì Phở Cháo Miến" }));
    fireEvent.click(screen.getByRole("button", { name: "Mì hộp" }));
    expect(onSelect).toHaveBeenCalledWith(["Đồ khô - Mì gói", "Mì Phở Cháo Miến", "Mì hộp"]);

    const home = screen.getByRole("button", { name: "Trang chủ" });
    expect(home.querySelector(".category-tree-home-icon")).toBeInTheDocument();
    fireEvent.click(home);
    expect(onSelect).toHaveBeenLastCalledWith([]);
  });

  it("closes from the backdrop, Escape, or a left swipe", () => {
    const onClose = vi.fn();
    const { container } = renderSelector({ onClose });
    fireEvent.click(container.querySelector(".category-drawer-backdrop")!);
    fireEvent.keyDown(window, { key: "Escape" });
    const panel = container.querySelector(".category-drawer-panel")!;
    fireEvent.touchStart(panel, { touches: [{ clientX: 150, clientY: 100 }] });
    fireEvent.touchEnd(panel, { changedTouches: [{ clientX: 80, clientY: 102 }] });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("locks scrolling and plays the closing lifecycle", () => {
    const { rerender } = renderSelector();
    expect(document.body.style.overflow).toBe("hidden");
    rerender(<CategorySelector groups={groups} selectedPath={[]} visible={false} onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(document.querySelector(".category-drawer-root")).toHaveAttribute("aria-hidden", "true");
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByRole("dialog", { name: "Chọn danh mục" })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });

  it("reverses a closing drawer without unmounting it", () => {
    const { rerender, container } = renderSelector();
    const drawer = container.querySelector(".category-drawer-root")!;
    act(() => vi.advanceTimersByTime(20));
    rerender(<CategorySelector groups={groups} selectedPath={[]} visible={false} onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(drawer).toHaveClass("category-drawer--closing");

    act(() => vi.advanceTimersByTime(100));
    rerender(<CategorySelector groups={groups} selectedPath={[]} visible onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(drawer).toHaveClass("category-drawer--open");
    act(() => vi.advanceTimersByTime(300));

    expect(container.querySelector(".category-drawer-root")).toBe(drawer);
    expect(drawer).toHaveClass("category-drawer--open");
  });
});

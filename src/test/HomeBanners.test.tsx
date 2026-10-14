import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CampaignIcons, CampaignPopup, HomeCampaignBanners } from "../market/HomeBanners.js";

const campaigns = [
  { id: "one", title: "Ưu đãi một", images: { headerUrl: "https://cdn.test/one-wide.png", popupUrl: "https://cdn.test/one-tall.png", iconUrl: "https://cdn.test/one-icon.png" }, productIds: ["10"] },
  { id: "two", title: "Ưu đãi hai", images: { headerUrl: "https://cdn.test/two-wide.png", popupUrl: "https://cdn.test/two-tall.png" }, productIds: ["20"] },
];

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Mini App campaign surfaces", () => {
  it("renders nothing without the requested campaign image", () => {
    const { container } = render(<HomeCampaignBanners campaigns={[]} onSelect={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("swipes, changes by dot and pauses automatic movement", () => {
    vi.useFakeTimers();
    render(<HomeCampaignBanners campaigns={campaigns} onSelect={() => undefined} />);
    const region = screen.getByRole("region", { name: "Banner khuyến mại" });
    fireEvent.pointerDown(region);
    act(() => vi.advanceTimersByTime(5_100));
    expect(screen.getByRole("button", { name: "Ưu đãi một" })).toBeVisible();
    fireEvent.pointerUp(region);
    const firstImage = screen.getByAltText("Ưu đãi một");
    fireEvent.touchStart(region, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(region, { changedTouches: [{ clientX: 80 }] });
    expect(screen.getByRole("button", { name: "Ưu đãi hai" })).toBeVisible();
    expect(firstImage).toBeInTheDocument();
    expect(firstImage.closest(".campaign-slide")).toHaveAttribute("aria-hidden", "true");
    expect(firstImage.closest(".campaign-slide")).not.toHaveClass("active");
    fireEvent.click(screen.getByRole("button", { name: "Banner 1: Ưu đãi một" }));
    expect(screen.getByRole("button", { name: "Ưu đãi một" })).toBeVisible();
    expect(firstImage.closest(".campaign-slide")).toHaveClass("active");
  });

  it("does not make an informational banner clickable", () => {
    const onSelect = vi.fn();
    render(<HomeCampaignBanners campaigns={[{ ...campaigns[0]!, productIds: [] }]} onSelect={onSelect} />);
    expect(screen.queryByRole("button", { name: "Ưu đãi một" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Ưu đãi một"));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows campaign icons and closes popup by X or backdrop", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const view = render(<><CampaignIcons campaigns={campaigns} onSelect={onSelect} /><CampaignPopup campaigns={campaigns} onClose={onClose} onSelect={onSelect} /></>);
    fireEvent.click(within(screen.getByRole("navigation", { name: "Danh mục campaign" })).getByRole("button", { name: "Ưu đãi một" }));
    expect(onSelect).toHaveBeenCalledWith(campaigns[0]);
    fireEvent.click(screen.getByRole("button", { name: "Đóng popup" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(view.container.querySelector(".campaign-popup-backdrop")!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

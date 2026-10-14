import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProductImageViewer } from "../market/ProductImageViewer.js";

describe("ProductImageViewer", () => {
  it("closes when the product image is tapped without rendering a close button", () => {
    const onClose = vi.fn();
    render(<ProductImageViewer visible images={["https://example.test/product.png"]} productName="Mì Indomie" onClose={onClose} />);

    expect(screen.queryByRole("button", { name: "Đóng xem ảnh" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("img", { name: "Mì Indomie - ảnh 1" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

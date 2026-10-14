import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { AppRoot } from "../AppRoot.js";

vi.mock("../App.js", async () => {
  const { useLocation } = await import("react-router-dom");

  return {
    App: () => <p>Cửa hàng đã khởi động tại {useLocation().pathname}</p>,
  };
});

afterEach(() => {
  window.history.replaceState({}, "", "/");
  Reflect.deleteProperty(window, "APP_ID");
});

it("renders when the Zalo runtime has not injected APP_ID", () => {
  window.history.replaceState({}, "", "/?env=DEVELOPMENT");
  Reflect.deleteProperty(window, "APP_ID");

  render(<AppRoot />);

  expect(screen.getByText("Cửa hàng đã khởi động tại /")).toBeInTheDocument();
});

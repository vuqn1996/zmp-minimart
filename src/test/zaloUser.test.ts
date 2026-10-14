import { afterEach, describe, expect, it, vi } from "vitest";
import { getAccessToken, getLocation, getPhoneNumber, getSetting, getUserInfo, openPermissionSetting } from "zmp-sdk-modern/apis";

import { getZaloLocationPermission, getZaloLoginPermission, isZaloLocationDenied, openZaloLocationPermissionSettings, requestZaloLocation, requestZaloPhoneToken, requestZaloUserInfo } from "../zaloUser.js";

vi.mock("zmp-sdk-modern/apis", () => ({
  getUserInfo: vi.fn(),
  getAccessToken: vi.fn(),
  getLocation: vi.fn(),
  getPhoneNumber: vi.fn(),
  getSetting: vi.fn(),
  openPermissionSetting: vi.fn(),
}));

describe("Zalo customer permissions", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "ZaloJavaScriptInterface");
  });

  it("requests profile access when the app starts", async () => {
    vi.mocked(getUserInfo).mockResolvedValue({ userInfo: { id: "zalo-1" } } as never);

    await requestZaloUserInfo();

    expect(getUserInfo).toHaveBeenCalledWith({ autoRequestPermission: true });
  });

  it("keeps the customer signed out when profile permission is rejected", async () => {
    vi.mocked(getUserInfo).mockRejectedValue({ code: -2000, message: "Unknown error" } as never);

    await expect(requestZaloUserInfo()).rejects.toThrow("Bạn chưa cấp quyền hồ sơ Zalo");
  });

  it("denies the customer session when phone access is revoked", async () => {
    Reflect.set(window, "ZaloJavaScriptInterface", {});
    vi.mocked(getSetting).mockResolvedValue({
      authSetting: { "scope.userInfo": true, "scope.userPhonenumber": false },
    } as never);

    await expect(getZaloLoginPermission()).resolves.toBe("denied");
  });

  it("uses a backend TEST phone token outside the Zalo bridge", async () => {
    await expect(requestZaloPhoneToken()).resolves.toEqual({
      code: "mock-phone:0900000000",
      accessToken: "mock:zalo-local:Khách hàng",
    });
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(getPhoneNumber).not.toHaveBeenCalled();
  });

  it("does not submit a phone token when Zalo does not issue an access token", async () => {
    Reflect.set(window, "ZaloJavaScriptInterface", {});
    vi.mocked(getAccessToken).mockResolvedValue("");

    await expect(requestZaloPhoneToken()).rejects.toThrow(
      "Không thể lấy quyền tài khoản Zalo. Hãy mở lại Mini App và cấp quyền hồ sơ.",
    );
    expect(getPhoneNumber).not.toHaveBeenCalled();
  });

  it("sends Zalo's one-time location token to backend instead of exposing coordinates", async () => {
    Reflect.set(window, "ZaloJavaScriptInterface", {});
    vi.mocked(getLocation).mockResolvedValue({ token: "one-time-location-token" } as never);
    vi.mocked(getAccessToken).mockResolvedValue("zalo-access-token");

    await expect(requestZaloLocation()).resolves.toEqual({
      locationToken: "one-time-location-token",
      accessToken: "zalo-access-token",
    });
  });

  it("detects a previous location denial and opens Zalo's native permission settings", async () => {
    Reflect.set(window, "ZaloJavaScriptInterface", {});
    vi.mocked(getSetting).mockResolvedValue({ authSetting: { "scope.userLocation": false } } as never);
    vi.mocked(openPermissionSetting).mockResolvedValue(undefined as never);

    await expect(getZaloLocationPermission()).resolves.toBe("denied");
    expect(isZaloLocationDenied({ code: -2002, message: "The user rejected!" })).toBe(true);
    await openZaloLocationPermissionSettings();
    expect(openPermissionSetting).toHaveBeenCalledWith({});
  });
});

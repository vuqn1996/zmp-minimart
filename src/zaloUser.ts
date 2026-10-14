import { getAccessToken, getLocation, getPhoneNumber, getSetting, getUserInfo, openPermissionSetting } from "zmp-sdk-modern/apis";

export function isZaloLocationDenied(reason: unknown): boolean {
  if (!reason || typeof reason !== "object") return false;
  const code = "code" in reason ? Number(reason.code) : NaN;
  const message = "message" in reason ? String(reason.message).toLowerCase() : "";
  return code === -2002 || code === -201 || message.includes("rejected") || message.includes("denied");
}

export async function getZaloLocationPermission(): Promise<"granted" | "denied" | "unknown"> {
  if (import.meta.env.DEV && !Reflect.has(window, "ZaloJavaScriptInterface")) return "granted";
  try {
    const { authSetting } = await getSetting({});
    const granted = authSetting?.["scope.userLocation"];
    return granted === true ? "granted" : granted === false ? "denied" : "unknown";
  } catch {
    return "unknown";
  }
}

export async function getZaloLoginPermission(): Promise<"granted" | "denied" | "unknown"> {
  if (import.meta.env.DEV && !Reflect.has(window, "ZaloJavaScriptInterface")) return "granted";
  try {
    const { authSetting } = await getSetting({});
    return authSetting?.["scope.userInfo"] === true
      && authSetting?.["scope.userPhonenumber"] === true
      ? "granted"
      : "denied";
  } catch {
    return "unknown";
  }
}

export async function openZaloLocationPermissionSettings(): Promise<void> {
  if (import.meta.env.DEV && !Reflect.has(window, "ZaloJavaScriptInterface")) return;
  await openPermissionSetting({});
}

export async function requestZaloUserInfo(): Promise<void> {
  try {
    await getUserInfo({ autoRequestPermission: true });
  } catch {
    throw new Error("Bạn chưa cấp quyền hồ sơ Zalo. Bạn vẫn có thể tiếp tục mua sắm với tư cách khách.");
  }
}

export async function requestZaloPhoneToken(): Promise<{ code: string; accessToken: string }> {
  if (import.meta.env.DEV && !Reflect.has(window, "ZaloJavaScriptInterface")) {
    return { code: "mock-phone:0900000000", accessToken: "mock:zalo-local:Khách hàng" };
  }
  const accessToken = await getAccessToken({});
  if (!accessToken)
    throw new Error(
      "Không thể lấy quyền tài khoản Zalo. Hãy mở lại Mini App và cấp quyền hồ sơ.",
    );
  const { token } = await getPhoneNumber({});
  if (!token) throw new Error("Zalo không trả về mã xác minh số điện thoại");
  return { code: token, accessToken };
}

export async function requestZaloLocation(): Promise<{ locationToken: string; accessToken: string }> {
  if (import.meta.env.DEV && !Reflect.has(window, "ZaloJavaScriptInterface"))
    return { locationToken: "mock-location-token", accessToken: "mock:zalo-local:Khách hàng" };
  const [{ token }, accessToken] = await Promise.all([getLocation({}), getAccessToken({})]);
  if (!token || !accessToken) throw new Error("Bạn chưa chia sẻ vị trí. Bạn có thể nhập địa chỉ thủ công.");
  return { locationToken: token, accessToken };
}

import { useEffect, useState } from "react";
import { Button, Icon, Input, Sheet } from "zmp-ui";

import type { Address, CustomerApi, CustomerProfile } from "../api.js";
import { administrativeNameKey, canonicalProvinceName, canonicalWardName, loadVietnamAdministrativeDivisions, type AdministrativeProvince } from "../administrativeDivisions.js";
import { requestZaloLocation } from "../zaloUser.js";

export function AddressEditorSheet({ visible, address, profile, api, onClose, onAddresses, onSaved }: {
  visible: boolean;
  address: Address | null;
  profile: CustomerProfile | null;
  api: CustomerApi;
  onClose: () => void;
  onAddresses: (addresses: Address[]) => void;
  onSaved?: (message: string) => void;
}) {
  const [recipientName, setRecipientName] = useState("");
  const [phone, setPhone] = useState("");
  const [line1, setLine1] = useState("");
  const [ward, setWard] = useState("");
  const [province, setProvince] = useState("");
  const [divisions, setDivisions] = useState<AdministrativeProvince[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const wards = divisions.find((item) => item.name === province)?.wards ?? [];

  useEffect(() => {
    if (!visible) {
      setReady(false);
      return;
    }
    let active = true;
    setError(null);
    setRecipientName(address?.recipientName ?? profile?.displayName ?? "Khách hàng");
    setPhone(address?.phone ?? profile?.phone ?? "");
    setLine1(address?.line1 ?? "");
    setProvince(address?.province ?? "");
    setWard(address?.ward ?? "");
    setReady(!address);
    void loadVietnamAdministrativeDivisions().then((next) => {
      if (!active) return;
      setDivisions(next);
      if (address) {
        const addressParts = address.line1.split(",").map(administrativeNameKey);
        const canonicalProvince = canonicalProvinceName(address.province, next)
          || next.find((item) => addressParts.includes(administrativeNameKey(item.name)))?.name
          || "";
        const currentWards = next.find((item) => item.name === canonicalProvince)?.wards ?? [];
        const canonicalWard = canonicalWardName(address.ward ?? "", currentWards)
          || canonicalWardName(address.line1, currentWards);
        const administrativeParts = new Set([canonicalProvince, canonicalWard, "Việt Nam"].map(administrativeNameKey));
        setProvince(canonicalProvince);
        setWard(canonicalWard);
        setLine1(address.line1.split(",").map((part) => part.trim()).filter((part) => !administrativeParts.has(administrativeNameKey(part))).join(", ") || address.line1);
      }
      setReady(true);
    }).catch(() => {
      if (!active) return;
      setError("Không thể tải danh mục địa chỉ. Hãy thử mở lại.");
      setReady(true);
    });
    return () => { active = false; };
  }, [address, profile?.displayName, profile?.phone, visible]);

  async function fillFromLocation(): Promise<void> {
    setLocationBusy(true);
    setError(null);
    try {
      const location = await requestZaloLocation();
      const suggestion = await api.reverseGeocode(location);
      if (!suggestion.address) throw new Error("Hệ thống chưa trả về địa chỉ gợi ý");
      const next = divisions.length ? divisions : await loadVietnamAdministrativeDivisions();
      if (!divisions.length) setDivisions(next);
      const province = canonicalProvinceName(suggestion.province ?? "", next);
      const provinceWards = next.find((item) => item.name === province)?.wards ?? [];
      const ward = canonicalWardName(suggestion.ward ?? "", provinceWards)
        || canonicalWardName(suggestion.address, provinceWards);
      const administrativeParts = new Set([province, ward, "Việt Nam"].map(administrativeNameKey));
      setLine1(suggestion.address.split(",").map((part) => part.trim()).filter((part) => !administrativeParts.has(administrativeNameKey(part))).join(", ") || suggestion.address);
      setProvince(province);
      setWard(ward);
      if (!province || !ward) setError("Chưa xác định được tỉnh hoặc xã/phường. Vui lòng chọn trước khi lưu.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể lấy vị trí. Bạn có thể nhập địa chỉ thủ công.");
    } finally {
      setLocationBusy(false);
    }
  }

  async function save(): Promise<void> {
    if (saving) return;
    const data = { recipientName: recipientName.trim(), phone: phone.trim(), line1: line1.trim(), ward, province };
    if (!data.recipientName || !/^0\d{9,10}$/.test(data.phone) || !data.line1 || !data.ward || !data.province) {
      setError("Vui lòng điền người nhận, số điện thoại hợp lệ và địa chỉ đầy đủ trước khi lưu.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (address) await api.updateAddress(address.id, data);
      else await api.createAddress({ ...data, isDefault: true });
      const result = await api.addresses();
      if (!result.addresses.some((item) => item.recipientName === data.recipientName
        && item.phone === data.phone && item.line1 === data.line1
        && item.ward === data.ward && item.province === data.province)) {
        throw new Error("Chưa xác nhận được địa chỉ đã lưu. Vui lòng thử lại.");
      }
      onAddresses(result.addresses);
      onSaved?.(address ? "Đã cập nhật địa chỉ" : "Đã thêm địa chỉ");
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể lưu địa chỉ");
    } finally {
      setSaving(false);
    }
  }

  return <Sheet visible={visible && ready} title={address ? "Sửa địa chỉ" : "Thêm địa chỉ giao hàng"} onClose={onClose} height="85vh" className="address-editor-sheet">
    {visible && ready && <form className="address-editor" noValidate onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <h3 className="visually-hidden">{address ? "Sửa địa chỉ" : "Thêm địa chỉ giao hàng"}</h3>
      <div className="address-editor-fields">
        <p className="address-editor-intro">Điền thông tin nhận hàng để cửa hàng giao đúng nơi cho bạn.</p>
        <section className="address-details-card" aria-labelledby="address-details-heading">
          <h4 id="address-details-heading">Thông tin nhận hàng</h4>
          <div className="address-editor-row"><Input label="Người nhận" aria-label="Người nhận" value={recipientName} onChange={(event) => setRecipientName(event.target.value)} /></div>
          <div className="address-editor-row"><Input label="Số điện thoại nhận hàng" aria-label="Số điện thoại nhận hàng" value={phone} onChange={(event) => setPhone(event.target.value)} /></div>
          <label className="address-editor-row address-field">Tỉnh / thành
            <select className="address-select" aria-label="Tỉnh / thành" required value={province} onChange={(event) => { setProvince(event.target.value); setWard(""); }}>
              <option value="">Chọn tỉnh / thành</option>
              {divisions.map((item) => <option key={item.code} value={item.name}>{item.name}</option>)}
            </select>
          </label>
          <label className="address-editor-row address-field">Xã / phường / đặc khu
            <select className="address-select" aria-label="Xã / phường / đặc khu" required disabled={!province} value={ward} onChange={(event) => setWard(event.target.value)}>
              <option value="">{province ? "Chọn xã / phường / đặc khu" : "Chọn tỉnh / thành trước"}</option>
              {wards.map((item) => <option key={item.code} value={item.name}>{item.name}</option>)}
            </select>
          </label>
          <div className="address-editor-row"><Input label="Số nhà, đường" aria-label="Số nhà, đường" value={line1} onChange={(event) => setLine1(event.target.value)} placeholder="Số nhà, tên đường, thôn / xóm" /></div>
        </section>
        <section className="address-location-hint" aria-label="Gợi ý vị trí hiện tại">
          <div><strong>Dùng vị trí hiện tại</strong><p>Nhận gợi ý địa chỉ rồi chỉnh sửa trước khi lưu.</p></div>
          <Button size="small" htmlType="button" aria-label="Dùng vị trí hiện tại" loading={locationBusy} prefixIcon={<Icon icon="zi-location" />} onClick={() => void fillFromLocation()}>Lấy vị trí</Button>
        </section>
      </div>
      <div className="address-editor-actions">
        {error && <p className="address-editor-error" role="alert">{error}</p>}
        <Button size="large" fullWidth htmlType="submit" loading={saving} prefixIcon={<Icon icon="zi-location" />}>{address ? "Lưu địa chỉ" : "Hoàn thành"}</Button>
        <Button fullWidth variant="tertiary" htmlType="button" onClick={onClose}>Hủy</Button>
      </div>
    </form>}
  </Sheet>;
}

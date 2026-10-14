import { useEffect, useState, type FormEvent } from "react";
import { Button } from "zmp-ui";

import type { InvoiceRequest } from "../api.js";

type InvoiceFields = {
  legalName: string;
  fullName: string;
  taxCode: string;
  personalId: string;
  address: string;
  email: string;
};

function fieldsFrom(value: InvoiceRequest | null | undefined): InvoiceFields {
  return {
    legalName: value?.kind === "BUSINESS" ? value.legalName : "",
    fullName: value?.kind === "INDIVIDUAL" ? value.fullName : "",
    taxCode: value?.taxCode ?? "",
    personalId: value?.kind === "INDIVIDUAL" ? value.personalId ?? "" : "",
    address: value?.kind === "BUSINESS" ? value.registeredAddress : value?.address ?? "",
    email: value?.email ?? "",
  };
}

export function InvoiceProfileEditor({
  value,
  submitLabel,
  onSave,
}: {
  value?: InvoiceRequest | null | undefined;
  submitLabel: string;
  onSave: (value: InvoiceRequest) => Promise<void> | void;
}) {
  const [kind, setKind] = useState<InvoiceRequest["kind"]>(value?.kind ?? "BUSINESS");
  const [fields, setFields] = useState(() => fieldsFrom(value));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setKind(value?.kind ?? "BUSINESS");
    setFields(fieldsFrom(value));
  }, [value]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const email = fields.email.trim();
    if (!fields.address.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Vui lòng nhập địa chỉ và email hợp lệ");
      return;
    }
    const invoice = kind === "BUSINESS"
      ? fields.legalName.trim() && fields.taxCode.trim()
        ? { kind, legalName: fields.legalName.trim(), taxCode: fields.taxCode.trim(), registeredAddress: fields.address.trim(), email }
        : null
      : fields.fullName.trim()
        ? { kind, fullName: fields.fullName.trim(), address: fields.address.trim(), email, ...(fields.taxCode.trim() ? { taxCode: fields.taxCode.trim() } : {}), ...(fields.personalId.trim() ? { personalId: fields.personalId.trim() } : {}) }
        : null;
    if (!invoice) {
      setError(kind === "BUSINESS" ? "Vui lòng nhập tên và mã số thuế" : "Vui lòng nhập họ tên người mua");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(invoice);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể lưu yêu cầu hóa đơn điện tử");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="invoice-sheet" noValidate onSubmit={(event) => void submit(event)}>
      <fieldset className="invoice-kind"><legend>Đối tượng xuất hóa đơn</legend><button type="button" className={kind === "INDIVIDUAL" ? "selected" : ""} onClick={() => setKind("INDIVIDUAL")}>Cá nhân</button><button type="button" className={kind === "BUSINESS" ? "selected" : ""} onClick={() => setKind("BUSINESS")}>Hộ kinh doanh / Công ty</button></fieldset>
      {kind === "BUSINESS" ? <><label>Tên hộ kinh doanh / công ty<input required value={fields.legalName} onChange={(event) => setFields({ ...fields, legalName: event.target.value })} /></label><label>Mã số thuế<input required value={fields.taxCode} onChange={(event) => setFields({ ...fields, taxCode: event.target.value })} /></label></> : <><label>Họ tên người mua<input required value={fields.fullName} onChange={(event) => setFields({ ...fields, fullName: event.target.value })} /></label><label>Mã số thuế (không bắt buộc)<input value={fields.taxCode} onChange={(event) => setFields({ ...fields, taxCode: event.target.value })} /></label><label>Số định danh (không bắt buộc)<input inputMode="numeric" value={fields.personalId} onChange={(event) => setFields({ ...fields, personalId: event.target.value })} /></label></>}
      <label>{kind === "BUSINESS" ? "Địa chỉ đăng ký" : "Địa chỉ"}<input required value={fields.address} onChange={(event) => setFields({ ...fields, address: event.target.value })} /></label>
      <label>Email nhận hóa đơn<input required type="email" value={fields.email} onChange={(event) => setFields({ ...fields, email: event.target.value })} /></label>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <p className="invoice-note">Cửa hàng ghi nhận yêu cầu để nhân viên xử lý, không tự động phát hành hóa đơn điện tử.</p>
      <Button fullWidth htmlType="submit" loading={saving}>{submitLabel}</Button>
    </form>
  );
}

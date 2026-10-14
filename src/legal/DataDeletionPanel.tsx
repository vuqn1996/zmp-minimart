import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "zmp-ui";
import { DATA_DELETION_PENDING_KEY, type CustomerApi, type DataDeletionRequest } from "../api.js";
import { createClientId } from "../clientId.js";
import { miniAppStorage } from "../storage.js";
import { SHOP } from "../config.js";

export function DataDeletionPanel({ api, authenticated, onCompleted, onSessionLost }: { api: CustomerApi; authenticated: boolean; onCompleted: () => void; onSessionLost: () => void }) {
  const [request, setRequest] = useState<DataDeletionRequest | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const [requestId, setRequestId] = useState(() => miniAppStorage.getItem(DATA_DELETION_PENDING_KEY));
  const completedRef = useRef(onCompleted);
  const sessionLostRef = useRef(onSessionLost);
  completedRef.current = onCompleted;
  sessionLostRef.current = onSessionLost;
  const accept = useCallback((next: DataDeletionRequest | null) => {
    setRequest((previous) => next ?? previous);
    if (next && next.status !== "PENDING_REVIEW") completedRef.current();
  }, []);
  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    void api.dataDeletionRequest().then(({ request: result }) => { if (active) accept(result); }).catch((reason: unknown) => {
      if (!active) return;
      setError("Chưa đọc được trạng thái. Bạn có thể thử lại hoặc liên hệ cửa hàng.");
      if (reason instanceof Error && "status" in reason && reason.status === 401) sessionLostRef.current();
    });
    return () => { active = false; };
  }, [api, authenticated, accept]);
  const submit = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(null);
    const id = requestId ?? createClientId();
    setRequestId(id); miniAppStorage.setItem(DATA_DELETION_PENDING_KEY, id);
    try {
      accept((await api.requestDataDeletion(id)).request);
      setConfirming(false);
    } catch (reason) {
      setError("Chưa nhận được xác nhận từ hệ thống. Chưa thể kết luận dữ liệu đã được xóa. Thử lại dùng cùng mã yêu cầu.");
      if (reason instanceof Error && "status" in reason && reason.status === 401) sessionLostRef.current();
    } finally { inFlight.current = false; setBusy(false); }
  };
  return <section className="data-deletion-panel" aria-label="Yêu cầu xóa dữ liệu">
    <h3>Yêu cầu xóa dữ liệu</h3>
    <p>Cửa hàng tiếp nhận tại một đầu mối chung. Yêu cầu có thể cần rà soát đơn hàng, chứng từ và dữ liệu cần lưu giữ. Tài khoản còn hoạt động khi yêu cầu đang chờ xử lý.</p>
    {request && <p role="status">Mã yêu cầu: {request.id}. {request.status === "PENDING_REVIEW" ? "Đang chờ rà soát" : "Đã xử lý"}. {request.retainedSummary}</p>}
    {requestId && <p>Mã đối chiếu: {requestId}. Liên hệ {SHOP.hotline} hoặc {SHOP.email} khi cần kiểm tra.</p>}
    {error && <p role="alert">{error}</p>}
    {!authenticated ? <p>Đăng nhập chủ động trong Cá nhân để gửi yêu cầu. Nếu phiên đã bị vô hiệu hóa, dùng mã đối chiếu để xác nhận kết quả với cửa hàng.</p> : request?.status !== "PENDING_REVIEW" && <>
      {confirming ? <><p>Sau khi hoàn tất, thông tin tài khoản sẽ bị xóa và mọi phiên đăng nhập bị vô hiệu hóa. Dữ liệu giao dịch chỉ được giữ khi có căn cứ đã xác nhận.</p><Button fullWidth loading={busy} disabled={busy} onClick={() => void submit()}>Xác nhận gửi yêu cầu</Button><Button fullWidth variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>Hủy</Button></> : <Button fullWidth variant="secondary" onClick={() => setConfirming(true)}>{requestId ? "Thử lại yêu cầu xóa dữ liệu" : "Yêu cầu xóa dữ liệu"}</Button>}
    </>}
  </section>;
}

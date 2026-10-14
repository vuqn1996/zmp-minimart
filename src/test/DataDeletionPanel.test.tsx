import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App as ZaUIApp } from "zmp-ui";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CustomerApi, DataDeletionRequest } from "../api.js";
import { DataDeletionPanel } from "../legal/DataDeletionPanel.js";
import { miniAppStorage } from "../storage.js";

const pending = (id: string): DataDeletionRequest => ({ id, status: "PENDING_REVIEW", requestedAt: new Date().toISOString(), completedAt: null, retainedSummary: null });
function mount(requestDataDeletion: CustomerApi["requestDataDeletion"]) {
  const completed = vi.fn();
  const api = { dataDeletionRequest: async () => ({ request: null }), requestDataDeletion } as unknown as CustomerApi;
  render(<ZaUIApp theme="light"><DataDeletionPanel api={api} authenticated onCompleted={completed} onSessionLost={() => undefined} /></ZaUIApp>);
  return completed;
}
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
describe("privacy deletion request UI", () => {
  it("does not submit twice while waiting for backend", async () => {
    let resolve!: (value: { request: DataDeletionRequest }) => void;
    const submit = vi.fn(() => new Promise<{ request: DataDeletionRequest }>((done) => { resolve = done; }));
    const completed = mount(submit);
    fireEvent.click(screen.getByRole("button", { name: "Yêu cầu xóa dữ liệu" }));
    const confirm = screen.getByRole("button", { name: "Xác nhận gửi yêu cầu" });
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(submit).toHaveBeenCalledTimes(1);
    resolve({ request: pending("request-1") });
    expect(await screen.findByText(/Đang chờ rà soát/)).toBeInTheDocument();
    expect(completed).not.toHaveBeenCalled();
  });
  it("preserves the request ID after an ambiguous response and reuses it", async () => {
    const submit = vi.fn().mockRejectedValueOnce(new Error("connection lost")).mockImplementation(async (id: string) => ({ request: pending(id) }));
    const completed = mount(submit);
    fireEvent.click(screen.getByRole("button", { name: "Yêu cầu xóa dữ liệu" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận gửi yêu cầu" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Chưa thể kết luận dữ liệu đã được xóa");
    const firstId = submit.mock.calls[0]![0];
    expect(miniAppStorage.getItem("shop_data_deletion_pending_request")).toBe(firstId);
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận gửi yêu cầu" }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(submit.mock.calls[1]![0]).toBe(firstId);
    expect(completed).not.toHaveBeenCalled();
  });
});

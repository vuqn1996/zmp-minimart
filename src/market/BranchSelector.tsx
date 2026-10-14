import { useEffect, useState } from "react";
import { Button, Icon, Sheet } from "zmp-ui";

import type { Branch } from "../api.js";
import { usePresence } from "../usePresence.js";

export function BranchSelector({
  branches,
  selectedBranchId,
  visible,
  required = false,
  onSelect,
  onClose,
}: {
  branches: Branch[];
  selectedBranchId?: string | undefined;
  visible: boolean;
  required?: boolean;
  onSelect: (branch: Branch) => void;
  onClose: () => void;
}) {
  const [listOpen, setListOpen] = useState(false);
  const [draftBranchId, setDraftBranchId] = useState<string | null>(null);
  const listPresence = usePresence(visible && listOpen, 180);
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId);
  const draftBranch = branches.find((branch) => branch.id === draftBranchId);

  useEffect(() => {
    if (!visible) {
      setListOpen(false);
      setDraftBranchId(null);
    }
  }, [visible]);

  const close = () => {
    setListOpen(false);
    setDraftBranchId(null);
    onClose();
  };

  return (
    <>
      <Sheet
        visible={visible && (!listOpen || !listPresence.active)}
        title="Chọn chi nhánh giao hàng"
        maskClosable={!required}
        swipeToClose={!required}
        onClose={close}
        className="branch-sheet"
        autoHeight
      >
        <div className="branch-sheet-content">
          <p className="branch-sheet-help">Chọn chi nhánh gần bạn để được phục vụ tốt hơn. Tồn kho và giỏ hàng được tách riêng theo chi nhánh.</p>
          <span className="branch-dropdown-label">Chi nhánh giao hàng</span>
          <button
            className="branch-picker-trigger"
            type="button"
            onClick={() => {
              setDraftBranchId(selectedBranchId ?? null);
              setListOpen(true);
            }}
          >
            <span>{selectedBranch?.name ?? "Chọn chi nhánh"}</span>
            <Icon icon="zi-chevron-right" aria-hidden="true" />
          </button>
          {selectedBranch && <p className="branch-dropdown-address">{selectedBranch.address?.trim() || "Địa chỉ chi nhánh đang cập nhật"}</p>}
          <Button fullWidth variant="secondary" onClick={close}>Huỷ</Button>
        </div>
      </Sheet>

      {listPresence.mounted && (
        <section className={`branch-list-screen${listPresence.active && visible && listOpen ? " motion-visible" : ""}`} role="dialog" aria-modal="true" aria-hidden={!visible || !listOpen} aria-labelledby="branch-list-title" ref={(node) => { if (node) node.inert = !visible || !listOpen; }}>
          <header className="branch-list-header">
            <h1 id="branch-list-title">Danh sách chi nhánh</h1>
          </header>
          <div className="branch-list-body">
            <p className="branch-sheet-help">Chọn chi nhánh gần bạn để được phục vụ tốt hơn. Tồn kho và giỏ hàng được tách riêng theo chi nhánh.</p>
            <div className="branch-list-options" aria-label="Danh sách chi nhánh">
              {branches.map((branch) => (
                <button
                  className={`branch-list-option${draftBranchId === branch.id ? " selected" : ""}`}
                  key={branch.id}
                  type="button"
                  aria-pressed={draftBranchId === branch.id}
                  onClick={() => setDraftBranchId(branch.id)}
                >
                  <span className="branch-list-option-copy">
                    <strong>{branch.name}</strong>
                    <small>{branch.address?.trim() || "Địa chỉ chi nhánh đang cập nhật"}</small>
                  </span>
                  <span className="branch-list-check" aria-hidden="true">
                    {draftBranchId === branch.id && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m4 12 5 5L20 6" /></svg>}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <footer className="branch-list-actions">
            <Button fullWidth variant="secondary" onClick={close}>Huỷ</Button>
            <Button fullWidth disabled={!draftBranch} onClick={() => {
              if (!draftBranch) return;
              setListOpen(false);
              if (draftBranch.id === selectedBranchId) onClose();
              else onSelect(draftBranch);
            }}>Xác nhận</Button>
          </footer>
        </section>
      )}
    </>
  );
}

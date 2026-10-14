import { beforeEach, describe, expect, it } from "vitest";

import { forgetBranch, readRememberedBranch, rememberBranch, resolveSelectedBranch } from "../branch.js";

const branches = [
  { id: "11111111-1111-4111-8111-111111111111", code: "Q1", name: "Cửa hàng Quận 1" },
  { id: "22222222-2222-4222-8222-222222222222", code: "TD", name: "Cửa hàng Thủ Đức" },
];

describe("Mini App branch selection", () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

  it("requires an explicit choice when there is no remembered branch", () => {
    expect(resolveSelectedBranch(branches, null)).toBeUndefined();
    expect(resolveSelectedBranch(branches, "missing")).toBeUndefined();
  });

  it("restores a guest branch across app sessions", () => {
    rememberBranch(branches[1]!);
    expect(resolveSelectedBranch(branches, sessionStorage.getItem("shop_selected_branch_v1"))).toEqual(branches[1]);
    sessionStorage.clear();
    expect(readRememberedBranch()).toBe(branches[1]!.id);
    forgetBranch();
    expect(readRememberedBranch()).toBeNull();
  });

  it("persists the last branch for a returning customer", () => {
    rememberBranch(branches[0]!, "customer-1");
    rememberBranch(branches[1]!);
    sessionStorage.clear();
    expect(readRememberedBranch("customer-1")).toBe(branches[0]!.id);
    expect(readRememberedBranch()).toBe(branches[1]!.id);
    expect(readRememberedBranch("customer-2")).toBe(branches[1]!.id);
  });
});

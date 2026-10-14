import type { CatalogProduct } from "../api.js";

export function compareCatalogProducts(left: CatalogProduct, right: CatalogProduct): number {
  const leftBrand = left.brandSortName?.trim() || null;
  const rightBrand = right.brandSortName?.trim() || null;
  if (Boolean(leftBrand) !== Boolean(rightBrand)) return leftBrand ? -1 : 1;
  return (leftBrand ? leftBrand.localeCompare(rightBrand!, "vi", { sensitivity: "base" }) : 0)
    || left.name.localeCompare(right.name, "vi", { sensitivity: "base" })
    || left.id.localeCompare(right.id, "vi", { numeric: true });
}

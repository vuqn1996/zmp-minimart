import { describe, expect, it } from "vitest";

import type { CatalogProduct } from "../api.js";
import { compareCatalogProducts } from "../market/catalogSort.js";

const product = (id: string, name: string, brandSortName: string | null): CatalogProduct => ({
  id, name, brandSortName, slug: id, categoryName: "Khác", recommended: false,
  imageUrl: null, minimumPriceVnd: "1000", skus: [],
});

describe("compareCatalogProducts", () => {
  it("sorts POS brands first, then unbranded products by name", () => {
    const products = [
      product("6", "Lay’s snack", null),
      product("3", "202687- Sữa Chống Nắng Cực Mạnh", "Sunplay"),
      product("2", "Z-Milo ít đường", "Milo"),
      product("1", "A-Milo có đường", "Milo"),
      product("5", "7up Lon 320", null),
      product("4", "Snack khoai tây Lay's", "Lay's"),
    ];

    expect(products.sort(compareCatalogProducts).map((item) => item.name)).toEqual([
      "Snack khoai tây Lay's",
      "A-Milo có đường",
      "Z-Milo ít đường",
      "202687- Sữa Chống Nắng Cực Mạnh",
      "7up Lon 320",
      "Lay’s snack",
    ]);
  });
});

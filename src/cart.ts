export function normalizeCartQuantity(quantity: number): number {
  return Math.max(0, Math.floor(quantity));
}

export function normalizeRestoredCart(
  lines: Array<{ skuId: string; quantity: number }>,
  availableBySku: ReadonlyMap<string, number>,
): { cart: Record<string, number>; changed: boolean } {
  const cart: Record<string, number> = {};
  let changed = false;
  for (const line of lines) {
    const available = availableBySku.get(line.skuId) ?? 0;
    const quantity = normalizeCartQuantity(Math.max(0, Math.min(line.quantity, available)));
    if (quantity > 0) cart[line.skuId] = quantity;
    if (quantity !== line.quantity) changed = true;
  }
  return { cart, changed };
}

export const SWIPE_BACK_EDGE_PX = 32;
export const SWIPE_BACK_MIN_DISTANCE_PX = 72;

export function isBackSwipe(initialX: number, absX: number, absY: number): boolean {
  return initialX <= SWIPE_BACK_EDGE_PX && absX >= SWIPE_BACK_MIN_DISTANCE_PX && absX > absY;
}

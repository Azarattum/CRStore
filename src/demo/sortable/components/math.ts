/**
 * Returns a value within min & max boundary
 */
export function minmax(value: number, min: number, max: number) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Checks whether the value is a finite number,
 *  otherwise returns the fallback value
 */
export function finitify(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

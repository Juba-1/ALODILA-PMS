/**
 * Locale-aware natural comparator for strings that contain embedded numbers.
 *
 * Ensures ordering like: "Unit 1" < "Unit 2" < "Unit 9" < "Unit 10" < "Unit 20"
 * instead of the lexicographic "Unit 1" < "Unit 10" < "Unit 11" < "Unit 2".
 *
 * Uses Intl-backed `localeCompare` with `{ numeric: true, sensitivity: 'base' }`
 * so it works seamlessly with Arabic, Latin, and mixed text.
 */
export function naturalCompare(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

/**
 * Factory that returns a comparator reading a named field (or accessor fn)
 * from each item. Handy for `array.sort(byNatural('unit_name'))`.
 */
export function byNatural(keyOrAccessor) {
  const read =
    typeof keyOrAccessor === 'function'
      ? keyOrAccessor
      : (item) => (item == null ? '' : item[keyOrAccessor])
  return (a, b) => naturalCompare(read(a), read(b))
}

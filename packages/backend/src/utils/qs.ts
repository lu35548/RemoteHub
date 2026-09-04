/** express query 参数归一化：string 直取，数组取首项，其余回退默认。 */
export function qsParam(val: unknown, fallback: string): string {
  if (typeof val === 'string') return val;
  if (Array.isArray(val) && typeof val[0] === 'string') return val[0];
  return fallback;
}

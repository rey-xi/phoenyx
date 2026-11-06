export function isProductionRuntime(): boolean {
  return Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
}

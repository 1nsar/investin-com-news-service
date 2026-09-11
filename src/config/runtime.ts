/** Vercel instances may stop between requests, so they must only enqueue work. */
export function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1";
}

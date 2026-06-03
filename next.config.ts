import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// Supabase REST/Storage origin + Realtime websocket origin
const supabaseHost = supabaseUrl.replace(/^https?:\/\//, "");
const connectSrc = [
  "'self'",
  supabaseUrl, // https://xxx.supabase.co (REST/Storage)
  supabaseHost ? `wss://${supabaseHost}` : "", // Realtime websocket
]
  .filter(Boolean)
  .join(" ");

const csp = [
  "default-src 'self'",
  // Next.js App Router injects inline bootstrap scripts without nonces; keep
  // 'unsafe-inline'/'unsafe-eval' so the runtime works (pragmatic choice).
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  // Tailwind/Next inject inline styles.
  "style-src 'self' 'unsafe-inline'",
  // Signed-URL images from Supabase Storage + data/blob previews.
  `img-src 'self' data: blob: ${supabaseUrl}`,
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  /* config options here */
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

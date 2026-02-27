import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse v2 uses pdfjs-dist v4 which accesses DOMMatrix at module eval time.
  // Marking it as external prevents Turbopack from bundling it inline, so the
  // lazy require() inside our API route stays truly lazy.
  serverExternalPackages: ['pdf-parse'],
};

export default nextConfig;

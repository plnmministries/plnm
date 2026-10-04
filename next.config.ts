import type { NextConfig } from "next";

// This app is the PUBLIC website. Content and uploaded images live in the admin app (plnmadmin).
const admin = (process.env.CONTENT_API_URL || "").replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    // images uploaded in the editor are stored by the admin app
    return admin ? [{ source: "/media/:path*", destination: `${admin}/media/:path*` }] : [];
  },
};

export default nextConfig;

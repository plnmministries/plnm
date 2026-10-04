import type { NextConfig } from "next";

// This app is the PUBLIC website. Content and uploaded images come from the shared database
// (DATABASE_URL) or, failing that, from the admin app (CONTENT_API_URL). See src/lib/content.ts.
const nextConfig: NextConfig = {};

export default nextConfig;

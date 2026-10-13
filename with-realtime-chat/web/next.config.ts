import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The function and web are separate npm projects, each with a lockfile; pin the
  // Turbopack root to this app so Next doesn't infer the parent directory.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;

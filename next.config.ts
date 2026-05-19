import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default process.env.ANALYZE === "true"
  ? require("@next/bundle-analyzer")({ enabled: true })(nextConfig)
  : nextConfig;

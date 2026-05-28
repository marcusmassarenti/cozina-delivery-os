import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // XLSX do iFood pode chegar a vários MB (Financeiro tem 11k linhas).
      bodySizeLimit: "30mb",
    },
  },
};

export default nextConfig;

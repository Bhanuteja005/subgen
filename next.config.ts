import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pub-cde29cc006ad49e9a43de447ef681306.r2.dev",
      },
    ],
  },
  // Prevent Next.js from bundling native binaries — they must resolve at runtime
  serverExternalPackages: ["fluent-ffmpeg", "ffmpeg-static", "@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"],
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
};

export default nextConfig;

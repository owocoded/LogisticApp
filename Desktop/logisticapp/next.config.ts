import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },

  images: {
  remotePatterns: [
    {
      protocol: "https",
      hostname: "gabaxjiblwzhhleubbqm.supabase.co",
      pathname: "/storage/v1/object/sign/delivery-product-images/**",
    },
  ],
}

};
export default nextConfig;

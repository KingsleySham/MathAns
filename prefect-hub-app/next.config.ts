import type { NextConfig } from "next";

/**
 * Prefect Hub ships as a static export inside the main MathAns site, served
 * at https://www.mathans.app/prefect-hub. `npm run export:site` writes the
 * build into ../prefect-hub/, which is what Vercel serves.
 *
 * The one server-side piece — the HKO proxy — lives at the site root as
 * /api/weather (see api/weather.js), so it is NOT under this base path.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  basePath: "/prefect-hub",
  trailingSlash: true,
};

export default nextConfig;

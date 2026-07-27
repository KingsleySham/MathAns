import type { WeatherResponse } from "@/lib/weather/types";

/**
 * The HKO proxy lives at the site root, not under the app's base path —
 * the app is a static export inside www.mathans.app, the function is not.
 */
export const WEATHER_URL = "/api/weather";

export const weatherFetcher = async (url: string): Promise<WeatherResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`weather ${res.status}`);
  return res.json();
};

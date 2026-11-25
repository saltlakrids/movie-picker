// Streaming services available in Denmark, matched against TMDB's
// watch-provider list for region DK by name (provider ids change over time,
// e.g. HBO Max -> Max -> HBO Max, so we resolve them at runtime).
export const PROVIDERS = [
  { key: 'netflix', name: 'Netflix', color: '#e50914', match: /^netflix$/i, fallbackId: 8, default: true },
  { key: 'disney', name: 'Disney+', color: '#113ccf', match: /^disney\s*(plus|\+)$/i, fallbackId: 337, default: true },
  { key: 'hbo', name: 'HBO Max', color: '#7b2ff7', match: /^(hbo\s*)?max$/i, fallbackId: 1899, default: true },
  { key: 'dr', name: 'DR TV', color: '#c8102e', match: /^dr(\s*tv)?$/i, default: true },
  { key: 'tv2', name: 'TV 2 Play', color: '#0a5cff', match: /^tv\s*2(\s*play)?$/i, default: true },
  { key: 'viaplay', name: 'Viaplay', color: '#1f1f3a', match: /^viaplay$/i, fallbackId: 76 },
  { key: 'prime', name: 'Prime Video', color: '#00a8e1', match: /^amazon prime video$/i, fallbackId: 119 },
  { key: 'skyshowtime', name: 'SkyShowtime', color: '#0b2a4a', match: /^skyshowtime$/i, fallbackId: 1773 },
];

export const PROVIDER_KEYS = PROVIDERS.map((p) => p.key);
export const DEFAULT_PROVIDERS = PROVIDERS.filter((p) => p.default).map((p) => p.key);

export function publicProviders() {
  return PROVIDERS.map(({ key, name, color, default: d }) => ({ key, name, color, default: !!d }));
}

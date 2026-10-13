// Approximate center coordinates [longitude, latitude] for each of Tunisia's
// 24 governorates. Used to place a coarse location marker when a company has
// no precise geocoded address on file.
export const GOVERNORATE_COORDINATES: Record<string, [number, number]> = {
  Tunis: [10.1815, 36.8065],
  Ariana: [10.1956, 36.8625],
  'Ben Arous': [10.2189, 36.7533],
  Manouba: [10.0972, 36.8081],
  Nabeul: [10.7376, 36.4561],
  Zaghouan: [10.1425, 36.4028],
  Bizerte: [9.8739, 37.2744],
  Béja: [9.1817, 36.7256],
  Jendouba: [8.7803, 36.5011],
  'Le Kef': [8.7148, 36.1826],
  Kef: [8.7148, 36.1826],
  Siliana: [9.3708, 36.0844],
  Kairouan: [10.0963, 35.6781],
  Kasserine: [8.8365, 35.1676],
  'Sidi Bouzid': [9.4849, 35.0382],
  Sousse: [10.6084, 35.8256],
  Monastir: [10.8113, 35.7643],
  Mahdia: [11.0622, 35.5047],
  Sfax: [10.7603, 34.7406],
  Gafsa: [8.7842, 34.425],
  Tozeur: [8.1335, 33.9197],
  Kebili: [8.969, 33.7044],
  Gabès: [10.0982, 33.8815],
  Medenine: [10.5055, 33.3549],
  Tataouine: [10.4518, 32.9297],
};

export const TUNISIA_CENTER: [number, number] = [9.5375, 33.8869];

export function coordinatesForGovernorate(
  governorate: string | null | undefined,
): [number, number] | null {
  if (!governorate) return null;
  return GOVERNORATE_COORDINATES[governorate] ?? null;
}

// Haversine great-circle distance in kilometers between two [lng, lat] points.
export function distanceKm(a: [number, number], b: [number, number]) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

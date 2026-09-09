/**
 * Geocoding utility for converting address strings into latitude and longitude coordinates.
 */

export async function geocodeAddress(address) {
  if (!address || typeof address !== "string" || !address.trim()) {
    return null;
  }

  const query = address.trim();

  // 1. Try Google Maps Geocoding API if key is available
  const googleKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_GEOCODING_API_KEY;
  if (googleKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${googleKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        if (data.status === "OK" && data.results?.length) {
          const loc = data.results[0].geometry.location;
          return {
            latitude: Number(loc.lat),
            longitude: Number(loc.lng),
            formattedAddress: data.results[0].formatted_address || query,
          };
        }
      }
    } catch (e) {
      console.warn("[geocoding] Google geocoding error:", e.message);
    }
  }

  // 2. Fallback to OpenStreetMap Nominatim
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "AIRestaurantMultiBranch/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return {
          latitude: Number(data[0].lat),
          longitude: Number(data[0].lon),
          formattedAddress: data[0].display_name || query,
        };
      }
    }
  } catch (e) {
    console.warn("[geocoding] Nominatim geocoding error:", e.message);
  }

  return null;
}

/**
 * Calculate Haversine distance in kilometers between two lat/lon points.
 */
export function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const nLat1 = Number(lat1);
  const nLon1 = Number(lon1);
  const nLat2 = Number(lat2);
  const nLon2 = Number(lon2);

  if (!Number.isFinite(nLat1) || !Number.isFinite(nLon1) || !Number.isFinite(nLat2) || !Number.isFinite(nLon2)) {
    return Infinity;
  }

  const R = 6371; // Earth radius in km
  const dLat = ((nLat2 - nLat1) * Math.PI) / 180;
  const dLon = ((nLon2 - nLon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((nLat1 * Math.PI) / 180) * Math.cos((nLat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Number((R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))).toFixed(2));
}

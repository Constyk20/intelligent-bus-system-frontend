/**
 * Geo helpers shared by the Routes and Dashboard pages.
 *
 *  - geocodePlace(name)  -> { lat, lng, label } | null   (OpenStreetMap Nominatim)
 *  - getRoute(a, b)      -> { distanceKm, durationMin, path }   (OSRM driving route)
 *  - estimateRoute(a, b) -> distance + bus travel time between two place names
 *
 * Both services are free public endpoints with no API key. They are fine for
 * development and light use. For heavy production traffic use a paid geocoder /
 * routing provider (or self-host) and only change the two URLs and parsing below.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';
const CACHE_KEY = 'avgbus_geocode_v1';

// OSRM gives car travel time on a free-flowing road. A bus with stops, traffic
// and road conditions takes longer, so scale it up. Tune to match reality.
const BUS_TIME_FACTOR = 1.25;
// Round the estimate up to the nearest N minutes so it reads like a timetable.
const ROUND_TO_MINUTES = 5;

// Short names used at your terminals that a map search can't resolve on its own.
// Keys are lowercase.
export const PLACE_ALIASES = {
  absu: 'Abia State University, Uturu',
};

/* ------------------------------------------------------------------ */
/* Geocoding (name -> coordinates)                                     */
/* ------------------------------------------------------------------ */

const keyFor = (name) => String(name ?? '').trim().toLowerCase();

const loadStored = () => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
};
const stored = loadStored(); // key -> { lat, lng, label }
const saveStored = () => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(stored));
  } catch {
    /* storage unavailable: ignore */
  }
};

const inflight = new Map();

// Nominatim allows about one request per second, so queue network calls.
let chain = Promise.resolve();
let lastRequestAt = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const throttled = (task) => {
  const run = chain.then(async () => {
    const wait = Math.max(0, lastRequestAt + 1100 - Date.now());
    if (wait) await sleep(wait);
    lastRequestAt = Date.now();
    return task();
  });
  chain = run.catch(() => {});
  return run;
};

const searchNominatim = (query) =>
  throttled(async () => {
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: '1',
      countrycodes: 'ng',
    });
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Location search failed (${res.status})`);
    const rows = await res.json();
    if (!rows.length) return null;
    return {
      lat: Number(rows[0].lat),
      lng: Number(rows[0].lon),
      label: rows[0].display_name,
    };
  });

/** Resolve a place name to coordinates. Returns null when nothing is found. */
export function geocodePlace(name) {
  const key = keyFor(name);
  if (!key) return Promise.resolve(null);
  if (stored[key]) return Promise.resolve(stored[key]);
  if (inflight.has(key)) return inflight.get(key);

  const clean = String(name).trim();
  const queries = [];
  if (PLACE_ALIASES[key]) queries.push(`${PLACE_ALIASES[key]}, Nigeria`);
  queries.push(/nigeria/i.test(clean) ? clean : `${clean}, Nigeria`);

  const promise = (async () => {
    for (const query of queries) {
      const place = await searchNominatim(query);
      if (place) {
        stored[key] = place;
        saveStored();
        return place;
      }
    }
    return null;
  })().finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

/* ------------------------------------------------------------------ */
/* Routing (coordinates -> road distance, time, path)                  */
/* ------------------------------------------------------------------ */

/**
 * Driving route between two { lat, lng } points.
 * Pass { geometry: true } to also get the road path as [[lat, lng], ...].
 */
export async function getRoute(from, to, { geometry = false, signal } = {}) {
  const params = new URLSearchParams({
    overview: geometry ? 'full' : 'false',
    geometries: 'geojson',
  });
  const url = `${OSRM_URL}/${from.lng},${from.lat};${to.lng},${to.lat}?${params}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Routing failed (${res.status})`);

  const data = await res.json();
  const route = data?.routes?.[0];
  if (!route) throw new Error('No road route found between these places');

  return {
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
    path: geometry
      ? (route.geometry?.coordinates || []).map(([lng, lat]) => [lat, lng])
      : null,
  };
}

/* ------------------------------------------------------------------ */
/* Route estimate used by the "Add Route" form                         */
/* ------------------------------------------------------------------ */

export const formatDuration = (minutes) => {
  const total = Math.round(Number(minutes) || 0);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
};

/**
 * Distance and bus travel time between two place names.
 * Throws an Error with a user-friendly message if a place can't be found.
 */
export async function estimateRoute(originName, destinationName, { signal } = {}) {
  if (keyFor(originName) === keyFor(destinationName)) {
    throw new Error('Origin and destination must be different places.');
  }

  const from = await geocodePlace(originName);
  if (!from) {
    throw new Error(`Could not find "${originName}" on the map. Try a more specific name.`);
  }
  const to = await geocodePlace(destinationName);
  if (!to) {
    throw new Error(`Could not find "${destinationName}" on the map. Try a more specific name.`);
  }

  const route = await getRoute(from, to, { signal });
  const scaled = route.durationMin * BUS_TIME_FACTOR;
  const durationMinutes = Math.max(
    ROUND_TO_MINUTES,
    Math.ceil(scaled / ROUND_TO_MINUTES) * ROUND_TO_MINUTES
  );

  return {
    distanceKm: Math.round(route.distanceKm * 10) / 10,
    durationMinutes,
    from,
    to,
  };
}
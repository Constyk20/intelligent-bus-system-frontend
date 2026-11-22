import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { 
  TrendingUp, DollarSign, Users, 
  Ticket, Activity, Bus, AlertCircle 
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import api from '../services/api';
import { useWebSocket } from '../context/WebSocketContext';
import { geocodePlace, getRoute } from '../utils/geo';

/* ------------------------------------------------------------------ */
/* Map icons                                                           */
/* ------------------------------------------------------------------ */

const busIcon = new L.DivIcon({
  className: 'bg-transparent',
  html: `<div class="bg-brand-accent text-white p-2 rounded-full shadow-lg border-2 border-white flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>
         </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const pickupIcon = new L.DivIcon({
  className: 'bg-transparent',
  html: `<div style="width:16px;height:16px;border-radius:9999px;background:#22c55e;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const destinationIcon = new L.DivIcon({
  className: 'bg-transparent',
  html: `<div style="width:18px;height:18px;border-radius:4px;background:#ef4444;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

/* ------------------------------------------------------------------ */
/* Route helpers                                                       */
/* ------------------------------------------------------------------ */

// Each trip's route is identified by the names of its origin and destination
const routeKeyFor = (trip) => `${trip.origin}|${trip.destination}`;

const haversine = (a, b) => {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

// Route object with cumulative distances so we can place a bus at any %
const buildRoute = (path, source, start, end) => {
  const cum = [0];
  for (let i = 1; i < path.length; i++) {
    cum.push(cum[i - 1] + haversine(path[i - 1], path[i]));
  }
  return { path, cum, total: cum[cum.length - 1] || 1, source, start, end };
};

// Exact point at `percent` along the route and the segment index it sits on
const positionAt = (route, percent) => {
  const { path, cum, total } = route;
  const target = (Math.min(100, Math.max(0, percent)) / 100) * total;

  let i = 1;
  while (i < cum.length - 1 && cum[i] < target) i++;

  const segLen = cum[i] - cum[i - 1] || 1;
  const t = Math.min(1, Math.max(0, (target - cum[i - 1]) / segLen));
  const a = path[i - 1];
  const b = path[i];
  return {
    pos: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
    index: i - 1,
  };
};

/**
 * Step 1: turn the origin/destination NAMES of the active trips into
 * coordinates. Value is [lat, lng], null when the place couldn't be found,
 * and undefined while it is still being looked up.
 */
function usePlaces(trips) {
  const [places, setPlaces] = useState({});
  const requested = useRef(new Set());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    trips.forEach((trip) => {
      [trip.origin, trip.destination].forEach((name) => {
        if (!name || requested.current.has(name)) return;
        requested.current.add(name);

        geocodePlace(name)
          .then((place) => {
            if (!mounted.current) return;
            setPlaces((prev) => ({ ...prev, [name]: place ? [place.lat, place.lng] : null }));
          })
          .catch((err) => {
            console.warn(`Could not look up "${name}":`, err.message);
            requested.current.delete(name); // network problem: allow a retry later
          });
      });
    });
  }, [trips]);

  return places;
}

/**
 * Step 2: fetch the real road geometry (like Google Maps directions) for every
 * trip whose two places are known. Falls back to a straight line if the
 * routing service fails.
 */
function useRoadRoutes(trips, places) {
  const [routes, setRoutes] = useState({});
  const requested = useRef(new Set());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    trips.forEach((trip) => {
      const key = routeKeyFor(trip);
      const start = places[trip.origin];
      const end = places[trip.destination];
      if (!start || !end || requested.current.has(key)) return;
      requested.current.add(key);

      getRoute(
        { lat: start[0], lng: start[1] },
        { lat: end[0], lng: end[1] },
        { geometry: true }
      )
        .then((result) => {
          if (!mounted.current) return;
          const path = result.path.length > 1 ? result.path : [start, end];
          setRoutes((prev) => ({ ...prev, [key]: buildRoute(path, 'road', start, end) }));
        })
        .catch((err) => {
          console.warn('Road routing failed, using straight line:', err.message);
          if (!mounted.current) return;
          setRoutes((prev) => ({ ...prev, [key]: buildRoute([start, end], 'straight', start, end) }));
        });
    });
  }, [trips, places]);

  return routes;
}

/* ------------------------------------------------------------------ */
/* Map components                                                      */
/* ------------------------------------------------------------------ */

// Zooms the map to fit every active route
function FitToRoutes({ routes, trips }) {
  const map = useMap();
  const lastFitKey = useRef('');

  useEffect(() => {
    const keys = trips.map(routeKeyFor).filter((k) => routes[k]);
    const fitKey = [...new Set(keys)].sort().join('#');
    if (!fitKey || fitKey === lastFitKey.current) return;
    lastFitKey.current = fitKey;

    const points = [...new Set(keys)].flatMap((k) => routes[k].path);
    if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 13 });
    }
  }, [routes, trips, map]);

  return null;
}

// One trip: route line, traveled portion, pickup/destination pins and a smoothly moving bus
function TripLayer({ trip, route }) {
  const target = Math.min(100, Math.max(0, Number(trip.progress_percent) || 0));
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  // Ease the bus toward the latest progress so it glides instead of jumping
  useEffect(() => {
    let raf;
    const step = () => {
      const diff = target - shownRef.current;
      if (Math.abs(diff) < 0.02) {
        shownRef.current = target;
        setShown(target);
        return;
      }
      shownRef.current += diff * 0.06;
      setShown(shownRef.current);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  const { pos, index } = positionAt(route, shown);

  const traveled = [...route.path.slice(0, index + 1), pos];
  const remaining = [pos, ...route.path.slice(index + 1)];

  return (
    <>
      {/* Full route outline (white casing, like Google Maps) */}
      <Polyline positions={route.path} pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.9 }} />
      {/* Remaining route */}
      <Polyline
        positions={remaining}
        pathOptions={{ color: '#93c5fd', weight: 6, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }}
      />
      {/* Traveled route */}
      <Polyline
        positions={traveled}
        pathOptions={{ color: '#2563eb', weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round' }}
      />

      <Marker position={route.start} icon={pickupIcon}>
        <Popup>
          <strong>Pickup</strong>
          <div className="text-xs text-gray-500">{trip.origin}</div>
        </Popup>
      </Marker>
      <Marker position={route.end} icon={destinationIcon}>
        <Popup>
          <strong>Destination</strong>
          <div className="text-xs text-gray-500">{trip.destination}</div>
        </Popup>
      </Marker>

      <Marker position={pos} icon={busIcon} zIndexOffset={1000}>
        <Popup>
          <div className="text-center">
            <strong className="block text-slate-800">{trip.registration_number}</strong>
            <span className="text-xs text-gray-500">{trip.origin} to {trip.destination}</span>
            <div className="mt-2 text-sm font-bold text-brand-accent">
              {Math.round(target)}% Complete
            </div>
          </div>
        </Popup>
      </Marker>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export default function Dashboard() {
  const [dashboardData, setDashboardData] = useState(null);
  const [recentBookings, setRecentBookings] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [activeTrips, setActiveTrips] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const { lastEvent } = useWebSocket();

  const places = usePlaces(activeTrips);
  const roadRoutes = useRoadRoutes(activeTrips, places);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const [statsRes, bookingsRes, reportsRes, tripsRes] = await Promise.all([
        api.get('/analytics/dashboard'),
        api.get('/bookings'),
        api.get('/analytics/reports'),
        api.get('/trips?status=in_transit')
      ]);

      setDashboardData(statsRes.data);
      setRecentBookings(bookingsRes.data.slice(0, 4));
      setActiveTrips(tripsRes.data);

      const formattedChartData = reportsRes.data.daily.map(item => ({
        name: item.date.split('-').slice(1).join('/'),
        revenue: parseFloat(item.revenue)
      }));
      setChartData(formattedChartData);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      setError("Failed to load dashboard data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  // Real-time WebSocket updates
  useEffect(() => {
    if (!lastEvent) return;
    
    // Handle live map updates
    if (lastEvent.type === 'trip_progress') {
      setActiveTrips(prev => 
        prev.map(trip => 
          trip.trip_reference === lastEvent.payload.trip_reference 
            ? { ...trip, progress_percent: lastEvent.payload.progress_percent } 
            : trip
        )
      );
    }

    // Handle dashboard stats updates
    if (['booking_created', 'passenger_arrived', 'trip_completed', 'trip_dispatched'].includes(lastEvent.type)) {
      api.get('/analytics/dashboard').then(res => setDashboardData(res.data));
      api.get('/bookings').then(res => setRecentBookings(res.data.slice(0, 4)));
      api.get('/trips?status=in_transit').then(res => setActiveTrips(res.data));
    }
  }, [lastEvent]);

  // Trips whose road route has been resolved
  const mappableTrips = useMemo(
    () => activeTrips.filter((trip) => roadRoutes[routeKeyFor(trip)]),
    [activeTrips, roadRoutes]
  );

  // Place names the map search could not find
  const unresolvedPlaces = useMemo(
    () => [...new Set(activeTrips.flatMap((t) => [t.origin, t.destination]))]
      .filter((name) => name && places[name] === null),
    [activeTrips, places]
  );

  if (loading && !dashboardData) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-accent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-center">
        <AlertCircle className="w-5 h-5 mr-2" />
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Top Section: Stats & Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mr-4">
                <DollarSign className="w-6 h-6 text-brand-accent" />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">Today's Revenue</p>
                <h3 className="text-2xl font-bold text-slate-800">
                  ₦{parseFloat(dashboardData.todays_revenue).toLocaleString()}
                </h3>
              </div>
            </div>
            <span className="text-sm font-medium text-green-500 bg-green-50 px-2 py-1 rounded-md flex items-center">
              <TrendingUp className="w-4 h-4 mr-1" /> Live
            </span>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mr-4">
                <Ticket className="w-6 h-6 text-indigo-500" />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">Today's Bookings</p>
                <h3 className="text-2xl font-bold text-slate-800">
                  {dashboardData.todays_bookings}
                </h3>
              </div>
            </div>
            <span className="text-sm font-medium text-green-500 bg-green-50 px-2 py-1 rounded-md flex items-center">
              <TrendingUp className="w-4 h-4 mr-1" /> Live
            </span>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-purple-50 rounded-full flex items-center justify-center mr-4">
                <Users className="w-6 h-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">Passengers Waiting</p>
                <h3 className="text-2xl font-bold text-slate-800">
                  {dashboardData.passengers_waiting}
                </h3>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-orange-50 rounded-full flex items-center justify-center mr-4">
                <Bus className="w-6 h-6 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">Available Buses</p>
                <h3 className="text-2xl font-bold text-slate-800">
                  {dashboardData.available_buses} <span className="text-sm text-gray-400 font-normal">/ {dashboardData.total_buses}</span>
                </h3>
              </div>
            </div>
          </div>
        </div>

        <div className="xl:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-slate-800">Revenue Trend (Last 7 Days)</h2>
          </div>
          
          <div className="h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} tickFormatter={(value) => `₦${value/1000}K`} width={70} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} formatter={(value) => [`₦${value.toLocaleString()}`, 'Revenue']} />
                <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6, fill: '#3b82f6' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-slate-800">Recent Bookings</h2>
          </div>
          
          <div className="space-y-4">
            {recentBookings.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No recent bookings found.</p>
            ) : (
              recentBookings.map((booking) => (
                <div key={booking.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition-colors border border-transparent hover:border-gray-100">
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-brand-accent/10 text-brand-accent rounded-full mr-4 flex items-center justify-center font-bold">
                      {booking.passenger_name?.charAt(0) || 'P'}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800 truncate w-32">{booking.passenger_name || 'Passenger'}</p>
                      <p className="text-xs text-gray-500">Ref: {booking.booking_reference}</p>
                    </div>
                  </div>
                  <div className="text-right flex-1 ml-4 hidden sm:block">
                    <p className="text-sm font-bold text-slate-800">{booking.destination}</p>
                    <p className="text-xs text-gray-500">From: {booking.origin}</p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-sm font-bold text-slate-800">₦{parseFloat(booking.fare).toLocaleString()}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full uppercase tracking-wider">
                      {booking.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* LIVE MAP SECTION */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center">
              <Activity className="w-5 h-5 mr-2 text-brand-accent" /> Live Bus Tracking
            </h2>
            <span className="text-xs font-bold bg-blue-50 text-brand-accent px-2 py-1 rounded-md uppercase tracking-wider">
              {activeTrips.length} Active
            </span>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 mb-3 text-xs text-gray-500">
            <span className="flex items-center">
              <span className="inline-block w-3 h-3 rounded-full bg-green-500 border-2 border-white shadow mr-1.5"></span> Pickup
            </span>
            <span className="flex items-center">
              <span className="inline-block w-3 h-3 rounded-sm bg-red-500 border-2 border-white shadow mr-1.5"></span> Destination
            </span>
            <span className="flex items-center">
              <span className="inline-block w-5 h-1.5 rounded bg-blue-600 mr-1.5"></span> Covered
            </span>
            <span className="flex items-center">
              <span className="inline-block w-5 h-1.5 rounded bg-blue-300 mr-1.5"></span> Remaining
            </span>
          </div>

          {unresolvedPlaces.length > 0 && (
            <div className="mb-3 p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg flex items-start">
              <AlertCircle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
              <span>
                Couldn't locate {unresolvedPlaces.map((n) => `"${n}"`).join(', ')} on the map.
                Use a more specific place name in Routes &amp; Terminals.
              </span>
            </div>
          )}
          
          <div className="flex-grow rounded-xl overflow-hidden border border-gray-200 relative z-0">
            <MapContainer 
              center={[5.8, 7.4]} 
              zoom={9} 
              style={{ height: '100%', width: '100%', minHeight: '340px' }}
              scrollWheelZoom={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <FitToRoutes routes={roadRoutes} trips={activeTrips} />

              {mappableTrips.map((trip) => (
                <TripLayer
                  key={trip.id}
                  trip={trip}
                  route={roadRoutes[routeKeyFor(trip)]}
                />
              ))}
            </MapContainer>

            {activeTrips.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm text-gray-500 z-[500] pointer-events-none">
                No buses in transit right now.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
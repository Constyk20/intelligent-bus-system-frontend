import { useState, useEffect } from 'react';
import { MapPin, Plus, Navigation, Building2, AlertCircle, Loader2, Clock, Route as RouteIcon } from 'lucide-react';
import api from '../services/api';
import { estimateRoute, formatDuration } from '../utils/geo';

const EMPTY_ROUTE = { terminal_id: '', origin: '', destination: '', fare: '' };
const IDLE_ESTIMATE = { status: 'idle' };

export default function Routes() {
  const [terminals, setTerminals] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals
  const [showTerminalModal, setShowTerminalModal] = useState(false);
  const [showRouteModal, setShowRouteModal] = useState(false);

  // Forms
  const [newTerminal, setNewTerminal] = useState({ name: '', code: '', city: '', state: '', address: '' });
  const [newRoute, setNewRoute] = useState(EMPTY_ROUTE);

  // Automatic distance / time estimate for the route being created
  const [estimate, setEstimate] = useState(IDLE_ESTIMATE);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [termRes, routeRes] = await Promise.all([
        api.get('/terminals'),
        api.get('/routes')
      ]);
      setTerminals(termRes.data);
      setRoutes(routeRes.data);
    } catch (err) {
      console.error(err);
      setError('Failed to load route data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Recalculate whenever origin or destination changes (debounced)
  useEffect(() => {
    if (!showRouteModal) return;

    const origin = newRoute.origin.trim();
    const destination = newRoute.destination.trim();
    if (origin.length < 3 || destination.length < 3) {
      setEstimate(IDLE_ESTIMATE);
      return;
    }

    const controller = new AbortController();
    setEstimate({ status: 'loading' });

    const timer = setTimeout(async () => {
      try {
        const result = await estimateRoute(origin, destination, { signal: controller.signal });
        if (!controller.signal.aborted) setEstimate({ status: 'ok', ...result });
      } catch (err) {
        if (controller.signal.aborted || err.name === 'AbortError') return;
        setEstimate({ status: 'error', message: err.message || 'Could not calculate the route.' });
      }
    }, 800);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [newRoute.origin, newRoute.destination, showRouteModal]);

  const closeRouteModal = () => {
    setShowRouteModal(false);
    setNewRoute(EMPTY_ROUTE);
    setEstimate(IDLE_ESTIMATE);
  };

  const handleCreateTerminal = async (e) => {
    e.preventDefault();
    try {
      await api.post('/terminals', newTerminal);
      setShowTerminalModal(false);
      setNewTerminal({ name: '', code: '', city: '', state: '', address: '' });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to create terminal');
    }
  };

  const handleCreateRoute = async (e) => {
    e.preventDefault();
    if (estimate.status !== 'ok') return;

    setSaving(true);
    try {
      await api.post('/routes', {
        ...newRoute,
        estimated_duration_minutes: estimate.durationMinutes,
        distance_km: estimate.distanceKm,
      });
      closeRouteModal();
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to create route');
    } finally {
      setSaving(false);
    }
  };

  if (loading && terminals.length === 0 && routes.length === 0) {
    return <div className="p-8 text-center text-gray-500">Loading network data...</div>;
  }

  return (
    <div className="space-y-6">
      
      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg flex items-center border border-red-100">
          <AlertCircle className="w-5 h-5 mr-2" /> {error}
        </div>
      )}

      {/* Terminals Section */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-slate-800 flex items-center">
            <Building2 className="w-6 h-6 mr-2 text-brand-accent" /> Terminals
          </h2>
          <button onClick={() => setShowTerminalModal(true)} className="flex items-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors">
            <Plus className="w-4 h-4 mr-2" /> Add Terminal
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {terminals.map(t => (
            <div key={t.id} className="p-4 border border-gray-100 rounded-xl bg-gray-50 flex justify-between items-center">
              <div>
                <p className="font-bold text-slate-800">{t.name}</p>
                <p className="text-sm text-gray-500">{t.city}, {t.state}</p>
              </div>
              <span className="bg-brand-accent/10 text-brand-accent px-2 py-1 rounded text-xs font-bold uppercase">{t.code}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Routes Section */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-slate-800 flex items-center">
            <Navigation className="w-6 h-6 mr-2 text-brand-accent" /> Active Routes
          </h2>
          <button onClick={() => setShowRouteModal(true)} className="flex items-center px-4 py-2 bg-brand-accent hover:bg-blue-600 text-white rounded-lg font-medium transition-colors">
            <Plus className="w-4 h-4 mr-2" /> Add Route
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-sm font-semibold text-gray-500">
                <th className="p-4">Origin</th>
                <th className="p-4">Destination</th>
                <th className="p-4">Fare (₦)</th>
                <th className="p-4">Distance</th>
                <th className="p-4">Est. Duration</th>
              </tr>
            </thead>
            <tbody>
              {routes.map(r => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="p-4 text-gray-600">{r.origin}</td>
                  <td className="p-4 font-bold text-slate-800">{r.destination}</td>
                  <td className="p-4 font-medium text-slate-800">{parseFloat(r.fare).toLocaleString()}</td>
                  <td className="p-4 text-gray-600">{r.distance_km ? `${r.distance_km} km` : '—'}</td>
                  <td className="p-4 text-gray-600">{formatDuration(r.estimated_duration_minutes)}</td>
                </tr>
              ))}
              {routes.length === 0 && (
                <tr><td colSpan="5" className="p-4 text-center text-gray-500">No routes yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Terminal Modal */}
      {showTerminalModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-100"><h3 className="text-xl font-bold text-slate-800">Add New Terminal</h3></div>
            <form onSubmit={handleCreateTerminal} className="p-6 space-y-4">
              <input required placeholder="Terminal Name" value={newTerminal.name} onChange={e => setNewTerminal({...newTerminal, name: e.target.value})} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-brand-accent" />
              <input required placeholder="Code (e.g. ABSU-01)" value={newTerminal.code} onChange={e => setNewTerminal({...newTerminal, code: e.target.value})} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-brand-accent" />
              <div className="flex space-x-4">
                <input required placeholder="City" value={newTerminal.city} onChange={e => setNewTerminal({...newTerminal, city: e.target.value})} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-brand-accent" />
                <input required placeholder="State" value={newTerminal.state} onChange={e => setNewTerminal({...newTerminal, state: e.target.value})} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-brand-accent" />
              </div>
              <div className="pt-4 flex space-x-3">
                <button type="button" onClick={() => setShowTerminalModal(false)} className="flex-1 py-3 text-gray-600 font-medium bg-gray-100 rounded-xl">Cancel</button>
                <button type="submit" className="flex-1 py-3 text-white font-bold bg-slate-800 rounded-xl">Save Terminal</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Route Modal */}
      {showRouteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-full overflow-y-auto">
            <div className="p-6 border-b border-gray-100"><h3 className="text-xl font-bold text-slate-800">Add New Route</h3></div>
            <form onSubmit={handleCreateRoute} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Terminal</label>
                <select required value={newRoute.terminal_id} onChange={e => setNewRoute({...newRoute, terminal_id: e.target.value})} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-brand-accent">
                  <option value="">Select terminal...</option>
                  {terminals.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="flex space-x-4">
                <input required placeholder="Origin" value={newRoute.origin} onChange={e => setNewRoute({...newRoute, origin: e.target.value})} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-brand-accent" />
                <input required placeholder="Destination" value={newRoute.destination} onChange={e => setNewRoute({...newRoute, destination: e.target.value})} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-brand-accent" />
              </div>
              <input required type="number" min="1" placeholder="Fare (e.g. 1500)" value={newRoute.fare} onChange={e => setNewRoute({...newRoute, fare: e.target.value})} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-brand-accent" />

              {/* Automatic estimate */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm" aria-live="polite">
                {estimate.status === 'idle' && (
                  <p className="text-gray-500">
                    Enter an origin and destination. Distance and travel time are calculated automatically.
                  </p>
                )}
                {estimate.status === 'loading' && (
                  <p className="flex items-center text-gray-600">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Calculating route...
                  </p>
                )}
                {estimate.status === 'error' && (
                  <p className="flex items-start text-red-600">
                    <AlertCircle className="w-4 h-4 mr-2 mt-0.5 shrink-0" /> {estimate.message}
                  </p>
                )}
                {estimate.status === 'ok' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center text-gray-500"><RouteIcon className="w-4 h-4 mr-2" /> Distance</span>
                      <span className="font-bold text-slate-800">{estimate.distanceKm} km</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center text-gray-500"><Clock className="w-4 h-4 mr-2" /> Est. travel time</span>
                      <span className="font-bold text-slate-800">{formatDuration(estimate.durationMinutes)}</span>
                    </div>
                    <div className="pt-2 border-t border-gray-200 text-xs text-gray-500 space-y-1">
                      <p className="flex items-start"><MapPin className="w-3 h-3 mr-1 mt-0.5 shrink-0 text-green-600" /> <span className="line-clamp-2">{estimate.from.label}</span></p>
                      <p className="flex items-start"><MapPin className="w-3 h-3 mr-1 mt-0.5 shrink-0 text-red-600" /> <span className="line-clamp-2">{estimate.to.label}</span></p>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 flex space-x-3">
                <button type="button" onClick={closeRouteModal} className="flex-1 py-3 text-gray-600 font-medium bg-gray-100 rounded-xl">Cancel</button>
                <button
                  type="submit"
                  disabled={estimate.status !== 'ok' || saving}
                  className="flex-1 py-3 text-white font-bold bg-brand-accent rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save Route'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
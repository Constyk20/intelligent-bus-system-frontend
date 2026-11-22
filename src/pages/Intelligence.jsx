import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BrainCircuit, Sparkles, CheckCircle, XCircle, AlertCircle, TrendingUp,
  Users, Clock, RefreshCw, Bot, Hand, Rocket, Activity, Zap, Bus,
  Phone, PlayCircle, Flame, Settings2, TriangleAlert,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';

const MODES = [
  { id: 'off', label: 'Manual', icon: Hand, text: 'Staff do everything. The engine only suggests.' },
  { id: 'assisted', label: 'Assisted', icon: Bot, text: 'The engine prepares recommendations for one-click approval.' },
  { id: 'autopilot', label: 'Autopilot', icon: Rocket, text: 'The engine schedules, calls, dispatches and tracks trips by itself.' },
];

const ACTION_STYLE = {
  trip_created: { icon: Bus, color: 'text-purple-600 bg-purple-50' },
  trip_dispatched: { icon: Rocket, color: 'text-green-600 bg-green-50' },
  trip_completed: { icon: CheckCircle, color: 'text-emerald-600 bg-emerald-50' },
  passengers_called: { icon: Phone, color: 'text-blue-600 bg-blue-50' },
  retrain: { icon: BrainCircuit, color: 'text-indigo-600 bg-indigo-50' },
  rush_simulated: { icon: Flame, color: 'text-orange-600 bg-orange-50' },
  warning: { icon: TriangleAlert, color: 'text-amber-700 bg-amber-50' },
};
const DEFAULT_ACTION_STYLE = { icon: Zap, color: 'text-slate-600 bg-slate-100' };

const CHART_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#db2777', '#0891b2'];

const timeAgo = (iso) => {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export default function Intelligence() {
  const { staff } = useAuth();
  const { lastEvent } = useWebSocket();
  const isAdmin = staff?.role === 'super_admin' || staff?.role === 'terminal_admin';

  const [recommendations, setRecommendations] = useState([]);
  const [modelStatus, setModelStatus] = useState(null);
  const [autopilot, setAutopilot] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [forecast, setForecast] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [isTraining, setIsTraining] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [savingMode, setSavingMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [draft, setDraft] = useState(null);
  const [rushRoute, setRushRoute] = useState('');
  const [rushCount, setRushCount] = useState(18);
  const [rushing, setRushing] = useState(false);
  const [message, setMessage] = useState(null);
  const refreshTimer = useRef(null);

  const flash = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4500);
  };

  const loadLive = useCallback(async () => {
    const [status, dec, fc, recs] = await Promise.all([
      api.get('/autopilot/status'),
      api.get('/autopilot/decisions?limit=30'),
      api.get('/autopilot/forecast?hours=8'),
      api.get('/scheduling/recommendations?status=pending'),
    ]);
    setAutopilot(status.data);
    setDecisions(dec.data);
    setForecast(fc.data);
    setRecommendations(recs.data);
  }, []);

  const loadModel = useCallback(async () => {
    const res = await api.get('/intelligence/status');
    setModelStatus(res.data);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setError('');
        await Promise.all([loadLive(), loadModel()]);
      } catch (err) {
        console.error(err);
        setError('Failed to load intelligence data.');
      } finally {
        setLoading(false);
      }
    })();
  }, [loadLive, loadModel]);

  // Keep the decision feed live: refresh shortly after any autopilot activity
  useEffect(() => {
    if (!lastEvent) return undefined;
    if (!['autopilot_action', 'trip_created', 'trip_dispatched', 'trip_completed', 'booking_created'].includes(lastEvent.type)) {
      return undefined;
    }
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => loadLive().catch(() => {}), 600);
    return () => clearTimeout(refreshTimer.current);
  }, [lastEvent, loadLive]);

  // Passive refresh so queue counts and the "last tick" stay current
  useEffect(() => {
    const id = setInterval(() => loadLive().catch(() => {}), 20000);
    return () => clearInterval(id);
  }, [loadLive]);

  const settings = autopilot?.settings;

  const saveSettings = async (changes) => {
    setSavingMode(true);
    try {
      const res = await api.put('/autopilot/settings', changes);
      setAutopilot((prev) => ({ ...prev, settings: res.data.settings || res.data }));
      await loadLive();
      return true;
    } catch (err) {
      flash('error', err.response?.data?.detail || 'Could not save settings');
      return false;
    } finally {
      setSavingMode(false);
    }
  };

  const openSettings = () => {
    setDraft({ ...settings });
    setShowSettings((v) => !v);
  };

  const submitSettings = async (e) => {
    e.preventDefault();
    const keys = [
      'min_passengers_to_schedule', 'max_wait_minutes', 'departure_wait_minutes',
      'min_boarded_percent', 'max_open_trips_per_terminal', 'demo_time_scale',
      'auto_call', 'simulate_boarding',
    ];
    const changes = {};
    keys.forEach((k) => { changes[k] = typeof draft[k] === 'boolean' ? draft[k] : Number(draft[k]); });
    if (await saveSettings(changes)) {
      flash('ok', 'Autopilot settings saved');
      setShowSettings(false);
    }
  };

  const runTick = async () => {
    setActionLoading('tick');
    try {
      await api.post('/autopilot/tick');
      await loadLive();
    } catch (err) {
      flash('error', err.response?.data?.detail || 'Autopilot pass failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleTrain = async () => {
    setIsTraining(true);
    try {
      await api.post('/intelligence/train');
      await Promise.all([loadModel(), loadLive()]);
      flash('ok', 'Model trained');
    } catch (err) {
      flash('error', err.response?.data?.detail || 'Failed to train. Make sure there are active routes and bookings.');
    } finally {
      setIsTraining(false);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await api.post('/scheduling/recommendations/generate');
      await loadLive();
    } catch (err) {
      flash('error', err.response?.data?.detail || 'Failed to generate recommendations.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApprove = async (id) => {
    setActionLoading(id);
    try {
      await api.post(`/scheduling/recommendations/${id}/approve`);
      await loadLive();
    } catch (err) {
      flash('error', err.response?.data?.detail || 'Failed to approve recommendation.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id) => {
    setActionLoading(id);
    try {
      await api.post(`/scheduling/recommendations/${id}/reject`);
      await loadLive();
    } catch (err) {
      flash('error', err.response?.data?.detail || 'Failed to reject recommendation.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRush = async () => {
    const routeId = rushRoute || forecast?.routes?.[0]?.route_id;
    if (!routeId) return;
    setRushing(true);
    try {
      const res = await api.post('/autopilot/simulate-rush', { route_id: routeId, count: Number(rushCount) });
      flash('ok', `${res.data.created} test passengers booked${res.data.failed ? `, ${res.data.failed} failed` : ''}`);
      await loadLive();
    } catch (err) {
      flash('error', err.response?.data?.detail || 'Simulation failed');
    } finally {
      setRushing(false);
    }
  };

  // Forecast chart: one line per route, x = hour of day
  const chartData = (() => {
    if (!forecast?.routes?.length) return [];
    const hours = forecast.routes[0].series.map((p) => p.at);
    return hours.map((at, i) => {
      const row = { hour: new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
      forecast.routes.forEach((r) => { row[r.destination] = r.series[i]?.predicted ?? 0; });
      return row;
    });
  })();

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading intelligence engine...</div>;
  }

  const mode = settings?.mode || 'off';
  const stats = autopilot?.stats || {};
  const beats = modelStatus?.rf_beats_baseline;

  return (
    <div className="space-y-6">
      {/* Header + mode switch */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 space-y-5">
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-center">
              <BrainCircuit className="w-7 h-7 mr-3 text-purple-600" />
              Terminal Intelligence
            </h2>
            <p className="text-gray-500 mt-1 max-w-2xl text-sm">
              Forecasts demand, creates trips before queues build up, calls passengers, dispatches buses and explains every decision.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className={`flex items-center px-3 py-1.5 rounded-full ${autopilot?.running ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              <span className={`w-2 h-2 rounded-full mr-2 ${autopilot?.running ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              {autopilot?.running ? 'Engine running' : 'Engine stopped'}
            </span>
            {autopilot?.last_tick_at && (
              <span className="text-gray-400 hidden sm:inline">Last pass {timeAgo(autopilot.last_tick_at)}</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {MODES.map(({ id, label, icon: Icon, text }) => {
            const active = mode === id;
            return (
              <button
                key={id}
                disabled={!isAdmin || savingMode}
                onClick={() => !active && saveSettings({ mode: id })}
                className={`text-left p-4 rounded-xl border-2 transition-all disabled:cursor-not-allowed ${
                  active
                    ? id === 'autopilot'
                      ? 'border-green-500 bg-green-50'
                      : 'border-brand-accent bg-blue-50/60'
                    : 'border-gray-100 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center font-bold text-slate-800">
                  <Icon className={`w-5 h-5 mr-2 ${active ? 'text-green-600' : 'text-gray-400'}`} />
                  {label}
                  {active && <span className="ml-auto text-xs text-green-700">ACTIVE</span>}
                </div>
                <p className="text-xs text-gray-500 mt-1">{text}</p>
              </button>
            );
          })}
        </div>
        {!isAdmin && <p className="text-xs text-gray-400">Only administrators can change the mode.</p>}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Waiting, no trip yet', value: stats.unassigned_waiting, icon: Users },
            { label: 'Scheduled trips', value: stats.scheduled_trips, icon: Clock },
            { label: 'On the road', value: stats.in_transit_trips, icon: Bus },
            { label: 'Free buses', value: stats.free_buses, icon: Activity },
            { label: 'Pending approvals', value: stats.pending_recommendations, icon: Sparkles },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 flex items-center"><Icon className="w-3 h-3 mr-1" />{label}</p>
              <p className="text-2xl font-black text-slate-800">{value ?? 0}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={runTick}
            disabled={actionLoading === 'tick'}
            className="flex items-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            <PlayCircle className="w-4 h-4 mr-2" />
            {actionLoading === 'tick' ? 'Running...' : 'Run a pass now'}
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center px-4 py-2 bg-brand-accent hover:bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            {isGenerating ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {isGenerating ? 'Analyzing...' : 'Generate recommendations'}
          </button>
          {isAdmin && (
            <button
              onClick={openSettings}
              className="flex items-center px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold"
            >
              <Settings2 className="w-4 h-4 mr-2" /> Rules
            </button>
          )}
        </div>

        {showSettings && draft && (
          <form onSubmit={submitSettings} className="border-t border-gray-100 pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              ['min_passengers_to_schedule', 'Passengers needed to schedule a trip'],
              ['max_wait_minutes', 'Longest a passenger should wait (min)'],
              ['departure_wait_minutes', 'Wait for a full bus before leaving (min)'],
              ['min_boarded_percent', 'Leave early when this % is boarded'],
              ['max_open_trips_per_terminal', 'Open trips allowed per terminal'],
              ['demo_time_scale', 'Demo speed (1 = real time)'],
            ].map(([key, label]) => (
              <label key={key} className="text-xs font-semibold text-gray-600">
                {label}
                <input
                  type="number"
                  min="1"
                  value={draft[key] ?? ''}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-normal"
                />
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={!!draft.auto_call} onChange={(e) => setDraft({ ...draft, auto_call: e.target.checked })} />
              Call passengers automatically
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={!!draft.simulate_boarding} onChange={(e) => setDraft({ ...draft, simulate_boarding: e.target.checked })} />
              Simulate boarding (demo only)
            </label>
            <div className="sm:col-span-2 lg:col-span-3 flex justify-end gap-2">
              <button type="button" onClick={() => setShowSettings(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="submit" disabled={savingMode} className="px-5 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                {savingMode ? 'Saving...' : 'Save rules'}
              </button>
            </div>
          </form>
        )}
      </div>

      {message && (
        <div role="status" className={`p-4 rounded-lg flex items-center border ${message.type === 'ok' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
          {message.type === 'ok' ? <CheckCircle className="w-5 h-5 mr-2" /> : <AlertCircle className="w-5 h-5 mr-2" />}
          {message.text}
        </div>
      )}
      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg flex items-center border border-red-100">
          <AlertCircle className="w-5 h-5 mr-2" /> {error}
        </div>
      )}

      {/* Forecast + live decisions */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 className="font-bold text-slate-800 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2 text-green-600" /> Expected passengers, next 8 hours
            </h3>
            {!forecast?.model_trained && (
              <span className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-md">Model not trained: using a simple average</span>
            )}
          </div>
          {chartData.length === 0 ? (
            <p className="text-gray-500 text-sm py-10 text-center">Create an active route to see a forecast.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v, name) => [`${v} passengers`, name]} />
                  <Legend />
                  {forecast.routes.map((r, i) => (
                    <Line key={r.route_id} type="monotone" dataKey={r.destination} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {forecast?.routes?.length > 0 && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {forecast.routes.map((r) => (
                <div key={r.route_id} className="bg-gray-50 rounded-lg p-3 text-sm">
                  <p className="font-semibold text-slate-800 truncate">{r.origin} to {r.destination}</p>
                  <p className="text-xs text-gray-500">
                    {r.waiting} waiting now
                    {r.peak_at && ` · peak around ${new Date(r.peak_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6 flex flex-col max-h-[34rem]">
          <h3 className="font-bold text-slate-800 flex items-center mb-4">
            <Activity className="w-5 h-5 mr-2 text-brand-accent" /> What the engine is doing
          </h3>
          <div className="overflow-y-auto space-y-2 pr-1 flex-1">
            {decisions.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                No decisions yet. Switch to Autopilot or run a pass.
              </p>
            ) : (
              decisions.map((d) => {
                const style = ACTION_STYLE[d.action] || DEFAULT_ACTION_STYLE;
                const Icon = style.icon;
                return (
                  <div key={d.id} className="flex gap-3 items-start">
                    <span className={`p-1.5 rounded-lg shrink-0 ${style.color}`}><Icon className="w-4 h-4" /></span>
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800 leading-snug">{d.message}</p>
                      <p className="text-xs text-gray-400">{timeAgo(d.at)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Model + recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 text-white shadow-lg">
            <h3 className="text-lg font-bold mb-4 flex items-center text-slate-200">
              <TrendingUp className="w-5 h-5 mr-2 text-green-400" /> Demand model
            </h3>

            {modelStatus?.trained ? (
              <div className="space-y-3 text-sm">
                <Row label="Status" value={<span className="text-green-400 font-bold">Trained</span>} />
                <Row label="Accuracy (R²)" value={<span className="font-bold text-green-400">{modelStatus.rf_r2 ?? modelStatus.r2}</span>} />
                <Row label="Typical error" value={<span className="font-bold text-yellow-400">{modelStatus.rf_mae ?? modelStatus.mae} passengers</span>} />
                {modelStatus.baseline_mae !== undefined && (
                  <Row label="Simple average error" value={<span className="text-slate-300">{modelStatus.baseline_mae} passengers</span>} />
                )}
                {beats !== undefined && (
                  <p className={`text-xs rounded-md px-2 py-1.5 ${beats ? 'bg-green-500/15 text-green-300' : 'bg-amber-500/15 text-amber-300'}`}>
                    {beats ? 'The model predicts better than a simple hourly average.' : 'Not better than a simple hourly average yet. It needs more booking history.'}
                  </p>
                )}
                {modelStatus.trained_at && (
                  <p className="pt-1 text-xs text-slate-500">Last trained {new Date(modelStatus.trained_at).toLocaleString()}</p>
                )}
                <button onClick={handleTrain} disabled={isTraining} className="w-full mt-2 py-2 bg-slate-700/60 hover:bg-slate-700 rounded-lg text-sm font-medium disabled:opacity-50">
                  {isTraining ? 'Retraining...' : 'Retrain now'}
                </button>
                <p className="text-xs text-slate-500">Autopilot also retrains it by itself as new bookings come in.</p>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-slate-400 mb-4 text-sm">The model is not trained yet.</p>
                <button onClick={handleTrain} disabled={isTraining} className="w-full py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium disabled:opacity-50">
                  {isTraining ? 'Training...' : 'Train model now'}
                </button>
              </div>
            )}
          </div>

          {isAdmin && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-bold text-slate-800 flex items-center mb-1">
                <Flame className="w-5 h-5 mr-2 text-orange-500" /> Rush-hour test
              </h3>
              <p className="text-xs text-gray-500 mb-3">Books test passengers so you can watch the engine react. They are marked as simulated.</p>
              <div className="flex gap-2">
                <select
                  value={rushRoute || forecast?.routes?.[0]?.route_id || ''}
                  onChange={(e) => setRushRoute(e.target.value)}
                  className="flex-1 min-w-0 px-2 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  {(forecast?.routes || []).map((r) => (
                    <option key={r.route_id} value={r.route_id}>{r.destination}</option>
                  ))}
                </select>
                <input
                  type="number" min="1" max="40" value={rushCount}
                  onChange={(e) => setRushCount(e.target.value)}
                  className="w-16 px-2 py-2 border border-gray-200 rounded-lg text-sm"
                  aria-label="Number of passengers"
                />
              </div>
              <button
                onClick={handleRush}
                disabled={rushing || !forecast?.routes?.length}
                className="w-full mt-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-bold disabled:opacity-50"
              >
                {rushing ? 'Booking...' : 'Simulate rush'}
              </button>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-lg font-bold text-slate-800 flex items-center">
            <Sparkles className="w-5 h-5 mr-2 text-brand-accent" /> Pending recommendations
          </h3>

          {recommendations.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-400" />
              <p className="text-lg font-bold text-slate-800">All caught up</p>
              <p className="text-gray-500 mt-1 text-sm">
                {mode === 'autopilot'
                  ? 'Autopilot is handling scheduling, so nothing needs approval.'
                  : 'Nothing to approve. Generate recommendations to analyze the queues.'}
              </p>
            </div>
          ) : (
            recommendations.map((rec) => (
              <div key={rec.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6 flex flex-col md:flex-row gap-6">
                <div className="flex-1 space-y-3 min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                      Priority {rec.priority_score}
                    </span>
                    <h4 className="text-xl font-bold text-slate-800">{rec.destination}</h4>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1 flex items-center"><Users className="w-3 h-3 mr-1" /> Waiting</p>
                      <p className="font-bold text-slate-800 text-lg">{rec.waiting_passengers} <span className="text-sm font-normal">passengers</span></p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1 flex items-center"><Clock className="w-3 h-3 mr-1" /> Longest wait</p>
                      <p className="font-bold text-slate-800 text-lg">{rec.oldest_wait_minutes} <span className="text-sm font-normal">min</span></p>
                    </div>
                  </div>

                  <div className="text-sm text-slate-600 bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                    <p className="font-semibold text-blue-800 mb-1">Why</p>
                    {rec.reason}
                  </div>
                </div>

                <div className="md:w-60 flex flex-col justify-between md:border-l md:border-gray-100 md:pl-6">
                  <div className="space-y-2 mb-4 text-sm">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Proposed</p>
                    <p className="font-medium text-slate-800"><span className="inline-block w-14 text-gray-500">Bus</span>{rec.registration_number || <span className="text-red-500">None free</span>}</p>
                    <p className="font-medium text-slate-800"><span className="inline-block w-14 text-gray-500">Driver</span>{rec.driver_name || <span className="text-red-500">None free</span>}</p>
                  </div>
                  <div className="flex gap-2 mt-auto">
                    <button
                      onClick={() => handleReject(rec.id)}
                      disabled={actionLoading === rec.id}
                      className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg"
                      title="Reject"
                      aria-label="Reject recommendation"
                    >
                      <XCircle className="w-5 h-5 mx-auto" />
                    </button>
                    <button
                      onClick={() => handleApprove(rec.id)}
                      disabled={actionLoading === rec.id || !rec.registration_number}
                      className="flex-[3] py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-bold flex items-center justify-center disabled:opacity-50"
                    >
                      {actionLoading === rec.id ? 'Working...' : (<><CheckCircle className="w-4 h-4 mr-1" /> Approve</>)}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between items-center border-b border-slate-700 pb-2 gap-3">
      <span className="text-slate-400">{label}</span>
      <span>{value}</span>
    </div>
  );
}
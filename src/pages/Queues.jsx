import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Users, Volume2, CheckCircle, XCircle, AlertCircle, RefreshCw,
  Bus, ScanLine, Zap, Search,
} from 'lucide-react';
import api from '../services/api';
import { useWebSocket } from '../context/WebSocketContext';

const REFRESH_EVENTS = [
  'passenger_arrived', 'booking_created', 'passenger_called', 'passenger_no_show',
  'passenger_boarded', 'trip_created', 'trip_dispatched', 'trip_cancelled',
  'trip_completed', 'autopilot_action', 'booking_cancelled',
];

export default function Queues() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null); // { type: 'ok' | 'error', text }
  const [actionLoading, setActionLoading] = useState(null);
  const [search, setSearch] = useState('');
  const [scanValue, setScanValue] = useState('');
  const [scanning, setScanning] = useState(false);
  const { lastEvent } = useWebSocket();
  const scanRef = useRef(null);
  const refreshTimer = useRef(null);

  const fetchQueue = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError('');
      const res = await api.get('/queues');
      setQueue(res.data.filter((q) => ['waiting', 'called'].includes(q.status)));
    } catch (err) {
      console.error(err);
      setError('Failed to load queue data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    scanRef.current?.focus();
  }, [fetchQueue]);

  // Several events can arrive together (autopilot calling many people): refresh once
  useEffect(() => {
    if (!lastEvent || !REFRESH_EVENTS.includes(lastEvent.type)) return undefined;
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => fetchQueue(true), 400);
    return () => clearTimeout(refreshTimer.current);
  }, [lastEvent, fetchQueue]);

  const flash = (type, text) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 4000);
  };

  const handleCall = async (ref) => {
    setActionLoading(ref);
    try {
      await api.post(`/queues/${ref}/call`);
      await fetchQueue(true);
    } catch (err) {
      flash('error', err.response?.data?.detail || 'Failed to call passenger');
    } finally {
      setActionLoading(null);
    }
  };

  // One click: call if needed, verify the ticket on the server and board
  const handleQuickBoard = async (item) => {
    setActionLoading(item.booking_reference);
    try {
      await api.post(`/queues/${item.booking_reference}/quick-board`);
      flash('ok', `${item.passenger_name || item.ticket_number} boarded`);
      await fetchQueue(true);
    } catch (err) {
      flash('error', err.response?.data?.detail || 'Failed to board passenger');
    } finally {
      setActionLoading(null);
    }
  };

  const handleNoShow = async (ref) => {
    if (!window.confirm('Mark this passenger as a no-show?')) return;
    setActionLoading(ref);
    try {
      await api.post(`/queues/${ref}/no-show`);
      await fetchQueue(true);
    } catch (err) {
      flash('error', err.response?.data?.detail || 'Failed to mark no-show');
    } finally {
      setActionLoading(null);
    }
  };

  // Scanner guns type the QR text and press Enter, so this works with them too
  const handleScan = async (e) => {
    e.preventDefault();
    const payload = scanValue.trim();
    if (!payload) return;
    setScanning(true);
    try {
      const res = await api.post('/boarding/scan', { payload });
      flash('ok', `${res.data.passenger_name || res.data.ticket_number} boarded`);
      setScanValue('');
      await fetchQueue(true);
    } catch (err) {
      flash('error', err.response?.data?.detail || 'Scan failed');
      setScanValue('');
    } finally {
      setScanning(false);
      scanRef.current?.focus();
    }
  };

  // Group by trip so an operator can see which bus each person is boarding
  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = queue.filter((q) =>
      !term ||
      [q.passenger_name, q.ticket_number, q.booking_reference, q.destination, q.trip_reference, String(q.queue_number)]
        .some((v) => String(v || '').toLowerCase().includes(term))
    );
    const map = new Map();
    rows.forEach((row) => {
      const key = row.trip_reference || '__unassigned__';
      if (!map.has(key)) map.set(key, { key, trip: row.trip_reference, destination: row.destination, rows: [] });
      map.get(key).rows.push(row);
    });
    return [...map.values()].sort((a, b) => {
      if (!a.trip) return 1;
      if (!b.trip) return -1;
      return a.trip.localeCompare(b.trip);
    });
  }, [queue, search]);

  if (loading && queue.length === 0) {
    return <div className="p-8 text-center text-gray-500">Loading active queues...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-center">
              <Users className="w-7 h-7 mr-3 text-brand-accent" />
              Live Terminal Queue
            </h2>
            <p className="text-gray-500 mt-1 text-sm">
              {queue.length} waiting or called. Scan a ticket to board in one step.
            </p>
          </div>
          <button
            onClick={() => fetchQueue()}
            className="flex items-center px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
          >
            <RefreshCw className={`w-5 h-5 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <form onSubmit={handleScan} className="flex gap-2">
            <div className="relative flex-1">
              <ScanLine className="w-5 h-5 text-brand-accent absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={scanRef}
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                placeholder="Scan ticket QR to board"
                autoComplete="off"
                className="w-full pl-10 pr-3 py-3 border-2 border-brand-accent/40 rounded-xl focus:outline-none focus:border-brand-accent font-mono text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={scanning || !scanValue.trim()}
              className="px-5 py-3 bg-brand-accent hover:bg-blue-600 text-white rounded-xl font-bold disabled:opacity-50"
            >
              {scanning ? '...' : 'Board'}
            </button>
          </form>

          <div className="relative">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, ticket, queue number or destination"
              className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-accent/40 text-sm"
            />
          </div>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className={`p-4 rounded-lg flex items-center border ${
            notice.type === 'ok'
              ? 'bg-green-50 text-green-700 border-green-100'
              : 'bg-red-50 text-red-700 border-red-100'
          }`}
        >
          {notice.type === 'ok' ? <CheckCircle className="w-5 h-5 mr-2" /> : <AlertCircle className="w-5 h-5 mr-2" />}
          {notice.text}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg flex items-center border border-red-100">
          <AlertCircle className="w-5 h-5 mr-2" /> {error}
        </div>
      )}

      {groups.length === 0 ? (
        <div className="p-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-100">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-400" />
          <p className="text-lg font-medium">{search ? 'No passengers match your search.' : 'The queue is empty.'}</p>
          {!search && <p>All waiting passengers have been attended to.</p>}
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <Bus className="w-4 h-4 text-purple-600" />
              {group.trip ? (
                <>
                  <span className="font-mono text-purple-700">{group.trip}</span>
                  <span className="text-gray-400 font-normal">to {group.destination}</span>
                </>
              ) : (
                <span className="text-amber-700">Waiting for a trip to be scheduled</span>
              )}
              <span className="ml-auto text-xs font-medium text-gray-500">{group.rows.length} passengers</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {group.rows.map((item) => {
                const busy = actionLoading === item.booking_reference;
                const called = item.status === 'called';
                return (
                  <div
                    key={item.id}
                    className={`bg-white rounded-2xl shadow-sm border-2 p-4 sm:p-5 flex flex-col transition-all ${
                      called ? 'border-blue-400 shadow-blue-100' : 'border-gray-100'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <span className="text-3xl font-black text-slate-800">#{item.queue_number}</span>
                        <p className="text-sm font-bold text-brand-accent mt-1">{item.destination}</p>
                      </div>
                      <div
                        className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                          called ? 'bg-blue-100 text-blue-700 animate-pulse' : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {item.status}
                      </div>
                    </div>

                    <div className="flex-grow mb-4 border-t border-gray-100 pt-3">
                      <p className="font-bold text-slate-800 text-lg">{item.passenger_name || 'Passenger'}</p>
                      <p className="text-sm text-gray-500 mt-1">
                        Ticket: <span className="font-mono text-gray-800">{item.ticket_number}</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Booked at {new Date(item.created_at).toLocaleTimeString()}
                      </p>
                    </div>

                    <div className="space-y-2 mt-auto">
                      <button
                        onClick={() => handleQuickBoard(item)}
                        disabled={busy}
                        className="w-full flex items-center justify-center py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold transition-colors disabled:opacity-50"
                      >
                        <Zap className="w-5 h-5 mr-2" />
                        {busy ? 'Boarding...' : 'Verify & Board'}
                      </button>

                      <div className="flex gap-2">
                        {item.status === 'waiting' && (
                          <button
                            onClick={() => handleCall(item.booking_reference)}
                            disabled={busy}
                            className="flex-1 flex items-center justify-center py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-sm font-medium disabled:opacity-50"
                          >
                            <Volume2 className="w-4 h-4 mr-2" /> Call
                          </button>
                        )}
                        {called && (
                          <button
                            onClick={() => handleNoShow(item.booking_reference)}
                            disabled={busy}
                            className="flex-1 flex items-center justify-center py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-sm font-medium disabled:opacity-50"
                          >
                            <XCircle className="w-4 h-4 mr-2" /> No show
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
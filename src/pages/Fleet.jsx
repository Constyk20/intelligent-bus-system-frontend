import { useState, useEffect } from 'react';
import { 
  Bus, Plus, Play, User, Activity, 
  CheckCircle, AlertCircle, Navigation, UserPlus
} from 'lucide-react';
import api from '../services/api';
import { useWebSocket } from '../context/WebSocketContext';

export default function Fleet() {
  const [buses, setBuses] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [trips, setTrips] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [terminals, setTerminals] = useState([]);
  const [boardedQueues, setBoardedQueues] = useState([]); 
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(null);

  const [showTripModal, setShowTripModal] = useState(false);
  const [showBusModal, setShowBusModal] = useState(false);
  const [showDriverModal, setShowDriverModal] = useState(false);

  const [newTrip, setNewTrip] = useState({ route_id: '', bus_id: '', driver_id: '' });
  const [newBus, setNewBus] = useState({ registration_number: '', terminal_id: '', capacity: '18', model: 'Toyota Hiace' });
  const [newDriver, setNewDriver] = useState({ full_name: '', phone: '', license_number: '', terminal_id: '' });
  
  const { lastEvent } = useWebSocket();

  const fetchData = async () => {
    try {
      setLoading(true);
      const [busesRes, driversRes, tripsRes, routesRes, terminalsRes, queueRes] = await Promise.all([
        api.get('/buses'),
        api.get('/drivers'),
        api.get('/trips'),
        api.get('/routes?active_only=true'),
        api.get('/terminals'),
        api.get('/queues?status=boarded') 
      ]);
      setBuses(busesRes.data);
      setDrivers(driversRes.data);
      setTrips(tripsRes.data);
      setRoutes(routesRes.data);
      setTerminals(terminalsRes.data);
      setBoardedQueues(queueRes.data); 
    } catch (err) {
      console.error(err);
      setError('Failed to load fleet data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!lastEvent) return;
    
    if (lastEvent.type === 'trip_progress') {
      setTrips(prevTrips => 
        prevTrips.map(trip => 
          trip.trip_reference === lastEvent.payload.trip_reference 
            ? { ...trip, progress_percent: lastEvent.payload.progress_percent, status: 'in_transit' } 
            : trip
        )
      );
    }
    
    if (['trip_dispatched', 'trip_completed', 'passenger_boarded', 'recommendations_generated', 'trip_created'].includes(lastEvent.type)) {
      fetchData();
    }
  }, [lastEvent]);

  const handleCreateTrip = async (e) => {
    e.preventDefault();
    try {
      await api.post('/trips', newTrip);
      setShowTripModal(false);
      setNewTrip({ route_id: '', bus_id: '', driver_id: '' });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to create trip');
    }
  };

  const handleCreateBus = async (e) => {
    e.preventDefault();
    try {
      await api.post('/buses', newBus);
      setShowBusModal(false);
      setNewBus({ registration_number: '', terminal_id: '', capacity: '18', model: 'Toyota Hiace' });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to add bus');
    }
  };

  const handleCreateDriver = async (e) => {
    e.preventDefault();
    try {
      await api.post('/drivers', newDriver);
      setShowDriverModal(false);
      setNewDriver({ full_name: '', phone: '', license_number: '', terminal_id: '' });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to add driver');
    }
  };

  const handleDispatch = async (tripRef) => {
    if (!window.confirm("Dispatch this bus? All passengers must be boarded.")) return;
    setActionLoading(tripRef);
    try {
      await api.post(`/trips/${tripRef}/dispatch`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to dispatch trip');
    } finally {
      setActionLoading(null);
    }
  };

  const availableBuses = buses.filter(b => b.status === 'available');
  const availableDrivers = drivers.filter(d => d.is_active);

  const getLivePassengerCount = (trip) => {
    if (trip.status === 'in_transit' || trip.status === 'completed') {
      return trip.passenger_count;
    }
    return boardedQueues.filter(q => q.trip_reference === trip.trip_reference).length;
  };

  if (loading && trips.length === 0) {
    return <div className="p-8 text-center text-gray-500">Loading fleet data...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-100 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center">
            <Bus className="w-8 h-8 mr-3 text-brand-accent" />
            Fleet & Dispatch
          </h2>
          <p className="text-gray-500 mt-1">Manage buses, drivers, and active trips</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowBusModal(true)} className="flex items-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition-colors">
            <Plus className="w-4 h-4 mr-2" /> Add Bus
          </button>
          <button onClick={() => setShowDriverModal(true)} className="flex items-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition-colors">
            <UserPlus className="w-4 h-4 mr-2" /> Add Driver
          </button>
          <button onClick={() => setShowTripModal(true)} className="flex items-center px-4 py-2 bg-brand-accent hover:bg-blue-600 text-white rounded-xl font-bold transition-colors">
            <Plus className="w-4 h-4 mr-2" /> Schedule Trip
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg flex items-center border border-red-100">
          <AlertCircle className="w-5 h-5 mr-2" /> {error}
        </div>
      )}

      <h3 className="text-lg font-bold text-slate-800 mt-8 mb-4 flex items-center">
        <Activity className="w-5 h-5 mr-2 text-indigo-500" /> 
        Active Trips (Live Simulation)
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {trips.filter(t => ['scheduled', 'in_transit'].includes(t.status)).length === 0 ? (
          <div className="col-span-full p-8 text-center text-gray-500 bg-white rounded-2xl border border-gray-100">
            No active trips. Schedule one or approve an AI recommendation to start.
          </div>
        ) : (
          trips.filter(t => ['scheduled', 'in_transit'].includes(t.status)).map(trip => {
            const livePassengerCount = getLivePassengerCount(trip);
            const isFull = livePassengerCount >= trip.capacity;
            
            return (
              <div key={trip.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{trip.trip_reference}</span>
                    <h4 className="text-xl font-bold text-slate-800 mt-1">{trip.destination}</h4>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    trip.status === 'in_transit' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {trip.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="space-y-2 mb-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Bus</span>
                    <span className="font-medium text-slate-800">{trip.registration_number}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Driver</span>
                    <span className="font-medium text-slate-800">{trip.driver_name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Boarded</span>
                    <span className={`font-bold ${isFull ? 'text-green-600' : 'text-slate-800'}`}>
                      {livePassengerCount} / {trip.capacity}
                    </span>
                  </div>
                </div>

                {trip.status === 'in_transit' ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-medium text-gray-500 mb-1">
                      <span>Progress</span>
                      <span>{trip.progress_percent}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                      <div 
                        className="bg-brand-accent h-2.5 rounded-full transition-all duration-1000" 
                        style={{ width: `${trip.progress_percent}%` }}
                      ></div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => handleDispatch(trip.trip_reference)}
                    disabled={actionLoading === trip.trip_reference || !isFull}
                    className="w-full flex items-center justify-center py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Play className="w-5 h-5 mr-2" /> 
                    {actionLoading === trip.trip_reference ? 'Dispatching...' : 
                     !isFull ? `Waiting for ${trip.capacity - livePassengerCount} more` : 'Dispatch Bus'}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-8">
        <div>
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
            <Navigation className="w-5 h-5 mr-2 text-brand-accent" /> Your Buses
          </h3>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-sm font-semibold text-gray-500">
                  <th className="p-4">Registration</th>
                  <th className="p-4">Capacity</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {buses.map(bus => (
                  <tr key={bus.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="p-4 font-bold text-slate-800">
                      {bus.registration_number}
                      <span className="block text-xs font-normal text-gray-400">{bus.model || 'Standard'}</span>
                    </td>
                    <td className="p-4 text-gray-600">{bus.capacity} seats</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                        bus.status === 'available' ? 'bg-green-100 text-green-800' :
                        bus.status === 'on_trip' ? 'bg-blue-100 text-blue-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {bus.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
                {buses.length === 0 && <tr><td colSpan="3" className="p-4 text-center text-gray-500">No buses in fleet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
            <User className="w-5 h-5 mr-2 text-brand-accent" /> Your Drivers
          </h3>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-sm font-semibold text-gray-500">
                  <th className="p-4">Name</th>
                  <th className="p-4">License</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map(driver => (
                  <tr key={driver.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="p-4 font-bold text-slate-800">
                      {driver.full_name}
                      <span className="block text-xs font-normal text-gray-400">{driver.phone}</span>
                    </td>
                    <td className="p-4 text-gray-600 font-mono text-sm">{driver.license_number}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                        driver.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {driver.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
                {drivers.length === 0 && <tr><td colSpan="3" className="p-4 text-center text-gray-500">No drivers registered.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showTripModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-100"><h3 className="text-xl font-bold text-slate-800">Schedule New Trip</h3></div>
            <form onSubmit={handleCreateTrip} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Route</label>
                <select required value={newTrip.route_id} onChange={(e) => setNewTrip({...newTrip, route_id: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-accent outline-none">
                  <option value="">Select a route...</option>
                  {routes.map(r => <option key={r.id} value={r.id}>{r.origin} to {r.destination}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bus (Available Only)</label>
                <select required value={newTrip.bus_id} onChange={(e) => setNewTrip({...newTrip, bus_id: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-accent outline-none">
                  <option value="">Select a bus...</option>
                  {availableBuses.map(b => <option key={b.id} value={b.id}>{b.registration_number} ({b.capacity} seats)</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Driver</label>
                <select required value={newTrip.driver_id} onChange={(e) => setNewTrip({...newTrip, driver_id: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-accent outline-none">
                  <option value="">Select a driver...</option>
                  {availableDrivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                </select>
              </div>
              <div className="pt-4 flex space-x-3">
                <button type="button" onClick={() => setShowTripModal(false)} className="flex-1 py-3 text-gray-600 font-medium bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">Cancel</button>
                <button type="submit" className="flex-1 py-3 text-white font-bold bg-brand-accent hover:bg-blue-600 rounded-xl transition-colors">Schedule Trip</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBusModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-100"><h3 className="text-xl font-bold text-slate-800">Add New Bus</h3></div>
            <form onSubmit={handleCreateBus} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Registration Number</label>
                <input required placeholder="e.g. ABJ-123-XY" value={newBus.registration_number} onChange={e => setNewBus({...newBus, registration_number: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-accent outline-none uppercase" />
              </div>
              <div className="flex space-x-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
                  <input required type="number" value={newBus.capacity} onChange={e => setNewBus({...newBus, capacity: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-accent outline-none" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                  <input placeholder="e.g. Toyota Hiace" value={newBus.model} onChange={e => setNewBus({...newBus, model: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-accent outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Terminal</label>
                <select required value={newBus.terminal_id} onChange={e => setNewBus({...newBus, terminal_id: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-accent outline-none">
                  <option value="">Select terminal...</option>
                  {terminals.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="pt-4 flex space-x-3">
                <button type="button" onClick={() => setShowBusModal(false)} className="flex-1 py-3 text-gray-600 font-medium bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">Cancel</button>
                <button type="submit" className="flex-1 py-3 text-white font-bold bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors">Save Bus</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDriverModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-100"><h3 className="text-xl font-bold text-slate-800">Add New Driver</h3></div>
            <form onSubmit={handleCreateDriver} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input required placeholder="e.g. John Doe" value={newDriver.full_name} onChange={e => setNewDriver({...newDriver, full_name: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-accent outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input required placeholder="e.g. 08012345678" value={newDriver.phone} onChange={e => setNewDriver({...newDriver, phone: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-accent outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">License Number</label>
                <input required placeholder="e.g. LIC-987654" value={newDriver.license_number} onChange={e => setNewDriver({...newDriver, license_number: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-accent outline-none uppercase" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Terminal</label>
                <select required value={newDriver.terminal_id} onChange={e => setNewDriver({...newDriver, terminal_id: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-accent outline-none">
                  <option value="">Select terminal...</option>
                  {terminals.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="pt-4 flex space-x-3">
                <button type="button" onClick={() => setShowDriverModal(false)} className="flex-1 py-3 text-gray-600 font-medium bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">Cancel</button>
                <button type="submit" className="flex-1 py-3 text-white font-bold bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors">Save Driver</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
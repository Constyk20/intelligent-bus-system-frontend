import { useState, useEffect, useMemo } from 'react';
import { 
  Users, UserPlus, CreditCard, Shield, 
  AlertCircle, CheckCircle, Printer, Plane, Clock,
  Search, X, Bus
} from 'lucide-react';
import api from '../services/api';

// Print only the card: hide everything else on the page, then place the card
// at the top-centre of the sheet at the standard bank-card size (85.6 x 54 mm).
const CARD_PRINT_CSS = `
@media print {
  @page { size: A4; margin: 10mm; }
  body * { visibility: hidden !important; }
  .print-area, .print-area * { visibility: visible !important; }
  .print-area {
    position: fixed;
    top: 15mm;
    left: 50%;
    transform: translateX(-50%);
  }
  .bus-card {
    width: 85.6mm !important;
    height: 54mm !important;
    max-width: none !important;
    box-shadow: none !important;
  }
  .print-area * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
`;

// Reusable search input with a clear button
function SearchBar({ value, onChange, placeholder }) {
  return (
    <div className="relative mb-4">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search className="w-4 h-4 text-gray-400" />
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full pl-10 pr-10 py-2.5 text-sm border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-brand-accent focus:border-brand-accent"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// Bus transport card (no balance shown). Used on screen and for printing.
function TransportCard({ cardNumber, holderName, issuedAt }) {
  const issued = issuedAt
    ? new Date(issuedAt).toLocaleDateString(undefined, { month: '2-digit', year: '2-digit' })
    : '';

  return (
    <div
      className="bus-card relative w-full aspect-[85.6/54] rounded-2xl overflow-hidden text-white shadow-xl
                 bg-gradient-to-br from-slate-900 via-blue-900 to-blue-600"
    >
      {/* Decorative shapes */}
      <div className="absolute -right-10 -top-12 w-48 h-48 rounded-full bg-white/10" />
      <div className="absolute -right-4 top-16 w-40 h-40 rounded-full bg-white/5" />
      <div className="absolute -left-12 -bottom-16 w-52 h-52 rounded-full bg-blue-400/20" />
      <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-300 via-white/70 to-blue-300" />

      <div className="relative h-full flex flex-col justify-between p-5">
        {/* Top row: brand + label */}
        <div className="flex items-start justify-between">
          <div className="flex items-center">
            <Bus className="w-6 h-6 mr-2 text-blue-300" />
            <span className="text-lg font-black tracking-widest">Nnenna Otti BUS Terminal</span>
          </div>
          <span className="text-[10px] font-semibold tracking-[0.25em] text-blue-100 mt-1">
            TRANSPORT CARD
          </span>
        </div>

        {/* Chip + card number */}
        <div>
          <div className="w-11 h-8 rounded-md bg-gradient-to-br from-yellow-200 via-yellow-400 to-yellow-600 mb-3 relative overflow-hidden border border-yellow-700/40">
            <div className="absolute inset-x-0 top-1/2 h-px bg-yellow-800/40" />
            <div className="absolute inset-y-0 left-1/3 w-px bg-yellow-800/40" />
            <div className="absolute inset-y-0 left-2/3 w-px bg-yellow-800/40" />
          </div>
          <p className="font-mono text-xl font-bold tracking-[0.18em] drop-shadow">
            {cardNumber}
          </p>
        </div>

        {/* Bottom row: holder + issue date */}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[8px] tracking-[0.2em] text-blue-200">CARD HOLDER</p>
            <p className="text-sm font-bold uppercase tracking-wider truncate">
              {holderName || 'PASSENGER'}
            </p>
          </div>
          {issued && (
            <div className="text-right shrink-0">
              <p className="text-[8px] tracking-[0.2em] text-blue-200">ISSUED</p>
              <p className="text-sm font-bold font-mono">{issued}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Lowercase + strip spaces/dashes so "0801 234-5678" matches "08012345678"
const normalize = (text) => String(text ?? '').toLowerCase().replace(/[\s-]+/g, '');

export default function Passengers() {
  const [passengers, setPassengers] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [terminals, setTerminals] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Search
  const [passengerSearch, setPassengerSearch] = useState('');
  const [staffSearch, setStaffSearch] = useState('');

  // Modals
  const [showPassengerModal, setShowPassengerModal] = useState(false);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);
  
  // State for newly issued card / newly registered passenger
  const [issuedCardData, setIssuedCardData] = useState(null);
  const [newlyRegisteredPassenger, setNewlyRegisteredPassenger] = useState(null);

  // Forms
  const [newPassenger, setNewPassenger] = useState({ full_name: '', phone: '', terminal_id: '' });
  const [newCard, setNewCard] = useState({ passenger_id: '', initial_balance: '5000' });
  const [newStaff, setNewStaff] = useState({ email: '', password: '', full_name: '', role: 'booking_operator', terminal_id: '' });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [passRes, termRes, staffRes, bookingsRes] = await Promise.all([
        api.get('/passengers'),
        api.get('/terminals'),
        api.get('/auth/me'),
        api.get('/bookings') // <-- Fetch all bookings to determine status per passenger
      ]);
      setPassengers(passRes.data);
      setTerminals(termRes.data);
      setStaffList([staffRes.data]); 
      setBookings(bookingsRes.data);
    } catch (err) {
      console.error(err);
      setError('Failed to load passenger data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Helper: get the most recent booking for a passenger
  const getLatestBookingStatus = (passengerId) => {
    const passengerBookings = bookings.filter(b => b.passenger_id === passengerId);
    if (passengerBookings.length === 0) return null;
    // Bookings come pre-sorted by created_at desc
    return passengerBookings[0];
  };

  // Filtered passengers: matches name, phone, or latest booking status
  const filteredPassengers = useMemo(() => {
    const query = normalize(passengerSearch);
    if (!query) return passengers;
    return passengers.filter((p) => {
      const latest = bookings.find((b) => b.passenger_id === p.id);
      return (
        normalize(p.full_name).includes(query) ||
        normalize(p.phone).includes(query) ||
        normalize(latest?.status).includes(query) ||
        normalize(latest?.status?.replace('_', ' ')).includes(query)
      );
    });
  }, [passengers, bookings, passengerSearch]);

  // Filtered staff: matches name, email, or role
  const filteredStaff = useMemo(() => {
    const query = normalize(staffSearch);
    if (!query) return staffList;
    return staffList.filter(
      (s) =>
        normalize(s.full_name).includes(query) ||
        normalize(s.email).includes(query) ||
        normalize(s.role).includes(query) ||
        normalize(s.role?.replace('_', ' ')).includes(query)
    );
  }, [staffList, staffSearch]);

  // Badge renderer based on booking status
  const renderStatusBadge = (status) => {
    if (!status) return null;
    
    const styles = {
      'confirmed': 'bg-yellow-100 text-yellow-700',
      'boarded': 'bg-blue-100 text-blue-700',
      'in_transit': 'bg-indigo-100 text-indigo-700',
      'arrived': 'bg-green-100 text-green-700',
      'cancelled': 'bg-red-100 text-red-700',
      'completed': 'bg-gray-100 text-gray-700',
    };
    const icons = {
      'confirmed': <Clock className="w-3 h-3 mr-1" />,
      'boarded': <Clock className="w-3 h-3 mr-1" />,
      'in_transit': <Plane className="w-3 h-3 mr-1" />,
      'arrived': <CheckCircle className="w-3 h-3 mr-1" />,
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${styles[status] || 'bg-gray-100 text-gray-700'}`}>
        {icons[status]}
        {status.replace('_', ' ')}
      </span>
    );
  };

  // Register passenger then immediately prompt to issue card
  const handleCreatePassenger = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/passengers', newPassenger);
      setShowPassengerModal(false);
      setNewlyRegisteredPassenger(res.data);
      setNewPassenger({ full_name: '', phone: '', terminal_id: '' });
      fetchData();
      setNewCard({ passenger_id: res.data.id, initial_balance: '5000' });
      setShowCardModal(true);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to create passenger');
    }
  };

  // Issue card, then show the printable bus card
  const handleIssueCard = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/cards', newCard);

      // Make sure the card always carries the holder's name
      const holderName =
        res.data.passenger_name ||
        newlyRegisteredPassenger?.full_name ||
        passengers.find((p) => p.id === newCard.passenger_id)?.full_name ||
        '';

      setShowCardModal(false);
      setNewCard({ passenger_id: '', initial_balance: '5000' });
      setNewlyRegisteredPassenger(null);
      setIssuedCardData({ ...res.data, passenger_name: holderName });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to issue card');
    }
  };

  const openCardModalForExisting = (passenger) => {
    setNewlyRegisteredPassenger(passenger);
    setNewCard({ ...newCard, passenger_id: passenger.id });
    setShowCardModal(true);
  };

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/staff', newStaff);
      setShowStaffModal(false);
      setNewStaff({ email: '', password: '', full_name: '', role: 'booking_operator', terminal_id: '' });
      alert("Staff member created successfully!");
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to create staff');
    }
  };

  if (loading && passengers.length === 0 && staffList.length === 0) {
    return <div className="p-8 text-center text-gray-500">Loading directory...</div>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg flex items-center border border-red-100">
          <AlertCircle className="w-5 h-5 mr-2" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Passengers Directory */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-slate-800 flex items-center">
              <Users className="w-6 h-6 mr-2 text-brand-accent" /> Passengers
            </h2>
            <button onClick={() => setShowPassengerModal(true)} className="flex items-center px-4 py-2 bg-brand-accent hover:bg-blue-600 text-white rounded-lg font-medium transition-colors">
              <UserPlus className="w-4 h-4 mr-2" /> Register
            </button>
          </div>

          <SearchBar
            value={passengerSearch}
            onChange={setPassengerSearch}
            placeholder="Search by name, phone or status..."
          />
          {passengerSearch && (
            <p className="text-xs text-gray-500 mb-3">
              Showing {filteredPassengers.length} of {passengers.length} passengers
            </p>
          )}

          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
            {filteredPassengers.map(p => {
              const latestBooking = getLatestBookingStatus(p.id);
              return (
                <div key={p.id} className="flex justify-between items-center p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 flex items-center truncate">
                      {p.full_name}
                      {latestBooking && (
                        <span className="ml-2 shrink-0">
                          {renderStatusBadge(latestBooking.status)}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-500">{p.phone}</p>
                    {latestBooking && latestBooking.status === 'arrived' && (
                      <p className="text-xs text-green-600 mt-1">
                        Arrived at {latestBooking.destination}
                      </p>
                    )}
                    {latestBooking && latestBooking.status === 'in_transit' && (
                      <p className="text-xs text-indigo-600 mt-1">
                        On the way to {latestBooking.destination}
                      </p>
                    )}
                  </div>
                  <button 
                    onClick={() => openCardModalForExisting(p)}
                    className="px-3 py-1.5 bg-green-100 text-green-700 hover:bg-green-200 rounded-lg text-sm font-bold flex items-center transition-colors shrink-0 ml-3"
                  >
                    <CreditCard className="w-4 h-4 mr-1" /> Issue Card
                  </button>
                </div>
              );
            })}
            {passengers.length === 0 && <p className="text-center text-gray-500 py-4">No passengers registered.</p>}
            {passengers.length > 0 && filteredPassengers.length === 0 && (
              <p className="text-center text-gray-500 py-4">
                No passengers match "{passengerSearch}".
              </p>
            )}
          </div>
        </div>

        {/* Staff Directory */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-slate-800 flex items-center">
              <Shield className="w-6 h-6 mr-2 text-indigo-500" /> Staff Members
            </h2>
            <button onClick={() => setShowStaffModal(true)} className="flex items-center px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-medium transition-colors">
              <UserPlus className="w-4 h-4 mr-2" /> Add Staff
            </button>
          </div>

          <SearchBar
            value={staffSearch}
            onChange={setStaffSearch}
            placeholder="Search by name, email or role..."
          />
          {staffSearch && (
            <p className="text-xs text-gray-500 mb-3">
              Showing {filteredStaff.length} of {staffList.length} staff
            </p>
          )}

          <div className="space-y-3">
            {filteredStaff.map(s => (
              <div key={s.id} className="flex justify-between items-center p-3 border border-gray-100 rounded-xl">
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 truncate">{s.full_name}</p>
                  <p className="text-sm text-gray-500 truncate">{s.email}</p>
                </div>
                <span className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded uppercase shrink-0 ml-3">
                  {s.role.replace('_', ' ')}
                </span>
              </div>
            ))}
            {staffList.length > 0 && filteredStaff.length === 0 && (
              <p className="text-center text-gray-500 py-4">
                No staff match "{staffSearch}".
              </p>
            )}
          </div>
        </div>

      </div>

      {/* Register Passenger Modal */}
      {showPassengerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-100"><h3 className="text-xl font-bold text-slate-800">Register Passenger</h3></div>
            <form onSubmit={handleCreatePassenger} className="p-6 space-y-4">
              <input required placeholder="Full Name" value={newPassenger.full_name} onChange={e => setNewPassenger({...newPassenger, full_name: e.target.value})} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-brand-accent" />
              <input required placeholder="Phone Number" value={newPassenger.phone} onChange={e => setNewPassenger({...newPassenger, phone: e.target.value})} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-brand-accent" />
              <select required value={newPassenger.terminal_id} onChange={e => setNewPassenger({...newPassenger, terminal_id: e.target.value})} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-brand-accent">
                <option value="">Select Terminal...</option>
                {terminals.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <div className="pt-4 flex space-x-3">
                <button type="button" onClick={() => setShowPassengerModal(false)} className="flex-1 py-3 text-gray-600 font-medium bg-gray-100 rounded-xl">Cancel</button>
                <button type="submit" className="flex-1 py-3 text-white font-bold bg-brand-accent rounded-xl">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Issue Card Modal */}
      {showCardModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold text-slate-800">Issue Transport Card</h3>
              {newlyRegisteredPassenger && (
                <p className="text-sm text-gray-500 mt-1">
                  To: <span className="font-bold text-brand-accent">{newlyRegisteredPassenger.full_name}</span>
                </p>
              )}
            </div>
            <form onSubmit={handleIssueCard} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Initial Balance (₦)</label>
                <input required type="number" value={newCard.initial_balance} onChange={e => setNewCard({...newCard, initial_balance: e.target.value})} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-brand-accent" />
              </div>
              <div className="pt-4 flex space-x-3">
                <button type="button" onClick={() => { setShowCardModal(false); setNewlyRegisteredPassenger(null); }} className="flex-1 py-3 text-gray-600 font-medium bg-gray-100 rounded-xl">Cancel</button>
                <button type="submit" className="flex-1 py-3 text-white font-bold bg-green-500 rounded-xl">Issue Card</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Card Issued: printable bus card (no balance shown) */}
      {issuedCardData && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <style>{CARD_PRINT_CSS}</style>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-full overflow-y-auto">
            <div className="bg-green-500 p-5 text-white text-center">
              <CheckCircle className="w-12 h-12 mx-auto mb-2" />
              <h2 className="text-xl font-bold">Card Issued Successfully!</h2>
              <p className="text-sm opacity-90">Print the card and hand it to the passenger.</p>
            </div>

            <div className="p-6">
              <div className="print-area">
                <TransportCard
                  cardNumber={issuedCardData.card_number}
                  holderName={issuedCardData.passenger_name}
                  issuedAt={issuedCardData.issued_at}
                />
              </div>

              <p className="text-center text-xs text-gray-500 mt-4">
                Keep this card safe. You will need it to book and board.
              </p>

              <div className="flex space-x-4 mt-6">
                <button 
                  onClick={() => setIssuedCardData(null)}
                  className="flex-1 py-3 border border-gray-300 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
                <button 
                  onClick={() => window.print()}
                  className="flex-1 py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-colors flex items-center justify-center"
                >
                  <Printer className="w-5 h-5 mr-2" /> Print Card
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Staff Modal */}
      {showStaffModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-100"><h3 className="text-xl font-bold text-slate-800">Add Staff Member</h3></div>
            <form onSubmit={handleCreateStaff} className="p-6 space-y-4">
              <input required placeholder="Full Name" value={newStaff.full_name} onChange={e => setNewStaff({...newStaff, full_name: e.target.value})} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-brand-accent" />
              <input required type="email" placeholder="Email Address" value={newStaff.email} onChange={e => setNewStaff({...newStaff, email: e.target.value})} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-brand-accent" />
              <input required type="password" placeholder="Password (min 8 chars)" value={newStaff.password} onChange={e => setNewStaff({...newStaff, password: e.target.value})} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-brand-accent" />
              <select required value={newStaff.role} onChange={e => setNewStaff({...newStaff, role: e.target.value})} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-brand-accent">
                <option value="booking_operator">Booking Operator</option>
                <option value="terminal_admin">Terminal Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
              <div className="pt-4 flex space-x-3">
                <button type="button" onClick={() => setShowStaffModal(false)} className="flex-1 py-3 text-gray-600 font-medium bg-gray-100 rounded-xl">Cancel</button>
                <button type="submit" className="flex-1 py-3 text-white font-bold bg-indigo-500 rounded-xl">Save Staff</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
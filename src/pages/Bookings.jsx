import { useState, useEffect } from 'react';
import { 
  Search, CreditCard, MapPin, CheckCircle, 
  AlertCircle, ArrowRight, Printer, User 
} from 'lucide-react';
import api from '../services/api';

export default function Bookings() {
  // Search state
  const [cardNumber, setCardNumber] = useState('');
  const [cardData, setCardData] = useState(null);
  const [cardError, setCardError] = useState('');
  const [searching, setSearching] = useState(false);

  // Booking state
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState('');

  // Success state (Ticket)
  const [ticket, setTicket] = useState(null);

  // Fetch available routes on mount
  useEffect(() => {
    const fetchRoutes = async () => {
      try {
        const res = await api.get('/routes?active_only=true');
        setRoutes(res.data);
      } catch (err) {
        console.error("Failed to load routes", err);
      }
    };
    fetchRoutes();
  }, []);

  // 1. Identify Card
  const handleSearchCard = async (e) => {
    e.preventDefault();
    if (!cardNumber) return;

    setSearching(true);
    setCardError('');
    setCardData(null);
    setTicket(null);

    try {
      // The backend returns the card with the passenger's name attached
      const res = await api.get(`/cards/${cardNumber.toUpperCase()}`);
      setCardData(res.data);
    } catch (err) {
      setCardError(err.response?.data?.detail || 'Card not found');
    } finally {
      setSearching(false);
    }
  };

  // 2. Process Booking
  const handleBook = async () => {
    if (!cardData || !selectedRoute) return;

    setBookingLoading(true);
    setBookingError('');

    try {
      // Create the booking
      const bookRes = await api.post('/bookings', {
        card_number: cardData.card_number,
        route_id: selectedRoute
      });

      // Once booked, immediately fetch the ticket data so we can print it
      const ticketRes = await api.get(`/tickets/${bookRes.data.ticket_number}`);
      setTicket(ticketRes.data);

      // Reset the selected route and card for the next passenger
      setSelectedRoute('');
      // Note: we keep cardData until they close the ticket, then reset
      
    } catch (err) {
      setBookingError(err.response?.data?.detail || 'Booking failed. Check wallet balance.');
    } finally {
      setBookingLoading(false);
    }
  };

  const handleCloseTicket = () => {
    setTicket(null);
    setCardData(null);
    setCardNumber('');
  };

  // RENDER: Ticket Success Screen
  if (ticket) {
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden mt-8">
        <div className="bg-green-500 p-6 text-white text-center">
          <CheckCircle className="w-16 h-16 mx-auto mb-2" />
          <h2 className="text-2xl font-bold">Booking Successful!</h2>
          <p className="opacity-90">The passenger has been added to the queue.</p>
        </div>
        
        <div className="p-8">
          <div className="flex justify-between items-center mb-8 border-b pb-4">
            <div>
              <p className="text-sm text-gray-500 font-medium">Ticket Number</p>
              <p className="text-xl font-bold font-mono">{ticket.ticket_number}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500 font-medium">Booking Ref</p>
              <p className="text-lg font-bold font-mono text-brand-accent">{ticket.booking_reference}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-8">
            <div>
              <p className="text-sm text-gray-500 font-medium">Passenger</p>
              <p className="text-lg font-bold text-slate-800">{ticket.passenger_name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Route</p>
              <p className="text-lg font-bold text-slate-800">{ticket.origin} <ArrowRight className="inline w-4 h-4"/> {ticket.destination}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Fare Paid</p>
              <p className="text-lg font-bold text-slate-800">₦{parseFloat(ticket.fare).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Status</p>
              <span className="inline-block px-3 py-1 bg-green-100 text-green-700 font-bold rounded-full text-sm uppercase tracking-wider">
                {ticket.status}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center mb-8 bg-gray-50 p-6 rounded-xl border border-dashed border-gray-300">
            <p className="text-sm text-gray-500 mb-3">Scan QR Code for Boarding</p>
            <img 
              src={`data:image/png;base64,${ticket.qr_png_base64}`} 
              alt="Ticket QR Code" 
              className="w-48 h-48"
            />
          </div>

          <div className="flex space-x-4">
            <button 
              onClick={() => window.print()}
              className="flex-1 flex justify-center items-center py-3 px-4 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 font-medium"
            >
              <Printer className="w-5 h-5 mr-2" /> Print Ticket
            </button>
            <button 
              onClick={handleCloseTicket}
              className="flex-1 py-3 px-4 border border-transparent rounded-lg shadow-sm text-white bg-brand-accent hover:bg-blue-600 font-medium"
            >
              Next Passenger
            </button>
          </div>
        </div>
      </div>
    );
  }

  // RENDER: Main Booking Form
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {/* Step 1: Identify Card */}
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center">
          <span className="bg-brand-accent text-white w-8 h-8 rounded-full flex items-center justify-center mr-3 text-sm">1</span>
          Identify Passenger Card
        </h2>
        
        <form onSubmit={handleSearchCard} className="flex space-x-4">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <CreditCard className="h-6 w-6 text-gray-400" />
            </div>
            <input
              type="text"
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              placeholder="Enter Transport Card Number (e.g., TC231109123456)"
              className="w-full pl-12 pr-4 py-4 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-accent focus:border-brand-accent outline-none uppercase"
            />
          </div>
          <button 
            type="submit"
            disabled={searching || !cardNumber}
            className="px-8 py-4 bg-brand text-white rounded-xl font-medium hover:bg-brand-light disabled:opacity-50 flex items-center"
          >
            {searching ? 'Searching...' : <><Search className="w-5 h-5 mr-2" /> Search</>}
          </button>
        </form>

        {cardError && (
          <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg flex items-center border border-red-100">
            <AlertCircle className="w-5 h-5 mr-2" /> {cardError}
          </div>
        )}

        {/* Card Details Result */}
        {cardData && (
          <div className="mt-6 p-6 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center">
            <div className="flex items-center">
              <div className="w-16 h-16 bg-brand text-white rounded-full flex items-center justify-center mr-4 text-2xl font-bold">
                {cardData.passenger_name?.charAt(0) || 'P'}
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-800">{cardData.passenger_name}</h3>
                <p className="text-slate-500 font-mono mt-1">{cardData.card_number}</p>
                <span className={`inline-block mt-2 px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider ${cardData.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  Card {cardData.status}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500 font-medium mb-1">Available Balance</p>
              <p className="text-3xl font-bold text-slate-800">
                ₦{parseFloat(cardData.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Step 2: Select Destination & Book */}
      {cardData && cardData.status === 'active' && (
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center">
            <span className="bg-brand-accent text-white w-8 h-8 rounded-full flex items-center justify-center mr-3 text-sm">2</span>
            Select Destination
          </h2>

          {bookingError && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg flex items-center border border-red-100">
              <AlertCircle className="w-5 h-5 mr-2" /> {bookingError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {routes.map(route => {
              const isAffordable = parseFloat(cardData.balance) >= parseFloat(route.fare);
              return (
                <button
                  key={route.id}
                  onClick={() => setSelectedRoute(route.id)}
                  disabled={!isAffordable}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    selectedRoute === route.id 
                      ? 'border-brand-accent bg-blue-50/50 shadow-sm' 
                      : isAffordable 
                        ? 'border-gray-100 hover:border-blue-200 hover:bg-gray-50' 
                        : 'border-gray-100 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center text-slate-800 font-bold text-lg">
                      <MapPin className="w-5 h-5 mr-2 text-brand-accent" />
                      {route.destination}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-slate-800">₦{parseFloat(route.fare).toLocaleString()}</p>
                      {!isAffordable && <p className="text-xs text-red-500 font-medium mt-1">Insufficient Balance</p>}
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 ml-7">From {route.origin}</p>
                  <p className="text-xs text-gray-400 ml-7 mt-1">Duration: {route.estimated_duration_minutes} mins</p>
                </button>
              );
            })}
          </div>

          <button
            onClick={handleBook}
            disabled={!selectedRoute || bookingLoading}
            className="w-full py-4 text-lg border border-transparent rounded-xl shadow-sm font-bold text-white bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:hover:bg-green-500 transition-colors flex justify-center items-center"
          >
            {bookingLoading ? 'Processing Payment...' : (
              <>
                <CheckCircle className="w-6 h-6 mr-2" /> Confirm & Pay
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
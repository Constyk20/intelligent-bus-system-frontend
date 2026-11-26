import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Users, Bus, MapPin, 
  Ticket, LogOut, Clock, BrainCircuit, Menu, X
} from 'lucide-react';
import { useWebSocket } from '../context/WebSocketContext';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { name: 'Summary', path: '/', icon: LayoutDashboard },
  { name: 'Queue Management', path: '/queues', icon: Clock },
  { name: 'Bookings', path: '/bookings', icon: Ticket },
  { name: 'Fleet & Dispatch', path: '/fleet', icon: Bus },
  { name: 'Routes & Terminals', path: '/routes', icon: MapPin },
  { name: 'Staff & Passengers', path: '/passengers', icon: Users },
  { name: 'AI Scheduling', path: '/intelligence', icon: BrainCircuit },
];

export default function DashboardLayout() {
  const location = useLocation();
  const { isConnected } = useWebSocket();
  const { logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close the drawer whenever the route changes
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Close the drawer with Escape and lock body scroll while it is open (mobile/tablet)
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e) => e.key === 'Escape' && setSidebarOpen(false);
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [sidebarOpen]);

  // If the window grows to desktop size, make sure the drawer state is reset
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = (e) => e.matches && setSidebarOpen(false);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const pageTitle =
    location.pathname === '/'
      ? 'Report Summary'
      : location.pathname.replace('/', '').replace(/-/g, ' ');

  return (
    <div className="flex h-screen h-[100dvh] w-full bg-gray-50 overflow-hidden">
      {/* Mobile/tablet backdrop */}
      <div
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 lg:hidden ${
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Sidebar: off-canvas drawer below lg, static column on lg+ */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-brand text-white flex flex-col
          transform transition-transform duration-300 ease-in-out
          lg:static lg:translate-x-0 lg:shrink-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="h-16 sm:h-20 flex items-center justify-between px-6 border-b border-brand-light shrink-0">
          <div className="flex items-center">
            <Bus className="w-8 h-8 text-brand-accent mr-3" />
            <span className="text-xl font-bold tracking-wider">Nnenna Otti BUS Terminal</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 -mr-2 text-gray-300 hover:text-white rounded-lg"
            aria-label="Close menu"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          <p className="text-xs font-semibold text-gray-400 mb-4 px-2 tracking-wider">REPORT</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center px-4 py-3 rounded-lg transition-colors ${
                  isActive ? 'bg-brand-accent text-white' : 'text-gray-300 hover:bg-brand-light hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5 mr-3 shrink-0" />
                <span className="text-sm font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-brand-light shrink-0">
          <button onClick={logout} className="flex items-center px-4 py-3 w-full text-gray-300 hover:text-white hover:bg-brand-light rounded-lg transition-colors">
            <LogOut className="w-5 h-5 mr-3" />
            <span className="text-sm font-medium">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-16 sm:h-20 bg-white border-b border-gray-200 flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 shrink-0">
          <div className="flex items-center min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 mr-2 text-slate-700 hover:bg-gray-100 rounded-lg"
              aria-label="Open menu"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-slate-800 capitalize truncate">
              {pageTitle}
            </h1>
          </div>
          
          <div className="flex items-center space-x-2 sm:space-x-4 shrink-0">
            {/* Live WebSocket Indicator: label hidden on very small screens */}
            <div
              className="flex items-center text-sm font-medium bg-gray-50 px-2.5 sm:px-3 py-1.5 rounded-lg border border-gray-200"
              title={isConnected ? 'Live System' : 'Disconnected'}
            >
              <span className={`w-2.5 h-2.5 rounded-full sm:mr-2 ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
              <span className="hidden sm:inline text-gray-600">{isConnected ? 'Live System' : 'Disconnected'}</span>
            </div>

            {/* "Today" pill: hidden on mobile */}
            <div className="hidden md:flex items-center bg-gray-100 rounded-lg px-4 py-2 text-sm font-medium text-gray-600">
              <Clock className="w-4 h-4 mr-2" />
              <span>Today</span>
            </div>

            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-brand-accent rounded-full flex items-center justify-center text-white font-bold cursor-pointer">
              A
            </div>
          </div>
        </header>

        {/* Scrollable Page Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
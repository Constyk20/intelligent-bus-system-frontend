import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from './layouts/DashboardLayout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import ProtectedRoute from './components/ProtectedRoute';
import Bookings from './pages/Bookings';
import Queues from './pages/Queues';
import Fleet from './pages/Fleet';
import Intelligence from './pages/Intelligence';
import RoutesPage from './pages/Routes';       // <-- Import Routes
import PassengersPage from './pages/Passengers'; // <-- Import Passengers

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<DashboardLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="bookings" element={<Bookings />} />
            <Route path="queues" element={<Queues />} />
            <Route path="fleet" element={<Fleet />} />
            <Route path="intelligence" element={<Intelligence />} />
            <Route path="routes" element={<RoutesPage />} />      
            <Route path="passengers" element={<PassengersPage />} /> 
          </Route>
        </Route>
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
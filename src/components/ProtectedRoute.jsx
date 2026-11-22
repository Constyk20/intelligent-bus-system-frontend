import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute() {
  const { staff } = useAuth();
  
  if (!staff) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
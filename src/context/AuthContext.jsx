import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [staff, setStaff] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On page refresh, check if we have a token and fetch the user profile
    const fetchUser = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const response = await api.get('/auth/me');
        setStaff(response.data);
      } catch (error) {
        console.error("Session expired or invalid token", error);
        localStorage.removeItem('token');
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, []);

  const login = async (email, password) => {
    // FastAPI's OAuth2PasswordRequestForm expects x-www-form-urlencoded
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);

    const response = await api.post('/auth/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const { access_token, staff: staffData } = response.data;
    localStorage.setItem('token', access_token);
    setStaff(staffData);
    return staffData;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setStaff(null);
  };

  return (
    <AuthContext.Provider value={{ staff, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useAuth } from './AuthContext';
import { WS_URL } from '../services/api';

const WebSocketContext = createContext({ isConnected: false, lastEvent: null });

const MAX_BACKOFF_MS = 15000;

export function WebSocketProvider({ children }) {
  const { staff } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const ws = useRef(null);

  useEffect(() => {
    if (!staff) {
      setIsConnected(false);
      return undefined;
    }

    let stopped = false;
    let attempt = 0;
    let retryTimer = null;

    const connect = () => {
      const token = localStorage.getItem('token');
      if (!token || stopped) return;

      const socket = new WebSocket(`${WS_URL}/ws/operations?token=${encodeURIComponent(token)}`);
      ws.current = socket;

      socket.onopen = () => {
        attempt = 0;
        setIsConnected(true);
      };

      socket.onmessage = (message) => {
        try {
          const data = JSON.parse(message.data);
          if (data.type === 'snapshot' || data.type === 'heartbeat') return;
          // Pages read lastEvent.type / lastEvent.payload. Accept either a bare event
          // or one wrapped as { type: 'event', event: {...} }.
          const evt = data.type === 'event' ? (data.event || data.data || data) : data;
          setLastEvent({ ...evt, type: evt.type === 'event' ? evt.event_type : evt.type, _id: Date.now() + Math.random() });
        } catch (err) {
          console.error('Failed to parse WebSocket message', err);
        }
      };

      socket.onclose = () => {
        setIsConnected(false);
        if (stopped) return;
        // Reconnect with exponential backoff: 1s, 2s, 4s ... up to 15s
        const delay = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);
        attempt += 1;
        retryTimer = setTimeout(connect, delay);
      };

      socket.onerror = () => {
        socket.close(); // onclose schedules the retry
      };
    };

    connect();

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      if (ws.current) ws.current.close();
      ws.current = null;
    };
  }, [staff]);

  return (
    <WebSocketContext.Provider value={{ isConnected, lastEvent }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export const useWebSocket = () => useContext(WebSocketContext);
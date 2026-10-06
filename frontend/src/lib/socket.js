import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

/**
 * Socket.io client singleton instance.
 *
 * Configured with:
 * - WebSocket transport prioritized for real-time low-latency updates
 * - Polling fallback for constrained network environments
 * - withCredentials: true for cross-origin cookie/header support
 * - autoConnect: false to control connection lifecycle tied to document sessions
 */
export const socket = io(SOCKET_URL, {
  autoConnect: false,
  withCredentials: true,
  transports: ['websocket', 'polling'],
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

/**
 * Connect the socket instance if disconnected
 */
export const connectSocket = () => {
  if (!socket.connected) {
    socket.connect();
  }
  return socket;
};

/**
 * Disconnect socket when leaving editor session
 */
export const disconnectSocket = () => {
  if (socket.connected) {
    socket.disconnect();
  }
};

export default socket;


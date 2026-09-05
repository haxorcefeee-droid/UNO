import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useSocketEvents } from './hooks/useSocket';
import ProtectedRoute from './components/auth/ProtectedRoute';
import LoginPage from './components/auth/LoginPage';
import RegisterPage from './components/auth/RegisterPage';
import LobbyPage from './components/lobby/LobbyPage';
import RoomPage from './components/lobby/RoomPage';

function AppRoutes() {
  // Register all socket event listeners at the app level
  useSocketEvents();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route
        path="/lobby"
        element={
          <ProtectedRoute>
            <LobbyPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/room/:roomId"
        element={
          <ProtectedRoute>
            <RoomPage />
          </ProtectedRoute>
        }
      />

      {/* Default redirect */}
      <Route path="/" element={<Navigate to="/lobby" replace />} />
      <Route path="*" element={<Navigate to="/lobby" replace />} />
    </Routes>
  );
}

export default function App() {
  const { loadFromStorage } = useAuthStore();

  useEffect(() => {
    // Restore session from localStorage on app load
    loadFromStorage();
  }, [loadFromStorage]);

  return <AppRoutes />;
}

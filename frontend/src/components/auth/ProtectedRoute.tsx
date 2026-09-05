import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-uno-dark flex items-center justify-center">
        <div className="text-center animate-pulse">
          <div className="uno-logo text-5xl mb-3">
            <span className="text-uno-red">U</span>
            <span className="text-uno-blue">N</span>
            <span className="text-uno-yellow">O</span>
          </div>
          <p className="text-gray-500 text-sm">Loading your game...</p>
        </div>
      </div>
    );
  }

  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

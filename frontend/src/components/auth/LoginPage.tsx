import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, user, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => { if (user) navigate('/lobby'); }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(email, password);
  };

  return (
    <div className="min-h-screen bg-uno-dark flex items-center justify-center p-4">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="uno-logo inline-block mb-1">
            <span className="text-uno-red" style={{ fontSize: 'clamp(3rem,10vw,5rem)' }}>U</span>
            <span className="text-uno-blue" style={{ fontSize: 'clamp(3rem,10vw,5rem)' }}>N</span>
            <span className="text-uno-yellow" style={{ fontSize: 'clamp(3rem,10vw,5rem)' }}>O</span>
          </div>
          <p className="text-gray-500 text-sm">Multiplayer Card Game 🃏</p>
        </div>

        <div className="panel p-5 sm:p-7">
          <h2 className="text-white text-xl font-black mb-5 text-center">Welcome back 👋</h2>

          {error && (
            <div className="bg-red-900/40 border border-red-700/50 text-red-300 rounded-xl
                            px-4 py-3 mb-4 text-sm flex items-start justify-between gap-2 animate-shake">
              <span>❌ {error}</span>
              <button onClick={clearError} className="text-red-400 hover:text-red-200 flex-shrink-0">✕</button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider block mb-1.5">
                Email
              </label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                required className="input" placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider block mb-1.5">
                Password
              </label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                required className="input" placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            <button type="submit" disabled={isLoading} className="btn-primary w-full py-3.5 text-base">
              {isLoading ? '⏳ Signing in...' : 'Sign In 🚀'}
            </button>
          </form>
        </div>

        <p className="text-gray-600 text-sm text-center mt-5">
          No account?{' '}
          <Link to="/register" className="text-uno-yellow hover:underline font-semibold">
            Create one →
          </Link>
        </p>
      </div>
    </div>
  );
}

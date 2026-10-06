import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FileText, LogOut, User as UserIcon, LayoutDashboard } from 'lucide-react';

export const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="h-14 border-b border-slate-800 bg-slate-900/80 backdrop-blur px-4 flex items-center justify-between sticky top-0 z-50">
      {/* Brand Logo */}
      <div className="flex items-center space-x-3">
        <Link
          to={isAuthenticated ? '/dashboard' : '/login'}
          className="flex items-center space-x-2 text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
            <FileText className="w-5 h-5 text-indigo-400" />
          </div>
          <span className="font-bold tracking-tight text-lg text-slate-100">
            Collab<span className="text-indigo-400">Mark</span>
          </span>
        </Link>
      </div>

      {/* User Actions */}
      <div className="flex items-center space-x-4">
        {isAuthenticated ? (
          <>
            <Link
              to="/dashboard"
              className="flex items-center space-x-1.5 text-xs sm:text-sm font-medium text-slate-300 hover:text-white px-3 py-1.5 rounded-md hover:bg-slate-800 transition"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </Link>

            <div className="h-4 w-px bg-slate-800" />

            {/* User Badge */}
            <div className="flex items-center space-x-2 text-xs sm:text-sm text-slate-300 bg-slate-800/60 border border-slate-700/60 px-2.5 py-1 rounded-full">
              <div className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-xs font-semibold">
                {user?.name ? user.name.charAt(0).toUpperCase() : <UserIcon className="w-3 h-3" />}
              </div>
              <span className="max-w-[120px] truncate font-medium text-slate-200">
                {user?.name || user?.email}
              </span>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="flex items-center space-x-1 text-xs sm:text-sm text-slate-400 hover:text-rose-400 px-2.5 py-1.5 rounded-md hover:bg-rose-500/10 transition"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </>
        ) : (
          <div className="flex items-center space-x-3 text-sm">
            <Link
              to="/login"
              className="text-slate-300 hover:text-white px-3 py-1.5 rounded-md hover:bg-slate-800 transition"
            >
              Sign In
            </Link>
            <Link
              to="/register"
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-3.5 py-1.5 rounded-md transition shadow-sm"
            >
              Get Started
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;


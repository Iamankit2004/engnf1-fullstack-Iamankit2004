import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div>
      <header className="navbar">
        <strong>TriageSync</strong>
        <nav className="nav-links">
          <NavLink to="/triage">Triage Queue</NavLink>
          <NavLink to="/resources">Resources</NavLink>
          <NavLink to="/bookings">My Bookings</NavLink>
          {user?.role === 'ADMIN' && <NavLink to="/admin">Admin</NavLink>}
        </nav>
        <div className="nav-links">
          <span className="muted">
            {user?.name} ({user?.role})
          </span>
          <button onClick={logout}>Logout</button>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </div>
  );
}
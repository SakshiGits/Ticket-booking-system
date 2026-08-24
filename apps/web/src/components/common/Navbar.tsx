import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <nav className="sticky top-0 z-40 border-b border-border bg-base/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3.5">
        <Link to="/" className="flex items-center gap-2 font-display text-2xl tracking-wide text-accent">
          <span aria-hidden>🎬</span> TICKETBOOKING
        </Link>

        <div className="flex items-center gap-6 text-sm font-medium text-gray-300">
          {!user && (
            <>
              <Link to="/login" className="hover:text-white transition-colors">
                Log in
              </Link>
              <Link
                to="/register"
                className="rounded-full bg-accent text-black px-4 py-1.5 font-semibold hover:brightness-110 transition"
              >
                Sign up
              </Link>
            </>
          )}
          {user?.role === "CUSTOMER" && (
            <Link to="/my-bookings" className="hover:text-white transition-colors">
              My Bookings
            </Link>
          )}
          {user?.role === "ORGANISER" && (
            <Link to="/organiser" className="hover:text-white transition-colors">
              Organiser Dashboard
            </Link>
          )}
          {user?.role === "ADMIN" && (
            <Link to="/admin" className="hover:text-white transition-colors">
              Venue Admin
            </Link>
          )}
          {user && (
            <div className="flex items-center gap-3 pl-4 border-l border-border">
              <span className="hidden sm:inline text-gray-500">{user.email}</span>
              <button
                className="text-accent2 hover:brightness-110 transition-colors font-semibold"
                onClick={() => {
                  logout();
                  navigate("/");
                }}
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

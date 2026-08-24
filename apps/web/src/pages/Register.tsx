import { useState, FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiErrorMessage } from "../lib/api-client";
import { Role } from "../types";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Public registration is limited to these two roles — admins are provisioned separately.
  const [role, setRole] = useState<Extract<Role, "CUSTOMER" | "ORGANISER">>("CUSTOMER");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(name, email, password, role);
      navigate("/");
    } catch (err) {
      setError(apiErrorMessage(err, "Registration failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-20 px-6">
      <div className="rounded-xl border border-border bg-surface p-7">
        <h1 className="font-display text-3xl tracking-wide text-center mb-1">Join Us</h1>
        <p className="text-center text-sm text-gray-500 mb-6">Create an account to get started</p>
        <form onSubmit={onSubmit} className="space-y-3">
          <input
            className="w-full rounded-lg bg-surface2 border border-border px-4 py-2.5 text-sm placeholder-gray-500 focus:outline-none focus:border-accent transition-colors"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="w-full rounded-lg bg-surface2 border border-border px-4 py-2.5 text-sm placeholder-gray-500 focus:outline-none focus:border-accent transition-colors"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="w-full rounded-lg bg-surface2 border border-border px-4 py-2.5 text-sm placeholder-gray-500 focus:outline-none focus:border-accent transition-colors"
            type="password"
            placeholder="Password (min 8 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          <select
            className="w-full rounded-lg bg-surface2 border border-border px-4 py-2.5 text-sm focus:outline-none focus:border-accent transition-colors"
            value={role}
            onChange={(e) => setRole(e.target.value as "CUSTOMER" | "ORGANISER")}
          >
            <option value="CUSTOMER">Customer — book tickets</option>
            <option value="ORGANISER">Organiser — create events</option>
          </select>
          {error && <p className="text-accent2 text-sm">{error}</p>}
          <button
            disabled={loading}
            className="w-full bg-accent text-black rounded-lg py-2.5 text-sm font-bold hover:brightness-110 transition disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>
      </div>
      <p className="text-sm mt-4 text-gray-500 text-center">
        Already have an account?{" "}
        <Link to="/login" className="text-accent hover:brightness-110">
          Log in
        </Link>
      </p>
    </div>
  );
}

import { useState, FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiErrorMessage } from "../lib/api-client";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(apiErrorMessage(err, "Login failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-20 px-6">
      <div className="rounded-xl border border-border bg-surface p-7">
        <h1 className="font-display text-3xl tracking-wide text-center mb-1">Welcome Back</h1>
        <p className="text-center text-sm text-gray-500 mb-6">Log in to book your next show</p>
        <form onSubmit={onSubmit} className="space-y-3">
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
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-accent2 text-sm">{error}</p>}
          <button
            disabled={loading}
            className="w-full bg-accent text-black rounded-lg py-2.5 text-sm font-bold hover:brightness-110 transition disabled:opacity-50"
          >
            {loading ? "Logging in…" : "Log in"}
          </button>
        </form>
      </div>
      <p className="text-sm mt-4 text-gray-500 text-center">
        No account?{" "}
        <Link to="/register" className="text-accent hover:brightness-110">
          Register
        </Link>
      </p>
    </div>
  );
}

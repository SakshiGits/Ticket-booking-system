import { useEffect, useState, FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, apiErrorMessage } from "../../lib/api-client";

interface VenueOption {
  id: string;
  name: string;
  address: string;
}

export default function CreateShow() {
  const { id: eventId } = useParams();
  const navigate = useNavigate();

  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [venueId, setVenueId] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<VenueOption[]>("/venues/public").then((res) => setVenues(res.data));
  }, []);

  useEffect(() => {
    if (!venueId) return;
    api.get(`/venues/public/${venueId}`).then((res) => {
      setCategories(res.data.categories);
      setPrices(Object.fromEntries(res.data.categories.map((c: string) => [c, ""])));
    });
  }, [venueId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/events/${eventId}/shows`, {
        venueId,
        date,
        time,
        categories: categories.map((name) => ({ name, price: Number(prices[name]) })),
      });
      navigate("/organiser");
    } catch (err) {
      setError(apiErrorMessage(err, "Could not create show"));
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full rounded-lg bg-surface2 border border-border px-4 py-2.5 text-sm placeholder-gray-500 focus:outline-none focus:border-accent transition-colors";

  return (
    <div className="max-w-md mx-auto px-6 py-10">
      <div className="rounded-xl border border-border bg-surface p-7">
        <h1 className="font-display text-2xl tracking-wide mb-5">Add a Show</h1>
        <form onSubmit={onSubmit} className="space-y-3">
          <select className={inputClass} value={venueId} onChange={(e) => setVenueId(e.target.value)} required>
            <option value="">Select venue…</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} — {v.address}
              </option>
            ))}
          </select>

          <div className="flex gap-3">
            <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} required />
            <input type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} required />
          </div>

          {categories.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-300">Pricing per category</p>
              {categories.map((c) => (
                <div key={c} className="flex items-center gap-2">
                  <span className="text-sm w-24 text-gray-400">{c}</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className={`${inputClass} py-1.5 flex-1`}
                    placeholder="Price"
                    value={prices[c]}
                    onChange={(e) => setPrices((p) => ({ ...p, [c]: e.target.value }))}
                    required
                  />
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-accent2 text-sm">{error}</p>}
          <button
            disabled={busy || !venueId}
            className="w-full bg-accent text-black rounded-lg py-2.5 text-sm font-bold hover:brightness-110 transition disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create show"}
          </button>
        </form>
      </div>
    </div>
  );
}

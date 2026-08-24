import { useEffect, useState, FormEvent } from "react";
import { api, apiErrorMessage } from "../../lib/api-client";

interface Venue {
  id: string;
  name: string;
  address: string;
  _count: { seats: number };
}

interface RowInput {
  row: string;
  seatCount: number;
  category: string;
}

export default function VenueBuilder() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [selectedVenue, setSelectedVenue] = useState<string | null>(null);
  const [rows, setRows] = useState<RowInput[]>([{ row: "A", seatCount: 8, category: "Premium" }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api.get<Venue[]>("/venues").then((res) => setVenues(res.data));
  }
  useEffect(load, []);

  async function createVenue(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post("/venues", { name, address });
      setName("");
      setAddress("");
      setSelectedVenue(data.id);
      load();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not create venue"));
    } finally {
      setBusy(false);
    }
  }

  function updateRow(i: number, patch: Partial<RowInput>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function saveLayout() {
    if (!selectedVenue) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/venues/${selectedVenue}/seats`, { rows });
      load();
      alert("Seat layout saved.");
    } catch (err) {
      setError(apiErrorMessage(err, "Could not save layout"));
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full rounded-lg bg-surface2 border border-border px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-accent transition-colors";

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 grid md:grid-cols-2 gap-6">
      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="font-display text-lg tracking-wide mb-3">Venues</h2>
        <ul className="space-y-2 mb-4">
          {venues.map((v) => (
            <li key={v.id}>
              <button
                onClick={() => setSelectedVenue(v.id)}
                className={`w-full text-left text-sm p-2 rounded-lg transition-colors ${
                  selectedVenue === v.id ? "bg-accent/15 text-accent" : "text-gray-300 hover:bg-surface2"
                }`}
              >
                <span className="font-medium">{v.name}</span> — {v._count.seats} seats
              </button>
            </li>
          ))}
        </ul>

        <form onSubmit={createVenue} className="space-y-2 border-t border-border pt-4">
          <input className={inputClass} placeholder="Venue name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input className={inputClass} placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} required />
          <button disabled={busy} className="w-full bg-accent text-black rounded-lg py-2 text-sm font-bold hover:brightness-110 transition disabled:opacity-50">
            + Create venue
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="font-display text-lg tracking-wide mb-3">Seat layout {selectedVenue ? "" : "(select a venue)"}</h2>
        {selectedVenue && (
          <div className="space-y-3">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className={`${inputClass} w-14 px-2 py-1.5`} value={r.row} onChange={(e) => updateRow(i, { row: e.target.value })} />
                <input
                  type="number"
                  min={1}
                  className={`${inputClass} w-20 px-2 py-1.5`}
                  value={r.seatCount}
                  onChange={(e) => updateRow(i, { seatCount: Number(e.target.value) })}
                />
                <input className={`${inputClass} flex-1 px-2 py-1.5`} value={r.category} onChange={(e) => updateRow(i, { category: e.target.value })} />
              </div>
            ))}
            <button
              type="button"
              onClick={() => setRows((prev) => [...prev, { row: String.fromCharCode(65 + prev.length), seatCount: 8, category: "Standard" }])}
              className="text-accent text-sm hover:brightness-110"
            >
              + Add row
            </button>
            {error && <p className="text-accent2 text-sm">{error}</p>}
            <button disabled={busy} onClick={saveLayout} className="w-full bg-accent text-black rounded-lg py-2 text-sm font-bold hover:brightness-110 transition disabled:opacity-50">
              Save layout
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

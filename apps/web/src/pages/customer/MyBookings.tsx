import { useEffect, useMemo, useState } from "react";
import { api, apiErrorMessage } from "../../lib/api-client";
import { Booking } from "../../types";

const TABS = ["Upcoming", "Past", "Cancelled"] as const;
type Tab = (typeof TABS)[number];

export default function MyBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("Upcoming");

  function load() {
    setLoading(true);
    api
      .get<Booking[]>("/bookings")
      .then((res) => setBookings(res.data))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function cancel(id: string) {
    if (!confirm("Cancel this booking? The seat will be released or offered to the waitlist.")) return;
    try {
      await api.post(`/bookings/${id}/cancel`);
      load();
    } catch (err) {
      alert(apiErrorMessage(err, "Could not cancel booking"));
    }
  }

  const counts = useMemo(() => {
    const now = Date.now();
    return {
      Upcoming: bookings.filter((b) => b.status === "CONFIRMED" && new Date(b.show.date).getTime() >= now).length,
      Past: bookings.filter((b) => b.status === "CONFIRMED" && new Date(b.show.date).getTime() < now).length,
      Cancelled: bookings.filter((b) => b.status === "CANCELLED").length,
    };
  }, [bookings]);

  const visible = useMemo(() => {
    const now = Date.now();
    return bookings.filter((b) => {
      if (tab === "Cancelled") return b.status === "CANCELLED";
      if (b.status !== "CONFIRMED") return false;
      const isFuture = new Date(b.show.date).getTime() >= now;
      return tab === "Upcoming" ? isFuture : !isFuture;
    });
  }, [bookings, tab]);

  if (loading) return <p className="text-center mt-16 text-gray-500">Loading…</p>;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="font-display text-3xl tracking-wide mb-6">My Bookings</h1>

      <div className="flex gap-2 mb-6 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? "border-accent text-accent" : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {t} <span className="text-xs text-gray-600">({counts[t]})</span>
          </button>
        ))}
      </div>

      <div className="space-y-5">
        {visible.map((b) => (
          <div key={b.id} className="rounded-xl overflow-hidden border border-border bg-surface flex">
            {b.show.event.posterUrl && (
              <img src={b.show.event.posterUrl} alt="" className="w-24 sm:w-32 object-cover shrink-0" />
            )}
            <div className="flex-1 p-4 sm:p-5 flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                      b.status === "CONFIRMED" ? "bg-seatSelected/20 text-seatSelected" : "bg-gray-700/40 text-gray-500"
                    }`}
                  >
                    {b.status}
                  </span>
                </div>
                <p className="font-semibold text-gray-100">{b.show.event.title}</p>
                <p className="text-sm text-gray-500">
                  {b.show.venue.name} · {new Date(b.show.date).toDateString()} · {b.show.time}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Seats: {b.seats.map((s) => `${s.venueSeat.row}${s.venueSeat.number}`).join(", ")}
                </p>
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                  <span className="font-mono">{b.bookingRef}</span>
                  <span className="font-semibold text-gray-300">₹{b.totalAmount}</span>
                </div>
                {b.status === "CONFIRMED" && new Date(b.show.date).getTime() >= Date.now() && (
                  <button onClick={() => cancel(b.id)} className="text-accent2 text-xs mt-3 hover:brightness-110">
                    Cancel booking
                  </button>
                )}
              </div>

              {b.status === "CONFIRMED" && (
                <div className="shrink-0 flex flex-col items-center justify-center border-t sm:border-t-0 sm:border-l border-dashed border-border pt-3 sm:pt-0 sm:pl-4">
                  {b.qrUrl ? (
                    <img src={b.qrUrl} alt="Booking QR code" className="w-20 h-20 rounded bg-white p-1" />
                  ) : (
                    <div className="w-20 h-20 rounded bg-surface2 flex items-center justify-center text-[10px] text-gray-600 text-center px-1">
                      QR generating…
                    </div>
                  )}
                  <span className="text-[10px] text-gray-600 mt-1">Show at entry</span>
                </div>
              )}
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="text-gray-500 text-center py-16">
            {bookings.length === 0 ? "No bookings yet." : `No ${tab.toLowerCase()} bookings.`}
          </p>
        )}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, apiErrorMessage } from "../../lib/api-client";
import { getSocket } from "../../lib/socket";
import { SeatGrid } from "../../components/seatmap/SeatGrid";
import { SeatMapSeat, ShowDetail } from "../../types";
import { useAuth } from "../../context/AuthContext";

interface HeldState {
  seatIds: string[];
  expiresAt: string;
}

export default function ShowSeatMap() {
  const { id: showId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [show, setShow] = useState<ShowDetail | null>(null);
  const [seats, setSeats] = useState<SeatMapSeat[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [held, setHeld] = useState<HeldState | null>(null);
  const [remainingSec, setRemainingSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const heldRef = useRef<HeldState | null>(null);
  heldRef.current = held;

  useEffect(() => {
    if (!showId) return;
    api.get<ShowDetail>(`/shows/${showId}`).then((res) => setShow(res.data));
    api.get<SeatMapSeat[]>(`/shows/${showId}/seatmap`).then((res) => setSeats(res.data));

    const socket = getSocket();
    socket.emit("show:subscribe", showId);
    const onUpdate = (updates: { showSeatId: string; status: SeatMapSeat["status"] }[]) => {
      setSeats((prev) =>
        prev.map((s) => {
          const u = updates.find((x) => x.showSeatId === s.id);
          return u ? { ...s, status: u.status } : s;
        })
      );
    };
    socket.on("seat:update", onUpdate);

    return () => {
      socket.off("seat:update", onUpdate);
      socket.emit("show:unsubscribe", showId);
      // Best-effort release if the customer navigates away mid-checkout.
      if (heldRef.current) {
        api.post(`/shows/${showId}/release`, { seatIds: heldRef.current.seatIds }).catch(() => {});
      }
    };
  }, [showId]);

  useEffect(() => {
    if (!held) return;
    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(held.expiresAt).getTime() - Date.now()) / 1000));
      setRemainingSec(diff);
      if (diff === 0) setHeld(null);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [held]);

  function toggleSeat(seat: SeatMapSeat) {
    if (held) return; // locked in once holding — release first to change selection
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(seat.id)) next.delete(seat.id);
      else next.add(seat.id);
      return next;
    });
  }

  async function holdSelected() {
    if (!user) return navigate("/login");
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post(`/shows/${showId}/hold`, { seatIds: [...selected] });
      setHeld({ seatIds: [...selected], expiresAt: data.expiresAt });
    } catch (err) {
      setError(apiErrorMessage(err, "Could not hold those seats — try again"));
    } finally {
      setBusy(false);
    }
  }

  async function cancelHold() {
    if (!held) return;
    setBusy(true);
    try {
      await api.post(`/shows/${showId}/release`, { seatIds: held.seatIds });
    } finally {
      setHeld(null);
      setSelected(new Set());
      setBusy(false);
    }
  }

  async function checkout() {
    if (!held) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post("/bookings/checkout", { showId, seatIds: held.seatIds });
      setHeld(null);
      navigate("/my-bookings", { state: { justBooked: data.bookingRef } });
    } catch (err) {
      setError(apiErrorMessage(err, "Checkout failed — your hold may have expired"));
    } finally {
      setBusy(false);
    }
  }

  async function joinWaitlist(categoryId: string) {
    if (!user) return navigate("/login");
    try {
      await api.post(`/waitlist/${showId}/join`, { categoryId });
      alert("You're on the waitlist — we'll email you if a seat opens up.");
    } catch (err) {
      alert(apiErrorMessage(err, "Could not join waitlist"));
    }
  }

  if (!show) return <p className="text-center mt-16 text-gray-500">Loading…</p>;

  const categoriesSoldOut = show.categories.filter(
    (c) => !seats.some((s) => s.category === c.name && s.status === "AVAILABLE")
  );

  const activeIds = held ? held.seatIds : [...selected];
  const activeSeats = seats.filter((s) => activeIds.includes(s.id));
  const total = activeSeats.reduce((sum, s) => sum + Number(s.price), 0);
  const urgent = remainingSec > 0 && remainingSec <= 60;

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 grid md:grid-cols-[1fr_320px] gap-8">
      <div className="rounded-xl bg-surface border border-border p-6">
        <h1 className="font-display text-3xl tracking-wide">{show.event.title}</h1>
        <p className="text-sm text-gray-500 mb-6">
          {show.venue.name} · {new Date(show.date).toDateString()} · {show.time}
        </p>
        <SeatGrid seats={seats} selectedIds={held ? new Set(held.seatIds) : selected} onToggle={toggleSeat} />
      </div>

      <div className="rounded-xl bg-surface border border-border p-6 h-fit space-y-4 sticky top-20">
        <h2 className="font-display text-lg tracking-wide text-gray-200">Your Selection</h2>
        {error && <p className="text-accent2 text-sm">{error}</p>}

        {activeSeats.length > 0 && (
          <div className="space-y-1.5 text-sm border-b border-border pb-3">
            {activeSeats.map((s) => (
              <div key={s.id} className="flex justify-between text-gray-400">
                <span>
                  {s.row}
                  {s.number} · {s.category}
                </span>
                <span>₹{s.price}</span>
              </div>
            ))}
            <div className="flex justify-between font-semibold text-gray-100 pt-1.5">
              <span>Total</span>
              <span>₹{total}</span>
            </div>
          </div>
        )}

        {!held && (
          <>
            <p className="text-sm text-gray-500">{selected.size} seat(s) selected</p>
            <button
              disabled={selected.size === 0 || busy}
              onClick={holdSelected}
              className="w-full bg-accent text-black rounded-lg py-2.5 text-sm font-bold hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Hold Seats
            </button>
          </>
        )}

        {held && (
          <>
            <p className={`text-sm rounded-lg px-3 py-2 ${urgent ? "bg-accent2/15 text-accent2" : "bg-surface2 text-gray-300"}`}>
              {held.seatIds.length} seat(s) held — expires in{" "}
              <span className="font-bold tabular-nums">
                {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, "0")}
              </span>
            </p>
            <button
              disabled={busy}
              onClick={checkout}
              className="w-full bg-accent text-black rounded-lg py-2.5 text-sm font-bold hover:brightness-110 transition disabled:opacity-40"
            >
              Confirm Booking
            </button>
            <button
              disabled={busy}
              onClick={cancelHold}
              className="w-full border border-border rounded-lg py-2.5 text-sm font-medium text-gray-400 hover:border-accent2/50 hover:text-accent2 transition"
            >
              Cancel hold
            </button>
          </>
        )}

        {categoriesSoldOut.length > 0 && (
          <div className="pt-4 border-t border-border">
            <h3 className="text-sm font-medium mb-2 text-gray-300">Sold out — join waitlist</h3>
            {categoriesSoldOut.map((c) => (
              <button
                key={c.id}
                onClick={() => joinWaitlist(c.id)}
                className="w-full text-left text-sm text-accent hover:brightness-110 py-1.5"
              >
                {c.name} (₹{c.price}) — notify me →
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

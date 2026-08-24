import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, apiErrorMessage } from "../../lib/api-client";
import { useAuth } from "../../context/AuthContext";
import { WaitlistOffer as WaitlistOfferType } from "../../types";

export default function WaitlistOfferPage() {
  const { token } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [offer, setOffer] = useState<WaitlistOfferType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<WaitlistOfferType>(`/waitlist/offers/${token}`)
      .then((res) => setOffer(res.data))
      .catch((err) => setError(apiErrorMessage(err, "Offer not found")));
  }, [token]);

  async function complete() {
    if (!user) return navigate("/login");
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post(`/waitlist/offers/${token}/complete`);
      navigate("/my-bookings", { state: { justBooked: data.bookingRef } });
    } catch (err) {
      setError(apiErrorMessage(err, "Could not complete booking — the offer may have expired"));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-center mt-16 text-accent2">{error}</p>;
  if (!offer) return <p className="text-center mt-16 text-gray-500">Loading…</p>;

  const expired = offer.status !== "OFFERED" || (offer.offerExpiresAt && new Date(offer.offerExpiresAt) <= new Date());

  return (
    <div className="max-w-md mx-auto mt-20 px-6">
      <div className="rounded-xl border border-border bg-surface p-7 text-center">
        <h1 className="font-display text-2xl tracking-wide mb-2">A Seat Opened Up 🎉</h1>
        <p className="text-gray-300 mb-1">{offer.show.event.title}</p>
        <p className="text-sm text-gray-500 mb-5">
          {offer.show.venue.name} · {new Date(offer.show.date).toDateString()} {offer.show.time} · {offer.category.name}{" "}
          (₹{offer.category.price})
        </p>

        {expired ? (
          <p className="text-accent2 text-sm">This offer has expired and moved to the next person in line.</p>
        ) : (
          <>
            {!user && (
              <p className="text-sm text-gray-500 mb-3">Log in as the customer this offer was sent to, then come back to this link.</p>
            )}
            <button
              disabled={busy}
              onClick={complete}
              className="w-full bg-accent text-black rounded-lg py-2.5 text-sm font-bold hover:brightness-110 transition disabled:opacity-50"
            >
              {busy ? "Booking…" : "Claim this seat"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

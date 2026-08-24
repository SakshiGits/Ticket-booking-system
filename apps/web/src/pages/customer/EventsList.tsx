import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api-client";
import { EventSummary } from "../../types";
import { EventCard } from "../../components/events/EventCard";

const FILTERS = [
  { label: "All", value: "" },
  { label: "Movies", value: "MOVIE" },
  { label: "Concerts", value: "CONCERT" },
] as const;

const SORTS = [
  { label: "Recommended", value: "recommended" },
  { label: "Rating: High to Low", value: "rating" },
  { label: "Date: Soonest", value: "date" },
  { label: "Name: A–Z", value: "name" },
] as const;

interface VenueOption {
  id: string;
  name: string;
  address: string;
}

/** Cities are stored as the trailing segment of a venue's address, e.g. "Rajajinagar, Bengaluru". */
function cityOf(address: string) {
  const parts = address.split(",");
  return parts[parts.length - 1].trim();
}

export default function EventsList() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [type, setType] = useState<string>("");
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [sort, setSort] = useState<(typeof SORTS)[number]["value"]>("recommended");
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Location filter options — pulled from venues independently of the current event filters,
  // so picking a city never narrows the list of cities you could pick. Public endpoint, so this
  // works for anonymous visitors too.
  useEffect(() => {
    api.get<VenueOption[]>("/venues/public").then((res) => {
      setCities([...new Set(res.data.map((v) => cityOf(v.address)))].sort());
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .get<EventSummary[]>("/events", { params: { type: type || undefined, q: q || undefined, city: city || undefined } })
      .then((res) => setEvents(res.data))
      .finally(() => setLoading(false));
  }, [type, q, city]);

  const sortedEvents = useMemo(() => {
    const copy = [...events];
    switch (sort) {
      case "rating":
        return copy.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      case "date":
        return copy.sort((a, b) => {
          const da = a.shows[0] ? new Date(a.shows[0].date).getTime() : Infinity;
          const db = b.shows[0] ? new Date(b.shows[0].date).getTime() : Infinity;
          return da - db;
        });
      case "name":
        return copy.sort((a, b) => a.title.localeCompare(b.title));
      default:
        return copy;
    }
  }, [events, sort]);

  const heroEvent = events[0];

  return (
    <div>
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-border">
        {heroEvent?.posterUrl && (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-20 blur-sm scale-110"
            style={{ backgroundImage: `url(${heroEvent.posterUrl})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-base/40 via-base to-base" />
        <div className="relative max-w-6xl mx-auto px-6 pt-16 pb-10 text-center">
          <h1 className="font-display text-5xl sm:text-6xl tracking-wide text-white">
            Book Your Next <span className="text-accent">Big Night Out</span>
          </h1>
          <p className="text-gray-400 mt-3 max-w-xl mx-auto">
            Movies and live concerts, seats picked from a real-time map — no surprises at checkout.
          </p>

          <div className="mt-8 max-w-2xl mx-auto flex flex-wrap gap-2 justify-center">
            <input
              className="flex-1 min-w-[220px] rounded-full bg-surface border border-border px-5 py-3 text-sm placeholder-gray-500 focus:outline-none focus:border-accent transition-colors"
              placeholder="Search movies, concerts…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              className="rounded-full bg-surface border border-border px-4 py-3 text-sm text-gray-300 focus:outline-none focus:border-accent transition-colors"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              title="Filter by location"
            >
              <option value="">📍 All locations</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-5 flex flex-wrap justify-center items-center gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setType(f.value)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  type === f.value ? "bg-accent text-black" : "bg-surface border border-border text-gray-300 hover:border-accent/50"
                }`}
              >
                {f.label}
              </button>
            ))}
            <span className="w-px h-5 bg-border mx-1" />
            <select
              className="rounded-full bg-surface border border-border px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-accent transition-colors"
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  Sort: {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-2xl tracking-wide text-gray-200">
            {type === "MOVIE" ? "Now Showing" : type === "CONCERT" ? "Live Events" : "Now Showing & Live Events"}
            {city && <span className="text-accent"> in {city}</span>}
          </h2>
          <span className="text-sm text-gray-500">{!loading && `${sortedEvents.length} result${sortedEvents.length === 1 ? "" : "s"}`}</span>
        </div>

        {loading && <p className="text-gray-500">Loading…</p>}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {sortedEvents.map((ev) => (
            <EventCard key={ev.id} event={ev} />
          ))}
        </div>

        {!loading && sortedEvents.length === 0 && (
          <p className="text-gray-500 text-center py-16">No events found — try a different search or location.</p>
        )}
      </div>
    </div>
  );
}

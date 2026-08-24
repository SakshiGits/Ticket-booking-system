import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api-client";
import { EventSummary } from "../../types";

export default function EventDetail() {
  const { id } = useParams();
  const [event, setEvent] = useState<EventSummary | null>(null);

  useEffect(() => {
    api.get<EventSummary>(`/events/${id}`).then((res) => setEvent(res.data));
  }, [id]);

  if (!event) return <p className="text-center mt-16 text-gray-500">Loading…</p>;

  const showsByDate = event.shows.reduce<Record<string, typeof event.shows>>((acc, s) => {
    const key = new Date(s.date).toDateString();
    (acc[key] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="grid md:grid-cols-[280px_1fr] gap-8">
        <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-surface border border-border shadow-glow">
          {event.posterUrl && <img src={event.posterUrl} alt={event.title} className="w-full h-full object-cover" />}
        </div>

        <div>
          <span className="inline-block rounded-full bg-accent/15 text-accent text-xs font-bold uppercase tracking-wide px-3 py-1">
            {event.type === "MOVIE" ? "Movie" : "Concert"}
          </span>
          <h1 className="font-display text-4xl sm:text-5xl tracking-wide mt-3">{event.title}</h1>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-400 mt-3">
            {typeof event.rating === "number" && <span className="text-accent font-semibold">★ {event.rating.toFixed(1)}</span>}
            {event.genre && <span>{event.genre}</span>}
            {event.language && <span>{event.language}</span>}
            {event.durationMinutes && (
              <span>
                {Math.floor(event.durationMinutes / 60)}h {event.durationMinutes % 60}m
              </span>
            )}
          </div>

          <p className="text-gray-400 mt-4 max-w-2xl leading-relaxed">{event.description}</p>

          <h2 className="font-display text-xl tracking-wide text-gray-200 mt-8 mb-3">Showtimes</h2>
          <div className="space-y-5">
            {Object.entries(showsByDate).map(([date, shows]) => (
              <div key={date}>
                <p className="text-sm text-gray-500 mb-2">{date}</p>
                <div className="flex flex-wrap gap-2.5">
                  {shows.map((show) => (
                    <Link
                      key={show.id}
                      to={`/shows/${show.id}`}
                      className="rounded-lg border border-border bg-surface px-4 py-2.5 hover:border-accent hover:bg-surface2 transition-colors group"
                    >
                      <span className="block text-sm font-semibold group-hover:text-accent">{show.time}</span>
                      <span className="block text-xs text-gray-500">{show.venue.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

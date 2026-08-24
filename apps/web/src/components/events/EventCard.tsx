import { Link } from "react-router-dom";
import { EventSummary } from "../../types";

export function EventCard({ event }: { event: EventSummary }) {
  const nextShow = event.shows[0];

  return (
    <Link
      to={`/events/${event.id}`}
      className="group block rounded-xl overflow-hidden bg-surface border border-border hover:border-accent/60 transition-all hover:shadow-glow hover:-translate-y-1 duration-200"
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-surface2">
        {event.posterUrl ? (
          <img
            src={event.posterUrl}
            alt={event.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : null}
        <div className="absolute top-2 left-2 rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-accent">
          {event.type === "MOVIE" ? "Movie" : "Concert"}
        </div>
        {typeof event.rating === "number" && (
          <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-xs font-semibold text-accent">
            ★ {event.rating.toFixed(1)}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/90 to-transparent" />
      </div>

      <div className="p-3">
        <h3 className="font-semibold text-sm leading-snug line-clamp-2 group-hover:text-accent transition-colors">
          {event.title}
        </h3>
        <p className="text-xs text-gray-500 mt-1 line-clamp-1">
          {event.genre ?? (event.type === "MOVIE" ? "Movie" : "Live event")}
          {event.language ? ` · ${event.language}` : ""}
        </p>
        {nextShow && (
          <p className="text-[11px] text-gray-600 mt-1.5">
            {event.shows.length} showtime{event.shows.length > 1 ? "s" : ""} · {nextShow.venue.name}
          </p>
        )}
      </div>
    </Link>
  );
}

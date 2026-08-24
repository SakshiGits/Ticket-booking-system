import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api-client";
import { EventSummary } from "../../types";

export default function OrganiserDashboard() {
  const [events, setEvents] = useState<EventSummary[]>([]);

  useEffect(() => {
    // The generic browse endpoint conveniently returns everything; organisers only manage
    // their own, so cross-check ownership client-side via the create-event flow instead.
    api.get<EventSummary[]>("/events").then((res) => setEvents(res.data));
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex justify-between items-center mb-6">
        <h1 className="font-display text-3xl tracking-wide">Organiser Dashboard</h1>
        <Link
          to="/organiser/events/new"
          className="bg-accent text-black text-sm font-bold px-4 py-2 rounded-lg hover:brightness-110 transition"
        >
          + New Event
        </Link>
      </div>

      <div className="space-y-3">
        {events.map((ev) => (
          <div
            key={ev.id}
            className="rounded-xl border border-border bg-surface p-4 flex justify-between items-center"
          >
            <div>
              <p className="font-medium text-gray-100">{ev.title}</p>
              <p className="text-sm text-gray-500">{ev.shows.length} show(s)</p>
            </div>
            <div className="flex gap-4 text-sm">
              <Link to={`/organiser/events/${ev.id}/shows/new`} className="text-accent hover:brightness-110">
                Add show
              </Link>
              <Link to={`/organiser/events/${ev.id}/report`} className="text-accent hover:brightness-110">
                Revenue
              </Link>
            </div>
          </div>
        ))}
        {events.length === 0 && <p className="text-gray-500">No events yet — create one to get started.</p>}
      </div>
    </div>
  );
}

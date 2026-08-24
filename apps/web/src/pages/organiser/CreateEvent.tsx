import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiErrorMessage } from "../../lib/api-client";

export default function CreateEvent() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"MOVIE" | "CONCERT">("MOVIE");
  const [description, setDescription] = useState("");
  const [posterUrl, setPosterUrl] = useState("");
  const [genre, setGenre] = useState("");
  const [language, setLanguage] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post("/events", {
        title,
        type,
        description: description || undefined,
        posterUrl: posterUrl || undefined,
        genre: genre || undefined,
        language: language || undefined,
        durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
      });
      navigate(`/organiser/events/${data.id}/shows/new`);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not create event"));
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full rounded-lg bg-surface2 border border-border px-4 py-2.5 text-sm placeholder-gray-500 focus:outline-none focus:border-accent transition-colors";

  return (
    <div className="max-w-md mx-auto px-6 py-10">
      <div className="rounded-xl border border-border bg-surface p-7">
        <h1 className="font-display text-2xl tracking-wide mb-5">New Event</h1>
        <form onSubmit={onSubmit} className="space-y-3">
          <input className={inputClass} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as "MOVIE" | "CONCERT")}>
            <option value="MOVIE">Movie</option>
            <option value="CONCERT">Concert</option>
          </select>
          <textarea className={inputClass} placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <input
            className={inputClass}
            placeholder="Poster image URL (optional)"
            value={posterUrl}
            onChange={(e) => setPosterUrl(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <input className={inputClass} placeholder="Genre" value={genre} onChange={(e) => setGenre(e.target.value)} />
            <input className={inputClass} placeholder="Language" value={language} onChange={(e) => setLanguage(e.target.value)} />
          </div>
          {type === "MOVIE" && (
            <input
              className={inputClass}
              type="number"
              min={1}
              placeholder="Duration (minutes)"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
            />
          )}
          {error && <p className="text-accent2 text-sm">{error}</p>}
          <button disabled={busy} className="w-full bg-accent text-black rounded-lg py-2.5 text-sm font-bold hover:brightness-110 transition disabled:opacity-50">
            {busy ? "Creating…" : "Create event"}
          </button>
        </form>
      </div>
    </div>
  );
}

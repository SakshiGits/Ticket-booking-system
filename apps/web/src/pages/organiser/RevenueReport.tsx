import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api-client";

interface ShowSummary {
  showId: string;
  date: string;
  time: string;
  bookingsCount: number;
  seatsSold: number;
  revenue: number;
}
interface Report {
  title: string;
  totalBookings: number;
  totalRevenue: number;
  shows: ShowSummary[];
}

export default function RevenueReport() {
  const { id } = useParams();
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    api.get<Report>(`/reports/events/${id}/summary`).then((res) => setReport(res.data));
  }, [id]);

  if (!report) return <p className="text-center mt-16 text-gray-500">Loading…</p>;

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="font-display text-3xl tracking-wide mb-1">{report.title}</h1>
      <p className="text-gray-500 mb-6">
        {report.totalBookings} bookings · <span className="text-accent font-semibold">₹{report.totalRevenue.toFixed(2)}</span> total revenue
      </p>

      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-surface2 text-gray-400">
            <tr>
              <th className="p-3 font-medium">Show</th>
              <th className="p-3 font-medium">Bookings</th>
              <th className="p-3 font-medium">Seats sold</th>
              <th className="p-3 font-medium">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {report.shows.map((s) => (
              <tr key={s.showId} className="border-t border-border text-gray-300">
                <td className="p-3">
                  {new Date(s.date).toDateString()} {s.time}
                </td>
                <td className="p-3">{s.bookingsCount}</td>
                <td className="p-3">{s.seatsSold}</td>
                <td className="p-3 text-gray-100 font-medium">₹{s.revenue.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

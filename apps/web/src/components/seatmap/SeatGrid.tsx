import { SeatMapSeat } from "../../types";

interface Props {
  seats: SeatMapSeat[];
  selectedIds: Set<string>;
  onToggle: (seat: SeatMapSeat) => void;
}

const statusClasses: Record<string, string> = {
  AVAILABLE: "bg-seatAvailable text-gray-300 hover:bg-accent/30 hover:text-white cursor-pointer",
  HELD: "bg-seatHeld/80 text-black cursor-not-allowed",
  BOOKED: "bg-seatBooked/70 text-white cursor-not-allowed opacity-70",
};

export function SeatGrid({ seats, selectedIds, onToggle }: Props) {
  const rows = Array.from(new Set(seats.map((s) => s.row))).sort();

  return (
    <div>
      <div className="relative mb-8 flex justify-center">
        <div
          className="h-2 w-3/4 rounded-[50%] bg-gradient-to-r from-transparent via-accent/70 to-transparent"
          style={{ boxShadow: "0 0 30px 4px rgba(245,197,24,0.35)" }}
        />
      </div>
      <p className="text-center text-[11px] tracking-[0.3em] text-gray-500 uppercase mb-6">Screen this way</p>

      <div className="space-y-2 overflow-x-auto no-scrollbar pb-2">
        {rows.map((row) => (
          <div key={row} className="flex items-center gap-2 justify-center min-w-max mx-auto">
            <span className="w-4 text-xs text-gray-500 font-medium">{row}</span>
            <div className="flex gap-1.5">
              {seats
                .filter((s) => s.row === row)
                .sort((a, b) => a.number - b.number)
                .map((seat) => {
                  const selected = selectedIds.has(seat.id);
                  const clickable = seat.status === "AVAILABLE";
                  return (
                    <button
                      key={seat.id}
                      disabled={!clickable && !selected}
                      onClick={() => onToggle(seat)}
                      title={`${seat.row}${seat.number} · ${seat.category} · ₹${seat.price}`}
                      className={`w-7 h-7 rounded-md text-[10px] font-medium flex items-center justify-center transition-all ${
                        selected ? "bg-seatSelected text-black scale-105 shadow-glow" : statusClasses[seat.status]
                      }`}
                    >
                      {seat.number}
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-5 mt-8 text-xs text-gray-400">
        <Legend color="bg-seatAvailable" label="Available" />
        <Legend color="bg-seatHeld" label="Held" />
        <Legend color="bg-seatBooked" label="Booked" />
        <Legend color="bg-seatSelected" label="Selected" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-3 h-3 rounded ${color}`} />
      {label}
    </div>
  );
}

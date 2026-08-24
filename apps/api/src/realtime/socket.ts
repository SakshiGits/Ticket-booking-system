import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { env } from "../config/env";

let io: SocketIOServer | null = null;

export function initSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: env.CLIENT_URL },
  });

  io.on("connection", (socket) => {
    // Clients join a room per show to receive only that show's seat updates.
    socket.on("show:subscribe", (showId: string) => {
      socket.join(roomFor(showId));
    });
    socket.on("show:unsubscribe", (showId: string) => {
      socket.leave(roomFor(showId));
    });
  });

  return io;
}

function roomFor(showId: string) {
  return `show:${showId}`;
}

export type SeatStatusEvent = {
  showSeatId: string;
  status: "AVAILABLE" | "HELD" | "BOOKED";
};

// Called from seat hold / release / booking / waitlist logic to push live seat-map updates.
export function emitSeatUpdate(showId: string, seats: SeatStatusEvent[]) {
  io?.to(roomFor(showId)).emit("seat:update", seats);
}

export type Role = "CUSTOMER" | "ORGANISER" | "ADMIN";
export type SeatStatus = "AVAILABLE" | "HELD" | "BOOKED";

export interface AuthUser {
  id: string;
  role: Role;
  email: string;
}

export interface EventSummary {
  id: string;
  title: string;
  type: "MOVIE" | "CONCERT";
  description?: string;
  posterUrl?: string | null;
  language?: string | null;
  durationMinutes?: number | null;
  genre?: string | null;
  rating?: number | null;
  shows: { id: string; date: string; time: string; venue: { id: string; name: string; address: string } }[];
}

export interface ShowCategory {
  id: string;
  name: string;
  price: string;
}

export interface ShowDetail {
  id: string;
  date: string;
  time: string;
  event: {
    id: string;
    title: string;
    type: string;
    description?: string;
    posterUrl?: string | null;
    language?: string | null;
    durationMinutes?: number | null;
    genre?: string | null;
    rating?: number | null;
  };
  venue: { id: string; name: string; address: string };
  categories: ShowCategory[];
}

export interface SeatMapSeat {
  id: string;
  row: string;
  number: number;
  posX: number;
  posY: number;
  category: string;
  price: string;
  status: SeatStatus;
  holdExpiresAt: string | null;
}

export interface Booking {
  id: string;
  bookingRef: string;
  totalAmount: string;
  status: "CONFIRMED" | "CANCELLED";
  qrUrl: string | null;
  createdAt: string;
  show: { date: string; time: string; event: { title: string; posterUrl?: string | null }; venue: { name: string } };
  seats: { venueSeat: { row: string; number: number }; category: { name: string } }[];
}

export interface WaitlistOffer {
  id: string;
  status: "WAITING" | "OFFERED" | "EXPIRED" | "BOOKED" | "CANCELLED";
  offerToken: string | null;
  offerExpiresAt: string | null;
  offeredSeatId: string | null;
  showId: string;
  show: { event: { title: string }; venue: { name: string }; date: string; time: string };
  category: { name: string; price: string };
}

import { PrismaClient, Role, EventType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;

// Deterministic placeholder "posters" (picsum.photos seeded by slug → same image every seed run).
// Using a generic photo service rather than real studio artwork avoids any poster-rights issue
// while still giving every card a distinct, consistent image for a realistic-looking catalog.
function poster(slug: string) {
  return `https://picsum.photos/seed/${slug}/400/600`;
}

async function main() {
  const passwordHash = await bcrypt.hash("Password123!", 10);

  // Admin is seeded directly — there is no public admin registration endpoint.
  const admin = await prisma.user.upsert({
    where: { email: "admin@ticketbooking.dev" },
    update: {},
    create: { name: "Platform Admin", email: "admin@ticketbooking.dev", passwordHash, role: Role.ADMIN },
  });

  const organiser = await prisma.user.upsert({
    where: { email: "organiser@ticketbooking.dev" },
    update: {},
    create: { name: "Demo Organiser", email: "organiser@ticketbooking.dev", passwordHash, role: Role.ORGANISER },
  });

  const customer = await prisma.user.upsert({
    where: { email: "customer@ticketbooking.dev" },
    update: {},
    create: { name: "Demo Customer", email: "customer@ticketbooking.dev", passwordHash, role: Role.CUSTOMER },
  });

  // Owns the pre-booked "sold" seats scattered across shows, so the seat maps look realistically
  // busy without cluttering the demo customer's own booking history with dozens of single-seat bookings.
  const otherPatron = await prisma.user.upsert({
    where: { email: "other-patron@ticketbooking.dev" },
    update: {},
    create: { name: "Other Patron", email: "other-patron@ticketbooking.dev", passwordHash, role: Role.CUSTOMER },
  });

  // --- Venues (spread across cities so the location filter has something real to filter) ---
  const cinemaBLR = await prisma.venue.create({
    data: { adminId: admin.id, name: "PVR Orion Mall", address: "Rajajinagar, Bengaluru" },
  });
  const cinemaMUM = await prisma.venue.create({
    data: { adminId: admin.id, name: "INOX Megaplex", address: "Malad, Mumbai" },
  });
  const arena = await prisma.venue.create({
    data: { adminId: admin.id, name: "Phoenix Arena", address: "Whitefield, Bengaluru" },
  });

  // Cinemas use only Premium/Standard (matches each movie show's 2 pricing categories).
  await prisma.venueSeat.createMany({ data: seatGrid(cinemaBLR.id, ["A", "B", "C", "D", "E", "F", "G", "H"], 12, 0, 3) });
  await prisma.venueSeat.createMany({ data: seatGrid(cinemaMUM.id, ["A", "B", "C", "D", "E", "F", "G", "H"], 12, 0, 3) });
  // Arena uses VIP/Premium/Standard (matches each concert show's 3 pricing categories).
  await prisma.venueSeat.createMany({ data: seatGrid(arena.id, ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], 14, 2, 3) });

  const cinemaSeatsByVenue = {
    [cinemaBLR.id]: await prisma.venueSeat.findMany({ where: { venueId: cinemaBLR.id } }),
    [cinemaMUM.id]: await prisma.venueSeat.findMany({ where: { venueId: cinemaMUM.id } }),
  };
  const arenaSeats = await prisma.venueSeat.findMany({ where: { venueId: arena.id } });

  // --- Movies ---
  const movies = [
    {
      slug: "inception",
      title: "Inception",
      genre: "Sci-Fi / Thriller",
      language: "English",
      durationMinutes: 148,
      rating: 8.8,
      description: "A thief who steals corporate secrets through dream-sharing technology is given the inverse task of planting an idea into the mind of a CEO.",
    },
    {
      slug: "dune-part-two",
      title: "Dune: Part Two",
      genre: "Sci-Fi / Adventure",
      language: "English",
      durationMinutes: 166,
      rating: 8.6,
      description: "Paul Atreides unites with the Fremen to seek revenge against the conspirators who destroyed his family, while facing a choice between love and the fate of the universe.",
    },
    {
      slug: "the-dark-knight",
      title: "The Dark Knight",
      genre: "Action / Crime",
      language: "English",
      durationMinutes: 152,
      rating: 9.0,
      description: "When the menace known as the Joker wreaks havoc on Gotham, Batman must accept one of the greatest psychological tests of his ability to fight injustice.",
    },
    {
      slug: "oppenheimer",
      title: "Oppenheimer",
      genre: "Biography / Drama",
      language: "English",
      durationMinutes: 180,
      rating: 8.9,
      description: "The story of J. Robert Oppenheimer's role in the development of the atomic bomb during World War II.",
    },
    {
      slug: "spiderverse",
      title: "Spider-Man: Across the Spider-Verse",
      genre: "Animation / Action",
      language: "English",
      durationMinutes: 140,
      rating: 8.7,
      description: "Miles Morales catapults across the multiverse, where he encounters a team of Spider-People charged with protecting its very existence.",
    },
    {
      slug: "interstellar",
      title: "Interstellar",
      genre: "Sci-Fi / Drama",
      language: "English",
      durationMinutes: 169,
      rating: 8.7,
      description: "A team of explorers travel through a wormhole in space in an attempt to ensure humanity's survival as Earth becomes uninhabitable.",
    },
  ];

  for (const [i, m] of movies.entries()) {
    // Alternate cities so movies (and their showtimes) span both — real cross-city browsing.
    const venue = i % 2 === 0 ? cinemaBLR : cinemaMUM;
    const venueSeats = cinemaSeatsByVenue[venue.id];

    const event = await prisma.event.create({
      data: {
        organiserId: organiser.id,
        title: m.title,
        type: EventType.MOVIE,
        description: m.description,
        posterUrl: poster(m.slug),
        language: m.language,
        durationMinutes: m.durationMinutes,
        genre: m.genre,
        rating: m.rating,
      },
    });

    // Two showtimes per movie, spread over the next few days.
    for (const [s, offset] of [[0, 1], [1, 3]] as const) {
      const show = await prisma.show.create({
        data: {
          eventId: event.id,
          venueId: venue.id,
          date: new Date(Date.now() + (i + offset) * DAY),
          time: s === 0 ? "15:30" : "20:00",
        },
      });
      const premium = await prisma.showCategory.create({ data: { showId: show.id, name: "Premium", price: 450 + i * 20 } });
      const standard = await prisma.showCategory.create({ data: { showId: show.id, name: "Standard", price: 250 + i * 10 } });
      await prisma.showSeat.createMany({
        data: venueSeats.map((vs) => ({
          showId: show.id,
          venueSeatId: vs.id,
          categoryId: vs.category === "Premium" ? premium.id : standard.id,
        })),
      });

      // Pre-book a realistic scatter of seats on the first showtime of each movie, owned by
      // "other patrons", so the seat map doesn't look untouched — a handful of separate
      // 1-2 seat bookings rather than one booking per seat.
      if (s === 0) {
        const showSeats = await prisma.showSeat.findMany({
          where: { showId: show.id },
          take: 6 + i,
          include: { category: true },
        });
        for (let k = 0; k < showSeats.length; k += 2) {
          const pair = showSeats.slice(k, k + 2);
          const total = pair.reduce((sum, s) => sum + Number(s.category.price), 0);
          const booking = await prisma.booking.create({
            data: { customerId: otherPatron.id, showId: show.id, totalAmount: total, status: "CONFIRMED" },
          });
          await prisma.showSeat.updateMany({
            where: { id: { in: pair.map((s) => s.id) } },
            data: { status: "BOOKED", bookingId: booking.id },
          });
        }

        // The demo customer gets exactly one real booking, on the very first movie, so
        // "My Bookings" has something to show without being flooded.
        if (i === 0) {
          const mySeats = await prisma.showSeat.findMany({
            where: { showId: show.id, status: "AVAILABLE" },
            take: 2,
            include: { category: true },
          });
          const myTotal = mySeats.reduce((sum, s) => sum + Number(s.category.price), 0);
          const myBooking = await prisma.booking.create({
            data: { customerId: customer.id, showId: show.id, totalAmount: myTotal, status: "CONFIRMED" },
          });
          await prisma.showSeat.updateMany({
            where: { id: { in: mySeats.map((s) => s.id) } },
            data: { status: "BOOKED", bookingId: myBooking.id },
          });
        }
      }
    }
  }

  // --- Concerts ---
  const concerts = [
    {
      slug: "coldplay-live",
      title: "Coldplay: Music of the Spheres",
      genre: "Pop / Rock",
      language: "English",
      description: "Coldplay brings their record-breaking Music of the Spheres World Tour to Bengaluru for one night only.",
    },
    {
      slug: "arijit-singh-live",
      title: "Arijit Singh — Live in Concert",
      genre: "Bollywood / Live",
      language: "Hindi",
      description: "An evening of soulful hits performed live by one of India's most-loved playback singers.",
    },
  ];

  for (const [i, c] of concerts.entries()) {
    const event = await prisma.event.create({
      data: {
        organiserId: organiser.id,
        title: c.title,
        type: EventType.CONCERT,
        description: c.description,
        posterUrl: poster(c.slug),
        language: c.language,
        genre: c.genre,
      },
    });
    const show = await prisma.show.create({
      data: { eventId: event.id, venueId: arena.id, date: new Date(Date.now() + (7 + i * 4) * DAY), time: "19:00" },
    });
    const vip = await prisma.showCategory.create({ data: { showId: show.id, name: "VIP", price: 4500 } });
    const premium = await prisma.showCategory.create({ data: { showId: show.id, name: "Premium", price: 2500 } });
    const standard = await prisma.showCategory.create({ data: { showId: show.id, name: "Standard", price: 1200 } });
    await prisma.showSeat.createMany({
      data: arenaSeats.map((vs) => ({
        showId: show.id,
        venueSeatId: vs.id,
        categoryId: vs.category === "VIP" ? vip.id : vs.category === "Premium" ? premium.id : standard.id,
      })),
    });
  }

  console.log("Seed complete —", movies.length, "movies,", concerts.length, "concerts across 3 venues in 2 cities.");
  console.log("Login with: admin@ticketbooking.dev / organiser@ticketbooking.dev / customer@ticketbooking.dev");
  console.log("Password for all: Password123!");
}

/** Builds a VenueSeat[] input list: `vipRows` front rows are VIP, next `premiumRows` are Premium, rest Standard. */
function seatGrid(venueId: string, rows: string[], seatsPerRow: number, vipRows: number, premiumRows: number) {
  return rows.flatMap((row, rowIdx) =>
    Array.from({ length: seatsPerRow }, (_, i) => ({
      venueId,
      row,
      number: i + 1,
      category: rowIdx < vipRows ? "VIP" : rowIdx < vipRows + premiumRows ? "Premium" : "Standard",
      posX: i,
      posY: rowIdx,
    }))
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { Navbar } from "./components/common/Navbar";
import { ProtectedRoute } from "./components/common/ProtectedRoute";

import Login from "./pages/Login";
import Register from "./pages/Register";
import EventsList from "./pages/customer/EventsList";
import EventDetail from "./pages/customer/EventDetail";
import ShowSeatMap from "./pages/customer/ShowSeatMap";
import MyBookings from "./pages/customer/MyBookings";
import WaitlistOfferPage from "./pages/customer/WaitlistOffer";
import OrganiserDashboard from "./pages/organiser/OrganiserDashboard";
import CreateEvent from "./pages/organiser/CreateEvent";
import CreateShow from "./pages/organiser/CreateShow";
import RevenueReport from "./pages/organiser/RevenueReport";
import VenueBuilder from "./pages/admin/VenueBuilder";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Navbar />
        <Routes>
          <Route path="/" element={<EventsList />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/events/:id" element={<EventDetail />} />
          <Route path="/shows/:id" element={<ShowSeatMap />} />
          <Route path="/waitlist/offers/:token" element={<WaitlistOfferPage />} />

          <Route
            path="/my-bookings"
            element={
              <ProtectedRoute roles={["CUSTOMER"]}>
                <MyBookings />
              </ProtectedRoute>
            }
          />

          <Route
            path="/organiser"
            element={
              <ProtectedRoute roles={["ORGANISER"]}>
                <OrganiserDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organiser/events/new"
            element={
              <ProtectedRoute roles={["ORGANISER"]}>
                <CreateEvent />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organiser/events/:id/shows/new"
            element={
              <ProtectedRoute roles={["ORGANISER"]}>
                <CreateShow />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organiser/events/:id/report"
            element={
              <ProtectedRoute roles={["ORGANISER"]}>
                <RevenueReport />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin"
            element={
              <ProtectedRoute roles={["ADMIN"]}>
                <VenueBuilder />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ReservationsPage from "../app/reservations-page";

createRoot(document.getElementById("root")!).render(
  <StrictMode><ReservationsPage /></StrictMode>,
);

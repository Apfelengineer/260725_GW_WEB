/** さくら静的版の試験室空き状況画面をHTML上のroot要素へ起動します。 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ReservationsPage from "../app/reservations-page";

createRoot(document.getElementById("root")!).render(
  <StrictMode><ReservationsPage /></StrictMode>,
);

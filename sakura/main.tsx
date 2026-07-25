/** さくら静的版のメイン画面をHTML上のroot要素へ起動します。 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);

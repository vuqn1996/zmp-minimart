import React from "react";
import ReactDOM from "react-dom/client";
import "zmp-ui/zaui.css";

import { AppRoot } from "./AppRoot.js";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <AppRoot />
  </React.StrictMode>,
);

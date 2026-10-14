import { App as ZaUIApp, ZMPRouter } from "zmp-ui";

import { App as StoreApp } from "./App.js";

export function AppRoot() {
  return (
    <ZaUIApp theme="light">
      <ZMPRouter memoryRouter>
        <StoreApp />
      </ZMPRouter>
    </ZaUIApp>
  );
}

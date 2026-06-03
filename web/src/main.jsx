import React from "react";
import { createRoot } from "react-dom/client";
import { Auth0Provider } from "@auth0/auth0-react";
import App, { AUTH0, USING_AUTH0, IS_NATIVE } from "./App.jsx";

const style = document.createElement("style");
style.textContent = `
  body { margin: 0; background: #0c0a09; }
  #root { min-height: 100vh; box-sizing: border-box; padding: 24px 12px; }
`;
document.head.appendChild(style);

// When Auth0 env vars are present, wrap the app in the provider; otherwise the app
// uses the mock IdP. useRefreshTokens + localstorage cache give silent refresh and
// session persistence across reloads.
// On native (Capacitor) the app uses CapacitorAuthShell, which manages its own Auth0 client —
// so we skip the web @auth0/auth0-react provider there. Web is unchanged.
const tree = (USING_AUTH0 && !IS_NATIVE) ? (
  <Auth0Provider
    domain={AUTH0.domain}
    clientId={AUTH0.clientId}
    authorizationParams={{ redirect_uri: window.location.origin, audience: AUTH0.audience }}
    useRefreshTokens
    cacheLocation="localstorage"
  >
    <App />
  </Auth0Provider>
) : (
  <App />
);

createRoot(document.getElementById("root")).render(tree);

// PWA service worker: web production only (not the dev server, not the native shell).
if (import.meta.env.PROD && !IS_NATIVE && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

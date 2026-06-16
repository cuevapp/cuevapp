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

// Tokens persist in localStorage so users stay signed in across reloads/restarts. Session
// expiry is handled by Auth0's *idle/absolute timeouts* (Auth0 Dashboard → Settings → Sessions
// + the app's Refresh Token Inactivity Lifetime), not by clearing storage on close — see MOBILE/
// auth notes. On native (Capacitor) the app uses CapacitorAuthShell, so we skip this provider.
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

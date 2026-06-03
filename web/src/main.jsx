import React from "react";
import { createRoot } from "react-dom/client";
import { Auth0Provider } from "@auth0/auth0-react";
import App, { AUTH0, USING_AUTH0 } from "./App.jsx";

const style = document.createElement("style");
style.textContent = `
  body { margin: 0; background: #0c0a09; }
  #root { min-height: 100vh; box-sizing: border-box; padding: 24px 12px; }
`;
document.head.appendChild(style);

// When Auth0 env vars are present, wrap the app in the provider; otherwise the app
// uses the mock IdP. useRefreshTokens + localstorage cache give silent refresh and
// session persistence across reloads.
const tree = USING_AUTH0 ? (
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

// Register the PWA service worker in production builds only (keeps the dev server clean).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

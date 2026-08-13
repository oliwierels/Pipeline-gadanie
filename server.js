/**
 * Pipeline Gadanie — backend dla Conversational AI (ElevenLabs, WebRTC).
 *
 * Rola serwera jest CELOWO minimalna i bezpieczna:
 *   1. Generuje krótkożyciowy token sesji WebRTC (`/api/webrtc-token`).
 *      Dzięki temu klucz API ElevenLabs NIGDY nie trafia do przeglądarki.
 *   2. Serwuje statyczny frontend z katalogu `public/`.
 *   3. Serwuje oficjalny pakiet przeglądarkowy SDK z `node_modules` pod `/vendor`
 *      (brak zależności od zewnętrznego CDN, brak kroku budowania).
 *
 * Nasłuchuje na `process.env.PORT` — wymóg Railway/Nixpacks (`npm start`).
 */

import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import cors from "cors";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

// Zapobiegaj crashowi procesu z powodu niezłapanych błędów asynchronicznych.
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception — serwer kontynuuje działanie:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled promise rejection — serwer kontynuuje działanie:", reason);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Konfiguracja ze zmiennych środowiskowych
// ---------------------------------------------------------------------------

/** Czyta zmienną i obcina najczęstsze śmieci z wklejania (spacje, cudzysłowy). */
function readEnv(name) {
  const raw = process.env[name];
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/^(['"])([\s\S]*)\1$/, "$2").trim();
}

const PORT = process.env.PORT || 3000;
const API_KEY = readEnv("ELEVENLABS_API_KEY").replace(/\s+/g, "");
const AGENT_ID = readEnv("ELEVENLABS_AGENT_ID");
// Opcjonalnie: ogranicz CORS do konkretnego origin (np. https://twoja-domena.up.railway.app).
// Domyślnie odbicie origin żądania (wygodne, bo frontend i tak jest serwowany z tego serwera).
const ALLOWED_ORIGIN = readEnv("ALLOWED_ORIGIN");

// Klucze ElevenLabs mają prefiks "sk_". Sprawdzamy to lokalnie, bo klucz w starym
// formacie (same znaki hex) API odrzuca błędem 400 przy KAŻDYM żądaniu — bez tej
// walidacji w logach ląduje tylko zalew nic nie mówiących błędów.
const configErrors = [];
if (!API_KEY) {
  configErrors.push("ELEVENLABS_API_KEY: brak zmiennej");
} else if (!API_KEY.startsWith("sk_")) {
  configErrors.push(
    `ELEVENLABS_API_KEY: wartość nie zaczyna się od "sk_" (${API_KEY.length} znaków). ` +
      "Klucze w starym formacie nie są już akceptowane — zrotuj klucz w panelu ElevenLabs " +
      "i wklej nową wartość (pokazuje się tylko raz)."
  );
}
if (!AGENT_ID) {
  configErrors.push("ELEVENLABS_AGENT_ID: brak zmiennej");
}

const CONFIG_OK = configErrors.length === 0;

// Świadomie bez `process.exit(1)` — na Railway dałoby to pętlę restartów, w której
// powód awarii przewija się w logach. Serwer żyje i mówi wprost, co poprawić.
const elevenlabs = CONFIG_OK ? new ElevenLabsClient({ apiKey: API_KEY }) : null;

// ---------------------------------------------------------------------------
// Aplikacja Express
// ---------------------------------------------------------------------------

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: ALLOWED_ORIGIN || true }));

// Oficjalny, samowystarczalny bundle przeglądarkowy SDK (IIFE -> window.ElevenLabsClient).
// Serwujemy prosto z node_modules: zawsze zgodny z zainstalowaną wersją, bez CDN i bez bundlera.
app.use(
  "/vendor",
  express.static(
    path.join(__dirname, "node_modules", "@elevenlabs", "client", "dist"),
    { maxAge: "1h" }
  )
);

// Statyczny frontend.
app.use(express.static(path.join(__dirname, "public")));

// Health-check: od razu widać, czy konfiguracja jest poprawna (bez ujawniania klucza).
app.get("/api/health", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(CONFIG_OK ? 200 : 503).json({ ok: CONFIG_OK, errors: configErrors });
});

/** Zamienia błąd z API ElevenLabs na komunikat, z którego wynika, co poprawić. */
function explainTokenError(err) {
  const status = err?.statusCode ?? err?.status;
  const raw = typeof err?.message === "string" ? err.message : "";

  if (status === 401 || /invalid_api_key|must start with/i.test(raw)) {
    return "ElevenLabs odrzucił klucz API. Zrotuj klucz w panelu i ustaw nową wartość „sk_…” w ELEVENLABS_API_KEY.";
  }
  if (status === 403) {
    return "Klucz nie ma uprawnienia ElevenAgents = Zapis (convai_write) albo agent należy do innego konta.";
  }
  if (status === 404) {
    return "Nie znaleziono agenta o podanym ELEVENLABS_AGENT_ID.";
  }
  if (status === 429) {
    return "Przekroczono limit zapytań lub wyczerpano pakiet ElevenLabs.";
  }
  return "Nie udało się pobrać tokenu sesji WebRTC.";
}

/**
 * Mintuje krótkożyciowy token sesji WebRTC dla skonfigurowanego agenta.
 * Frontend przekazuje ten token do `Conversation.startSession({ connectionType: "webrtc", conversationToken })`.
 */
app.get("/api/webrtc-token", async (_req, res) => {
  res.set("Cache-Control", "no-store");

  // Zła konfiguracja: odpowiadamy od razu, bez odpytywania API.
  if (!CONFIG_OK) {
    return res.status(503).json({ error: `Błąd konfiguracji serwera — ${configErrors.join("; ")}` });
  }

  try {
    const response = await elevenlabs.conversationalAi.conversations.getWebrtcToken({
      agentId: AGENT_ID,
    });
    const token = response?.token;
    if (!token) {
      throw new Error("Odpowiedź ElevenLabs nie zawiera pola 'token'.");
    }
    res.json({ token });
  } catch (err) {
    console.error("Nie udało się wygenerować tokenu WebRTC:", err?.message || String(err));
    res.status(502).json({ error: explainTokenError(err) });
  }
});

// Fallback: każde inne żądanie GET (np. odświeżenie SPA-podobnej ścieżki) -> index.html.
app.get(/^(?!\/api\/|\/vendor\/).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const server = app.listen(PORT, () => {
  console.log(`Pipeline Gadanie (WebRTC) nasłuchuje na porcie ${PORT}`);
  console.log(`Agent ID: ${AGENT_ID ? `${AGENT_ID.slice(0, 10)}…` : "(brak)"}`);

  if (!CONFIG_OK) {
    console.error("──────────────────────────────────────────────────────────────");
    console.error("BŁĄD KONFIGURACJI — rozmowa z agentem nie zadziała:");
    for (const problem of configErrors) console.error(`  • ${problem}`);
    console.error("Popraw zmienne (Railway → Variables) i zapisz — redeploy ruszy sam.");
    console.error("──────────────────────────────────────────────────────────────");
  }
});

// Graceful shutdown przy sygnałach Railway/Docker (SIGTERM) i Ctrl+C (SIGINT).
function shutdown(signal) {
  console.log(`[${signal}] Zamykam serwer…`);
  server.close(() => {
    console.log("Serwer zamknięty.");
    process.exit(0);
  });
  // Wymuszony exit po 10 s, jeśli połączenia nie zakończą się same.
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

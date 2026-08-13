# Pipeline Gadanie — agent głosowy (ElevenLabs, WebRTC)

Rozmowa głosowa z agentem ElevenLabs **w czasie rzeczywistym (WebRTC)**, pod kiosk/stoisko:
minimalne opóźnienia i wielowarstwowa ochrona przed sprzężeniem (echo). Wdrożenie na
**Railway** (Nixpacks, `npm start`), bez Dockerfile i bez kroku budowania frontendu.

## Architektura

```
┌──────────────────────────┐          ┌──────────────────────────────┐
│  Przeglądarka (public/)  │   GET    │  Node/Express (server.js)    │
│  ElevenLabs WebRTC SDK   │ ───────▶ │  /api/webrtc-token           │
│                          │  token   │   → getWebrtcToken(agentId)  │
│                          │ ◀─────── │   (klucz API tylko na serwerze)│
└───────────┬──────────────┘          └──────────────────────────────┘
            │ WebRTC (audio) — bezpośrednio do ElevenLabs/LiveKit
            ▼
   🎙️ Mikrofon (DJI)   🔊 Głośnik (Bluetooth)
```

Backend robi jedną rzecz: mintuje **krótkożyciowy token sesji**. Klucz API **nigdy** nie
trafia do przeglądarki. Sam dźwięk płynie bezpośrednio między przeglądarką a ElevenLabs.

## ⚠️ Klucz API — przeczytaj, zanim zaczniesz

To źródło ~100% awarii tego projektu:

- Klucz **musi zaczynać się od `sk_`**. Klucze w starym formacie (same znaki hex, bez
  prefiksu) **nie są już akceptowane**. Klucz, który działał miesiącami, potrafi paść
  z dnia na dzień właśnie z tego powodu.
- Wartości klucza **nie da się odczytać później** — pokazuje się jeden raz, przy tworzeniu
  albo rotacji. To, co widać na liście w panelu, to ID klucza, nie klucz.
- Wymagane uprawnienie: **ElevenAgents = Zapis** (`convai_write`). Resztę zostaw na
  „Brak dostępu" — serwer tylko mintuje tokeny.
- **Nie włączaj ograniczenia po adresie IP** — Railway nie ma stałego IP wychodzącego.
- Uważaj na **limit kredytów** na kluczu: po wyczerpaniu klucz przestaje działać w trakcie.
- **To repozytorium jest publiczne.** Nigdy nie commituj `.env` — ElevenLabs automatycznie
  wyłącza klucze wykryte w publicznych repo. `.gitignore` już to blokuje.

Nowy klucz: ElevenLabs → **API Keys** → **Create API Key** (lub **Rotate**) → skopiuj
wartość natychmiast.

## Konfiguracja

| Zmienna | Wymagana | Opis |
|---|---|---|
| `ELEVENLABS_API_KEY` | ✅ | Klucz API, prefiks `sk_`, uprawnienie ElevenAgents = Zapis. |
| `ELEVENLABS_AGENT_ID` | ✅ | ID agenta Conversational AI (`agent_…`). |
| `PORT` | ➖ | Na Railway wstrzykiwany automatycznie — nie ustawiaj ręcznie. |
| `ALLOWED_ORIGIN` | ➖ | Ogranicza CORS do podanego origin (domyślnie odbija origin żądania). |

## Uruchomienie lokalne

```bash
npm install
cp .env.example .env    # i uzupełnij
npm start               # http://localhost:3000
```

> `getUserMedia` wymaga bezpiecznego kontekstu: `localhost` działa w dev, w sieci potrzebny
> jest HTTPS (Railway zapewnia go automatycznie).

## Wdrożenie na Railway

1. Nowy projekt z tego repozytorium — Nixpacks sam wykryje Node (`npm install`, `npm start`).
2. **Variables**: ustaw `ELEVENLABS_API_KEY` i `ELEVENLABS_AGENT_ID`. Wklejaj **bez
   cudzysłowów i spacji**. `PORT` zostaw w spokoju.
3. Otwórz publiczny URL (HTTPS), zezwól na mikrofon, wybierz urządzenia, kliknij **Start**.

Trzymaj **jedną** usługę na to repo. Dwie usługi z różnych gałęzi to prosta droga do
debugowania nieaktualnego kodu przez kilka dni.

### Egress

Serwer potrzebuje wyjścia na `api.elevenlabs.io`. Przeglądarka łączy się bezpośrednio
z ElevenLabs/LiveKit (WebRTC).

## Diagnostyka

Zacznij zawsze tutaj — endpoint mówi wprost, co jest źle, bez grzebania w logach:

```bash
curl https://<twoja-domena>.up.railway.app/api/health
```

- `{"ok":true,"errors":[]}` — konfiguracja poprawna.
- `503` + opis — brakuje zmiennej albo klucz ma zły format. Serwer w tym stanie **nie
  odpytuje ElevenLabs**, więc logi nie zapychają się powtarzalnymi błędami 400.

Klucz możesz sprawdzić z pominięciem aplikacji:

```bash
curl -s https://api.elevenlabs.io/v1/user -H "xi-api-key: sk_TWOJ_KLUCZ"
```

Kody błędów z `/api/webrtc-token`:

| Kod | Znaczenie |
|---|---|
| `503` | Błąd konfiguracji — patrz `/api/health`. |
| `401` | Klucz nieprawidłowy, odwołany albo w starym formacie. |
| `403` | Brak uprawnienia ElevenAgents = Zapis, albo agent z innego konta. |
| `404` | Nie znaleziono agenta o podanym `ELEVENLABS_AGENT_ID`. |
| `429` | Limit zapytań lub wyczerpany pakiet. |

## Ochrona przed sprzężeniem (echo)

1. **Wymuszone flagi audio**: `echoCancellation`, `noiseSuppression`, `autoGainControl`.
2. **Jawny wybór urządzeń** wejścia i wyjścia, aplikowany po połączeniu przez
   `changeInputDevice` / `changeOutputDevice`.
3. **Trzy tryby mikrofonu**: otwarty mikrofon, auto‑wyciszanie (zalecane — mikrofon milknie,
   gdy bot mówi), push‑to‑talk.
4. **Ręczne wyciszenie** zawsze nadrzędne.
5. **Mierniki poziomu** — wizualne potwierdzenie, że mikrofon milczy, gdy bot mówi.

## Struktura

```
.
├── server.js         # Backend: token WebRTC + serwowanie statyków i SDK
├── package.json      # Skrypty i zależności
├── .env.example      # Wzór konfiguracji
└── public/
    ├── index.html    # UI
    ├── styles.css    # Style
    └── app.js        # WebRTC, wybór urządzeń, tryby mikrofonu, mierniki
```

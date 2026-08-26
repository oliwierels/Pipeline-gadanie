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

## Instalacja na telefonie (Android)

Aplikacja jest **PWA** — instaluje się prosto z przeglądarki, bez sklepu, bez konta
dewelopera i bez pliku APK do rozsyłania.

1. Otwórz adres Railway w **Chrome na telefonie** (musi być HTTPS — Railway daje je sam).
2. Menu ⋮ → **Zainstaluj aplikację** (albo baner „Dodaj do ekranu głównego").
3. Gotowe: ikona w launcherze, start na pełnym ekranie, bez paska adresu.

Na Androidzie Chrome nie robi zwykłego skrótu — generuje **WebAPK**, czyli prawdziwy
pakiet Androida. Aplikacja pojawia się w liście zainstalowanych, ma własne uprawnienia
(mikrofon zapamiętany na stałe) i własne miejsce w przełączniku zadań.

**Aktualizacje idą same.** Wypychasz zmianę na Railway → telefon podnosi ją przy
następnym uruchomieniu. Nic nie trzeba przeinstalowywać.

> iOS: instalacja działa (Safari → Udostępnij → Do ekranu początkowego), ale wybór
> głośnika przez `setSinkId` na iOS nie jest wspierany — wyjście audio wybiera system.

## Aplikacja natywna (APK)

Poza PWA repozytorium buduje **prawdziwy pakiet Androida** (`pl.bots33.robot`)
przez Capacitor. Aplikacja ładuje interfejs z Railway, więc telefon klienta dalej
podnosi aktualizacje zdalnie — bez przeinstalowywania.

### Pobranie

Stały link do najnowszej wersji, można otworzyć wprost na telefonie:

```
https://github.com/oliwierels/Pipeline-gadanie/releases/latest/download/robot-33bots.apk
```

Plik powstaje automatycznie przy każdym pushu na `main` (Actions → **Build APK**).
Można go też zbudować ręcznie: Actions → Build APK → **Run workflow**.

### Instalacja na telefonie

1. Otwórz link powyżej w przeglądarce na telefonie — plik się pobierze.
2. Dotknij pobranego pliku. Android zapyta o zgodę na instalację z nieznanych
   źródeł — zezwól (to jednorazowe, dotyczy przeglądarki, z której pobierasz).
3. Zainstaluj, uruchom, **zezwól na mikrofon** przy pierwszym starcie.

### Zmiana adresu serwera

Adres, spod którego aplikacja ładuje interfejs, siedzi w `capacitor.config.json`.
Można go nadpisać **bez dotykania kodu**:

**Settings → Secrets and variables → Actions → Variables → New variable**
- nazwa: `APP_URL`
- wartość: `https://twoj-adres.up.railway.app`

Potem Actions → Build APK → **Run workflow**. Nowy plik pojawi się pod tym samym linkiem.

> Build jest w wariancie *debug* — instaluje się bez problemu z pliku, ale nie nadaje
> się do publikacji w Google Play. Do sklepu potrzebny byłby wariant *release*
> podpisany własnym keystore.

### Kiedy PWA nie wystarczy

PWA nie ma dostępu do natywnych API Androida. Jeśli kiedyś dojdzie potrzeba
**blokady ekranu przed usypianiem**, **trybu kiosku** (przypięcie aplikacji) albo
**sterowania profilem audio Bluetooth z poziomu systemu** — wtedy dopiero warto opakować
to w **Capacitor** i wydać APK. Dopóki tego nie potrzebujesz, PWA jest prostsze:
zero toolchainu, zero podpisywania, zero przebudowy przy każdej zmianie.

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
    ├── index.html            # UI
    ├── styles.css            # Style
    ├── app.js                # WebRTC, wybór urządzeń, tryby mikrofonu, mierniki
    ├── manifest.webmanifest  # PWA: nazwa, ikony, tryb standalone
    ├── sw.js                 # Service worker (pomija /api/, cache'uje shell)
    └── icons/                # Ikony launchera (zwykłe + maskable)
```

> Po zmianie plików w `public/` podbij `VERSION` w `sw.js` — inaczej telefony mogą
> jeszcze przez chwilę serwować statyki ze starego cache.

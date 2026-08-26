/**
 * Kopiuje przeglądarkowy bundle SDK ElevenLabs do `public/vendor/`.
 *
 * W wersji webowej serwer wystawia ten plik prosto z `node_modules` (patrz trasa
 * `/vendor` w server.js), więc kopia nie jest tam potrzebna. Ale aplikacja natywna
 * ma tylko to, co leży w `public/` — bez tej kopii `<script src="/vendor/lib.iife.js">`
 * nie ma czego wczytać i rozmowa kończy się błędem „nie udało się załadować SDK".
 *
 * Uruchamiane przed `cap sync` (patrz skrypt `sync:android` w package.json).
 */

import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, "node_modules", "@elevenlabs", "client", "dist", "lib.iife.js");
const destDir = path.join(root, "public", "vendor");
const dest = path.join(destDir, "lib.iife.js");

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);

console.log(`SDK skopiowane: ${path.relative(root, dest)}`);

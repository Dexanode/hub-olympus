# PT Olympus Sejahtera

Prototipe dunia PT Olympus Sejahtera. Peta realm adalah ilustrasi pulau terapung tanpa teks di `src/assets/olympus-web3-map.jpg` (2752×1536). Nama tiap dewa tampil di atas spritenya, peran kerjanya ada di papan kecil di sampingnya, dan Zeus bisa berjalan di tangga serta lantai pulau. Sepuluh NPC berjalan di area yang sama.

Hephaestus, Hermes, dan Apollo tetap ada di data agen, tetapi tidak tampil di peta.

## Jalankan lokal

```sh
npm install
npm run dev
```

Buka alamat lokal yang ditampilkan Vite. Untuk membuat build produksi: `npm run build`.

## Struktur

- `src/assets/olympus-web3-map.jpg` — peta pulau tanpa label dan tanpa judul.
- `src/assets/npcs/` — sprite NPC berlatar transparan, dipotong dari lembar karakter.
- `src/App.jsx` — peta, tag nama, papan peran, judul HUD, dan panel agen.
- `src/game/ZeusWorldCharacter.jsx` — gerak Zeus di lantai pulau.
- `src/game/IslandNpcs.jsx` — NPC yang berjalan, berhenti, dan berbalik di pulau.
- `src/game/islandWalk.js` — batas lantai, plus penolakan kolam, lava, dan sungai bawah tanah.
- `legacy.html` — salinan prototipe satu-file sebelumnya, tidak dipakai aplikasi.

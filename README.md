# PT Olympus Bahagia

Prototipe dunia Olympus Web3. Peta realm adalah ilustrasi pulau terapung isometrik di `src/assets/olympus-web3-map.jpg`. React menaruh zona klik pada tujuh ruangan di gambar itu, sprite agen di lantainya, dan Zeus yang bisa berjalan di tangga serta plaza.

Hephaestus, Hermes, dan Apollo tetap ada di data agen, tetapi belum punya ruangan di ilustrasi ini.

## Jalankan lokal

```sh
npm install
npm run dev
```

Buka alamat lokal yang ditampilkan Vite. Untuk membuat build produksi: `npm run build`.

## Struktur

- `src/assets/olympus-web3-map.jpg` — peta ilustrasi Olympus Web3 Agents.
- `src/App.jsx` — peta, zona klik, HUD, dan panel agen.
- `src/game/ZeusWorldCharacter.jsx` — gerak Zeus di lantai pulau.
- `legacy.html` — salinan prototipe satu-file sebelumnya, tidak dipakai aplikasi.

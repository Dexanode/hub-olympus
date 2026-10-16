# PT Olympus Sejahtera

Prototipe dunia PT Olympus Sejahtera. Peta realm adalah ilustrasi pulau terapung tanpa teks di `src/assets/olympus-web3-map.jpg` (2752×1536). Nama tiap dewa tampil di atas spritenya, peran kerjanya ada di papan kecil di sampingnya, dan Zeus bisa berjalan di tangga serta lantai pulau. Sepuluh NPC berjalan di area yang sama.

Hephaestus, Hermes, dan Apollo tetap ada di data agen, tetapi tidak tampil di peta.

## Jalankan lokal

```sh
npm install
cp .env.example .env
npm run dev
```

`npm run dev` menjalankan Vite dan server chat bersama. Vite membuka peta di port 5173 dan meneruskan `/api` ke server chat di port 8787. Kunci model hanya dibaca di server dari `.env` atau environment. Isi salah satu kunci:

- `OPENAI_API_KEY` untuk OpenAI (model bawaan `gpt-4o-mini`)
- `DEEPSEEK_API_KEY` untuk DeepSeek (basis `https://api.deepseek.com`, model bawaan `deepseek-chat`)

Kalau kedua kunci ada, OpenAI yang dipakai, kecuali `LLM_PROVIDER` diset ke `openai` atau `deepseek`. Tanpa kunci, chat Zeus menampilkan pesan yang jelas. `LLM_PROVIDER=mock` membalas tanpa memanggil model, untuk uji lokal.

Bicara dengan Zeus lewat sprite Zeus di peta. Modal dewa lain tidak berubah.

Perintah terpisah: `npm run dev:web` hanya peta, `npm run dev:api` hanya server chat. Setelah `npm run build`, `npm start` menyajikan build dan `POST /api/chat` dari proses yang sama.

## Struktur

- `src/assets/olympus-web3-map.jpg` — peta pulau tanpa label dan tanpa judul.
- `src/assets/npcs/` — sprite NPC berlatar transparan, dipotong dari lembar karakter.
- `src/App.jsx` — peta, tag nama, papan peran, judul HUD, dan panel agen.
- `src/game/ZeusChat.jsx` — percakapan Zeus di dalam modal.
- `server/index.js` — `POST /api/chat` dan `GET /api/health`.
- `server/personas.js` — persona tiap dewa. Zeus aktif; dewa lain tinggal diaktifkan di config ini.
- `server/providers.js` — OpenAI dan DeepSeek, keduanya lewat API yang kompatibel dengan OpenAI.
- `src/game/ZeusWorldCharacter.jsx` — gerak Zeus di lantai pulau.
- `src/game/IslandNpcs.jsx` — NPC yang berjalan, berhenti, dan berbalik di pulau.
- `src/game/islandWalk.js` — batas lantai, plus penolakan kolam, lava, dan sungai bawah tanah.
- `legacy.html` — salinan prototipe satu-file sebelumnya, tidak dipakai aplikasi.

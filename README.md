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

Kalau kedua kunci ada, OpenAI yang dipakai, kecuali `LLM_PROVIDER` diset ke `openai` atau `deepseek`. Tanpa kunci, chat menampilkan pesan yang jelas. `LLM_PROVIDER=mock` membalas tanpa memanggil model, untuk uji lokal.

Klik dewa di peta membuka Olympus Hub di bawah peta dan memilih dewa itu. Modal domain hanya berisi Overview, Activity, dan Controls, plus tombol Open chat yang kembali ke hub.

Hub punya dua bagian dan tiga tinggi: small, half, dan hidden. Kiri adalah roster avatar (Hephaestus, Hermes, dan Apollo tetap disembunyikan). Kanan adalah chat dewa yang dipilih. Layar sempit menaruh roster sebagai strip horizontal di atas chat. Zeus, Demeter, dan Hades online. Dewa lain abu-abu, berlabel coming soon, dan panelnya hanya menampilkan peran. Throne Room Zeus menempel di atas roster: itu satu-satunya utas Zeus, termasuk saat ia mengarahkan pertanyaan ke dewa yang online. Riwayat tiap dewa tersimpan di browser lewat localStorage.

Hades adalah analis onchain. Ia hanya membaca lewat RPC publik (Ethereum, Base, Arbitrum, BSC, Polygon, dan Solana) dan tidak pernah menandatangani transaksi atau menyimpan private key. URL RPC bisa ditimpa lewat `ETH_RPC_URL`, `BASE_RPC_URL`, `ARBITRUM_RPC_URL`, `BSC_RPC_URL`, `POLYGON_RPC_URL`, dan `SOLANA_RPC_URL` (bawaan `https://api.mainnet-beta.solana.com`). Setiap angka, alamat, atau hash yang ia sebut harus berasal dari hasil alat dan dikutip (chain, blok, slot, hash, atau signature Solana, sumber rpc/explorer). Kalau data tidak ada, ia mengatakan tidak tersedia. Baris kecil `onchain lookup` di chat menampilkan nama alat dan argumennya. `ETHERSCAN_API_KEY` hanya untuk riwayat transaksi EVM; tanpa kunci, lookup RPC tetap jalan. Riwayat signature Solana memakai RPC dan tidak butuh kunci itu.

Kalau pertanyaan di utas Demeter butuh data onchain (status transaksi, saldo, cek token atau kontrak), server meminta Hades sekali, menampilkan jawabannya dengan nama dan avatar Hades, lalu Demeter menjelaskan dengan nada dukungan. Pertanyaan "dompet tidak tersambung" tidak memanggil Hades. Throne Room juga mengarahkan pertanyaan onchain ke Hades, paling banyak dua konsultasi per pesan.

Perintah terpisah: `npm run dev:web` hanya peta, `npm run dev:api` hanya server chat. Setelah `npm run build`, `npm start` menyajikan build serta `POST /api/chat`, `POST /api/chat/:agent`, dan `POST /api/room` dari proses yang sama.

## Struktur

- `src/assets/olympus-web3-map.jpg` — peta pulau tanpa label dan tanpa judul.
- `src/assets/npcs/` — sprite NPC berlatar transparan, dipotong dari lembar karakter.
- `src/App.jsx` — peta, tag nama, papan peran, judul HUD, dan panel agen.
- `src/game/OlympusHub.jsx` — hub di bawah peta. Zeus memakai `POST /api/room`. Dewa lain yang online memakai `POST /api/chat/:agent`.
- `src/game/hubState.js` — tinggi hub, riwayat, dan hitungan pesan yang belum dibaca.
- `server/index.js` — `POST /api/chat`, `POST /api/chat/:agent`, `POST /api/room`, dan `GET /api/health`.
- `server/room.js` — Zeus mengarahkan pertanyaan, memanggil paling banyak dua dewa yang aktif, lalu merangkum. Pertanyaan onchain ikut memanggil Hades.
- `server/personas.js` — persona tiap dewa. Zeus, Demeter, dan Hades aktif; dewa lain tinggal diaktifkan di config ini.
- `server/chain.js` — alat baca Hades: saldo native, token EVM dan SPL, transaksi, blok atau slot, serta cek kontrak atau program Solana.
- `server/hades.js` — putaran function calling, paling banyak empat putaran alat per pesan.
- `server/providers.js` — OpenAI dan DeepSeek, keduanya lewat API yang kompatibel dengan OpenAI, termasuk tools.
- `src/game/ZeusWorldCharacter.jsx` — gerak Zeus di lantai pulau.
- `src/game/IslandNpcs.jsx` — NPC yang berjalan, berhenti, dan berbalik di pulau.
- `src/game/islandWalk.js` — batas lantai, plus penolakan kolam, lava, dan sungai bawah tanah.
- `legacy.html` — salinan prototipe satu-file sebelumnya, tidak dipakai aplikasi.

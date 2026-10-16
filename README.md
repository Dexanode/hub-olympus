# PT Olympus Bahagia

Prototipe dunia Olympus Web3 dengan Phaser untuk rendering map dan React untuk antarmuka. Dunia dibuat sebagai pulau terapung isometrik bergaya pixel art, dengan singgasana pusat Zeus dan enam wilayah tematik para dewa.

## Jalankan lokal

```sh
npm install
npm run dev
```

Buka alamat lokal yang ditampilkan Vite. Untuk membuat build produksi: `npm run build`.

## Struktur

- `src/game/OlympusScene.js` — terrain, jalan, landmark, dan singgasana Phaser.
- `src/App.jsx` — HUD, status Zeus, daftar domain, dan chronicle React.
- `src/styles.css` — layout antarmuka.
- `legacy.html` — salinan prototipe kantor satu-file sebelumnya.

Tahap ini berfokus pada map dan lingkungan. Sprite Zeus maupun para dewa belum ditambahkan. Atribut karakter dan interaksi MMORPG akan menyusul setelah layout dunianya disepakati.

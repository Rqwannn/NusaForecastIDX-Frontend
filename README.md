# Frontend Setup (Vue 3 + Tailwind CSS)

Frontend ini memakai:
- Vue 3 + Vite
- Tailwind CSS v3

## Konfigurasi API

```bash
cd Frontend
cp .env.example .env
```

Variabel:
- `VITE_API_BASE_URL` (default `http://localhost:8000`)
- `VITE_WS_BASE_URL` (opsional, auto-derive dari API URL jika kosong)

## Menjalankan Lokal

```bash
cd Frontend
npm install
npm run dev
```

Default dev server: `http://localhost:5173`

## Build Production

```bash
cd Frontend
npm run build
npm run preview
```

## Struktur Penting

- `src/App.vue`: logic playground untuk integrasi HTTP + WebSocket backend.
- `src/style.css`: konfigurasi layer Tailwind (`base`, `components`, `utilities`).
- `tailwind.config.js`: path scanning class Tailwind untuk Vue.
- `src/services/backendApi.js`: wrapper endpoint backend.
- `src/composables/useAgenticSocket.js`: websocket agentic stream.
- `src/composables/useForecastSocket.js`: websocket forecast stream.

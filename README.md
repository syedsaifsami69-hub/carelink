# CareLink — Anonymous care messaging

Full-stack demo: React (Vite + HeroUI + Motion + Tailwind 4) + Node (Express + WebSocket).

## Run
```bash
npm install
npm start        # builds and serves everything on http://localhost:3001
```
Dev mode: `npm run server` in one terminal, `npm run dev` in another (Vite proxies /api and /ws).

## Routes
- `/` landing · `#/staff` reception · `#/doctor` consult room · `#/patient` token gate (demo tokens: A417, K208, M551)

## Design system — "Evergreen Ledger"
Evergreen #0E5F4C · Marigold #E8A33D · Porcelain #F4F6F3 · Ink #161A18.
Type: Bricolage Grotesque / Figtree / Spline Sans Mono. Dark mode via CSS-variable flipping (`.dark`).
Animations: spring-based, transform+opacity only, <300ms, hover guarded by `@media (hover:hover)`, reduced-motion respected.

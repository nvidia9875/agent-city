# Repository Guidelines

## Project Structure & Module Organization
- `app/` holds the Next.js App Router routes and global styles (e.g., `app/page.tsx`, `app/sim`, `app/globals.css`).
- `components/` contains UI components and React Three Fiber scene pieces; 3D simulation code lives in `components/three/`.
- `store/` is the Zustand state store; shared helpers live in `hooks/`, `utils/`, and `types/`.
- `server/` hosts the WebSocket simulation server for authoritative updates.
- `public/` stores static assets; `mocks/` has mock services; `lib/` contains server utilities.
- `infra/` is Terraform; `scripts/mysql/` contains schema/seed scripts.

## Build, Test, and Development Commands
- `npm run dev`: start the Next.js dev server at `http://localhost:3000`.
- `npm run dev:server`: start the WebSocket simulation server.
- `npm run build`: create the production build.
- `npm run start`: run the production server after a build.
- `npm run lint`: run ESLint (Next.js core-web-vitals + TypeScript rules).

## Coding Style & Naming Conventions
- TypeScript strict mode is enabled; keep 2-space indentation.
- React components use PascalCase; hooks use `useX` naming.
- Co-locate files by feature; prefer Tailwind utility classes for styling.
- No dedicated formatter is configured; rely on ESLint and existing patterns.

## Testing Guidelines
- No test framework is configured yet.
- If you add tests, use a clear pattern like `*.test.tsx` and document the new test command in this file.

## Commit & Pull Request Guidelines
- Git history currently only has the initial commit; use short, imperative subjects (e.g., “Add tooltip pinning”).
- PRs should include a brief description, verification steps (e.g., `npm run lint`), and screenshots for UI changes.

## Configuration & Security Notes
- Environment variables live in `.env` (see `.env.example` for required keys).
- Terraform in `infra/` provisions GCP resources; Cloud SQL schema/seed is in `scripts/mysql/`.

## Agent-Specific Instructions
- `AI_CONTEXT.md` documents simulation behavior and integration notes; update it when behavior changes.

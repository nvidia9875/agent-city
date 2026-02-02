# Repository Guidelines

## Project Structure & Module Organization
- `app/` contains the Next.js App Router routes (e.g., `app/page.tsx`, `app/sim`) and global styles in `app/globals.css`.
- `components/` holds UI and R3F scene pieces; `components/three/` is the main 3D simulation layer.
- `store/` is the Zustand state store; `hooks/`, `utils/`, and `types/` provide shared helpers and types.
- `server/` hosts the WebSocket simulation server for authoritative world updates.
- `mocks/` includes mock services (e.g., `mocks/mockWs.ts`); `lib/` hosts server utilities (Vertex AI / Cloud SQL).
- `infra/` contains Terraform, `scripts/mysql/` contains schema/seed scripts, and `public/` stores static assets.

## Build, Test, and Development Commands
- `npm run dev`: start the local dev server at `http://localhost:3000`.
- `npm run dev:server`: start the WebSocket simulation server.
- `npm run build`: create the production build.
- `npm run start`: run the production server after a build.
- `npm run lint`: run ESLint (Next.js core-web-vitals + TypeScript rules).

## Coding Style & Naming Conventions
- TypeScript strict mode is enabled. Keep edits consistent with existing 2-space indentation.
- React components use PascalCase; hooks use `useX` naming; files are co-located by feature.
- Tailwind CSS is used for styling (utility classes in JSX). No dedicated formatter is configured.

## Testing Guidelines
- No test framework is currently configured.
- If you add tests, use a clear pattern like `*.test.tsx` and document the new test command here.

## Commit & Pull Request Guidelines
- Git history only has the initial commit; use short, imperative commit subjects (e.g., “Add tooltip pinning”).
- PRs should include: a brief description, verification steps (e.g., `npm run lint`), and screenshots for UI changes.

## Configuration & Infrastructure
- Environment variables live in `.env` (see `.env.example` for Vertex AI / Cloud SQL keys).
- Terraform in `infra/` provisions GCP resources; Cloud SQL schema/seed live in `scripts/mysql/`.

## Agent-Specific Notes
- `AI_CONTEXT.md` documents simulation behavior and integration notes; update it when behavior changes.

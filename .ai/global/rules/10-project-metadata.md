# Project Metadata

- Project: fudo-ext — control tools built on top of the FUDO point-of-sale API (blind stock counts, shrinkage panel for the owner, exception alerts).
- Stack: Node.js 24, TypeScript 5.7, React 19, Vite 6, Express 4, PostgreSQL 15, Docker, Tailwind CSS 4, shadcn/ui, Vitest, Jest
- Repository layout: backend/, frontend/, docker-compose*.yml, tools/ (Python read-only scripts used by the scheduled GitHub workflow), spec/ (FUDO OpenAPI spec), docs/
- Hosting: Railway — services `backend`, `frontend` (nginx proxies `/api` to the backend over the private network) and PostgreSQL.
- FUDO account access is READ-ONLY by decision: never call FUDO write endpoints (POST/PATCH/DELETE) against a production account. Counts and results are stored in our own database.
- User-facing copy is Spanish (Argentina). Code, rules and skills are English.

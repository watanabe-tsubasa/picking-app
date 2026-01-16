# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
**ユーザーは日本語で話しかけてくるかもしれませんが、返答は英語で良いです。**

## Project Overview

A supermarket picking efficiency measurement app (ネットスーパー売り場でのピッキング効率計測アプリ). Workers record SKU-level timestamps during order picking to measure and analyze efficiency.

## Commands

```bash
# Development
bun install          # Install dependencies
bun run dev          # Start dev server (localhost:5173, HMR enabled)
bun run typecheck    # Generate React Router types + TypeScript check

# Production
bun run build        # Build for production (outputs to ./build/)
bun run start        # Run production server (port 3000)
```

Note: No test framework is configured yet.

## Tech Stack

- **Framework**: React Router v7 (Framework Mode with SSR)
- **Styling**: Tailwind CSS v4
- **Database**: Drizzle ORM with SQLite (dev) / Turso (staging/prod)
- **Tables**: TanStack Table (for dashboard data display)
- **Runtime**: Bun (package manager), Node 20 (production)
- **Deployment**: Docker → Cloud Run

## Architecture

### Data Flow Pattern

This app follows React Router's data flow conventions strictly:

1. **Data fetching**: Always use `loader` functions, never `useEffect` for initial data
2. **Data mutations**: Always use `action` functions with `<Form>` component
3. **Local updates**: Use `useFetcher` for non-navigating mutations
4. **State rule**: `useState` is ONLY for UI state (modals, sidebars), never for form data

### Route Structure

```
/                           # Top menu page
/picking                    # Layout with Outlet
  /picking/register         # Start/resume order measurement
  /picking/pick?order_id=   # Record SKU-level timestamps
/dashboard                  # Layout with Outlet
  /dashboard                # Search filters (date/worker/store)
  /dashboard/result?...     # Results with aggregation (requires from=selector)
/edit                       # Layout with Outlet
  /edit/worker              # Worker CRUD
  /edit/store               # Store CRUD
```

### Database Schema

Four tables: `stores`, `workers`, `orders`, `each_picks`

- Primary keys: INTEGER AUTOINCREMENT (no UUIDs)
- `orders.work_date`: JST-based date string ("YYYY-MM-DD") for efficient date filtering
- `orders.order_number`: "A" + 7 digits, duplicates allowed
- Timestamps stored as ISO strings, null-allowed for flexibility

### Action Patterns

Actions use `_intent` field to distinguish operations:
- `/picking/register`: `create` | `resume`
- `/picking/pick`: `save_each_pick` | `complete_order`
- `/edit/*`: `create` | `update` | `delete`

## Key Design Constraints

1. **Stateless forms**: Form values go directly to action, not held in useState
2. **Responsive split**: `/picking/*` is mobile-first, `/dashboard/*` is PC-first
3. **Frontend aggregation**: Dashboard aggregation (order/worker/each_pick units) computed client-side from raw `each_picks` data
4. **Reducer for display state**: Dashboard's `displayFormat` state uses `useReducer` with testable reducer functions
5. **Direct access prevention**: `/dashboard/result` requires `from=selector` query param
6. **Colocation directory structure**: Use a colocation-based folder structure—route modules, UI components, reducers, and tests are placed together by feature/route (e.g., `routes/picking/*`, `routes/dashboard/*`), avoiding cross-cutting “components-only” directories unless truly shared.


## Path Alias

`~/` maps to `./app/` (configured in tsconfig.json)

```typescript
import { something } from "~/components/Button"  // → ./app/components/Button
```

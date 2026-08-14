# Frontend Application

This directory contains the React single-page application that students and lecturers actually use: an interactive campus map, live classroom status, crowdsourced reporting, schedule-based search, ML availability forecasts, and the admin panel. The interface is in Hebrew and laid out right-to-left.

## Stack

- **React 19 + TypeScript**, bundled with **Vite**
- **Tailwind CSS 4** for styling
- **Leaflet** with **React Leaflet** for the campus map
- **TanStack React Query** for server state and polling, **Axios** for HTTP

## Files & Structure

- **`src/App.tsx`**: The application shell. Holds the session, tab navigation, and all five views (map, search, profile, report, admin).
- **`src/components/CampusMap.tsx`**: The Leaflet map. Aggregates room statuses per building, renders count markers, and handles search fly-to and fullscreen.
- **`src/hooks/`**: One React Query hook per API endpoint, each owning its own cache key and invalidation rules — `useRooms`, `useSearchRooms`, `useSubmitReport`, `usePredictAvailability`, `useUserHistory`, `useAdminUsers`, and the simulation controls.
- **`src/index.css`**: Tailwind entry point plus a few global rules.
- **`src/assets/`**: Logos and static images.
- **`public/`**: Favicons and the app icon served as-is.

## Setup

Configuration files are not kept in Git. Before the first run, create a `.env` file in this directory pointing at the backend:

```
VITE_API_URL=http://127.0.0.1:8000
```

Install the dependencies (first time only):

```bash
npm install
```

## Usage

Start the development server:

```bash
npm run dev
```

The interface opens at http://localhost:5173. The backend must be running in parallel — or set `VITE_API_URL` to the deployed API to work against the cloud instead.

Build the production bundle into `dist/`:

```bash
npm run build
```

This is the same command Render runs on deploy, so a local build failure means the deploy will fail too.

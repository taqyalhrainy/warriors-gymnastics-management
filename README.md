# Warriors Gymnastics Management System

This repository contains a full-stack web application for Warriors Gymnastics, built with React + Vite on the frontend and Node.js + Express + MongoDB on the backend.

## Setup

1. Clone the repository.
2. Create `backend/.env` from `backend/.env.example` and fill in your MongoDB Atlas connection string, JWT secret, and AES encryption key.
3. Create `frontend/.env` from `frontend/.env.example` if you need to override the API endpoint.
4. Install dependencies:
   - `cd backend && npm install`
   - `cd ../frontend && npm install`
5. Seed backend data:
   - `cd backend && npm run seed`

> The `ENCRYPTION_KEY` in `backend/.env` should be a 64 character hexadecimal string (32 bytes) for AES-256-CBC.
6. Run backend and frontend:
   - `cd backend && npm run dev`
   - `cd frontend && npm run dev`

## Environment variables

backend/.env example:

```env
MONGO_URI=your_mongodb_atlas_connection_string
MONGODB_URI=your_mongodb_atlas_connection_string
JWT_SECRET=your_jwt_secret
ENCRYPTION_KEY=your_64_character_hex_string
CLIENT_URL=http://localhost:5173
PORT=5000
```

frontend/.env example:

```env
VITE_API_URL=http://localhost:5000/api
```

## Features

- Role-based authentication: admin, coach, receptionist, parent
- JWT authentication with protected routes
- Secure password hashing with bcrypt
- Audit log recording for key actions
- Player, attendance, subscription, payments, notifications, and audit log management
- Parent portal for child subscription, attendance, and payment views

## PWA / Install App / Club Media

The frontend is configured as an installable PWA using `frontend/public/manifest.webmanifest`, `frontend/public/sw.js`, iOS home-screen meta tags, and a shared React source for browser and installed app modes.

- Android and supported desktop browsers use `beforeinstallprompt`. The install prompt is stored and shown only after the user clicks `Install App`.
- iPhone and iPad cannot be installed programmatically. The install button shows Add to Home Screen instructions: Share, Add to Home Screen, Add.
- Unsupported desktop browsers show a QR code generated from the current public origin so the visitor can scan the live website with a phone. Localhost is not hardcoded.
- The service worker caches only the public app shell and static same-origin assets. It does not cache `/api` requests, so private dashboard, attendance, payment, and authentication data continue to come from the server.
- A SPA fallback file is included at `frontend/public/_redirects`. Production hosting should also have a rewrite rule from all non-API routes to `index.html`.

Admins can manage public club media from `Media Gallery` in the existing admin navigation. Backend authorization is enforced on `/api/club-media` with the admin role. Public visitors only receive active public fields from `GET /api/club-media/public`.

Media storage notes:

- Existing player photos are stored as compressed image data strings, and the media manager supports the same pattern for small images.
- Video files are not stored on local server disk or inside MongoDB. Add videos using persistent `http(s)` URLs from a durable storage provider.
- Supported image formats: JPEG, PNG, WebP.
- Supported video URL formats: MP4, WebM, MOV, M4V.
- Image data URL limit: 4 MB after browser compression.
- Backend request body limit: 5 MB.
- Do not store Cloudinary, S3, Firebase, or other storage secrets in frontend JavaScript. If external storage is added later, keep credentials in backend environment variables.

No new required environment variables were added. Optional production media storage variables depend on the provider you choose later, for example:

```env
MEDIA_STORAGE_PROVIDER=cloudinary
MEDIA_STORAGE_CLOUD_NAME=
MEDIA_STORAGE_API_KEY=
MEDIA_STORAGE_API_SECRET=
```

## Project Structure

- `backend/`: Express API server
- `frontend/`: React + Vite app


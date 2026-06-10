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

## Project Structure

- `backend/`: Express API server
- `frontend/`: React + Vite app


# CollabEditor Backend

The real-time collaborative markdown editor backend powered by Node.js, Express, Socket.io, and MongoDB (Mongoose).

---

## Features

- **JWT Authentication**: Secure user registration, login, and token-based API authentication.
- **Document Management**: Full CRUD operations for markdown documents with owner and collaborator permission controls.
- **Collaborator Sharing**: Share documents with other users via email address.
- **Real-Time Collaboration**: Sub-millisecond broadcast of keystrokes and cursor positions using Socket.io WebSocket rooms (`doc:${documentId}`).
- **Debounced MongoDB Persistence**: Throttled document saving (at most once every 2 seconds or immediately upon last collaborator departure) to prevent database write amplification.
- **Cross-Origin Security**: Configured CORS policies restricting cross-origin REST and WebSocket traffic to trusted clients with credentials support.

---

## Architecture & Design Concepts

### 1. JWT Authentication Flow
1. **Login/Register**: Client submits credentials to `/api/auth/register` or `/api/auth/login`.
2. **Token Generation**: The server signs a payload `{ id, email, name }` with a secret key (`JWT_SECRET`) and a 7-day expiration.
3. **Transmission**: The client stores the token in `localStorage` and provides it in HTTP `Authorization: Bearer <token>` headers for REST requests, and inside `doc:join` for real-time WebSocket room authorization.
4. **Validation**: Protected endpoints run the `authenticateJWT` middleware, validating the signature and populating `req.user`.

### 2. Socket.io Room Management
- Each document represents an isolated room: `doc:${documentId}`.
- When a user joins via `doc:join`, the server verifies the user's JWT and validates that the user is the document owner or an invited collaborator.
- The server maintains an in-memory presence map (`roomPresence`), tracking active sockets, user identities, and color assignments.
- Whenever users connect or disconnect, updated presence lists are broadcasted to the room.

### 3. Debounced MongoDB Persistence
- Rather than executing expensive database write queries on every single keystroke, the server buffers the latest document content in an in-memory map (`pendingSaves`).
- Writes are debounced to **at most once every 2 seconds** per document.
- When the last active user in a room disconnects, any pending debounced save is flushed immediately to MongoDB to prevent data loss.

### 4. Conflict Handling Strategy (Last-Write-Wins vs OT / CRDT)
- **Current Demo Implementation**: Last-Write-Wins (LWW) on the entire document string. The latest edit received by the server replaces prior content.
- **Limitation**: LWW is suitable for demos or single-section edits, but in production, concurrent edits to different lines could overwrite each other.
- **Production Alternatives**:
  - **Operational Transformation (OT)**: Centralized sequencing and operation transformation (used by Google Docs).
  - **Conflict-free Replicated Data Types (CRDTs)**: Mathematically provable convergence via libraries like **Yjs** or **Automerge**, ideal for decentralized and P2P collaborative text editing.

---

## Environment Variables

Create a `.env` file in the `backend/` directory based on `.env.example`:

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `PORT` | Port number for Express and Socket.io server | `3001` |
| `MONGO_URI` | MongoDB connection URI | `mongodb://127.0.0.1:27017/collab_editor` |
| `JWT_SECRET` | Secret key used to sign JWT tokens | `your_secure_random_jwt_secret` |
| `CLIENT_URL` | Allowed frontend origin for CORS | `http://localhost:5173` |

---

## API Endpoints

### Authentication (`/api/auth`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public | Register new user account (`name`, `email`, `password`) |
| `POST` | `/api/auth/login` | Public | Authenticate user credentials (`email`, `password`) |
| `GET` | `/api/auth/me` | Protected | Get profile of currently authenticated user |

### Documents (`/api/documents`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/documents` | Protected | List all documents owned by or shared with current user |
| `POST` | `/api/documents` | Protected | Create a new document (`title`, `content`) |
| `GET` | `/api/documents/:id` | Protected | Fetch a document by ID (owner or collaborator only) |
| `PUT` | `/api/documents/:id` | Protected | Update document title or content snapshot |
| `DELETE`| `/api/documents/:id` | Protected | Delete document (owner only) |
| `POST` | `/api/documents/:id/share` | Protected | Invite collaborator by email (`{ email }`) |

---

## Socket.io Real-Time Events

### Client $\to$ Server
- `doc:join`: `{ documentId, token }` - Join the document room.
- `doc:edit`: `{ documentId, content, cursorPosition }` - Broadcast content edit and trigger debounced save.
- `doc:cursor`: `{ documentId, cursorPosition }` - Broadcast cursor movement.

### Server $\to$ Client
- `doc:joined`: `{ documentId, collaborators, currentUser }` - Join confirmation with initial room state.
- `doc:update`: `{ documentId, content, cursorPosition, sender }` - Broadcasted edit from another user.
- `doc:cursor:update`: `{ userId, name, color, cursorPosition }` - Broadcasted cursor position.
- `doc:presence`: `{ collaborators }` - Updated list of active users in the room.
- `doc:error`: `{ message }` - Socket error notification.

---

## Installation & Running

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Start in development mode with nodemon
npm run dev

# Start in production mode
npm start
```


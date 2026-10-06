# CollabMark: Real-Time Collaborative Markdown Editor

A full-stack, production-ready real-time collaborative Markdown editor built with a **React (Vite + Tailwind CSS)** frontend and a **Node.js (Express + Socket.io + MongoDB)** backend.

---

## Folder Structure

```
collab-editor/
├── backend/
│   ├── src/
│   │   ├── index.js              # Express + Socket.io server entry point
│   │   ├── config/
│   │   │   └── db.js             # MongoDB connection setup
│   │   ├── models/
│   │   │   ├── User.js           # User schema (email, password hash, name)
│   │   │   └── Document.js       # Document schema (title, content, owner, collaborators)
│   │   ├── routes/
│   │   │   ├── auth.js           # POST /api/auth/register, /login, GET /me
│   │   │   └── documents.js      # CRUD /api/documents, sharing endpoints
│   │   ├── middleware/
│   │   │   └── auth.js           # JWT verification middleware
│   │   ├── sockets/
│   │   │   └── docHandler.js     # Socket.io event handlers for real-time editing
│   │   └── utils/
│   │       └── jwt.js            # Sign/verify JWT helpers
│   ├── package.json
│   ├── .env.example              # PORT, MONGO_URI, JWT_SECRET, CLIENT_URL
│   └── README.md
│
├── frontend/
│   ├── src/
│   │   ├── main.jsx              # React entry point
│   │   ├── App.jsx               # Router setup & route guards
│   │   ├── pages/
│   │   │   ├── Login.jsx         # Sign-in form
│   │   │   ├── Register.jsx      # Account creation form
│   │   │   ├── Dashboard.jsx     # Document management & creation
│   │   │   └── Editor.jsx        # Collaborative editor page
│   │   ├── components/
│   │   │   ├── EditorPane.jsx    # Markdown textarea + live preview
│   │   │   ├── PresenceList.jsx  # Active collaborators avatar stack
│   │   │   └── Navbar.jsx        # Navigation bar with user badge & logout
│   │   ├── context/
│   │   │   └── AuthContext.jsx   # Auth state, login/logout, session restoration
│   │   ├── lib/
│   │   │   ├── api.js            # Axios instance with base URL + interceptors
│   │   │   └── socket.js         # Socket.io client setup
│   │   └── styles/
│   │       └── index.css         # Tailwind directives & markdown preview styles
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── .env.example              # VITE_API_URL, VITE_SOCKET_URL
│   └── README.md
│
└── README.md                     # Root README with setup + deployment
```

---

## Key Features

1. **Authentication**: JWT-based authentication with bcrypt password hashing, token validation middleware, and auto-restored sessions.
2. **Document Management**: Create, rename, delete (owner only), and list owned and shared Markdown documents.
3. **Sharing & Permissions**: Share documents with collaborators by their registered email address.
4. **Real-Time Collaboration**: Sub-millisecond peer text updates and cursor tracking using Socket.io WebSocket rooms.
5. **Debounced MongoDB Persistence**: Writes to MongoDB are debounced to **at most once every 2 seconds per document**, or flushed immediately when the last user exits the room. Keystrokes never flood the database.
6. **Live Markdown Preview**: Split-view editor featuring rendered Markdown with syntax formatting, lists, tables, and blockquotes powered by `react-markdown`.
7. **Presence Cues**: Active collaborator avatars, online count indicator, and live "user is typing" alerts.
8. **Dark Mode UI**: Clean, responsive dark theme styled using Tailwind CSS.

---

## Technical Architecture & Deep Dive

### 1. JWT Authentication Flow
```
User (Browser)                     Server (Express)                 MongoDB
     │                                    │                            │
     ├─── POST /api/auth/login ──────────>│                            │
     │    { email, password }             ├─── Validate & Find User ──>│
     │                                    │<── Return User Record ─────│
     │                                    ├─── Bcrypt compare hash     │
     │                                    ├─── Sign JWT token          │
     │<── 200 OK + { token, user } ───────│                            │
     │                                    │                            │
     ├─── GET /api/documents ────────────>│                            │
     │    Authorization: Bearer <token>   ├─── verifyToken(token)      │
     │                                    ├─── Query user documents ──>│
     │<── 200 OK + { documents } ─────────│<── Return documents ───────│
```
- The JWT payload contains the user's ID, email, and name.
- Protected REST routes use `authenticateJWT` to decode and verify token validity before accessing resources.
- During Socket.io room joins (`doc:join`), the client provides the JWT to verify document authorization.

### 2. Socket.io Room Management
- Each document represents an isolated Socket.io room named `doc:${documentId}`.
- When a client emits `doc:join`:
  1. The server decodes the token and queries MongoDB to check if the user is the document owner or an invited collaborator.
  2. If authorized, the socket joins `doc:${documentId}`.
  3. The server updates an in-memory presence map (`roomPresence`) and broadcasts `doc:presence` with the active user list.
- When a client emits `doc:edit`, the server broadcasts `doc:update` only to *other* sockets in `doc:${documentId}`.
- When a client disconnects, they are removed from `roomPresence`, and an updated presence list is broadcasted.

### 3. Debounced MongoDB Persistence
```
Keystroke 1 ──> Broadcast Socket ──> Schedule 2s DB Timer
Keystroke 2 ──> Broadcast Socket ──> Update In-Memory Buffer
Keystroke N ──> Broadcast Socket ──> Update In-Memory Buffer
                        ... 2 seconds elapse ...
                                │
                                └─── Write Snapshot to MongoDB
```
- **Why?** Writing to MongoDB on every single keystroke causes write amplification, socket backpressure, and database connection pool starvation.
- **How it works:**
  - Content edits are buffered in an in-memory `pendingSaves` map.
  - A timer triggers a single `Document.findByIdAndUpdate()` at most once every 2 seconds.
  - **Graceful room drain:** If the last collaborator leaves or disconnects from the room, any active timer is cleared and the snapshot is persisted to MongoDB immediately, preventing lost updates.

### 4. Conflict Handling Strategy (Last-Write-Wins vs OT / CRDTs)
- **Current Demo Implementation:** Last-Write-Wins (LWW) for the entire document string. Incoming edits replace the local text buffer.
- **Why LWW is not production-grade:** If two users edit different paragraphs simultaneously, the second write will overwrite the first, causing lost work.
- **Production Alternatives:**
  - **Operational Transformation (OT):** Central authority sequences edits into operations (insert, delete, retain) and transforms concurrent operations against the revision log (used in Google Docs).
  - **Conflict-free Replicated Data Types (CRDTs):** Mathematically proven commutative data structures (e.g., [Yjs](https://github.com/yjs/yjs), [Automerge](https://automerge.org/)) that converge to identical state peer-to-peer without central locks.

### 5. CORS Configuration
- Express and Socket.io use strict CORS checking:
  - Allowed origin matches `CLIENT_URL` (e.g., `http://localhost:5173` or production frontend domain).
  - `credentials: true` enables cross-origin credential passing.
  - WebSockets explicitly enabled via `transports: ['websocket', 'polling']`.

---

## Local Development Setup

### Prerequisites
- Node.js (v18+ recommended)
- MongoDB instance (local or MongoDB Atlas free tier)

### 1. Backend Setup
```bash
cd backend

# Create environment configuration
cp .env.example .env

# Edit .env with your MongoDB URI and a random JWT Secret:
# PORT=3001
# MONGO_URI=mongodb://127.0.0.1:27017/collab_editor
# JWT_SECRET=super_secret_jwt_key_here
# CLIENT_URL=http://localhost:5173

# Install dependencies
npm install

# Run backend development server (with nodemon)
npm run dev
```
Backend runs at `http://localhost:3001`.

### 2. Frontend Setup
```bash
cd frontend

# Create environment configuration
cp .env.example .env

# Edit .env:
# VITE_API_URL=http://localhost:3001/api
# VITE_SOCKET_URL=http://localhost:3001

# Install dependencies
npm install

# Run Vite development server
npm run dev
```
Frontend runs at `http://localhost:5173`. Open in multiple browser windows or incognito tabs to test real-time collaboration between different users!

---

## Deployment Guide

> [!IMPORTANT]
> **Persistent Server Requirement for WebSockets:**
> WebSockets maintain a stateful, long-lived bidirectional TCP connection.
> **DO NOT deploy the backend to serverless platforms like Vercel Serverless Functions or AWS Lambda**, because serverless environments terminate execution after responding to an HTTP request and cannot hold open WebSocket connections.
> Use persistent container / Node.js hosting providers such as **Render**, **Railway**, or **Fly.io** for the backend.

### 1. Database: MongoDB Atlas
1. Create a free account at [MongoDB Atlas](https://www.mongodb.com/atlas).
2. Create a new cluster (Shared Free M0 tier).
3. Under **Database Access**, create a database user and password.
4. Under **Network Access**, add IP address `0.0.0.0/0` (allow access from anywhere) to allow hosting platforms to connect.
5. In **Clusters** $\to$ **Connect** $\to$ **Drivers**, copy the connection string:
   ```
   mongodb+srv://<username>:<password>@cluster0.mongodb.net/collab_editor?retryWrites=true&w=majority
   ```

### 2. Backend Deployment: Render
1. Push your repository to GitHub.
2. Sign up on [Render](https://render.com) and click **New +** $\to$ **Web Service**.
3. Connect your GitHub repository.
4. Configure service settings:
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Configure Environment Variables in Render:
   - `PORT`: `3001` (or let Render set it dynamically)
   - `MONGO_URI`: *Your MongoDB Atlas connection URI*
   - `JWT_SECRET`: *A secure random string (e.g. 64 characters)*
   - `CLIENT_URL`: *Your production frontend URL (e.g. `https://your-collabmark.vercel.app`)*
   - `NODE_ENV`: `production`
6. Click **Deploy Web Service**. Render provides a URL like `https://collab-backend.onrender.com`.

### 3. Frontend Deployment: Vercel
1. Sign up on [Vercel](https://vercel.com) and click **Add New...** $\to$ **Project**.
2. Import your GitHub repository.
3. Configure project settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `frontend`
4. Add Environment Variables in Vercel:
   - `VITE_API_URL`: `https://collab-backend.onrender.com/api`
   - `VITE_SOCKET_URL`: `https://collab-backend.onrender.com`
5. Click **Deploy**. Vercel will build and deploy your static assets with edge CDN caching.
6. After deployment, update the `CLIENT_URL` environment variable on Render with your Vercel production domain and trigger a redeploy of the backend.

---

## REST API Reference

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public | Register new user account (`name`, `email`, `password`) |
| `POST` | `/api/auth/login` | Public | Authenticate user credentials (`email`, `password`) |
| `GET` | `/api/auth/me` | Protected | Fetch current authenticated user's profile |
| `GET` | `/api/documents` | Protected | List all documents owned by or shared with current user |
| `POST` | `/api/documents` | Protected | Create a new document (`title`, `content`) |
| `GET` | `/api/documents/:id` | Protected | Fetch a document by ID (owner or collaborator) |
| `PUT` | `/api/documents/:id` | Protected | Update document title or content snapshot |
| `DELETE` | `/api/documents/:id` | Protected | Delete a document (owner only) |
| `POST` | `/api/documents/:id/share` | Protected | Add a collaborator by email (`{ email }`) |

---

## Socket.io Event Contract

### Client $\to$ Server Events
- `doc:join`: `{ documentId: string, token: string }`
  - Validates user token and document permissions, joins socket to room `doc:${documentId}`.
- `doc:edit`: `{ documentId: string, content: string, cursorPosition: number }`
  - Broadcasts updated content to other room members and queues debounced MongoDB persistence.
- `doc:cursor`: `{ documentId: string, cursorPosition: number }`
  - Broadcasts collaborator cursor position.

### Server $\to$ Client Events
- `doc:joined`: `{ documentId, collaborators, currentUser }`
  - Emitted to the connecting socket upon successful admission to the room.
- `doc:presence`: `{ collaborators: Array<Collaborator> }`
  - Broadcasted to the room when users enter or disconnect.
- `doc:update`: `{ documentId, content, cursorPosition, sender }`
  - Broadcasted to peer collaborators when someone edits the document.
- `doc:cursor:update`: `{ userId, name, color, cursorPosition }`
  - Broadcasted to peer collaborators on cursor movement.
- `doc:error`: `{ message: string }`
  - Emitted when an unauthorized or invalid socket request occurs.

---

## License

MIT License. Feel free to use and extend this project for learning, prototypes, or production applications.


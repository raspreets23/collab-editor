# CollabEditor Frontend

A modern real-time collaborative markdown editor frontend built with React, Vite, Tailwind CSS, and Socket.io.

---

## Features

- **Split-View Markdown Editor**: Live side-by-side editing with synchronized Markdown preview rendered via `react-markdown`.
- **Real-Time Collaboration**: Keystrokes, cursor positions, and collaborator presence synced in real time via Socket.io WebSockets.
- **Presence Indicators**: Visual badges and avatar tooltips showing active collaborators in the document room.
- **Client-Side Debouncing**: Text input emissions are debounced to ~100ms to eliminate socket overhead while preserving typing responsiveness.
- **Document Management**: Dashboard interface to create, rename, list, share, and delete markdown documents.
- **Dark Theme UI**: Clean, minimal dark UI styled with Tailwind CSS and responsive design.

---

## Architecture & Conflict Handling

- **Conflict Handling Strategy**: Simple **Last-Write-Wins (LWW)** on the whole markdown document string. Incoming edits from peers update local state while preserving the local cursor when applicable.
- **Production Considerations**: In production applications, LWW can lead to conflicts during simultaneous typing in identical sections. Production systems typically utilize **Operational Transformation (OT)** or **Conflict-Free Replicated Data Types (CRDTs)** such as [Yjs](https://github.com/yjs/yjs) or [Automerge](https://automerge.org/).

---

## Environment Variables

Create a `.env` file in the `frontend/` directory based on `.env.example`:

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `VITE_API_URL` | Base REST API URL | `http://localhost:3001/api` |
| `VITE_SOCKET_URL` | Socket.io server connection URL | `http://localhost:3001` |

---

## Project Structure

```
frontend/
├── src/
│   ├── main.jsx              # React entry point
│   ├── App.jsx               # Router setup & auth guards
│   ├── pages/
│   │   ├── Login.jsx         # Sign-in form
│   │   ├── Register.jsx      # Sign-up form
│   │   ├── Dashboard.jsx     # Document list, creator, and sharing
│   │   └── Editor.jsx        # Real-time collaborative editor page
│   ├── components/
│   │   ├── EditorPane.jsx    # Split-view textarea + React-Markdown preview
│   │   ├── PresenceList.jsx  # Active collaborators avatar stack & count
│   │   └── Navbar.jsx        # Top navigation with user badge & logout
│   ├── context/
│   │   └── AuthContext.jsx   # Global auth state & token management
│   ├── lib/
│   │   ├── api.js            # Axios client with JWT interceptors
│   │   └── socket.js         # Socket.io client configuration
│   └── styles/
│       └── index.css         # Tailwind CSS directives & markdown styles
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
└── .env.example
```

---

## Getting Started

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start Vite development server
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview
```


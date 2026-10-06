import Document from '../models/Document.js';
import { verifyToken } from '../utils/jwt.js';
import { hasDocumentAccess } from '../routes/documents.js';

/**
 * ============================================================================
 * REAL-TIME COLLABORATION ARCHITECTURE & DESIGN NOTES
 * ============================================================================
 * 
 * 1. Socket.io Room Management:
 *    - Each document corresponds to an isolated Socket.io room named `doc:${documentId}`.
 *    - Only authenticated users with access to that document (owner or collaborator)
 *      are admitted into the room.
 *    - Presence state is maintained in-memory per room to track who is currently
 *      viewing/editing the document.
 * 
 * 2. Debounced MongoDB Persistence:
 *    - Writing to MongoDB on every single keystroke causes massive DB write amplification,
 *      exhausting I/O, database connections, and driving high latency.
 *    - Instead, edits are broadcasted immediately over WebSockets (low latency peer updates),
 *      while database persistence is throttled to at most once every 2 seconds per document.
 *    - When the last collaborator leaves the room (disconnect / navigate away), any pending
 *      debounced save is flushed immediately to MongoDB to ensure data integrity.
 * 
 * 3. Conflict Handling Strategy & The "Last-Write-Wins" Limitation:
 *    - This implementation uses a "Last-Write-Wins" (LWW) strategy for the entire document
 *      string: whichever edit reaches the server last overwrites the prior state.
 *    - WARNING: Last-Write-Wins is NOT production-grade for concurrent real-time editing.
 *      If User A and User B type simultaneously in different paragraphs, one user's keystrokes
 *      will overwrite the other's, leading to data loss or "rubber-banding".
 *    - Production-grade collaborative editors solve this using either:
 *      a) Operational Transformation (OT) - as used in Google Docs. Edits are transformed
 *         against concurrent operations relative to a centralized sequence revision.
 *      b) Conflict-free Replicated Data Types (CRDTs) - as used in Figma, Notion, and
 *         libraries like Yjs and Automerge. Edits are deterministic commutative operations
 *         that converge to identical state peer-to-peer without central lock contention.
 * ============================================================================
 */

// In-memory presence map: documentId -> Map(socketId -> userInfo)
const roomPresence = new Map();

// In-memory debounce persistence map: documentId -> { timer, content, lastEditedBy }
const pendingSaves = new Map();

// Palette of colors to assign to collaborators for cursors & avatars
const COLLABORATOR_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#8B5CF6', // Purple
  '#06B6D4', // Cyan
  '#F97316', // Orange
  '#14B8A6', // Teal
];

const pickUserColor = (userId) => {
  if (!userId) return COLLABORATOR_COLORS[0];
  let hash = 0;
  const str = userId.toString();
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLLABORATOR_COLORS[Math.abs(hash) % COLLABORATOR_COLORS.length];
};

/**
 * Flush pending document content snapshot to MongoDB
 */
const flushDocumentToDB = async (documentId) => {
  const pending = pendingSaves.get(documentId);
  if (!pending) return;

  // Clear timer if active
  if (pending.timer) {
    clearTimeout(pending.timer);
  }
  pendingSaves.delete(documentId);

  try {
    await Document.findByIdAndUpdate(
      documentId,
      {
        content: pending.content,
        lastEditedBy: pending.lastEditedBy,
      },
      { new: true }
    );
    console.log(`[Persistence] Flushed snapshot for document ${documentId} to MongoDB.`);
  } catch (err) {
    console.error(`[Persistence Error] Failed to flush document ${documentId}:`, err);
  }
};

/**
 * Schedule a debounced save to MongoDB (at most once every 2 seconds)
 */
const scheduleDebouncedSave = (documentId, content, userId) => {
  let pending = pendingSaves.get(documentId);

  if (pending) {
    // Update the pending content and author
    pending.content = content;
    pending.lastEditedBy = userId;
  } else {
    // Schedule a new 2-second debounce timer
    const timer = setTimeout(async () => {
      await flushDocumentToDB(documentId);
    }, 2000);

    pendingSaves.set(documentId, {
      timer,
      content,
      lastEditedBy: userId,
    });
  }
};

/**
 * Get active collaborators list for a given document room
 */
const getRoomCollaborators = (documentId) => {
  const roomMap = roomPresence.get(documentId);
  if (!roomMap) return [];
  return Array.from(roomMap.values());
};

/**
 * Register all Socket.io event handlers
 */
export const registerDocHandlers = (io, socket) => {
  // Track which document room this socket is currently in
  let currentDocId = null;
  let currentUser = null;

  /**
   * Client joins a document session
   * Payload: { documentId, token }
   */
  socket.on('doc:join', async ({ documentId, token }) => {
    try {
      if (!documentId || !token) {
        socket.emit('doc:error', { message: 'Document ID and auth token are required.' });
        return;
      }

      // 1. Verify token
      let decoded;
      try {
        decoded = verifyToken(token);
      } catch (err) {
        socket.emit('doc:error', { message: 'Authentication failed: Invalid or expired token.' });
        return;
      }

      // 2. Verify user has access to this document
      const doc = await Document.findById(documentId);
      if (!doc) {
        socket.emit('doc:error', { message: 'Document not found.' });
        return;
      }

      if (!hasDocumentAccess(doc, decoded.id)) {
        socket.emit('doc:error', { message: 'Access denied: You do not have permission to join this document.' });
        return;
      }

      // Leave previous room if socket was in one
      if (currentDocId && currentDocId !== documentId) {
        handleLeaveRoom(currentDocId, socket.id);
      }

      currentDocId = documentId;
      currentUser = {
        socketId: socket.id,
        userId: decoded.id,
        name: decoded.name || 'Anonymous',
        email: decoded.email,
        color: pickUserColor(decoded.id),
        cursorPosition: null,
      };

      const roomName = `doc:${documentId}`;
      socket.join(roomName);

      // Track presence
      if (!roomPresence.has(documentId)) {
        roomPresence.set(documentId, new Map());
      }
      roomPresence.get(documentId).set(socket.id, currentUser);

      console.log(`[Socket] User "${currentUser.name}" (${socket.id}) joined room "${roomName}"`);

      // Broadcast updated presence list to everyone in this room
      const collaborators = getRoomCollaborators(documentId);
      io.to(roomName).emit('doc:presence', { collaborators });

      // Send initial acknowledgement to the joining client
      socket.emit('doc:joined', {
        documentId,
        collaborators,
        currentUser,
      });
    } catch (error) {
      console.error('[Socket Join Error]:', error);
      socket.emit('doc:error', { message: 'Failed to join document room.' });
    }
  });

  /**
   * Client emits an edit
   * Payload: { documentId, content, cursorPosition }
   */
  socket.on('doc:edit', ({ documentId, content, cursorPosition }) => {
    if (!documentId || currentDocId !== documentId || !currentUser) {
      return;
    }

    const roomName = `doc:${documentId}`;

    // Update cursor position in presence map
    const roomMap = roomPresence.get(documentId);
    if (roomMap && roomMap.has(socket.id)) {
      roomMap.get(socket.id).cursorPosition = cursorPosition;
    }

    // 1. Broadcast edit to all OTHER clients in the room
    socket.to(roomName).emit('doc:update', {
      documentId,
      content,
      cursorPosition,
      sender: {
        userId: currentUser.userId,
        name: currentUser.name,
        color: currentUser.color,
      },
    });

    // 2. Debounced save to MongoDB (max once every 2 seconds)
    scheduleDebouncedSave(documentId, content, currentUser.userId);
  });

  /**
   * Client emits cursor movement without text change
   * Payload: { documentId, cursorPosition }
   */
  socket.on('doc:cursor', ({ documentId, cursorPosition }) => {
    if (!documentId || currentDocId !== documentId || !currentUser) {
      return;
    }

    const roomMap = roomPresence.get(documentId);
    if (roomMap && roomMap.has(socket.id)) {
      roomMap.get(socket.id).cursorPosition = cursorPosition;
    }

    socket.to(`doc:${documentId}`).emit('doc:cursor:update', {
      userId: currentUser.userId,
      name: currentUser.name,
      color: currentUser.color,
      cursorPosition,
    });
  });

  /**
   * Clean up presence and check if last collaborator left
   */
  const handleLeaveRoom = async (docId, socketId) => {
    const roomMap = roomPresence.get(docId);
    if (!roomMap) return;

    roomMap.delete(socketId);
    const remainingUsers = Array.from(roomMap.values());

    const roomName = `doc:${docId}`;
    socket.leave(roomName);

    console.log(`[Socket] Socket ${socketId} left room "${roomName}". Remaining: ${remainingUsers.length}`);

    // If no users left in room, flush any pending debounced save to MongoDB immediately!
    if (remainingUsers.length === 0) {
      roomPresence.delete(docId);
      console.log(`[Socket] Room "${roomName}" is now empty. Flushing any pending changes to database...`);
      await flushDocumentToDB(docId);
    } else {
      // Broadcast updated presence to remaining users
      io.to(roomName).emit('doc:presence', { collaborators: remainingUsers });
    }
  };

  /**
   * Handle client disconnect
   */
  socket.on('disconnect', async (reason) => {
    console.log(`[Socket Disconnect] Socket ${socket.id} disconnected. Reason: ${reason}`);
    if (currentDocId) {
      await handleLeaveRoom(currentDocId, socket.id);
      currentDocId = null;
      currentUser = null;
    }
  });
};

export default registerDocHandlers;


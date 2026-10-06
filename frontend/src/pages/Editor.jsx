import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { socket, connectSocket, disconnectSocket } from '../lib/socket';
import { useAuth } from '../context/AuthContext';
import EditorPane from '../components/EditorPane';
import PresenceList from '../components/PresenceList';
import {
  ArrowLeft,
  Share2,
  AlertCircle,
  X,
  FileText,
  Copy,
  Check,
} from 'lucide-react';

export const Editor = () => {
  const { id: documentId } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();

  // Document state
  const [doc, setDoc] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Real-time collaboration state
  const [collaborators, setCollaborators] = useState([]);
  const [remoteEditorName, setRemoteEditorName] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Share Modal state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [shareLoading, setShareLoading] = useState(false);
  const [shareFeedback, setShareFeedback] = useState({ type: '', message: '' });
  const [copiedLink, setCopiedLink] = useState(false);

  // References to keep track of current documentId and token across event callbacks
  const docIdRef = useRef(documentId);
  docIdRef.current = documentId;

  const contentRef = useRef(content);
  contentRef.current = content;

  const remoteEditTimeoutRef = useRef(null);

  /**
   * 1. Load Document via REST API on Mount
   */
  useEffect(() => {
    let isMounted = true;

    const fetchDocument = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await api.get(`/documents/${documentId}`);
        if (isMounted && res.data.success && res.data.document) {
          const documentData = res.data.document;
          setDoc(documentData);
          setTitle(documentData.title || 'Untitled Document');
          setContent(documentData.content || '');
        }
      } catch (err) {
        console.error('[Editor Fetch Error]:', err);
        if (isMounted) {
          if (err.response?.status === 403) {
            setError('Access Denied: You do not have permission to view this document.');
          } else if (err.response?.status === 404) {
            setError('Document Not Found: This document may have been deleted.');
          } else {
            setError('Failed to load document content. Please check your network.');
          }
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchDocument();

    return () => {
      isMounted = false;
    };
  }, [documentId]);

  /**
   * 2. Manage Socket.io Room Lifecycle
   */
  useEffect(() => {
    if (!documentId || !token) return;

    // Connect socket if not already open
    const s = connectSocket();

    // Emit join event once connected
    const joinRoom = () => {
      s.emit('doc:join', { documentId, token });
    };

    if (s.connected) {
      joinRoom();
    } else {
      s.on('connect', joinRoom);
    }

    // Handle initial join acknowledgement
    const handleJoined = (data) => {
      if (data.documentId === documentId && data.collaborators) {
        setCollaborators(data.collaborators);
      }
    };

    // Handle room presence updates (collaborators joining/leaving)
    const handlePresence = (data) => {
      if (data && data.collaborators) {
        setCollaborators(data.collaborators);
      }
    };

    // Handle remote edits from collaborators
    const handleRemoteUpdate = (data) => {
      if (data.documentId === documentId) {
        // Simple conflict handling: Last-Write-Wins (LWW)
        // Overwrite the local document string with incoming peer content.
        setContent(data.content);

        // Flash peer typing indicator
        if (data.sender?.name) {
          setRemoteEditorName(data.sender.name);
          if (remoteEditTimeoutRef.current) {
            clearTimeout(remoteEditTimeoutRef.current);
          }
          remoteEditTimeoutRef.current = setTimeout(() => {
            setRemoteEditorName(null);
          }, 2000);
        }
      }
    };

    // Handle peer cursor updates
    const handleCursorUpdate = (data) => {
      if (data.name) {
        setRemoteEditorName(data.name);
        if (remoteEditTimeoutRef.current) {
          clearTimeout(remoteEditTimeoutRef.current);
        }
        remoteEditTimeoutRef.current = setTimeout(() => {
          setRemoteEditorName(null);
        }, 1500);
      }
    };

    // Handle socket errors
    const handleSocketError = (err) => {
      console.warn('[Socket Error]:', err.message);
    };

    s.on('doc:joined', handleJoined);
    s.on('doc:presence', handlePresence);
    s.on('doc:update', handleRemoteUpdate);
    s.on('doc:cursor:update', handleCursorUpdate);
    s.on('doc:error', handleSocketError);

    // Cleanup on unmount or when document changes
    return () => {
      s.off('connect', joinRoom);
      s.off('doc:joined', handleJoined);
      s.off('doc:presence', handlePresence);
      s.off('doc:update', handleRemoteUpdate);
      s.off('doc:cursor:update', handleCursorUpdate);
      s.off('doc:error', handleSocketError);

      if (remoteEditTimeoutRef.current) {
        clearTimeout(remoteEditTimeoutRef.current);
      }

      disconnectSocket();
    };
  }, [documentId, token]);

  /**
   * 3. Handle local content edits
   * Called by EditorPane on keystrokes
   */
  const handleContentChange = useCallback(
    (newContent, cursorPosition, shouldBroadcast) => {
      setContent(newContent);

      if (shouldBroadcast && socket.connected) {
        setIsSaving(true);

        // Emit edit to Socket.io room
        socket.emit('doc:edit', {
          documentId,
          content: newContent,
          cursorPosition,
        });

        // Clear saving indicator after debounce interval
        setTimeout(() => {
          setIsSaving(false);
        }, 600);
      }
    },
    [documentId]
  );

  /**
   * 4. Handle cursor movement without content edit
   */
  const handleCursorChange = useCallback(
    (cursorPosition) => {
      if (socket.connected) {
        socket.emit('doc:cursor', {
          documentId,
          cursorPosition,
        });
      }
    },
    [documentId]
  );

  /**
   * 5. Rename Document Title
   */
  const handleTitleBlur = async () => {
    if (!title.trim() || title === doc?.title) return;

    try {
      const res = await api.put(`/documents/${documentId}`, {
        title: title.trim(),
      });
      if (res.data.success) {
        setDoc((prev) => ({ ...prev, title: res.data.document.title }));
      }
    } catch (err) {
      console.error('[Editor Error - Rename]:', err);
    }
  };

  /**
   * 6. Invite Collaborator by Email
   */
  const handleShareSubmit = async (e) => {
    e.preventDefault();
    if (!shareEmail.trim()) return;

    try {
      setShareLoading(true);
      setShareFeedback({ type: '', message: '' });

      const res = await api.post(`/documents/${documentId}/share`, {
        email: shareEmail.trim(),
      });

      if (res.data.success) {
        setShareFeedback({
          type: 'success',
          message: res.data.message || 'Collaborator added successfully!',
        });
        setShareEmail('');
        setDoc(res.data.document);
      }
    } catch (err) {
      console.error('[Editor Error - Share]:', err);
      setShareFeedback({
        type: 'error',
        message: err.response?.data?.message || 'Failed to add collaborator.',
      });
    } finally {
      setShareLoading(false);
    }
  };

  const copyDocLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Render Error Screen
  if (error) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-6 bg-slate-950">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-8 text-center shadow-2xl">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Unable to Open Document</h2>
          <p className="text-sm text-slate-400 mb-6">{error}</p>
          <Link
            to="/dashboard"
            className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Dashboard</span>
          </Link>
        </div>
      </div>
    );
  }

  // Render Loading Screen
  if (loading) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center bg-slate-950 text-slate-400 space-y-4">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium">Connecting to real-time room...</p>
      </div>
    );
  }

  const isOwner = doc?.owner?._id === user?.id || doc?.owner === user?.id;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-slate-950 overflow-hidden">
      {/* Editor Sub-Header */}
      <div className="h-14 border-b border-slate-800/80 bg-slate-900/90 px-4 flex items-center justify-between z-20">
        {/* Left: Back & Document Title */}
        <div className="flex items-center space-x-3 flex-1 min-w-0 mr-4">
          <Link
            to="/dashboard"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition flex-shrink-0"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <div className="flex items-center space-x-2 flex-1 min-w-0 max-w-lg">
            <FileText className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              placeholder="Untitled Document"
              className="bg-transparent hover:bg-slate-800/60 focus:bg-slate-950 px-2 py-1 rounded text-sm font-semibold text-slate-100 placeholder-slate-500 border border-transparent focus:border-indigo-500/80 outline-none w-full truncate transition"
              title="Click to rename"
            />
          </div>
        </div>

        {/* Right: Presence List & Share Button */}
        <div className="flex items-center space-x-3 flex-shrink-0">
          <PresenceList
            collaborators={collaborators}
            currentUserId={user?.id}
          />

          {isOwner && (
            <button
              onClick={() => {
                setShowShareModal(true);
                setShareFeedback({ type: '', message: '' });
              }}
              className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg shadow-sm transition"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </button>
          )}
        </div>
      </div>

      {/* Editor Main Pane */}
      <div className="flex-1 overflow-hidden">
        <EditorPane
          content={content}
          onChange={handleContentChange}
          onCursorChange={handleCursorChange}
          remoteEditorName={remoteEditorName}
          isSaving={isSaving}
        />
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl relative">
            <button
              onClick={() => setShowShareModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-2 mb-4 text-indigo-400">
              <Share2 className="w-5 h-5" />
              <h2 className="text-lg font-bold text-white">Share Document</h2>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              Invite teammates to edit this document in real-time.
            </p>

            {/* Copy Link Action */}
            <div className="mb-5 flex items-center space-x-2 bg-slate-950 p-2 rounded-lg border border-slate-800">
              <input
                type="text"
                readOnly
                value={window.location.href}
                className="bg-transparent text-xs text-slate-300 flex-1 outline-none truncate select-all px-1 font-mono"
              />
              <button
                onClick={copyDocLink}
                className="flex items-center space-x-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded transition"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            {shareFeedback.message && (
              <div
                className={`mb-4 p-3 rounded-lg text-xs flex items-center space-x-2 ${
                  shareFeedback.type === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                }`}
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{shareFeedback.message}</span>
              </div>
            )}

            <form onSubmit={handleShareSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Collaborator Email Address
                </label>
                <input
                  type="email"
                  required
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  placeholder="teammate@example.com"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowShareModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={shareLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition"
                >
                  {shareLoading ? 'Inviting...' : 'Add Collaborator'}
                </button>
              </div>
            </form>

            {/* Existing Collaborators List */}
            {doc?.collaborators && doc.collaborators.length > 0 && (
              <div className="mt-6 pt-4 border-t border-slate-800">
                <div className="text-xs font-semibold text-slate-400 mb-2">
                  Invited Collaborators ({doc.collaborators.length})
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {doc.collaborators.map((c) => (
                    <div
                      key={c._id || c}
                      className="flex items-center justify-between text-xs py-1.5 px-2 bg-slate-950 rounded border border-slate-800 text-slate-300"
                    >
                      <span className="truncate">{c.name ? `${c.name} (${c.email})` : c.email || c}</span>
                      <span className="text-[10px] text-emerald-400 uppercase font-semibold">Editor</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Editor;


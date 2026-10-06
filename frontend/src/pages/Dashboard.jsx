import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  Plus,
  FileText,
  Trash2,
  Share2,
  Clock,
  User,
  Users,
  Search,
  ExternalLink,
  AlertCircle,
  X,
} from 'lucide-react';

export const Dashboard = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // New Document modal state
  const [isCreating, setIsCreating] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');

  // Share Modal state
  const [shareDoc, setShareDoc] = useState(null);
  const [shareEmail, setShareEmail] = useState('');
  const [shareLoading, setShareLoading] = useState(false);
  const [shareFeedback, setShareFeedback] = useState({ type: '', message: '' });

  // Delete Confirmation state
  const [deleteDoc, setDeleteDoc] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const { user } = useAuth();
  const navigate = useNavigate();

  // Fetch documents on component mount
  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/documents');
      if (res.data.success) {
        setDocuments(res.data.documents || []);
      }
    } catch (err) {
      console.error('[Dashboard Error - Fetch]:', err);
      setError('Failed to load documents. Please check your network connection.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle Create New Document
   */
  const handleCreateDocument = async (e) => {
    e.preventDefault();
    try {
      setIsCreating(true);
      const title = newDocTitle.trim() || 'Untitled Document';
      const res = await api.post('/documents', {
        title,
        content: `# ${title}\n\nStart writing your collaborative document here...`,
      });

      if (res.data.success && res.data.document) {
        navigate(`/editor/${res.data.document._id}`);
      }
    } catch (err) {
      console.error('[Dashboard Error - Create]:', err);
      alert('Could not create document. Please try again.');
    } finally {
      setIsCreating(false);
      setNewDocTitle('');
    }
  };

  /**
   * Handle Delete Document
   */
  const handleDeleteDocument = async () => {
    if (!deleteDoc) return;
    try {
      setDeleteLoading(true);
      const res = await api.delete(`/documents/${deleteDoc._id}`);
      if (res.data.success) {
        setDocuments((prev) => prev.filter((d) => d._id !== deleteDoc._id));
        setDeleteDoc(null);
      }
    } catch (err) {
      console.error('[Dashboard Error - Delete]:', err);
      alert(err.response?.data?.message || 'Failed to delete document.');
    } finally {
      setDeleteLoading(false);
    }
  };

  /**
   * Handle Share Document with Collaborator
   */
  const handleShareSubmit = async (e) => {
    e.preventDefault();
    if (!shareDoc || !shareEmail.trim()) return;

    try {
      setShareLoading(true);
      setShareFeedback({ type: '', message: '' });

      const res = await api.post(`/documents/${shareDoc._id}/share`, {
        email: shareEmail.trim(),
      });

      if (res.data.success) {
        setShareFeedback({
          type: 'success',
          message: res.data.message || 'Collaborator added successfully!',
        });
        setShareEmail('');
        // Update local document list with new collaborators
        setDocuments((prev) =>
          prev.map((d) => (d._id === shareDoc._id ? res.data.document : d))
        );
      }
    } catch (err) {
      console.error('[Dashboard Error - Share]:', err);
      setShareFeedback({
        type: 'error',
        message: err.response?.data?.message || 'Failed to share document.',
      });
    } finally {
      setShareLoading(false);
    }
  };

  // Filter documents based on search term
  const filteredDocs = documents.filter((doc) =>
    doc.title?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const ownedDocs = filteredDocs.filter(
    (d) => d.owner?._id === user?.id || d.owner === user?.id
  );

  const sharedDocs = filteredDocs.filter(
    (d) => d.owner?._id !== user?.id && d.owner !== user?.id
  );

  const formatDate = (dateString) => {
    if (!dateString) return 'Recently';
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-slate-950 p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Top Header & Quick Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Your Documents</h1>
            <p className="text-sm text-slate-400 mt-1">
              Create, manage, and collaborate on your markdown files in real time.
            </p>
          </div>

          <button
            onClick={() => handleCreateDocument({ preventDefault: () => {} })}
            disabled={isCreating}
            className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium px-4 py-2.5 rounded-lg shadow-lg shadow-indigo-600/20 transition self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>{isCreating ? 'Creating...' : 'New Document'}</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents by title..."
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
          />
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-44 rounded-xl bg-slate-900/60 border border-slate-800 animate-pulse p-5 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="h-5 bg-slate-800 rounded w-3/4"></div>
                  <div className="h-3 bg-slate-800 rounded w-1/2"></div>
                </div>
                <div className="h-8 bg-slate-800/80 rounded w-full"></div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Section 1: Owned Documents */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2 text-slate-300 text-sm font-semibold uppercase tracking-wider">
                <FileText className="w-4 h-4 text-indigo-400" />
                <span>My Documents ({ownedDocs.length})</span>
              </div>

              {ownedDocs.length === 0 ? (
                <div className="border border-dashed border-slate-800 rounded-xl p-8 text-center bg-slate-900/30">
                  <FileText className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm font-medium">No documents created yet.</p>
                  <p className="text-slate-500 text-xs mt-1">
                    Click "New Document" above to get started with your first note.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {ownedDocs.map((doc) => (
                    <DocumentCard
                      key={doc._id}
                      doc={doc}
                      isOwner={true}
                      onOpen={() => navigate(`/editor/${doc._id}`)}
                      onShare={() => {
                        setShareDoc(doc);
                        setShareFeedback({ type: '', message: '' });
                      }}
                      onDelete={() => setDeleteDoc(doc)}
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Section 2: Shared Documents */}
            {sharedDocs.length > 0 && (
              <div className="space-y-4 pt-4">
                <div className="flex items-center space-x-2 text-slate-300 text-sm font-semibold uppercase tracking-wider">
                  <Users className="w-4 h-4 text-emerald-400" />
                  <span>Shared with Me ({sharedDocs.length})</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {sharedDocs.map((doc) => (
                    <DocumentCard
                      key={doc._id}
                      doc={doc}
                      isOwner={false}
                      onOpen={() => navigate(`/editor/${doc._id}`)}
                      onShare={null}
                      onDelete={null}
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Share Document Modal */}
      {shareDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl relative">
            <button
              onClick={() => setShareDoc(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-2 mb-4 text-indigo-400">
              <Share2 className="w-5 h-5" />
              <h2 className="text-lg font-bold text-white">Share Document</h2>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              Add collaborators to <span className="font-semibold text-slate-200">"{shareDoc.title}"</span>. They will be able to view and edit in real time.
            </p>

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
                  placeholder="collaborator@example.com"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShareDoc(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={shareLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition"
                >
                  {shareLoading ? 'Inviting...' : 'Invite Collaborator'}
                </button>
              </div>
            </form>

            {/* List Existing Collaborators */}
            {shareDoc.collaborators && shareDoc.collaborators.length > 0 && (
              <div className="mt-6 pt-4 border-t border-slate-800">
                <div className="text-xs font-semibold text-slate-400 mb-2">
                  Current Collaborators ({shareDoc.collaborators.length})
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {shareDoc.collaborators.map((c) => (
                    <div
                      key={c._id || c}
                      className="flex items-center justify-between text-xs py-1.5 px-2 bg-slate-950 rounded border border-slate-800 text-slate-300"
                    >
                      <span className="truncate">{c.name ? `${c.name} (${c.email})` : c.email || c}</span>
                      <span className="text-[10px] text-slate-500 uppercase font-semibold">Editor</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2">Delete Document</h3>
            <p className="text-xs text-slate-400 mb-6">
              Are you sure you want to permanently delete{' '}
              <span className="font-semibold text-slate-200">"{deleteDoc.title}"</span>? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setDeleteDoc(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteDocument}
                disabled={deleteLoading}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition"
              >
                {deleteLoading ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Reusable Document Card Component
 */
const DocumentCard = ({ doc, isOwner, onOpen, onShare, onDelete, formatDate }) => {
  return (
    <div className="bg-slate-900/80 border border-slate-800/80 hover:border-slate-700 rounded-xl p-5 flex flex-col justify-between transition group hover:shadow-xl hover:shadow-indigo-500/5">
      <div>
        <div className="flex items-start justify-between gap-2 mb-2">
          <h2
            onClick={onOpen}
            className="font-semibold text-slate-100 group-hover:text-indigo-400 cursor-pointer line-clamp-1 transition text-base"
          >
            {doc.title || 'Untitled Document'}
          </h2>
          <button
            onClick={onOpen}
            className="text-slate-500 group-hover:text-indigo-400 transition p-1"
            title="Open Document"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>

        {/* Snippet */}
        <p className="text-xs text-slate-400 line-clamp-2 mb-4 font-mono bg-slate-950/60 p-2 rounded border border-slate-800/60">
          {doc.content ? doc.content.slice(0, 100) : 'Empty document...'}
        </p>
      </div>

      <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center space-x-1.5">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>{formatDate(doc.updatedAt)}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-1">
          {isOwner && onShare && (
            <button
              onClick={onShare}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-indigo-400 transition"
              title="Share Document"
            >
              <Share2 className="w-4 h-4" />
            </button>
          )}

          {isOwner && onDelete && (
            <button
              onClick={onDelete}
              className="p-1.5 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition"
              title="Delete Document"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {!isOwner && doc.owner && (
            <div className="flex items-center space-x-1 text-[11px] text-slate-400 bg-slate-800/50 px-2 py-0.5 rounded">
              <User className="w-3 h-3 text-emerald-400" />
              <span className="truncate max-w-[100px]">{doc.owner.name || 'Owner'}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;


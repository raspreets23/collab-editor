import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Columns,
  Eye,
  FileCode,
  Bold,
  Italic,
  Heading,
  Code,
  List,
  Quote,
  Link as LinkIcon,
  CheckCircle2,
  CloudUpload,
} from 'lucide-react';

/**
 * ============================================================================
 * EditorPane Component
 * ============================================================================
 * 
 * Conflict Handling Note:
 * - This editor utilizes a simple "Last-Write-Wins" (LWW) resolution model.
 * - Edits are debounced client-side (~100ms) before emitting to the Socket.io
 *   server to prevent flooding the network socket on rapid keystrokes.
 * - Incoming updates from peers ('doc:update') overwrite the local content
 *   while preserving the active cursor position when possible.
 * - Caveat: In production applications with high concurrency, LWW can lead to
 *   clobbered text. Production systems should use Operational Transforms (OT)
 *   or CRDTs (such as Yjs, Automerge).
 * ============================================================================
 */
export const EditorPane = ({
  content,
  onChange,
  onCursorChange,
  remoteEditorName,
  isSaving,
}) => {
  const [viewMode, setViewMode] = useState('split'); // 'split' | 'code' | 'preview'
  const textareaRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Notify parent of cursor selection changes
  const handleSelectOrKeyUp = () => {
    if (textareaRef.current && onCursorChange) {
      const cursorPosition = textareaRef.current.selectionStart;
      onCursorChange(cursorPosition);
    }
  };

  /**
   * Handle local textarea changes with ~100ms debounce
   */
  const handleTextChange = (e) => {
    const newContent = e.target.value;
    const cursorPosition = e.target.selectionStart;

    // Call immediate state update for fluid UI response
    onChange(newContent, cursorPosition, false);

    // Debounce the socket emission to ~100ms
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      onChange(newContent, cursorPosition, true); // true = broadcast over socket
    }, 100);
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  /**
   * Markdown formatting helpers
   */
  const insertFormatting = (prefix, suffix = '', placeholder = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = textarea.value;

    const selectedText = currentVal.substring(start, end) || placeholder;
    const replacement = `${prefix}${selectedText}${suffix}`;

    const updated =
      currentVal.substring(0, start) + replacement + currentVal.substring(end);

    onChange(updated, start + prefix.length + selectedText.length, true);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + selectedText.length
      );
    }, 0);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-slate-950 text-slate-100 overflow-hidden">
      {/* Editor Toolbar */}
      <div className="h-11 border-b border-slate-800 bg-slate-900/60 px-4 flex items-center justify-between text-xs select-none">
        {/* Formatting Actions */}
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => insertFormatting('**', '**', 'bold text')}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
            title="Bold (**text**)"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('*', '*', 'italic text')}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
            title="Italic (*text*)"
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('### ', '', 'Heading 3')}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
            title="Heading (### text)"
          >
            <Heading className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-slate-800 mx-1" />

          <button
            type="button"
            onClick={() => insertFormatting('`', '`', 'code')}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
            title="Inline Code (`code`)"
          >
            <Code className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('- ', '', 'List item')}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
            title="Bulleted List"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('> ', '', 'Quote text')}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
            title="Blockquote"
          >
            <Quote className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('[', '](https://example.com)', 'link title')}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
            title="Hyperlink"
          >
            <LinkIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Status Indicators & View Mode Selector */}
        <div className="flex items-center space-x-4">
          {/* Peer editing toast indicator */}
          {remoteEditorName && (
            <div className="hidden sm:flex items-center space-x-1.5 text-indigo-400 bg-indigo-950/60 border border-indigo-800/60 px-2 py-0.5 rounded-full text-[11px] animate-pulse">
              <span>{remoteEditorName} is typing...</span>
            </div>
          )}

          {/* Sync status */}
          <div className="flex items-center space-x-1 text-slate-400 text-[11px]">
            {isSaving ? (
              <>
                <CloudUpload className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
                <span className="text-amber-400 hidden sm:inline">Saving to cloud...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-slate-400 hidden sm:inline">Saved</span>
              </>
            )}
          </div>

          <div className="h-4 w-px bg-slate-800" />

          {/* View Mode Buttons */}
          <div className="flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/60">
            <button
              type="button"
              onClick={() => setViewMode('code')}
              className={`p-1 rounded ${
                viewMode === 'code' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Markdown Editor Only"
            >
              <FileCode className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={`p-1 rounded ${
                viewMode === 'split' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Split View"
            >
              <Columns className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`p-1 rounded ${
                viewMode === 'preview' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Preview Only"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Editor Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Raw Markdown Editor */}
        {(viewMode === 'split' || viewMode === 'code') && (
          <div
            className={`h-full flex flex-col ${
              viewMode === 'split' ? 'w-full md:w-1/2 border-r border-slate-800' : 'w-full'
            }`}
          >
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleTextChange}
              onSelect={handleSelectOrKeyUp}
              onKeyUp={handleSelectOrKeyUp}
              placeholder="Write your markdown here..."
              spellCheck="false"
              className="w-full h-full p-6 bg-slate-950 text-slate-100 font-mono text-sm leading-relaxed outline-none resize-none placeholder-slate-600 selection:bg-indigo-600 selection:text-white"
            />
          </div>
        )}

        {/* Right: Rendered Markdown Preview */}
        {(viewMode === 'split' || viewMode === 'preview') && (
          <div
            className={`h-full overflow-y-auto p-6 bg-slate-900/40 ${
              viewMode === 'split' ? 'hidden md:block md:w-1/2' : 'w-full'
            }`}
          >
            <div className="max-w-3xl mx-auto markdown-preview">
              <ReactMarkdown>{content || '*No content yet. Start typing to see preview.*'}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EditorPane;


import React from 'react';
import { Users } from 'lucide-react';

export const PresenceList = ({ collaborators = [], currentUserId }) => {
  if (!collaborators || collaborators.length === 0) {
    return (
      <div className="flex items-center space-x-1.5 text-xs text-slate-400">
        <Users className="w-3.5 h-3.5" />
        <span>1 Online</span>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      {/* Presence count with pulsing online indicator */}
      <div className="flex items-center space-x-1.5 text-xs text-slate-300 font-medium bg-slate-800/80 px-2.5 py-1 rounded-full border border-slate-700">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span>
          {collaborators.length} {collaborators.length === 1 ? 'Collaborator' : 'Collaborators'}
        </span>
      </div>

      {/* Avatars Stack */}
      <div className="flex -space-x-1.5 overflow-hidden py-0.5">
        {collaborators.map((c) => {
          const isCurrentUser = c.userId === currentUserId;
          const initial = c.name ? c.name.charAt(0).toUpperCase() : '?';
          const bgColor = c.color || '#3B82F6';

          return (
            <div
              key={c.socketId || c.userId}
              title={`${c.name} (${c.email || 'online'})${isCurrentUser ? ' - You' : ''}`}
              className="relative group cursor-pointer"
            >
              <div
                style={{ backgroundColor: bgColor }}
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold ring-2 ring-slate-900 shadow-sm transition-transform transform group-hover:scale-110 group-hover:z-10"
              >
                {initial}
              </div>

              {/* Tooltip on Hover */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:flex flex-col items-center z-50 pointer-events-none">
                <div className="bg-slate-800 text-slate-200 text-[11px] font-medium py-1 px-2 rounded shadow-lg border border-slate-700 whitespace-nowrap">
                  {c.name} {isCurrentUser && <span className="text-indigo-400 font-bold">(You)</span>}
                </div>
                <div className="w-1.5 h-1.5 bg-slate-800 rotate-45 -mt-1 border-r border-b border-slate-700"></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PresenceList;


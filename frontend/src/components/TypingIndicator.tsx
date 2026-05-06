import React from 'react';

interface TypingIndicatorProps {
  typingUsers: { id: string; name: string }[];
}

export function TypingIndicator({ typingUsers }: TypingIndicatorProps) {
  if (typingUsers.length === 0) return null;

  // "User is typing..." or "User1, User2 are typing..."
  const text = typingUsers.length === 1
    ? `${typingUsers[0].name} is typing`
    : typingUsers.length === 2
      ? `${typingUsers[0].name} and ${typingUsers[1].name} are typing`
      : `${typingUsers[0].name} and ${typingUsers.length - 1} others are typing`;

  return (
    <div className="flex items-center gap-2 px-4 py-2 my-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div
        className="flex items-center gap-1.5 px-3 py-2 rounded-2xl"
        style={{ background: "#161b22", border: "1px solid #2d3748" }}
      >
        <span className="flex gap-0.5">
          <span
            className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce"
            style={{ animationDelay: "300ms" }}
          />
        </span>
        <span className="text-xs font-medium text-gray-400">
          {text}
        </span>
      </div>
    </div>
  );
}

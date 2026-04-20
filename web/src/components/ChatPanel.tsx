"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import apiClient from "@/lib/apiClient";

interface Message {
  id: string;
  chat_id: string;
  user_profile_id: string;
  content: string;
  created_at: string;
  user_profiles?: {
    display_name: string;
    avatar_url: string;
  };
}

interface UserProfile {
  id: string;
  display_name: string;
  avatar_url: string;
}

export default function ChatPanel({ chatId, onClose }: { chatId: string | null; onClose?: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [chatMembers, setChatMembers] = useState<UserProfile[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chatId) return;
    let mounted = true;

    const loadData = async () => {
      // Carregar perfil do usuário
      const profileResult = await apiClient.getProfile();
      if (mounted && profileResult.success && profileResult.data) {
        const profileData = profileResult.data as any;
        setCurrentUser({
          id: profileData.id,
          display_name: profileData.display_name || 'Usuário',
          avatar_url: profileData.avatar_url || ''
        });
      }

      // Carregar mensagens do chat via backend API
      const msgsResult = await apiClient.getChatMessages(chatId);
      if (mounted && msgsResult.success && Array.isArray(msgsResult.data)) {
        setMessages(msgsResult.data as Message[]);
        scrollToBottom();
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [chatId]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const sendMessage = async () => {
    if (!chatId || !text.trim() || sending) return;
    
    setSending(true);
    try {
      const userProfileId = currentUser?.id;
      if (!userProfileId) {
        console.error("Cannot send message: current user profile not loaded");
        return;
      }

      const result = await apiClient.sendMessage(chatId, text.trim(), userProfileId);
      
      if (result.success) {
        setText("");
        const msgsResult = await apiClient.getChatMessages(chatId);
        if (msgsResult.success && Array.isArray(msgsResult.data)) {
          setMessages(msgsResult.data as Message[]);
        }
      }
    } catch (e) {
      console.error("Error sending message:", e);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return "Hoje";
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Ontem";
    }
    return date.toLocaleDateString("pt-BR");
  };

  const groupMessagesByDate = (msgs: Message[]) => {
    const groups: { [key: string]: Message[] } = {};
    msgs.forEach(msg => {
      const dateKey = new Date(msg.created_at).toDateString();
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(msg);
    });
    return groups;
  };

  if (!chatId) {
    return null;
  }

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [messages]
  );

  const messageGroups = groupMessagesByDate(sortedMessages);

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0 chat-window">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {Object.entries(messageGroups).map(([dateKey, msgs]) => (
            <div key={dateKey}>
              <div className="flex items-center gap-4 my-4">
                <div className="flex-1 h-px bg-gray-200"></div>
                <span className="text-xs text-gray-400 font-medium">{formatDate(dateKey)}</span>
                <div className="flex-1 h-px bg-gray-200"></div>
              </div>
              {msgs.map((msg) => {
                const isOwnMessage = currentUser?.id === msg.user_profile_id;
                return (
                  <div
                    key={msg.id}
                    className={`group flex gap-3 py-2 px-3 -mx-2 rounded-lg hover:bg-gray-50 ${isOwnMessage ? "flex-row-reverse" : ""}`}
                  >
                    {!isOwnMessage && (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center text-white font-semibold flex-shrink-0 shadow-sm">
                        {msg.user_profiles?.display_name?.charAt(0).toUpperCase() || "?"}
                      </div>
                    )}
                    <div className={`flex-1 min-w-0 ${isOwnMessage ? "text-right" : ""}`}>
                      <div className={`flex items-baseline gap-2 ${isOwnMessage ? "justify-end" : ""}`}>
                        <span className="font-semibold text-gray-800 text-sm">
                          {msg.user_profiles?.display_name || "Usuário"}
                        </span>
                        <span className="text-xs text-gray-400">{formatTime(msg.created_at)}</span>
                      </div>
                      <div className={`chat-bubble inline-block max-w-[80%] ${
                        isOwnMessage ? "chat-bubble me" : "chat-bubble other"
                      }`}>
                        <p className={`text-sm whitespace-pre-wrap break-words ${
                          isOwnMessage ? "text-white" : "text-gray-700"
                        }`}>
                          {msg.content}
                        </p>
                      </div>
                    </div>
                    {isOwnMessage && (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center text-white font-semibold flex-shrink-0 shadow-sm">
                        {msg.user_profiles?.display_name?.charAt(0).toUpperCase() || "?"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-gray-200 bg-white rounded-b-xl">
          <div className="flex gap-2 items-end">
            <div className="flex-1 bg-gray-50 rounded-lg border border-gray-200 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Mensagem..."
                rows={1}
                className="w-full bg-transparent px-4 py-3 text-gray-800 placeholder-gray-400 resize-none focus:outline-none"
                style={{ minHeight: "44px", maxHeight: "120px" }}
              />
            </div>
            <button
              onClick={sendMessage}
              disabled={sending || !text.trim()}
              className="px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {sending ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {chatMembers.length > 0 && (
        <div className="w-60 border-l border-gray-200 bg-gray-50 p-4 hidden lg:block">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Membros - {chatMembers.length}
          </h3>
          <div className="space-y-1">
            {chatMembers.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white cursor-pointer transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center text-white text-xs font-semibold relative shadow-sm">
                  {member.display_name?.charAt(0).toUpperCase() || "?"}
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                </div>
                <span className="text-sm text-gray-600 truncate">{member.display_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


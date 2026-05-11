package com.kanux.config;

import com.kanux.repository.ChatMemberRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.security.Principal;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Rastreia conexões/desconexões WebSocket e faz broadcast de presença
 * para os tópicos dos chats em que o usuário é membro.
 *
 * Payload broadcast em /topic/chat/{chatId}/presence:
 * { "user_profile_id": "...", "online": true|false }
 */
@Component
public class PresenceEventListener {

    private static final Logger log = LoggerFactory.getLogger(PresenceEventListener.class);

    // userId → Set<chatId> onde o usuário é membro (populado na conexão)
    private final Map<UUID, Set<UUID>> userChats = new ConcurrentHashMap<>();
    // Usuários online (userId → sessionId)
    private final Map<String, UUID> sessionToUser = new ConcurrentHashMap<>();

    private final SimpMessagingTemplate messagingTemplate;
    private final ChatMemberRepository chatMemberRepository;

    public PresenceEventListener(SimpMessagingTemplate messagingTemplate,
                                  ChatMemberRepository chatMemberRepository) {
        this.messagingTemplate = messagingTemplate;
        this.chatMemberRepository = chatMemberRepository;
    }

    @EventListener
    public void onConnected(SessionConnectedEvent event) {
        StompHeaderAccessor sha = StompHeaderAccessor.wrap(event.getMessage());
        Principal principal = sha.getUser();
        if (principal == null) return;

        UUID userId;
        try {
            userId = UUID.fromString(principal.getName());
        } catch (IllegalArgumentException e) {
            return;
        }

        String sessionId = sha.getSessionId();
        if (sessionId == null) return;

        sessionToUser.put(sessionId, userId);

        // Buscar chats do usuário e fazer broadcast online
        try {
            var memberships = chatMemberRepository.findByUserProfileId(userId);
            Set<UUID> chatIds = ConcurrentHashMap.newKeySet();
            for (var m : memberships) {
                chatIds.add(m.getChatId());
            }
            userChats.put(userId, chatIds);

            Map<String, Object> payload = Map.of(
                    "user_profile_id", userId.toString(),
                    "online", true
            );
            for (UUID chatId : chatIds) {
                messagingTemplate.convertAndSend("/topic/chat/" + chatId + "/presence",
                        java.util.Objects.requireNonNull((Object) payload));
            }
            log.debug("[Presence] {} ficou online em {} chats", userId, chatIds.size());
        } catch (RuntimeException e) {
            log.warn("[Presence] Erro ao processar conexão: {}", e.getMessage());
        }
    }

    @EventListener
    public void onDisconnected(SessionDisconnectEvent event) {
        StompHeaderAccessor sha = StompHeaderAccessor.wrap(event.getMessage());
        String sessionId = sha.getSessionId();
        if (sessionId == null) return;

        UUID userId = sessionToUser.remove(sessionId);
        if (userId == null) return;

        Set<UUID> chatIds = userChats.remove(userId);
        if (chatIds == null || chatIds.isEmpty()) return;

        Map<String, Object> payload = Map.of(
                "user_profile_id", userId.toString(),
                "online", false
        );
        for (UUID chatId : chatIds) {
            messagingTemplate.convertAndSend("/topic/chat/" + chatId + "/presence",
                    java.util.Objects.requireNonNull((Object) payload));
        }
        log.debug("[Presence] {} ficou offline", userId);
    }

    /**
     * Retorna os IDs dos usuários atualmente online que são membros do chat informado.
     */
    public Set<UUID> getOnlineUsersForChat(UUID chatId) {
        Set<UUID> online = new HashSet<>();
        for (Map.Entry<UUID, Set<UUID>> entry : userChats.entrySet()) {
            if (entry.getValue().contains(chatId)) {
                online.add(entry.getKey());
            }
        }
        return online;
    }

    public boolean isUserOnline(UUID userId) {
        return userChats.containsKey(userId);
    }
}

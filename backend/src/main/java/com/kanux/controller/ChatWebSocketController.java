package com.kanux.controller;

import com.kanux.entity.Message;
import com.kanux.repository.ChatMemberRepository;
import com.kanux.repository.MessageRepository;
import com.kanux.repository.UserProfileRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

import java.security.Principal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Controller WebSocket STOMP para mensagens de chat em tempo real.
 * Membros são adicionados ao chat pelo admin ou super admin via REST.
 * Após autenticação STOMP, o cliente recebe mensagens do tópico /topic/chat/{chatId}.
 * Clientes enviam para /app/chat/{chatId}/send para publicar mensagens.
 */
@SuppressWarnings("null")
@Controller
@RequestMapping
public class ChatWebSocketController {

    private static final Logger log = LoggerFactory.getLogger(ChatWebSocketController.class);

    private final SimpMessagingTemplate messagingTemplate;
    private final MessageRepository messageRepository;
    private final UserProfileRepository userProfileRepository;
    private final ChatMemberRepository chatMemberRepository;

    public ChatWebSocketController(SimpMessagingTemplate messagingTemplate,
                                    MessageRepository messageRepository,
                                    UserProfileRepository userProfileRepository,
                                    ChatMemberRepository chatMemberRepository) {
        this.messagingTemplate = messagingTemplate;
        this.messageRepository = messageRepository;
        this.userProfileRepository = userProfileRepository;
        this.chatMemberRepository = chatMemberRepository;
    }

    /**
     * Recebe mensagem do cliente e faz broadcast para todos os subscribers do chat.
     * Destino: /app/chat/{chatId}/send
     * Broadcast: /topic/chat/{chatId}
     */
    @MessageMapping("/chat/{chatId}/send")
    public void sendMessage(@DestinationVariable String chatId,
                             @Payload Map<String, Object> payload,
                             Principal principal) {
        if (principal == null) {
            log.warn("[WS] Tentativa de envio sem autenticação no chat {}", chatId);
            return;
        }

        try {
            UUID chatUuid = UUID.fromString(chatId);
            UUID senderProfileId = UUID.fromString(principal.getName());
            if (!chatMemberRepository.existsByChatIdAndUserProfileId(chatUuid, senderProfileId)) {
                log.warn("[WS] Usuário {} tentou enviar mensagem sem participar do chat {}", senderProfileId, chatId);
                return;
            }

            String content = payload.containsKey("content") ? String.valueOf(payload.get("content")) : "";
            String messageType = payload.containsKey("message_type")
                    ? String.valueOf(payload.get("message_type")) : "text";
            String mediaUrl = payload.containsKey("media_url") ? String.valueOf(payload.get("media_url")) : null;
            String mediaName = payload.containsKey("media_name") ? String.valueOf(payload.get("media_name")) : null;
            String clientMessageId = payload.containsKey("client_message_id")
                    ? String.valueOf(payload.get("client_message_id")) : null;

            if ("text".equals(messageType) && (content == null || content.isBlank())) {
                log.warn("[WS] Mensagem de texto vazia ignorada no chat {}", chatId);
                return;
            }

            // Idempotência: retries/offline sync com mesmo client_message_id não geram duplicata.
            if (clientMessageId != null && !clientMessageId.isBlank() && !"null".equals(clientMessageId)) {
                var existing = messageRepository.findByChatIdAndUserProfileIdAndClientMessageId(
                        chatUuid, senderProfileId, clientMessageId);
                if (existing.isPresent()) {
                    Message dedup = existing.get();
                    String senderNameDedup = userProfileRepository.findById(senderProfileId)
                            .map(up -> up.getDisplayName() != null ? up.getDisplayName() : up.getEmail())
                            .orElse("Usuário");

                    Map<String, Object> dedupBroadcast = new LinkedHashMap<>();
                    dedupBroadcast.put("id", dedup.getId().toString());
                    dedupBroadcast.put("chat_id", chatId);
                    dedupBroadcast.put("user_profile_id", senderProfileId.toString());
                    dedupBroadcast.put("display_name", senderNameDedup);
                    dedupBroadcast.put("content", dedup.getContent());
                    dedupBroadcast.put("message_type", dedup.getMessageType());
                    dedupBroadcast.put("media_url", dedup.getMediaUrl());
                    dedupBroadcast.put("media_name", dedup.getMediaName());
                    dedupBroadcast.put("client_message_id", dedup.getClientMessageId());
                    dedupBroadcast.put("attachments", "[]");
                    dedupBroadcast.put("created_at", dedup.getCreatedAt() != null ? dedup.getCreatedAt().toString()
                            : Instant.now().toString());
                    dedupBroadcast.put("source", "websocket_dedup");

                    messagingTemplate.convertAndSend("/topic/chat/" + chatId, (Object) dedupBroadcast);
                    return;
                }
            }

            // Salvar mensagem no banco
            Message message = new Message();
            message.setChatId(chatUuid);
            message.setUserProfileId(senderProfileId);
            message.setContent(content != null ? content : "");
            message.setMessageType(messageType);
            message.setAttachments("[]");
            if (mediaUrl != null && !mediaUrl.equals("null")) message.setMediaUrl(mediaUrl);
            if (mediaName != null && !mediaName.equals("null")) message.setMediaName(mediaName);
            if (clientMessageId != null && !clientMessageId.isBlank() && !"null".equals(clientMessageId)) {
                message.setClientMessageId(clientMessageId);
            }
            Message saved = messageRepository.save(message);

            // Buscar nome do remetente
            String senderName = userProfileRepository.findById(senderProfileId)
                    .map(up -> up.getDisplayName() != null ? up.getDisplayName() : up.getEmail())
                    .orElse("Usuário");

            // Montar payload para broadcast
            Map<String, Object> broadcast = new LinkedHashMap<>();
            broadcast.put("id", saved.getId().toString());
            broadcast.put("chat_id", chatId);
            broadcast.put("user_profile_id", senderProfileId.toString());
            broadcast.put("display_name", senderName);
            broadcast.put("content", saved.getContent());
            broadcast.put("message_type", saved.getMessageType());
            broadcast.put("media_url", saved.getMediaUrl());
            broadcast.put("media_name", saved.getMediaName());
            broadcast.put("client_message_id", saved.getClientMessageId());
            broadcast.put("attachments", "[]");
            broadcast.put("created_at", saved.getCreatedAt() != null ? saved.getCreatedAt().toString()
                    : Instant.now().toString());
            broadcast.put("source", "websocket"); // distingue de mensagens via REST

            // Broadcast para todos no tópico do chat
            messagingTemplate.convertAndSend("/topic/chat/" + chatId, (Object) broadcast);
            log.debug("[WS] Mensagem broadcast → /topic/chat/{} por {}", chatId, senderName);

        } catch (org.springframework.messaging.MessagingException e) {
            log.error("[WS] Erro ao processar mensagem no chat {}: {}", chatId, e.getMessage());
        }
    }

    /**
     * Evento de digitação em tempo real.
     * Destino: /app/chat/{chatId}/typing
     * Broadcast: /topic/chat/{chatId}/typing
     */
    @MessageMapping("/chat/{chatId}/typing")
    public void typing(@DestinationVariable String chatId,
                        @Payload Map<String, Object> payload,
                        Principal principal) {
        if (principal == null) return;
        try {
            UUID chatUuid = UUID.fromString(chatId);
            UUID senderProfileId = UUID.fromString(principal.getName());
            UUID nonNullTypingSenderId = senderProfileId;
            if (!chatMemberRepository.existsByChatIdAndUserProfileId(chatUuid, nonNullTypingSenderId)) {
                return;
            }
            boolean isTyping = Boolean.TRUE.equals(payload.get("typing"));

            String senderName = userProfileRepository.findById(nonNullTypingSenderId)
                    .map(up -> up.getDisplayName() != null ? up.getDisplayName() : up.getEmail())
                    .orElse("Usuário");

            Map<String, Object> typingPayload = Map.of(
                    "user_profile_id", senderProfileId.toString(),
                    "display_name", senderName,
                    "typing", isTyping
            );
            messagingTemplate.convertAndSend("/topic/chat/" + chatId + "/typing", (Object) typingPayload);
        } catch (org.springframework.messaging.MessagingException e) {
            log.warn("[WS] Erro no evento de digitação: {}", e.getMessage());
        }
    }

    /**
     * Broadcast público de notificação de erro para admins.
     * Destino do subscribe: /topic/admin/{companyId}/alerts
     * Usado pelo ActivityLogService quando status >= 400.
     */
    public void broadcastErrorAlert(String companyId, Map<String, Object> alertPayload) {
        try {
            messagingTemplate.convertAndSend("/topic/admin/" + companyId + "/alerts", (Object) alertPayload);
            log.debug("[WS] Alerta de erro broadcast → /topic/admin/{}/alerts", companyId);
        } catch (org.springframework.messaging.MessagingException e) {
            log.warn("[WS] Falha ao broadcast alerta de erro: {}", e.getMessage());
        }
    }
}

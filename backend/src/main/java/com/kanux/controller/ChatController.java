package com.kanux.controller;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.kanux.dto.ApiResponse;
import com.kanux.dto.CreateChatRequest;
import com.kanux.dto.SendMessageRequest;
import com.kanux.entity.Chat;
import com.kanux.entity.ChatMember;
import com.kanux.entity.Message;
import com.kanux.entity.UserProfile;
import com.kanux.config.PresenceEventListener;
import com.kanux.config.PushNotificationService;
import com.kanux.repository.ChatMemberRepository;
import com.kanux.repository.ChatRepository;
import com.kanux.repository.MessageRepository;
import com.kanux.repository.UserProfileRepository;
import com.kanux.service.WorkingHoursService;

@RestController
@RequestMapping("/api/chats")
public class ChatController {

    private final ChatRepository chatRepository;
    private final ChatMemberRepository chatMemberRepository;
    private final MessageRepository messageRepository;
    private final UserProfileRepository userProfileRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final PushNotificationService pushNotificationService;
    private final PresenceEventListener presenceEventListener;
    private final WorkingHoursService workingHoursService;

    // chatId -> (userId -> timestamp da última digitação em ms)
    private final Map<UUID, Map<UUID, Long>> typingMap = new ConcurrentHashMap<>();

    public ChatController(ChatRepository chatRepository, ChatMemberRepository chatMemberRepository,
                          MessageRepository messageRepository, UserProfileRepository userProfileRepository,
                          SimpMessagingTemplate messagingTemplate,
                          PushNotificationService pushNotificationService,
                          PresenceEventListener presenceEventListener,
                          WorkingHoursService workingHoursService) {
        this.chatRepository = chatRepository;
        this.chatMemberRepository = chatMemberRepository;
        this.messageRepository = messageRepository;
        this.userProfileRepository = userProfileRepository;
        this.messagingTemplate = messagingTemplate;
        this.pushNotificationService = pushNotificationService;
        this.presenceEventListener = presenceEventListener;
        this.workingHoursService = workingHoursService;
    }

    @SuppressWarnings("null")
    @GetMapping
    public ResponseEntity<?> getChats(
            @AuthenticationPrincipal UserProfile p,
            @RequestParam(required = false) String companyId,
            @RequestParam(required = false) String chatId) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        if (chatId != null) {
            try {
                return chatRepository.findById(UUID.fromString(chatId))
                        .map(c -> ResponseEntity.ok(ApiResponse.ok(c)))
                        .orElse(ResponseEntity.notFound().build());
            } catch (IllegalArgumentException e) {
                return ResponseEntity.badRequest().body(ApiResponse.fail("Invalid chatId format"));
            }
        }
        if (companyId != null)
            return ResponseEntity.ok(ApiResponse.ok(
                    chatRepository.findVisibleChats(UUID.fromString(companyId), p.getId())));
        return ResponseEntity.badRequest().body(ApiResponse.fail("companyId ou chatId é obrigatório"));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<Chat>> createChat(
            @AuthenticationPrincipal UserProfile p, @RequestBody CreateChatRequest req) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        Chat chat = new Chat();
        chat.setCompanyId(UUID.fromString(req.getCompanyId()));
        if (req.getDepartmentId() != null) chat.setDepartmentId(UUID.fromString(req.getDepartmentId()));
        chat.setName(req.getName());
        chat.setPrivateChat(req.isPrivate());
        chat.setOnlyAdminsSend(req.isOnlyAdminsSend());
        chat.setCreatedBy(p.getId());
        Chat savedChat = chatRepository.save(chat);

        // Adiciona automaticamente o criador como membro ADMIN do chat
        ChatMember creatorMember = new ChatMember();
        creatorMember.setChatId(savedChat.getId());
        creatorMember.setUserProfileId(p.getId());
        creatorMember.setRole("ADMIN");
        chatMemberRepository.save(creatorMember);

        return ResponseEntity.ok(ApiResponse.ok(savedChat));
    }

    @SuppressWarnings("null")
    @DeleteMapping
    public ResponseEntity<ApiResponse<Void>> deleteChat(
            @AuthenticationPrincipal UserProfile p, @RequestParam String id) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        chatRepository.deleteById(UUID.fromString(id));
        return ResponseEntity.ok(ApiResponse.ok(null));
    }

    @SuppressWarnings("null")
    @PatchMapping("/{chatId}")
    public ResponseEntity<ApiResponse<Chat>> updateChat(
            @AuthenticationPrincipal UserProfile p, @PathVariable String chatId,
            @RequestBody Map<String, Object> body) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        return chatRepository.findById(UUID.fromString(chatId)).map(chat -> {
            if (body.containsKey("name")) chat.setName(String.valueOf(body.get("name")));
            if (body.containsKey("only_admins_send")) chat.setOnlyAdminsSend(Boolean.parseBoolean(String.valueOf(body.get("only_admins_send"))));
            return ResponseEntity.ok(ApiResponse.ok(chatRepository.save(chat)));
        }).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/{chatId}/messages")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getMessages(
            @AuthenticationPrincipal UserProfile p, @PathVariable String chatId) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        List<Map<String, Object>> result = messageRepository
                .findByChatIdOrderByCreatedAt(UUID.fromString(chatId))
                .stream().limit(50).map(this::toMap).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @SuppressWarnings("null")
    @PostMapping("/{chatId}/messages")
    public ResponseEntity<ApiResponse<Map<String, Object>>> sendMessage(
            @AuthenticationPrincipal UserProfile p, @PathVariable String chatId,
            @RequestBody SendMessageRequest req) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        workingHoursService.ensureAllowed(p, "enviar mensagens");
        // conteúdo obrigatório apenas para mensagens de texto; mídia pode ter content vazio
        boolean isTextMessage = req.getMessageType() == null || "text".equals(req.getMessageType());
        if (isTextMessage && (req.getContent() == null || req.getContent().isBlank()))
            return ResponseEntity.badRequest().body(ApiResponse.fail("content é obrigatório para mensagens de texto"));
        UUID senderId = p.getId();
        if (req.getUserProfileId() != null) {
            try { senderId = UUID.fromString(req.getUserProfileId()); } catch (Exception ignored) {}
        }
        String clientMessageId = req.getClientMessageId();
        if (clientMessageId != null && !clientMessageId.isBlank()) {
            var existing = messageRepository.findByChatIdAndUserProfileIdAndClientMessageId(
                    UUID.fromString(chatId), senderId, clientMessageId);
            if (existing.isPresent()) {
                return ResponseEntity.ok(ApiResponse.ok(toMap(existing.get())));
            }
        }

        Message message = new Message();
        message.setChatId(UUID.fromString(chatId));
        message.setUserProfileId(senderId);
        message.setContent(req.getContent() != null ? req.getContent() : "");
        message.setMessageType(req.getMessageType() != null ? req.getMessageType() : "text");
        if (req.getMediaUrl() != null) message.setMediaUrl(req.getMediaUrl());
        if (req.getMediaName() != null) message.setMediaName(req.getMediaName());
        if (clientMessageId != null && !clientMessageId.isBlank()) message.setClientMessageId(clientMessageId);
        message.setAttachments("[]");
        Message saved = messageRepository.save(message);
        Map<String, Object> payload = toMap(saved);
        messagingTemplate.convertAndSend("/topic/chat/" + chatId, payload);

        // Push notification para membros offline
        String senderName = p.getDisplayName() != null ? p.getDisplayName() : p.getEmail();
        pushNotificationService.notifyNewMessage(
                UUID.fromString(chatId), senderId, senderName, null,
                saved.getContent(), saved.getMessageType());

        return ResponseEntity.ok(ApiResponse.ok(payload));
    }

    @PostMapping("/{chatId}/typing")
    public ResponseEntity<ApiResponse<Void>> setTyping(
            @AuthenticationPrincipal UserProfile p, @PathVariable String chatId,
            @RequestBody Map<String, Object> body) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        workingHoursService.ensureAllowed(p, "enviar mensagens");
        boolean typing = false;
        if (body != null && body.containsKey("typing")) {
            try { typing = Boolean.parseBoolean(String.valueOf(body.get("typing"))); } catch (Exception ignored) {}
        }
        UUID cId;
        try { cId = UUID.fromString(chatId); } catch (Exception e) { return ResponseEntity.badRequest().body(ApiResponse.fail("Invalid chatId")); }

        Map<UUID, Long> m = typingMap.computeIfAbsent(cId, k -> new ConcurrentHashMap<>());
        if (typing) {
            m.put(p.getId(), System.currentTimeMillis());
        } else {
            m.remove(p.getId());
        }

        return ResponseEntity.ok(ApiResponse.ok(null));
    }

    @GetMapping("/{chatId}/typing")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getTyping(
            @AuthenticationPrincipal UserProfile p, @PathVariable String chatId) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        UUID cId;
        try { cId = UUID.fromString(chatId); } catch (Exception e) { return ResponseEntity.badRequest().body(ApiResponse.fail("Invalid chatId")); }

        Map<UUID, Long> m = typingMap.getOrDefault(cId, new HashMap<>());
        long now = System.currentTimeMillis();
        long ttl = 5000; // considera digitação ativa se atualizada nos últimos 5 segundos

        List<Map<String, Object>> result = m.entrySet().stream()
                .filter(e -> now - e.getValue() <= ttl && !e.getKey().equals(p.getId()))
                .map(e -> {
                    Map<String, Object> map = new LinkedHashMap<>();
                    UUID userId = e.getKey();
                    map.put("user_profile_id", userId);
                    Optional<UserProfile> opt = userProfileRepository.findById(Objects.requireNonNull(userId));
                    map.put("display_name", opt.map(UserProfile::getDisplayName).orElse(null));
                    return map;
                }).collect(Collectors.toList());

        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    // ==================== Membros do Chat ====================

    @GetMapping("/{chatId}/members")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getChatMembers(
            @AuthenticationPrincipal UserProfile p, @PathVariable String chatId) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Não autorizado"));
        List<Map<String, Object>> result = chatMemberRepository
                .findByChatIdWithProfile(UUID.fromString(chatId))
                .stream().map(cm -> {
                    Map<String, Object> map = new LinkedHashMap<>();
                    map.put("id", cm.getId());
                    map.put("chat_id", cm.getChatId());
                    map.put("user_profile_id", cm.getUserProfileId());
                    map.put("role", cm.getRole());
                    map.put("joined_at", cm.getJoinedAt());
                    if (cm.getUserProfile() != null) {
                        Map<String, Object> up = new LinkedHashMap<>();
                        up.put("id", cm.getUserProfile().getId());

                        up.put("display_name", cm.getUserProfile().getDisplayName());
                        up.put("email", cm.getUserProfile().getEmail());
                        up.put("avatar_url", cm.getUserProfile().getAvatarUrl());
                        map.put("user_profile", up);
                    }
                    return map;
                }).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @PostMapping("/{chatId}/members")
    public ResponseEntity<ApiResponse<Map<String, Object>>> addChatMember(
            @AuthenticationPrincipal UserProfile p, @PathVariable String chatId,
            @RequestBody Map<String, String> body) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Não autorizado"));
        String userProfileId = body.get("user_profile_id");
        if (userProfileId == null || userProfileId.isBlank())
            return ResponseEntity.badRequest().body(ApiResponse.fail("user_profile_id é obrigatório"));

        UUID cId = UUID.fromString(chatId);
        UUID uId = UUID.fromString(userProfileId);

        if (chatMemberRepository.existsByChatIdAndUserProfileId(cId, uId))
            return ResponseEntity.badRequest().body(ApiResponse.fail("Usuário já é membro deste chat"));

        ChatMember cm = new ChatMember();
        cm.setChatId(cId);
        cm.setUserProfileId(uId);
        cm.setRole(body.getOrDefault("role", "MEMBER"));
        ChatMember saved = chatMemberRepository.save(cm);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", saved.getId());
        result.put("chat_id", saved.getChatId());
        result.put("user_profile_id", saved.getUserProfileId());
        result.put("role", saved.getRole());
        result.put("joined_at", saved.getJoinedAt());
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("action", "added");
            payload.put("member", result);
            messagingTemplate.convertAndSend("/topic/chat/" + cId + "/members", payload);
        } catch (RuntimeException e) {
            org.slf4j.LoggerFactory.getLogger(ChatController.class)
                    .warn("[WS] Falha ao notificar membros adicionados do chat {}: {}", cId, e.getMessage());
        }
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @Transactional
    @DeleteMapping("/{chatId}/members/{userProfileId}")
    public ResponseEntity<ApiResponse<Void>> removeChatMember(
            @AuthenticationPrincipal UserProfile p, @PathVariable String chatId,
            @PathVariable String userProfileId) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Não autorizado"));
        UUID cId = UUID.fromString(chatId);
        UUID uId = UUID.fromString(userProfileId);
        chatMemberRepository.deleteByChatIdAndUserProfileId(cId, uId);
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("action", "removed");
            payload.put("user_profile_id", uId.toString());
            messagingTemplate.convertAndSend("/topic/chat/" + cId + "/members", payload);
        } catch (RuntimeException e) {
            org.slf4j.LoggerFactory.getLogger(ChatController.class)
                    .warn("[WS] Falha ao notificar remoção de membro no chat {}: {}", cId, e.getMessage());
        }
        return ResponseEntity.ok(ApiResponse.ok(null));
    }

    /** Retorna IDs dos usuários atualmente online (via WebSocket) no chat informado. */
    @GetMapping("/{chatId}/online-members")
    public ResponseEntity<ApiResponse<List<String>>> getOnlineMembers(
            @AuthenticationPrincipal UserProfile p, @PathVariable String chatId) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        UUID chatUuid;
        try {
            chatUuid = UUID.fromString(chatId);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(ApiResponse.fail("Invalid chatId"));
        }
        List<String> ids = presenceEventListener.getOnlineUsersForChat(chatUuid)
                .stream().map(UUID::toString).toList();
        return ResponseEntity.ok(ApiResponse.ok(ids));
    }

    @SuppressWarnings("null")
    private Map<String, Object> toMap(Message m) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", m.getId()); map.put("chat_id", m.getChatId());
        map.put("user_profile_id", m.getUserProfileId()); map.put("content", m.getContent());
        map.put("message_type", m.getMessageType() != null ? m.getMessageType() : "text");
        map.put("media_url", m.getMediaUrl());
        map.put("media_name", m.getMediaName());
        map.put("client_message_id", m.getClientMessageId());
        map.put("attachments", m.getAttachments()); map.put("created_at", m.getCreatedAt());
        map.put("updated_at", m.getUpdatedAt());

        // Inclui informações do perfil do usuário para exibição
        if (m.getUserProfileId() != null) {
            UUID profileId = m.getUserProfileId();
            userProfileRepository.findById(profileId).ifPresent(up -> {
                map.put("display_name", up.getDisplayName());
                map.put("avatar_url", up.getAvatarUrl());
            });
        }

        return map;
    }

}

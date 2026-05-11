package com.kanux.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanux.controller.ChatWebSocketController;
import com.kanux.entity.CompanyMember;
import com.kanux.entity.UserProfile;
import com.kanux.repository.ChatMemberRepository;
import com.kanux.repository.CompanyMemberRepository;
import com.kanux.repository.UserProfileRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Serviço responsável por:
 * 1. Enviar notificações push via Expo Push API quando status >= 400
 * 2. Fazer broadcast WebSocket para admins via /topic/admin/{companyId}/alerts
 */
@Service
public class PushNotificationService {

    private static final Logger log = LoggerFactory.getLogger(PushNotificationService.class);
    private static final String EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

    // Rate-limiting simples: evita spam de notificações para a mesma empresa
    // Chave: companyId — valor: timestamp da última notificação
    private final Map<UUID, Long> lastNotifiedAt = new java.util.concurrent.ConcurrentHashMap<>();
    private static final long NOTIFY_COOLDOWN_MS = 30_000; // 30 segundos entre notificações por empresa

    private final CompanyMemberRepository companyMemberRepository;
    private final ChatMemberRepository chatMemberRepository;
    private final UserProfileRepository userProfileRepository;
    private final ChatWebSocketController chatWebSocketController;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public PushNotificationService(CompanyMemberRepository companyMemberRepository,
                                    ChatMemberRepository chatMemberRepository,
                                    UserProfileRepository userProfileRepository,
                                    @Lazy ChatWebSocketController chatWebSocketController) {
        this.companyMemberRepository = companyMemberRepository;
        this.chatMemberRepository = chatMemberRepository;
        this.userProfileRepository = userProfileRepository;
        this.chatWebSocketController = chatWebSocketController;
    }

    /**
     * Notifica admins de uma empresa quando um erro HTTP (>= 400) ocorre.
     * Executa de forma assíncrona para não impactar a performance.
     */
    @Async
    public void notifyAdminsOnError(UUID companyId, String userName, String method,
                                     String endpoint, int status, String description) {
        if (companyId == null) return;

        // Rate-limit: no máximo 1 notificação a cada 30s por empresa
        long now = System.currentTimeMillis();
        Long lastTime = lastNotifiedAt.get(companyId);
        if (lastTime != null && (now - lastTime) < NOTIFY_COOLDOWN_MS) {
            log.debug("[Push] Notificação suprimida por rate-limit para empresa {}", companyId);
            return;
        }
        lastNotifiedAt.put(companyId, now);

        String statusEmoji = status >= 500 ? "🔴" : "🟡";
        String title = statusEmoji + " Erro " + status + " no sistema";
        String body = String.format("%s %s [%d] — %s", method, truncate(endpoint, 40), status,
                truncate(userName, 20));

        // Payload do alerta (para WebSocket e push)
        Map<String, Object> alertPayload = new LinkedHashMap<>();
        alertPayload.put("type", "ERROR_ALERT");
        alertPayload.put("status", status);
        alertPayload.put("method", method);
        alertPayload.put("endpoint", endpoint);
        alertPayload.put("user_name", userName);
        alertPayload.put("description", description);
        alertPayload.put("company_id", companyId.toString());
        alertPayload.put("timestamp", java.time.Instant.now().toString());

        // 1. Broadcast WebSocket para admins conectados em tempo real
        try {
            chatWebSocketController.broadcastErrorAlert(companyId.toString(), alertPayload);
        } catch (Exception e) {
            log.warn("[Push] Falha no broadcast WebSocket de erro: {}", e.getMessage());
        }

        // 2. Enviar push notification via Expo para admins com push_token
        try {
            List<CompanyMember> admins = companyMemberRepository
                    .findAdminsWithPushTokenByCompanyId(companyId);

            if (admins.isEmpty()) {
                log.debug("[Push] Nenhum admin com push_token para empresa {}", companyId);
                return;
            }

            List<Map<String, Object>> messages = new ArrayList<>();
            for (CompanyMember admin : admins) {
                String pushToken = admin.getUserProfile().getPushToken();
                if (pushToken == null || pushToken.isBlank()) continue;

                Map<String, Object> msg = new LinkedHashMap<>();
                msg.put("to", pushToken);
                msg.put("title", title);
                msg.put("body", body);
                msg.put("data", alertPayload);
                msg.put("sound", "default");
                msg.put("priority", status >= 500 ? "high" : "normal");
                messages.add(msg);
            }

            if (messages.isEmpty()) return;

            String jsonBody = objectMapper.writeValueAsString(messages);
            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(10))
                    .build();
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(EXPO_PUSH_URL))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                    .timeout(Duration.ofSeconds(15))
                    .build();

            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                log.info("[Push] {} notificações enviadas para admins da empresa {}", messages.size(), companyId);
            } else {
                log.warn("[Push] Expo API retornou {}: {}", response.statusCode(),
                        truncate(response.body(), 200));
            }

        } catch (java.io.IOException | InterruptedException e) {
            log.warn("[Push] Falha ao enviar push notifications: {}", e.getMessage());
        }
    }

    private String truncate(String s, int maxLen) {
        if (s == null) return "";
        return s.length() > maxLen ? s.substring(0, maxLen) + "…" : s;
    }
    /**
     * Envia push notification para os membros do chat quando uma nova mensagem chega.
     * N\u00e3o notifica o pr\u00f3prio remetente. Executa de forma ass\u00edncrona.
     */
    @Async
    public void notifyNewMessage(UUID chatId, UUID senderId, String senderName,
                                  String chatName, String content, String messageType) {
        try {
            List<com.kanux.entity.ChatMember> members =
                    chatMemberRepository.findMembersWithPushTokenExcludingSender(chatId, senderId);
            if (members.isEmpty()) return;

            String body = switch (messageType != null ? messageType : "") {
                case "image"    -> "\uD83D\uDCF7 Foto";
                case "audio"    -> "\uD83C\uDFB5 \u00c1udio";
                case "document" -> "\uD83D\uDCC4 Documento";
                default         -> content != null && content.length() > 60
                        ? content.substring(0, 60) + "\u2026"
                        : (content != null ? content : "");
            };

            String title = senderName + (chatName != null ? " em " + chatName : "");

            List<Map<String, Object>> messages = new ArrayList<>();
            for (com.kanux.entity.ChatMember member : members) {
                String pushToken = member.getUserProfile().getPushToken();
                if (pushToken == null || pushToken.isBlank()) continue;
                Map<String, Object> msg = new LinkedHashMap<>();
                msg.put("to", pushToken);
                msg.put("title", title);
                msg.put("body", body);
                msg.put("data", Map.of("chatId", chatId.toString()));
                msg.put("sound", "default");
                msg.put("priority", "high");
                msg.put("categoryId", "MESSAGE_REPLY");
                messages.add(msg);
            }
            if (messages.isEmpty()) return;

            String jsonBody = objectMapper.writeValueAsString(messages);
            HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(EXPO_PUSH_URL))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                    .timeout(Duration.ofSeconds(15))
                    .build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200) {
                log.debug("[Push] {} notifica\u00e7\u00f5es de mensagem enviadas para chat {}", messages.size(), chatId);
            } else {
                log.warn("[Push] Expo API (mensagem) retornou {}: {}", response.statusCode(), truncate(response.body(), 200));
            }
        } catch (java.io.IOException | InterruptedException e) {
            log.warn("[Push] Falha ao enviar push de mensagem: {}", e.getMessage());
        }
    }

    @Async
    public void notifyTicketAssigned(UUID ticketId, UUID assigneeProfileId, String ticketTitle, String companyId) {
        if (ticketId == null || assigneeProfileId == null) return;
        try {
            UserProfile assignee = userProfileRepository.findById(assigneeProfileId).orElse(null);
            if (assignee == null) return;
            String pushToken = assignee.getPushToken();
            if (pushToken == null || pushToken.isBlank()) return;

            Map<String, Object> data = new LinkedHashMap<>();
            data.put("ticketId", ticketId.toString());
            data.put("companyId", companyId);

            Map<String, Object> msg = new LinkedHashMap<>();
            msg.put("to", pushToken);
            msg.put("title", "📋 Ticket atribuído a você");
            msg.put("body", ticketTitle != null ? ticketTitle : "");
            msg.put("data", data);
            msg.put("sound", "default");
            msg.put("priority", "high");

            String jsonBody = objectMapper.writeValueAsString(List.of(msg));
            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(10))
                    .build();
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(EXPO_PUSH_URL))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                    .timeout(Duration.ofSeconds(15))
                    .build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                log.warn("[Push] Expo API (ticket assigned) retornou {}: {}", response.statusCode(),
                        truncate(response.body(), 200));
            }
        } catch (java.io.IOException e) {
            log.warn("[Push] Falha ao enviar push de ticket atribuído: {}", e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("[Push] Envio de push de ticket atribuído interrompido: {}", e.getMessage());
        }
    }
}

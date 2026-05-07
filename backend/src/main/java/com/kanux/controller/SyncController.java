package com.kanux.controller;

import com.kanux.dto.ApiResponse;
import com.kanux.entity.Chat;
import com.kanux.entity.Company;
import com.kanux.entity.Department;
import com.kanux.entity.Message;
import com.kanux.entity.Ticket;
import com.kanux.entity.UserProfile;
import com.kanux.repository.ChatRepository;
import com.kanux.repository.CompanyRepository;
import com.kanux.repository.DepartmentRepository;
import com.kanux.repository.MessageRepository;
import com.kanux.repository.TicketRepository;
import com.kanux.repository.UserProfileRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@RestController
@RequestMapping("/api/sync")
public class SyncController {

    private final CompanyRepository companyRepository;
    private final ChatRepository chatRepository;
    private final TicketRepository ticketRepository;
    private final DepartmentRepository departmentRepository;
    private final MessageRepository messageRepository;
    private final UserProfileRepository userProfileRepository;

    public SyncController(
            CompanyRepository companyRepository,
            ChatRepository chatRepository,
            TicketRepository ticketRepository,
            DepartmentRepository departmentRepository,
            MessageRepository messageRepository,
            UserProfileRepository userProfileRepository
    ) {
        this.companyRepository = companyRepository;
        this.chatRepository = chatRepository;
        this.ticketRepository = ticketRepository;
        this.departmentRepository = departmentRepository;
        this.messageRepository = messageRepository;
        this.userProfileRepository = userProfileRepository;
    }

    @GetMapping("/bootstrap")
    public ResponseEntity<ApiResponse<Map<String, Object>>> bootstrap(
            @AuthenticationPrincipal UserProfile p,
            @RequestParam(defaultValue = "50") int messagesPerChat
    ) {
        if (p == null) {
            return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        }

        int boundedMessagesPerChat = Math.max(1, Math.min(messagesPerChat, 200));

        List<Company> companies = p.isSuperAdmin()
                ? companyRepository.findAllByOrderByCompanyNumberAsc()
                : companyRepository.findByMemberProfileId(p.getId());

        List<Map<String, Object>> companyBundles = new ArrayList<>();

        for (Company company : companies) {
            UUID companyId = company.getId();

            List<Chat> chats = p.isSuperAdmin()
                    ? chatRepository.findByCompanyIdOrderByCreatedAtDesc(companyId)
                    : chatRepository.findVisibleChats(companyId, p.getId());
            List<Ticket> tickets = ticketRepository.findByCompanyIdOrderByCreatedAtDesc(companyId);
            List<Department> departments = departmentRepository.findByCompanyId(companyId);

            Map<String, Object> messagesByChat = new LinkedHashMap<>();
            for (Chat chat : chats) {
                List<Message> allMessages = messageRepository.findByChatIdOrderByCreatedAt(chat.getId());
                int fromIndex = Math.max(0, allMessages.size() - boundedMessagesPerChat);
                List<Message> tailMessages = allMessages.subList(fromIndex, allMessages.size());

                List<Map<String, Object>> payloadMessages = tailMessages.stream()
                        .map(this::toMessageMap)
                        .toList();

                messagesByChat.put(chat.getId().toString(), payloadMessages);
            }

            Map<String, Object> companyBundle = new LinkedHashMap<>();
            companyBundle.put("company", company);
            companyBundle.put("chats", chats);
            companyBundle.put("tickets", tickets);
            companyBundle.put("departments", departments);
            companyBundle.put("messages_by_chat", messagesByChat);
            companyBundles.add(companyBundle);
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("generated_at", Instant.now().toString());
        payload.put("messages_per_chat", boundedMessagesPerChat);
        payload.put("companies", companyBundles);
        payload.put("company_count", companyBundles.size());

        return ResponseEntity.ok(ApiResponse.ok(payload));
    }

    private Map<String, Object> toMessageMap(Message m) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", m.getId());
        map.put("chat_id", m.getChatId());
        map.put("user_profile_id", m.getUserProfileId());
        map.put("content", m.getContent());
        map.put("message_type", m.getMessageType() != null ? m.getMessageType() : "text");
        map.put("media_url", m.getMediaUrl());
        map.put("media_name", m.getMediaName());
        map.put("client_message_id", m.getClientMessageId());
        map.put("attachments", m.getAttachments());
        map.put("created_at", m.getCreatedAt());
        map.put("updated_at", m.getUpdatedAt());

        if (m.getUserProfileId() != null) {
            UUID profileId = Objects.requireNonNull(m.getUserProfileId());
            userProfileRepository.findById(profileId).ifPresent(up -> {
                map.put("display_name", up.getDisplayName());
                map.put("avatar_url", up.getAvatarUrl());
            });
        }

        return map;
    }
}

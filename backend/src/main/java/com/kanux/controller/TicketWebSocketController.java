package com.kanux.controller;

import com.kanux.entity.Ticket;
import com.kanux.entity.TicketComment;
import com.kanux.entity.UserProfile;
import com.kanux.repository.TicketCommentRepository;
import com.kanux.repository.TicketRepository;
import com.kanux.repository.UserProfileRepository;
import com.kanux.service.WorkingHoursService;
import java.security.Principal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.annotation.SendToUser;
import org.springframework.stereotype.Controller;

@Controller
public class TicketWebSocketController {

    private final TicketRepository ticketRepository;
    private final TicketCommentRepository commentRepository;
    private final UserProfileRepository userProfileRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final WorkingHoursService workingHoursService;

    public TicketWebSocketController(
            TicketRepository ticketRepository,
            TicketCommentRepository commentRepository,
            UserProfileRepository userProfileRepository,
            SimpMessagingTemplate messagingTemplate,
            WorkingHoursService workingHoursService) {
        this.ticketRepository = ticketRepository;
        this.commentRepository = commentRepository;
        this.userProfileRepository = userProfileRepository;
        this.messagingTemplate = messagingTemplate;
        this.workingHoursService = workingHoursService;
    }

    @SuppressWarnings({"null"})
    @MessageMapping("/ticket/{ticketId}/comment")
    public void addComment(
            @DestinationVariable String ticketId,
            @Payload Map<String, Object> payload,
            Principal principal) {
        if (principal == null) {
            return;
        }

        UUID ticketUuid = UUID.fromString(ticketId);
        UUID userProfileId = UUID.fromString(principal.getName());

        UserProfile profile = userProfileRepository.findById(userProfileId).orElse(null);
        if (profile == null) {
            return;
        }
        workingHoursService.ensureAllowed(profile, "responder chamados");

        String content = payload.get("content") != null ? String.valueOf(payload.get("content")) : "";
        if (content.isBlank()) {
            return;
        }

        if (!ticketRepository.existsById(ticketUuid)) {
            return;
        }

        TicketComment comment = new TicketComment();
        comment.setTicketId(ticketUuid);
        comment.setUserProfileId(userProfileId);
        comment.setContent(content);
        TicketComment saved = commentRepository.save(comment);

        Map<String, Object> result = toCommentMap(saved, profile);
        messagingTemplate.convertAndSend("/topic/ticket/" + ticketId + "/comments", (Object) result);
    }

    @SuppressWarnings({"null"})
    @MessageMapping("/ticket/{ticketId}/update")
    public void updateTicket(
            @DestinationVariable String ticketId,
            @Payload Map<String, Object> payload,
            Principal principal) {
        if (principal == null) {
            return;
        }

        UUID ticketUuid = UUID.fromString(ticketId);
        UUID userProfileId = UUID.fromString(principal.getName());

        UserProfile profile = userProfileRepository.findById(userProfileId).orElse(null);
        if (profile == null) {
            return;
        }
        workingHoursService.ensureAllowed(profile, "atualizar chamados");

        Ticket ticket = ticketRepository.findById(ticketUuid).orElse(null);
        if (ticket == null) {
            return;
        }

        if (payload.get("status") != null) {
            Ticket.TicketStatus status = Ticket.TicketStatus.valueOf(String.valueOf(payload.get("status")).trim().toUpperCase());
            ticket.setStatus(status);
            if (status == Ticket.TicketStatus.RESOLVED && ticket.getResolvedAt() == null) {
                ticket.setResolvedAt(Instant.now());
            }
        }
        if (payload.get("priority") != null) {
            Ticket.TicketPriority priority = Ticket.TicketPriority.valueOf(String.valueOf(payload.get("priority")).trim().toUpperCase());
            ticket.setPriority(priority);
        }

        Ticket saved = ticketRepository.save(ticket);
        messagingTemplate.convertAndSend("/topic/ticket/" + ticketId + "/updated", saved);
    }

    private Map<String, Object> toCommentMap(TicketComment comment, UserProfile userProfile) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", comment.getId());
        map.put("ticket_id", comment.getTicketId());
        map.put("user_profile_id", comment.getUserProfileId());
        map.put("content", comment.getContent());
        map.put("created_at", comment.getCreatedAt());
        if (userProfile != null) {
            Map<String, Object> up = new LinkedHashMap<>();
            up.put("id", userProfile.getId());
            up.put("display_name", userProfile.getDisplayName());
            up.put("email", userProfile.getEmail());
            up.put("avatar_url", userProfile.getAvatarUrl());
            map.put("user_profile", up);
        }
        return map;
    }

    @SuppressWarnings({"null"})
    @MessageMapping("/ticket/create")
    @SendToUser("/queue/ticket-created")
    public Map<String, Object> createTicket(
            @Payload Map<String, Object> payload,
            Principal principal) {
        Map<String, Object> error = new LinkedHashMap<>();
        if (principal == null) {
            error.put("success", false);
            error.put("error", "Não autenticado");
            return error;
        }

        UUID userProfileId = UUID.fromString(principal.getName());
        UserProfile profile = userProfileRepository.findById(userProfileId).orElse(null);
        if (profile == null) {
            error.put("success", false);
            error.put("error", "Perfil não encontrado");
            return error;
        }

        try {
            workingHoursService.ensureAllowed(profile, "abrir chamados");
        } catch (Exception e) {
            error.put("success", false);
            error.put("error", e.getMessage());
            return error;
        }

        String companyIdStr = payload.get("companyId") != null ? String.valueOf(payload.get("companyId")) : null;
        String title = payload.get("title") != null ? String.valueOf(payload.get("title")) : null;
        if (companyIdStr == null || title == null || title.isBlank()) {
            error.put("success", false);
            error.put("error", "companyId e title são obrigatórios");
            return error;
        }

        Ticket ticket = new Ticket();
        ticket.setCompanyId(UUID.fromString(companyIdStr));
        ticket.setCreatorProfileId(userProfileId);
        ticket.setTitle(title.trim());

        if (payload.get("description") != null && !String.valueOf(payload.get("description")).isBlank()) {
            ticket.setDescription(String.valueOf(payload.get("description")).trim());
        }
        if (payload.get("priority") != null) {
            try {
                ticket.setPriority(Ticket.TicketPriority.valueOf(String.valueOf(payload.get("priority")).trim().toUpperCase()));
            } catch (IllegalArgumentException ignored) { }
        }
        if (payload.get("departmentId") != null && !String.valueOf(payload.get("departmentId")).isBlank()) {
            ticket.setDepartmentId(UUID.fromString(String.valueOf(payload.get("departmentId"))));
        }
        if (payload.get("assigneeProfileId") != null && !String.valueOf(payload.get("assigneeProfileId")).isBlank()) {
            ticket.setAssigneeProfileId(UUID.fromString(String.valueOf(payload.get("assigneeProfileId"))));
        }

        Ticket saved = ticketRepository.save(ticket);
        // Notify all subscribers of this company
        messagingTemplate.convertAndSend("/topic/company/" + companyIdStr + "/tickets", saved);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("ticket", saved);
        return result;
    }
}

package com.kanux.controller;

import com.kanux.dto.ApiResponse;
import com.kanux.dto.CreateTicketRequest;
import com.kanux.dto.UpdateTicketRequest;
import com.kanux.config.PushNotificationService;
import com.kanux.entity.Ticket;
import com.kanux.entity.TicketComment;
import com.kanux.entity.UserProfile;
import com.kanux.repository.TicketCommentRepository;
import com.kanux.repository.TicketRepository;
import com.kanux.service.WorkingHoursService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/tickets")
public class TicketController {

    private static final Logger log = LoggerFactory.getLogger(TicketController.class);

    private final TicketRepository ticketRepository;
    private final TicketCommentRepository commentRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final WorkingHoursService workingHoursService;
    private final PushNotificationService pushNotificationService;

    public TicketController(
            TicketRepository ticketRepository,
            TicketCommentRepository commentRepository,
            SimpMessagingTemplate messagingTemplate,
            WorkingHoursService workingHoursService,
            PushNotificationService pushNotificationService) {
        this.ticketRepository = ticketRepository;
        this.commentRepository = commentRepository;
        this.messagingTemplate = messagingTemplate;
        this.workingHoursService = workingHoursService;
        this.pushNotificationService = pushNotificationService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<?>> getTickets(
            @AuthenticationPrincipal UserProfile p,
            @RequestParam(required = false) String companyId,
            @RequestParam(required = false) String ticketId) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));

        if (ticketId != null) {
            @SuppressWarnings("null")
            var ticketOptional = ticketRepository.findById(UUID.fromString(ticketId));
            if (ticketOptional.isEmpty()) return ResponseEntity.notFound().build();
            return ResponseEntity.ok(ApiResponse.ok(ticketOptional.get()));
        }

        if (companyId != null) {
            var tickets = ticketRepository.findByCompanyIdOrderByCreatedAtDesc(UUID.fromString(companyId));
            return ResponseEntity.ok(ApiResponse.ok(tickets));
        }

        return ResponseEntity.badRequest().body(ApiResponse.fail("companyId ou ticketId é obrigatório"));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<Ticket>> createTicket(
            @AuthenticationPrincipal UserProfile p, @RequestBody CreateTicketRequest req) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        workingHoursService.ensureAllowed(p, "abrir chamados");
        UUID creatorId = req.getCreatorProfileId() != null ? UUID.fromString(req.getCreatorProfileId()) : p.getId();
        Ticket ticket = new Ticket();
        ticket.setCompanyId(UUID.fromString(req.getCompanyId()));
        if (req.getDepartmentId() != null) ticket.setDepartmentId(UUID.fromString(req.getDepartmentId()));
        ticket.setCreatorProfileId(creatorId);
        ticket.setTitle(req.getTitle());
        ticket.setDescription(req.getDescription());
        ticket.setPriority(req.getPriority() != null ? Ticket.TicketPriority.valueOf(req.getPriority().trim().toUpperCase()) : Ticket.TicketPriority.MEDIUM);
        ticket.setStatus(Ticket.TicketStatus.OPEN);
        ticket = ticketRepository.save(ticket);
        try {
            messagingTemplate.convertAndSend("/topic/company/" + ticket.getCompanyId() + "/tickets", ticket);
        } catch (RuntimeException e) {
            log.warn("[WS] Falha ao publicar criação do ticket {}: {}", ticket.getId(), e.getMessage());
        }
        return ResponseEntity.ok(ApiResponse.ok(ticket));
    }

    @SuppressWarnings("null")
    @PutMapping
    public ResponseEntity<ApiResponse<Ticket>> updateTicket(
            @AuthenticationPrincipal UserProfile p, @RequestBody UpdateTicketRequest req) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        workingHoursService.ensureAllowed(p, "atualizar chamados");
        return ticketRepository.findById(UUID.fromString(req.getId())).map(t -> {
            UUID previousAssigneeId = t.getAssigneeProfileId();
            UUID newAssigneeId = previousAssigneeId;
            if (req.getTitle()       != null) t.setTitle(req.getTitle());
            if (req.getDescription() != null) t.setDescription(req.getDescription());
            if (req.getPriority()    != null) t.setPriority(Ticket.TicketPriority.valueOf(req.getPriority().trim().toUpperCase()));
            if (req.getDepartmentId()      != null) t.setDepartmentId(UUID.fromString(req.getDepartmentId()));
            if (req.getAssigneeProfileId() != null) {
                newAssigneeId = UUID.fromString(req.getAssigneeProfileId());
                t.setAssigneeProfileId(newAssigneeId);
            }
            if (req.getStatus() != null) {
                Ticket.TicketStatus s = Ticket.TicketStatus.valueOf(req.getStatus().trim().toUpperCase());
                t.setStatus(s);
                if (s == Ticket.TicketStatus.RESOLVED && t.getResolvedAt() == null) t.setResolvedAt(Instant.now());
            }
            Ticket saved = ticketRepository.save(t);
            try {
                messagingTemplate.convertAndSend("/topic/ticket/" + saved.getId() + "/updated", saved);
            } catch (RuntimeException e) {
                log.warn("[WS] Falha ao publicar atualização do ticket {}: {}", saved.getId(), e.getMessage());
            }
            try {
                messagingTemplate.convertAndSend("/topic/company/" + saved.getCompanyId() + "/tickets", saved);
            } catch (RuntimeException e) {
                log.warn("[WS] Falha ao publicar lista de tickets da empresa {}: {}", saved.getCompanyId(), e.getMessage());
            }
            if (newAssigneeId != null && !newAssigneeId.equals(previousAssigneeId)) {
                pushNotificationService.notifyTicketAssigned(
                        saved.getId(),
                        newAssigneeId,
                        saved.getTitle(),
                        saved.getCompanyId() != null ? saved.getCompanyId().toString() : null);
            }
            return ResponseEntity.ok(ApiResponse.ok(saved));
        }).orElse(ResponseEntity.notFound().build());
    }

    @SuppressWarnings("null")
    @DeleteMapping
    public ResponseEntity<ApiResponse<Void>> deleteTicket(
            @AuthenticationPrincipal UserProfile p, @RequestParam String id) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        workingHoursService.ensureAllowed(p, "alterar chamados");
        ticketRepository.deleteById(UUID.fromString(id));
        return ResponseEntity.ok(ApiResponse.ok(null));
    }

    @GetMapping("/{ticketId}/comments")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getComments(
            @AuthenticationPrincipal UserProfile p, @PathVariable String ticketId) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        List<Map<String, Object>> result = commentRepository
                .findByTicketIdWithProfileOrderByCreatedAtAsc(UUID.fromString(ticketId))
                .stream()
                .map(c -> toCommentMap(c, c.getUserProfile()))
                .collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @SuppressWarnings("null")
    @PostMapping("/{ticketId}/comments")
    public ResponseEntity<ApiResponse<Map<String, Object>>> addComment(
            @AuthenticationPrincipal UserProfile p, @PathVariable String ticketId,
            @RequestBody Map<String, String> body) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        workingHoursService.ensureAllowed(p, "responder chamados");
        String content = body.get("content");
        if (content == null || content.isBlank()) return ResponseEntity.badRequest().body(ApiResponse.fail("content é obrigatório"));
        TicketComment comment = new TicketComment();
        comment.setTicketId(UUID.fromString(ticketId));
        comment.setUserProfileId(p.getId());
        comment.setContent(content);
        TicketComment saved = commentRepository.save(comment);
        Map<String, Object> result = toCommentMap(saved, p);
        messagingTemplate.convertAndSend("/topic/ticket/" + saved.getTicketId() + "/comments", result);
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @SuppressWarnings("null")
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
}

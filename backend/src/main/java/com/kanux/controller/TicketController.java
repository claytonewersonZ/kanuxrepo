package com.kanux.controller;

import com.kanux.dto.ApiResponse;
import com.kanux.dto.CreateTicketRequest;
import com.kanux.dto.UpdateTicketRequest;
import com.kanux.entity.Ticket;
import com.kanux.entity.TicketComment;
import com.kanux.entity.UserProfile;
import com.kanux.repository.TicketCommentRepository;
import com.kanux.repository.TicketRepository;
import org.springframework.http.ResponseEntity;
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

    private final TicketRepository ticketRepository;
    private final TicketCommentRepository commentRepository;

    public TicketController(TicketRepository ticketRepository, TicketCommentRepository commentRepository) {
        this.ticketRepository = ticketRepository;
        this.commentRepository = commentRepository;
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
        return ResponseEntity.ok(ApiResponse.ok(ticket));
    }

    @SuppressWarnings("null")
    @PutMapping
    public ResponseEntity<ApiResponse<Ticket>> updateTicket(
            @AuthenticationPrincipal UserProfile p, @RequestBody UpdateTicketRequest req) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        return ticketRepository.findById(UUID.fromString(req.getId())).map(t -> {
            if (req.getTitle()       != null) t.setTitle(req.getTitle());
            if (req.getDescription() != null) t.setDescription(req.getDescription());
            if (req.getPriority()    != null) t.setPriority(Ticket.TicketPriority.valueOf(req.getPriority().trim().toUpperCase()));
            if (req.getDepartmentId()      != null) t.setDepartmentId(UUID.fromString(req.getDepartmentId()));
            if (req.getAssigneeProfileId() != null) t.setAssigneeProfileId(UUID.fromString(req.getAssigneeProfileId()));
            if (req.getStatus() != null) {
                Ticket.TicketStatus s = Ticket.TicketStatus.valueOf(req.getStatus().trim().toUpperCase());
                t.setStatus(s);
                if (s == Ticket.TicketStatus.RESOLVED && t.getResolvedAt() == null) t.setResolvedAt(Instant.now());
            }
            return ResponseEntity.ok(ApiResponse.ok(ticketRepository.save(t)));
        }).orElse(ResponseEntity.notFound().build());
    }

    @SuppressWarnings("null")
    @DeleteMapping
    public ResponseEntity<ApiResponse<Void>> deleteTicket(
            @AuthenticationPrincipal UserProfile p, @RequestParam String id) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        ticketRepository.deleteById(UUID.fromString(id));
        return ResponseEntity.ok(ApiResponse.ok(null));
    }

    @GetMapping("/{ticketId}/comments")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getComments(
            @AuthenticationPrincipal UserProfile p, @PathVariable String ticketId) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        List<Map<String, Object>> result = commentRepository
                .findByTicketIdWithProfileOrderByCreatedAtAsc(UUID.fromString(ticketId))
                .stream().map(c -> {
                    Map<String, Object> map = new LinkedHashMap<>();
                    map.put("id", c.getId());
                    map.put("ticket_id", c.getTicketId());
                    map.put("user_profile_id", c.getUserProfileId());
                    map.put("content", c.getContent());
                    map.put("created_at", c.getCreatedAt());
                    if (c.getUserProfile() != null) {
                        Map<String, Object> up = new LinkedHashMap<>();
                        up.put("id", c.getUserProfile().getId());
                        up.put("display_name", c.getUserProfile().getDisplayName());
                        up.put("email", c.getUserProfile().getEmail());
                        up.put("avatar_url", c.getUserProfile().getAvatarUrl());
                        map.put("user_profile", up);
                    }
                    return map;
                }).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @PostMapping("/{ticketId}/comments")
    public ResponseEntity<ApiResponse<Map<String, Object>>> addComment(
            @AuthenticationPrincipal UserProfile p, @PathVariable String ticketId,
            @RequestBody Map<String, String> body) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        String content = body.get("content");
        if (content == null || content.isBlank()) return ResponseEntity.badRequest().body(ApiResponse.fail("content é obrigatório"));
        TicketComment comment = new TicketComment();
        comment.setTicketId(UUID.fromString(ticketId));
        comment.setUserProfileId(p.getId());
        comment.setContent(content);
        TicketComment saved = commentRepository.save(comment);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", saved.getId());
        result.put("ticket_id", saved.getTicketId());
        result.put("user_profile_id", saved.getUserProfileId());
        result.put("content", saved.getContent());
        result.put("created_at", saved.getCreatedAt());
        Map<String, Object> up = new LinkedHashMap<>();
        up.put("id", p.getId());
        up.put("display_name", p.getDisplayName());
        up.put("email", p.getEmail());
        up.put("avatar_url", p.getAvatarUrl());
        result.put("user_profile", up);
        return ResponseEntity.ok(ApiResponse.ok(result));
    }
}

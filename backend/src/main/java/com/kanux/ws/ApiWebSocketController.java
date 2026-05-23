package com.kanux.ws;

import org.springframework.messaging.handler.annotation.*;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;
import org.springframework.messaging.simp.annotation.SendToUser;
import java.security.Principal;
import java.util.*;

@Controller
public class ApiWebSocketController {
    private final SimpMessagingTemplate messagingTemplate;

    public ApiWebSocketController(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    // Perfis
    @MessageMapping("/profile.get")
    @SendToUser("/topic/profile")
    public Map<String, Object> getProfile(Principal principal) {
        return new HashMap<>();
    }

    // Empresas
    @MessageMapping("/companies.list")
    @SendToUser("/topic/companies")
    public List<Map<String, Object>> listCompanies(Principal principal) {
        return new ArrayList<>();
    }

    // Membros da empresa
    @MessageMapping("/company.members")
    @SendToUser("/topic/company-members")
    public List<Map<String, Object>> listCompanyMembers(@Payload Map<String, Object> req, Principal principal) {
        return new ArrayList<>();
    }

    // Chats
    @MessageMapping("/api.chats.list")
    @SendToUser("/topic/api-chats")
    public List<Map<String, Object>> listChats(@Payload Map<String, Object> req, Principal principal) {
        return new ArrayList<>();
    }

    // Mensagens do chat
    @MessageMapping("/chat.messages.list")
    @SendToUser("/topic/chat-messages")
    public List<Map<String, Object>> listChatMessages(@Payload Map<String, Object> req, Principal principal) {
        return new ArrayList<>();
    }

    // Enviar mensagem
    @MessageMapping("/chat.message.send")
    public void sendChatMessage(@Payload Map<String, Object> msg, Principal principal) {
        messagingTemplate.convertAndSend("/topic/chat-messages", (Object) java.util.Objects.requireNonNull(msg));
    }

    // Tickets
    @MessageMapping("/tickets.list")
    @SendToUser("/topic/tickets")
    public List<Map<String, Object>> listTickets(@Payload Map<String, Object> req, Principal principal) {
        return new ArrayList<>();
    }

    // Criar ticket
    @MessageMapping("/ticket.create")
    public void createTicket(@Payload Map<String, Object> req, Principal principal) {
        messagingTemplate.convertAndSend("/topic/tickets", (Object) java.util.Objects.requireNonNull(req));
    }

    // Comentários de ticket
    @MessageMapping("/ticket.comments.list")
    @SendToUser("/topic/ticket-comments")
    public List<Map<String, Object>> listTicketComments(@Payload Map<String, Object> req, Principal principal) {
        return new ArrayList<>();
    }

    // Enviar comentário
    @MessageMapping("/ticket.comment.send")
    public void sendTicketComment(@Payload Map<String, Object> msg, Principal principal) {
        messagingTemplate.convertAndSend("/topic/ticket-comments", (Object) java.util.Objects.requireNonNull(msg));
    }

    // Departamentos
    @MessageMapping("/departments.list")
    @SendToUser("/topic/departments")
    public List<Map<String, Object>> listDepartments(Principal principal) {
        return new ArrayList<>();
    }

    // Admin (exemplo)
    @MessageMapping("/admin.invite-user")
    public void inviteUser(@Payload Map<String, Object> req, Principal principal) {
        messagingTemplate.convertAndSend("/topic/admin-invite", (Object) java.util.Objects.requireNonNull(req));
    }
}

package com.kanux.controller;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

import com.kanux.dto.AddMemberRequest;
import com.kanux.dto.ApiResponse;
import com.kanux.dto.InviteUserRequest;
import com.kanux.dto.UpdateMemberRequest;
import com.kanux.entity.Chat;
import com.kanux.entity.Company;
import com.kanux.entity.CompanyMember;
import com.kanux.entity.Ticket;
import com.kanux.entity.UserProfile;
import com.kanux.repository.ChatRepository;
import com.kanux.repository.CompanyMemberRepository;
import com.kanux.repository.CompanyRepository;
import com.kanux.repository.MessageRepository;
import com.kanux.repository.TicketRepository;
import com.kanux.repository.UserProfileRepository;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private static final Logger log = LoggerFactory.getLogger(AdminController.class);

    @Value("${supabase.url:}")
    private String supabaseUrl;

    @Value("${supabase.service-role-key:}")
    private String serviceRoleKey;

    private final CompanyRepository companyRepository;
    private final CompanyMemberRepository memberRepository;
    private final UserProfileRepository userProfileRepository;
    private final ChatRepository chatRepository;
    private final MessageRepository messageRepository;
    private final TicketRepository ticketRepository;

    public AdminController(CompanyRepository companyRepository, CompanyMemberRepository memberRepository,
            UserProfileRepository userProfileRepository, ChatRepository chatRepository,
            MessageRepository messageRepository, TicketRepository ticketRepository) {
        this.companyRepository = companyRepository;
        this.memberRepository = memberRepository;
        this.userProfileRepository = userProfileRepository;
        this.chatRepository = chatRepository;
        this.messageRepository = messageRepository;
        this.ticketRepository = ticketRepository;
    }

    @GetMapping("/companies")
    @SuppressWarnings("null")
    public ResponseEntity<ApiResponse<List<Company>>> getAllCompanies(@AuthenticationPrincipal UserProfile p) {
        if (!isAdminOrAbove(p)) return forbidden();
        if (p.isSuperAdmin()) {
            return ResponseEntity.ok(ApiResponse.ok(
                    companyRepository.findAll().stream()
                            .sorted(Comparator.comparing(Company::getCreatedAt).reversed())
                            .collect(Collectors.toList())));
        }
        // Usuários ADMIN só vêem as empresas das quais são membros
        List<UUID> companyIds = memberRepository.findByUserProfileId(p.getId()).stream()
                .map(CompanyMember::getCompanyId).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.ok(
                companyRepository.findAllById(companyIds).stream()
                        .sorted(Comparator.comparing(Company::getCreatedAt).reversed())
                        .collect(Collectors.toList())));
    }

    @DeleteMapping("/company")
    @SuppressWarnings("null")
    public ResponseEntity<ApiResponse<Void>> deleteCompany(@AuthenticationPrincipal UserProfile p, @RequestParam String id) {
        if (!isSuperAdmin(p)) return forbidden();
        if (id != null) {
            companyRepository.deleteById(UUID.fromString(id));
        }
        return ResponseEntity.ok(ApiResponse.ok(null));
    }

    @GetMapping("/members")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getMembers(
            @AuthenticationPrincipal UserProfile p, @RequestParam(required = false) String companyId) {
        if (!isAdminOrAbove(p)) return forbidden();
        List<CompanyMember> members = companyId != null
                ? memberRepository.findByCompanyIdWithProfile(UUID.fromString(companyId))
                : memberRepository.findAll();
        List<Map<String, Object>> result = members.stream().map(m -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("id", m.getId()); map.put("company_id", m.getCompanyId());
            map.put("user_profile_id", m.getUserProfileId()); map.put("role", m.getRole());
            map.put("joined_at", m.getJoinedAt());
            map.put("screen_permissions", m.getScreenPermissions() != null ? m.getScreenPermissions() : "{}");
            if (m.getUserProfile() != null) {
                UserProfile up = m.getUserProfile();
                map.put("user_profiles", Map.of(
                        "id", up.getId(), "display_name", String.valueOf(up.getDisplayName()),
                        "email", String.valueOf(up.getEmail()), "avatar_url", String.valueOf(up.getAvatarUrl())));
            }
            return map;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @PostMapping("/members")
    public ResponseEntity<ApiResponse<CompanyMember>> addMember(
            @AuthenticationPrincipal UserProfile p, @RequestBody AddMemberRequest req) {
        if (!isAdminOrAbove(p)) return forbidden();
        UUID companyId = UUID.fromString(req.getCompanyId());
        UUID upId = UUID.fromString(req.getUserProfileId());
        if (memberRepository.existsByCompanyIdAndUserProfileId(companyId, upId))
            return ResponseEntity.badRequest().body(ApiResponse.fail("Membro já existe"));
        CompanyMember m = new CompanyMember();
        m.setCompanyId(companyId);
        m.setUserProfileId(upId);
        m.setRole(CompanyMember.MemberRole.valueOf(req.getRole() != null ? req.getRole() : "MEMBER"));
        m = memberRepository.save(m);
        return ResponseEntity.ok(ApiResponse.ok(m));
    }

    @PutMapping("/members")
    @SuppressWarnings("null")
    public ResponseEntity<ApiResponse<CompanyMember>> updateMember(
            @AuthenticationPrincipal UserProfile p, @RequestBody UpdateMemberRequest req) {
        if (!isAdminOrAbove(p)) return forbidden();
        return memberRepository.findById(UUID.fromString(req.getId())).map(m -> {
            m.setRole(CompanyMember.MemberRole.valueOf(req.getRole()));
            return ResponseEntity.ok(ApiResponse.ok(memberRepository.save(m)));
        }).orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/members")
    @SuppressWarnings("null")
    public ResponseEntity<ApiResponse<Void>> removeMember(@AuthenticationPrincipal UserProfile p, @RequestParam String id) {
        if (!isAdminOrAbove(p)) return forbidden();
        memberRepository.deleteById(UUID.fromString(id));
        return ResponseEntity.ok(ApiResponse.ok(null));
    }

    @PostMapping("/invite-user")
    @SuppressWarnings("UseSpecificCatch")
    public ResponseEntity<ApiResponse<Map<String, Object>>> inviteUser(
            @AuthenticationPrincipal UserProfile p, @RequestBody InviteUserRequest req) {
        if (!isAdminOrAbove(p)) return forbidden();

        if (supabaseUrl.isBlank() || serviceRoleKey.isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.fail(
                    "Servidor não configurado para convidar usuários (SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes)"));
        }

        try {
            // Buscar ou criar usuário real no Supabase Auth via Invite API
            HttpHeaders headers = buildSupabaseHeaders();
            RestTemplate rest = new RestTemplate();

            UUID authUserId;
            UUID existing = findSupabaseAuthUserByEmail(rest, headers, req.getEmail());
            if (existing != null) {
                authUserId = existing;
            } else {
                // Enviar convite por e-mail via Supabase — cria auth.users real
                Map<String, Object> inviteBody = new LinkedHashMap<>();
                inviteBody.put("email", req.getEmail());
                inviteBody.put("data", Map.of("display_name",
                        req.getDisplayName() != null ? req.getDisplayName() : req.getEmail().split("@")[0]));
                HttpEntity<Map<String, Object>> inviteReq = new HttpEntity<>(inviteBody, headers);
                @SuppressWarnings("unchecked")
                Map<String, Object> authResp = rest.postForObject(
                        supabaseUrl + "/auth/v1/admin/invite", inviteReq, Map.class);
                if (authResp == null || authResp.get("id") == null)
                    return ResponseEntity.badRequest().body(ApiResponse.fail("Supabase não retornou ID do usuário convidado"));
                authUserId = UUID.fromString(authResp.get("id").toString());
            }

            // Criar ou atualizar perfil local com o auth_user_id real
            UserProfile invited = userProfileRepository.findByEmail(req.getEmail()).orElseGet(() -> {
                UserProfile up = new UserProfile();
                up.setAuthUserId(authUserId);
                up.setEmail(req.getEmail());
                up.setDisplayName(req.getDisplayName() != null ? req.getDisplayName()
                        : req.getEmail().split("@")[0]);
                return userProfileRepository.save(up);
            });
            // Garantir que o auth_user_id está correto (caso fosse criado antes com UUID falso)
            if (!authUserId.equals(invited.getAuthUserId())) {
                invited.setAuthUserId(authUserId);
                invited = userProfileRepository.save(invited);
            }

            UUID companyId = UUID.fromString(req.getCompanyId());
            if (!memberRepository.existsByCompanyIdAndUserProfileId(companyId, invited.getId())) {
                CompanyMember cm = new CompanyMember();
                cm.setCompanyId(companyId);
                cm.setUserProfileId(invited.getId());
                cm.setRole(CompanyMember.MemberRole.valueOf(req.getRole() != null ? req.getRole() : "MEMBER"));
                memberRepository.save(cm);
            }

            return ResponseEntity.ok(ApiResponse.ok(Map.of(
                    "message", "Convite enviado com sucesso",
                    "profile_id", invited.getId().toString(),
                    "email", invited.getEmail())));

        } catch (HttpClientErrorException e) {
            return ResponseEntity.badRequest().body(ApiResponse.fail("Erro Supabase: " + e.getResponseBodyAsString()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(ApiResponse.fail("Erro ao convidar usuário: " + e.getMessage()));
        }
    }

    @PostMapping("/create-user")
    @SuppressWarnings("UseSpecificCatch")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createUser(
            @AuthenticationPrincipal UserProfile p, @RequestBody Map<String, String> body) {
        if (!isAdminOrAbove(p)) return forbidden();

        String email = body.get("email");
        String password = body.get("password");
        String displayName = body.get("display_name");
        String position = body.get("position");
        String companyId = body.get("company_id");
        String role = body.getOrDefault("role", "MEMBER");

        if (email == null || password == null || displayName == null || companyId == null)
            return ResponseEntity.badRequest().body(ApiResponse.fail("email, password, display_name e company_id são obrigatórios"));

        if (password.length() < 6)
            return ResponseEntity.badRequest().body(ApiResponse.fail("Senha deve ter no mínimo 6 caracteres"));

        try {
            if (supabaseUrl.isBlank() || serviceRoleKey.isBlank()) {
                log.error("[createUser] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados");
                return ResponseEntity.badRequest().body(ApiResponse.fail(
                        "Servidor não configurado para criar usuários (SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes)"));
            }

            log.info("[createUser] Criando usuário email={} supabaseUrl={}", email, supabaseUrl);
            UUID authUserId;
            HttpHeaders headers = buildSupabaseHeaders();
            RestTemplate rest = new RestTemplate();

            // Verifica se o usuário já existe no Supabase Auth
            UUID existingAuthId = findSupabaseAuthUserByEmail(rest, headers, email);
            if (existingAuthId != null) {
                authUserId = existingAuthId;
                log.info("[createUser] Usuário já existe no Supabase Auth id={}, atualizando senha", authUserId);
                // Atualiza a senha do usuário existente
                updateSupabaseAuthUser(rest, headers, authUserId, password, displayName);
            } else {
                log.info("[createUser] Usuário não encontrado no Supabase Auth, criando novo");
                authUserId = createSupabaseAuthUser(rest, headers, email, password, displayName);
                log.info("[createUser] Usuário criado no Supabase Auth id={}", authUserId);
            }

            // 2. Cria ou localiza o perfil do usuário
            UserProfile profile;
            Optional<UserProfile> existing = userProfileRepository.findByEmail(email);
            if (existing.isPresent()) {
                profile = existing.get();
                profile.setAuthUserId(authUserId);
                profile.setDisplayName(displayName);
                if (position != null && !position.isBlank()) profile.setPosition(position);
                profile = userProfileRepository.save(profile);
            } else {
                profile = new UserProfile();
                profile.setAuthUserId(authUserId);
                profile.setEmail(email);
                profile.setDisplayName(displayName);
                if (position != null && !position.isBlank()) profile.setPosition(position);
                if ("SUPER_ADMIN".equals(role)) profile.setSuperAdmin(true);
                profile = userProfileRepository.save(profile);
            }

            // 3. Adiciona o usuário à empresa
            UUID cId = UUID.fromString(companyId);
            if (!memberRepository.existsByCompanyIdAndUserProfileId(cId, profile.getId())) {
                CompanyMember cm = new CompanyMember();
                cm.setCompanyId(cId);
                cm.setUserProfileId(profile.getId());
                cm.setRole(CompanyMember.MemberRole.valueOf(role));
                String screenPermissions = body.get("screen_permissions");
                if (screenPermissions != null && !screenPermissions.isBlank()) {
                    cm.setScreenPermissions(screenPermissions);
                }
                memberRepository.save(cm);
            } else {
                // Atualiza as permissões de tela no vínculo existente
                String screenPermissions = body.get("screen_permissions");
                if (screenPermissions != null && !screenPermissions.isBlank()) {
                    memberRepository.findByCompanyIdAndUserProfileId(cId, profile.getId())
                        .ifPresent(cm -> { cm.setScreenPermissions(screenPermissions); memberRepository.save(cm); });
                }
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("message", "Usuário criado com sucesso");
            result.put("profile_id", profile.getId().toString());
            result.put("email", email);
            result.put("auth_user_created", true);
            return ResponseEntity.ok(ApiResponse.ok(result));
        } catch (HttpClientErrorException e) {
            String errorBody = e.getResponseBodyAsString();
            log.error("[createUser] Erro Supabase HTTP {} body={}", e.getStatusCode(), errorBody);
            return ResponseEntity.badRequest().body(ApiResponse.fail("Erro Supabase Auth: " + errorBody));
        } catch (IllegalArgumentException e) {
            log.error("[createUser] Dados inválidos: {}", e.getMessage());
            return ResponseEntity.badRequest().body(ApiResponse.fail("Dados inválidos: " + e.getMessage()));
        } catch (Exception e) {
            Throwable rootCause = e.getCause();
            String cause = rootCause != null ? " | Causa: " + rootCause.getMessage() : "";
            log.error("[createUser] Erro inesperado: {}{}", e.getMessage(), cause, e);
            return ResponseEntity.badRequest().body(ApiResponse.fail("Erro ao criar usuário: " + e.getMessage() + cause));
        }
    }

    // ── Editar Usuário ───────────────────────────────────────────────────────
    @PutMapping("/users/{profileId}")
    @SuppressWarnings({"UseSpecificCatch", "null"})
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateUser(
            @AuthenticationPrincipal UserProfile p,
            @PathVariable String profileId,
            @RequestBody Map<String, String> body) {
        if (!isAdminOrAbove(p)) return forbidden();

        return userProfileRepository.findById(UUID.fromString(profileId)).map(profile -> {
            // Atualiza os campos básicos do perfil
            if (body.containsKey("display_name")) profile.setDisplayName(body.get("display_name"));
            if (body.containsKey("email")) profile.setEmail(body.get("email"));
            if (body.containsKey("position")) profile.setPosition(body.get("position"));
            if (body.containsKey("phone")) profile.setPhone(body.get("phone"));
            if (body.containsKey("department")) profile.setDepartment(body.get("department"));
            if (body.containsKey("is_super_admin")) profile.setSuperAdmin("true".equals(body.get("is_super_admin")));
            userProfileRepository.save(profile);

            // Atualiza a função na empresa, se informada
            if (body.containsKey("role") && body.containsKey("company_id")) {
                UUID companyId = UUID.fromString(body.get("company_id"));
                memberRepository.findByCompanyIdAndUserProfileId(companyId, profile.getId())
                        .ifPresent(member -> {
                            member.setRole(CompanyMember.MemberRole.valueOf(body.get("role")));
                            if (body.containsKey("screen_permissions")) {
                                member.setScreenPermissions(body.get("screen_permissions"));
                            }
                            memberRepository.save(member);
                        });
            }

            // Redefine a senha no Supabase Auth, se informada
            if (body.containsKey("password") && !body.get("password").isBlank()) {
                String newPassword = body.get("password");
                if (newPassword.length() < 6) {
                    return ResponseEntity.badRequest().body(ApiResponse.<Map<String, Object>>fail("Senha deve ter no mínimo 6 caracteres"));
                }
                try {
                    HttpHeaders headers = buildSupabaseHeaders();
                    RestTemplate rest = new RestTemplate();
                    updateSupabaseAuthUser(rest, headers, profile.getAuthUserId(), newPassword, null);
                } catch (HttpClientErrorException e) {
                    return ResponseEntity.badRequest().body(ApiResponse.<Map<String, Object>>fail("Erro ao alterar senha: " + e.getResponseBodyAsString()));
                } catch (Exception e) {
                    return ResponseEntity.badRequest().body(ApiResponse.<Map<String, Object>>fail("Erro ao alterar senha: " + e.getMessage()));
                }
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("message", "Usuário atualizado com sucesso");
            result.put("profile_id", profile.getId().toString());
            return ResponseEntity.ok(ApiResponse.ok(result));
        }).orElse(ResponseEntity.notFound().build());
    }

    // ── Dashboard / Activity Logs ────────────────────────────────────────────
    @GetMapping("/dashboard")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getDashboard(
            @AuthenticationPrincipal UserProfile p,
            @RequestParam String companyId) {
        if (!isAdminOrAbove(p)) return forbidden();

        UUID cId = UUID.fromString(companyId);

        // Verify user has access to this company
        if (!p.isSuperAdmin()) {
            boolean hasAccess = memberRepository.findByUserProfileId(p.getId()).stream()
                    .anyMatch(m -> m.getCompanyId().equals(cId)
                            && (m.getRole() == CompanyMember.MemberRole.ADMIN
                                || m.getRole() == CompanyMember.MemberRole.SUPER_ADMIN));
            if (!hasAccess) return forbidden();
        }

        Instant thirtyDaysAgo = Instant.now().minus(30, ChronoUnit.DAYS);
        Instant sevenDaysAgo = Instant.now().minus(7, ChronoUnit.DAYS);

        // Company stats
        List<Chat> chats = chatRepository.findByCompanyIdOrderByCreatedAtDesc(cId);
        List<UUID> chatIds = chats.stream().map(Chat::getId).collect(Collectors.toList());
        List<Ticket> tickets = ticketRepository.findByCompanyIdOrderByCreatedAtDesc(cId);
        List<CompanyMember> members = memberRepository.findByCompanyIdWithProfile(cId);

        long totalMessages = chatIds.isEmpty() ? 0 : messageRepository.countByChatIdIn(chatIds);
        long messagesLast30 = chatIds.isEmpty() ? 0 : messageRepository.countByChatIdInAndCreatedAtAfter(chatIds, thirtyDaysAgo);
        long messagesLast7 = chatIds.isEmpty() ? 0 : messageRepository.countByChatIdInAndCreatedAtAfter(chatIds, sevenDaysAgo);
        long ticketsOpen = tickets.stream().filter(t -> t.getStatus() != null && t.getStatus().name().equals("OPEN")).count();
        long ticketsPending = tickets.stream().filter(t -> t.getStatus() != null && t.getStatus().name().equals("PENDING")).count();
        long ticketsResolved = tickets.stream().filter(t -> t.getStatus() != null && (t.getStatus().name().equals("RESOLVED") || t.getStatus().name().equals("CLOSED"))).count();

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("total_chats", chats.size());
        stats.put("total_messages", totalMessages);
        stats.put("messages_last_30_days", messagesLast30);
        stats.put("messages_last_7_days", messagesLast7);
        stats.put("total_tickets", tickets.size());
        stats.put("tickets_open", ticketsOpen);
        stats.put("tickets_pending", ticketsPending);
        stats.put("tickets_resolved", ticketsResolved);
        stats.put("total_members", members.size());

        // Recent activity log (last 50 messages + tickets)
        List<Map<String, Object>> logs = new java.util.ArrayList<>();

        // Recent messages
        if (!chatIds.isEmpty()) {
            List<com.kanux.entity.Message> recentMessages = messageRepository
                    .findByChatIdInOrderByCreatedAtDesc(chatIds, PageRequest.of(0, 50));
            for (com.kanux.entity.Message m : recentMessages) {
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("id", m.getId());
                entry.put("type", "MESSAGE");
                entry.put("method", "POST");
                entry.put("endpoint", "/api/chats/" + m.getChatId() + "/messages");
                entry.put("status", 200);
                entry.put("status_text", "OK");
                entry.put("message_type", m.getMessageType());
                entry.put("content_preview", m.getContent() != null && m.getContent().length() > 60
                        ? m.getContent().substring(0, 60) + "..."
                        : m.getContent());
                entry.put("media_url", m.getMediaUrl());
                entry.put("user_profile_id", m.getUserProfileId());
                entry.put("created_at", m.getCreatedAt());
                entry.put("chat_id", m.getChatId());
                // Find chat name
                chats.stream().filter(c -> c.getId().equals(m.getChatId())).findFirst()
                        .ifPresent(c -> entry.put("chat_name", c.getName()));
                // Find member display name
                members.stream().filter(mem -> mem.getUserProfileId().equals(m.getUserProfileId())).findFirst()
                        .ifPresent(mem -> {
                            if (mem.getUserProfile() != null)
                                entry.put("user_name", mem.getUserProfile().getDisplayName());
                        });
                logs.add(entry);
            }
        }

        // Recent tickets
        tickets.stream().limit(30).forEach(t -> {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("id", t.getId());
            entry.put("type", "TICKET");
            entry.put("method", t.getCreatedAt().equals(t.getUpdatedAt()) ? "POST" : "PUT");
            entry.put("endpoint", "/api/tickets");
            entry.put("status", 200);
            entry.put("status_text", "OK");
            entry.put("content_preview", t.getTitle());
            entry.put("ticket_status", t.getStatus() != null ? t.getStatus().name() : "OPEN");
            entry.put("ticket_priority", t.getPriority() != null ? t.getPriority().name() : "MEDIUM");
            entry.put("user_profile_id", t.getCreatorProfileId());
            entry.put("created_at", t.getCreatedAt());
            // Find user
            if (t.getCreatorProfileId() != null) {
                members.stream().filter(mem -> mem.getUserProfileId().equals(t.getCreatorProfileId())).findFirst()
                        .ifPresent(mem -> {
                            if (mem.getUserProfile() != null)
                                entry.put("user_name", mem.getUserProfile().getDisplayName());
                        });
            }
            logs.add(entry);
        });

        // Sort all logs by created_at desc
        logs.sort((a, b) -> {
            Instant ia = a.get("created_at") instanceof Instant ? (Instant) a.get("created_at") : Instant.MIN;
            Instant ib = b.get("created_at") instanceof Instant ? (Instant) b.get("created_at") : Instant.MIN;
            return ib.compareTo(ia);
        });

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("stats", stats);
        result.put("logs", logs);
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    // ── Get All Users ────────────────────────────────────────────────────────
    @GetMapping("/users")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getAllUsers(
            @AuthenticationPrincipal UserProfile p) {
        if (!isAdminOrAbove(p)) return forbidden();
        List<Map<String, Object>> result = userProfileRepository.findAll().stream().map(up -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("id", up.getId());
            map.put("display_name", up.getDisplayName());
            map.put("email", up.getEmail());
            map.put("avatar_url", up.getAvatarUrl());
            map.put("phone", up.getPhone());
            map.put("position", up.getPosition());
            map.put("is_super_admin", up.isSuperAdmin());
            map.put("created_at", up.getCreatedAt());
            return map;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    // ── Supabase Auth helpers ───────────────────────────────────────────────
    private HttpHeaders buildSupabaseHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.set("apikey", serviceRoleKey);
        headers.set("Authorization", "Bearer " + serviceRoleKey);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }

    @SuppressWarnings({"unchecked", "UseSpecificCatch", "null"})
    private UUID findSupabaseAuthUserByEmail(RestTemplate rest, HttpHeaders headers, String email) {
        try {
            HttpEntity<Void> entity = new HttpEntity<>(headers);
            Map<String, Object> response = rest.exchange(
                    supabaseUrl + "/auth/v1/admin/users?page=1&per_page=1000",
                    HttpMethod.GET, entity, Map.class).getBody();
            List<?> users = response != null ? (List<?>) response.get("users") : null;
            if (users != null) {
                log.info("[findSupabaseAuth] Total de usuários encontrados: {}", users.size());
                for (Object u : users) {
                    Map<String, Object> usr = (Map<String, Object>) u;
                    if (email.equalsIgnoreCase(String.valueOf(usr.get("email")))) {
                        return UUID.fromString(usr.get("id").toString());
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[findSupabaseAuth] Falha ao buscar usuário por email: {}", e.getMessage());
        }
        return null;
    }

    private void updateSupabaseAuthUser(RestTemplate rest, HttpHeaders headers,
                                         UUID authUserId, String password, String displayName) {
        Map<String, Object> updateBody = new LinkedHashMap<>();
        if (password != null) updateBody.put("password", password);
        updateBody.put("email_confirm", true);
        if (displayName != null) updateBody.put("user_metadata", Map.of("display_name", displayName));
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(updateBody, headers);
        rest.put(supabaseUrl + "/auth/v1/admin/users/" + authUserId, request);
    }

    @SuppressWarnings("unchecked")
    private UUID createSupabaseAuthUser(RestTemplate rest, HttpHeaders headers,
                                         String email, String password, String displayName) {
        Map<String, Object> authBody = new LinkedHashMap<>();
        authBody.put("email", email);
        authBody.put("password", password);
        authBody.put("email_confirm", true);
        authBody.put("user_metadata", Map.of("display_name", displayName));

        HttpEntity<Map<String, Object>> request = new HttpEntity<>(authBody, headers);
        Map<String, Object> authResponse = rest.postForObject(
                supabaseUrl + "/auth/v1/admin/users", request, Map.class);
        if (authResponse == null || authResponse.get("id") == null) {
            throw new IllegalStateException("Supabase não retornou o ID do usuário criado");
        }
        return UUID.fromString(authResponse.get("id").toString());
    }

    private boolean isSuperAdmin(UserProfile p) { return p != null && p.isSuperAdmin(); }

    private boolean isAdminOrAbove(UserProfile p) {
        if (p == null) return false;
        if (p.isSuperAdmin()) return true;
        // Check if user has ADMIN or SUPER_ADMIN role in any company
        return memberRepository.findByUserProfileId(p.getId()).stream()
                .anyMatch(m -> m.getRole() == CompanyMember.MemberRole.ADMIN
                            || m.getRole() == CompanyMember.MemberRole.SUPER_ADMIN);
    }

    private <T> ResponseEntity<ApiResponse<T>> forbidden() {
        return ResponseEntity.status(403).body(ApiResponse.fail("Acesso negado: Super Admin necessário"));
    }

}

package com.kanux.controller;

import com.kanux.dto.*;
import com.kanux.entity.*;
import com.kanux.repository.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import java.util.List;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    @Value("${supabase.url:}")
    private String supabaseUrl;

    @Value("${supabase.service-role-key:}")
    private String serviceRoleKey;

    private final CompanyRepository companyRepository;
    private final CompanyMemberRepository memberRepository;
    private final UserProfileRepository userProfileRepository;

    public AdminController(CompanyRepository companyRepository, CompanyMemberRepository memberRepository, UserProfileRepository userProfileRepository) {
        this.companyRepository = companyRepository;
        this.memberRepository = memberRepository;
        this.userProfileRepository = userProfileRepository;
    }

    @GetMapping("/companies")
    public ResponseEntity<ApiResponse<List<Company>>> getAllCompanies(@AuthenticationPrincipal UserProfile p) {
        if (!isAdminOrAbove(p)) return forbidden();
        if (p.isSuperAdmin()) {
            return ResponseEntity.ok(ApiResponse.ok(
                    companyRepository.findAll().stream()
                            .sorted(Comparator.comparing(Company::getCreatedAt).reversed())
                            .collect(Collectors.toList())));
        }
        // ADMIN users only see companies they're members of
        List<UUID> companyIds = memberRepository.findByUserProfileId(p.getId()).stream()
                .map(CompanyMember::getCompanyId).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.ok(
                companyRepository.findAllById(companyIds).stream()
                        .sorted(Comparator.comparing(Company::getCreatedAt).reversed())
                        .collect(Collectors.toList())));
    }

    @SuppressWarnings("null")
    @DeleteMapping("/company")
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

    @SuppressWarnings("null")
    @PutMapping("/members")
    public ResponseEntity<ApiResponse<CompanyMember>> updateMember(
            @AuthenticationPrincipal UserProfile p, @RequestBody UpdateMemberRequest req) {
        if (!isAdminOrAbove(p)) return forbidden();
        return memberRepository.findById(UUID.fromString(req.getId())).map(m -> {
            m.setRole(CompanyMember.MemberRole.valueOf(req.getRole()));
            return ResponseEntity.ok(ApiResponse.ok(memberRepository.save(m)));
        }).orElse(ResponseEntity.notFound().build());
    }

    @SuppressWarnings("null")
    @DeleteMapping("/members")
    public ResponseEntity<ApiResponse<Void>> removeMember(@AuthenticationPrincipal UserProfile p, @RequestParam String id) {
        if (!isAdminOrAbove(p)) return forbidden();
        memberRepository.deleteById(UUID.fromString(id));
        return ResponseEntity.ok(ApiResponse.ok(null));
    }

    @PostMapping("/invite-user")
    public ResponseEntity<ApiResponse<Map<String, Object>>> inviteUser(
            @AuthenticationPrincipal UserProfile p, @RequestBody InviteUserRequest req) {
        if (!isAdminOrAbove(p)) return forbidden();
        UserProfile invited = userProfileRepository.findByEmail(req.getEmail()).orElseGet(() -> {
            UserProfile up = new UserProfile();
            up.setAuthUserId(UUID.randomUUID());
            up.setEmail(req.getEmail());
            up.setDisplayName(req.getDisplayName());
            return userProfileRepository.save(up);
        });
        UUID companyId = UUID.fromString(req.getCompanyId());
        if (!memberRepository.existsByCompanyIdAndUserProfileId(companyId, invited.getId())) {
            CompanyMember cm = new CompanyMember();
            cm.setCompanyId(companyId);
            cm.setUserProfileId(invited.getId());
            cm.setRole(CompanyMember.MemberRole.valueOf(req.getRole() != null ? req.getRole() : "MEMBER"));
            memberRepository.save(cm);
        }

        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "message", "Usuário convidado com sucesso",
                "profile_id", invited.getId().toString(), "email", invited.getEmail())));
    }

    @PostMapping("/create-user")
    @SuppressWarnings({"UseSpecificCatch", "null"})
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
                return ResponseEntity.badRequest().body(ApiResponse.fail(
                        "Servidor não configurado para criar usuários (SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes)"));
            }

            UUID authUserId;
            HttpHeaders headers = buildSupabaseHeaders();
            RestTemplate rest = new RestTemplate();

            // Check if user already exists in Supabase Auth
            UUID existingAuthId = findSupabaseAuthUserByEmail(rest, headers, email);
            if (existingAuthId != null) {
                authUserId = existingAuthId;
                // Update password for existing auth user
                updateSupabaseAuthUser(rest, headers, authUserId, password, displayName);
            } else {
                authUserId = createSupabaseAuthUser(rest, headers, email, password, displayName);
            }

            // 2. Create or find user profile
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

            // 3. Add to company
            UUID cId = UUID.fromString(companyId);
            if (!memberRepository.existsByCompanyIdAndUserProfileId(cId, profile.getId())) {
                CompanyMember cm = new CompanyMember();
                cm.setCompanyId(cId);
                cm.setUserProfileId(profile.getId());
                cm.setRole(CompanyMember.MemberRole.valueOf(role));
                memberRepository.save(cm);
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("message", "Usuário criado com sucesso");
            result.put("profile_id", profile.getId().toString());
            result.put("email", email);
            result.put("auth_user_created", true);
            return ResponseEntity.ok(ApiResponse.ok(result));
        } catch (HttpClientErrorException e) {
            String errorBody = e.getResponseBodyAsString();
            return ResponseEntity.badRequest().body(ApiResponse.fail("Erro Supabase Auth: " + errorBody));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(ApiResponse.fail("Dados inválidos: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(ApiResponse.fail("Erro ao criar usuário: " + e.getMessage()));
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
            // Update basic fields
            if (body.containsKey("display_name")) profile.setDisplayName(body.get("display_name"));
            if (body.containsKey("email")) profile.setEmail(body.get("email"));
            if (body.containsKey("position")) profile.setPosition(body.get("position"));
            if (body.containsKey("phone")) profile.setPhone(body.get("phone"));
            if (body.containsKey("department")) profile.setDepartment(body.get("department"));
            if (body.containsKey("is_super_admin")) profile.setSuperAdmin("true".equals(body.get("is_super_admin")));
            userProfileRepository.save(profile);

            // Update role in company if provided
            if (body.containsKey("role") && body.containsKey("company_id")) {
                UUID companyId = UUID.fromString(body.get("company_id"));
                memberRepository.findByCompanyIdAndUserProfileId(companyId, profile.getId())
                        .ifPresent(member -> {
                            member.setRole(CompanyMember.MemberRole.valueOf(body.get("role")));
                            memberRepository.save(member);
                        });
            }

            // Reset password in Supabase Auth if provided
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

    @SuppressWarnings("unchecked")
    private UUID findSupabaseAuthUserByEmail(RestTemplate rest, HttpHeaders headers, String email) {
        try {
            HttpEntity<Void> entity = new HttpEntity<>(headers);
            Map<String, Object> response = rest.exchange(
                    supabaseUrl + "/auth/v1/admin/users?page=1&per_page=100",
                    HttpMethod.GET, entity, Map.class).getBody();
            List<?> users = response != null ? (List<?>) response.get("users") : null;
            if (users != null) {
                for (Object u : users) {
                    Map<String, Object> usr = (Map<String, Object>) u;
                    if (email.equalsIgnoreCase(String.valueOf(usr.get("email")))) {
                        return UUID.fromString(usr.get("id").toString());
                    }
                }
            }
        } catch (Exception e) {
            // Lookup failed; return null to trigger creation
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

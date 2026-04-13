package com.kanux.controller;

import com.kanux.dto.*;
import com.kanux.entity.*;
import com.kanux.repository.*;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

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
        if (!isSuperAdmin(p)) return forbidden();
        return ResponseEntity.ok(ApiResponse.ok(
                companyRepository.findAll().stream()
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
        if (!isSuperAdmin(p)) return forbidden();
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
        if (!isSuperAdmin(p)) return forbidden();
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
        if (!isSuperAdmin(p)) return forbidden();
        return memberRepository.findById(UUID.fromString(req.getId())).map(m -> {
            m.setRole(CompanyMember.MemberRole.valueOf(req.getRole()));
            return ResponseEntity.ok(ApiResponse.ok(memberRepository.save(m)));
        }).orElse(ResponseEntity.notFound().build());
    }

    @SuppressWarnings("null")
    @DeleteMapping("/members")
    public ResponseEntity<ApiResponse<Void>> removeMember(@AuthenticationPrincipal UserProfile p, @RequestParam String id) {
        if (!isSuperAdmin(p)) return forbidden();
        memberRepository.deleteById(UUID.fromString(id));
        return ResponseEntity.ok(ApiResponse.ok(null));
    }

    @PostMapping("/invite-user")
    public ResponseEntity<ApiResponse<Map<String, Object>>> inviteUser(
            @AuthenticationPrincipal UserProfile p, @RequestBody InviteUserRequest req) {
        if (!isSuperAdmin(p)) return forbidden();
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


    private boolean isSuperAdmin(UserProfile p) { return p != null && p.isSuperAdmin(); }

    private <T> ResponseEntity<ApiResponse<T>> forbidden() {
        return ResponseEntity.status(403).body(ApiResponse.fail("Acesso negado: Super Admin necessário"));
    }
}

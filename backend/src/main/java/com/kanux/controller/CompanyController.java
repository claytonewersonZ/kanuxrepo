package com.kanux.controller;

import com.kanux.dto.ApiResponse;
import com.kanux.dto.CreateCompanyRequest;
import com.kanux.entity.Company;
import com.kanux.entity.CompanyMember;
import com.kanux.entity.UserProfile;
import com.kanux.repository.CompanyMemberRepository;
import com.kanux.repository.CompanyRepository;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;


import java.util.*;
import java.util.stream.Collectors;


@RestController
@RequestMapping("/api/companies")
public class CompanyController {

    private final CompanyRepository companyRepository;
    private final CompanyMemberRepository memberRepository;

    public CompanyController(CompanyRepository companyRepository, CompanyMemberRepository memberRepository) {
        this.companyRepository = companyRepository;
        this.memberRepository = memberRepository;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<Company>>> getUserCompanies(@AuthenticationPrincipal UserProfile p) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        if (p.isSuperAdmin()) {
            return ResponseEntity.ok(ApiResponse.ok(companyRepository.findAllByOrderByCompanyNumberAsc()));
        }
        return ResponseEntity.ok(ApiResponse.ok(companyRepository.findByMemberProfileId(p.getId())));
    }

    @GetMapping("/{companyId}/members")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getCompanyMembers(
            @AuthenticationPrincipal UserProfile p,
            @PathVariable String companyId) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        UUID companyUUID;
        try { companyUUID = UUID.fromString(companyId); }
        catch (IllegalArgumentException ex) { return ResponseEntity.badRequest().body(ApiResponse.fail("companyId inválido")); }

        if (!p.isSuperAdmin() && !memberRepository.existsByCompanyIdAndUserProfileId(companyUUID, p.getId())) {
            return ResponseEntity.status(403).body(ApiResponse.fail("Acesso negado"));
        }

        List<CompanyMember> members = memberRepository.findByCompanyIdWithProfile(companyUUID);
        List<Map<String, Object>> result = members.stream().map(m -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("id", m.getId());
            map.put("company_id", m.getCompanyId());
            map.put("user_profile_id", m.getUserProfileId());
            map.put("role", m.getRole());
            map.put("joined_at", m.getJoinedAt());
            UserProfile up = m.getUserProfile();
            if (up != null) {
                Map<String, Object> profileMap = new LinkedHashMap<>();
                profileMap.put("id", up.getId());
                profileMap.put("display_name", up.getDisplayName());
                profileMap.put("email", up.getEmail());
                profileMap.put("avatar_url", up.getAvatarUrl());
                map.put("user_profiles", profileMap);
            }
            return map;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<Company>> createCompany(
            @AuthenticationPrincipal UserProfile p, @RequestBody CreateCompanyRequest req) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        Company company = new Company();
        company.setName(req.getName());
        company.setSlug(req.getSlug().toLowerCase().trim());
        company.setCreatedBy(p.getId());
        company = companyRepository.save(company);

        CompanyMember member = new CompanyMember();
        member.setCompanyId(company.getId());
        member.setUserProfileId(p.getId());
        member.setRole(CompanyMember.MemberRole.ADMIN);
        memberRepository.save(member);

        return ResponseEntity.ok(ApiResponse.ok(company));
    }
}


package com.kanux.controller;

import com.kanux.dto.ApiResponse;
import com.kanux.entity.Department;
import com.kanux.entity.DepartmentMember;
import com.kanux.entity.UserProfile;
import com.kanux.repository.DepartmentMemberRepository;
import com.kanux.repository.DepartmentRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/departments")
public class DepartmentController {

    private final DepartmentRepository departmentRepository;
    private final DepartmentMemberRepository departmentMemberRepository;

    public DepartmentController(DepartmentRepository departmentRepository,
                                 DepartmentMemberRepository departmentMemberRepository) {
        this.departmentRepository = departmentRepository;
        this.departmentMemberRepository = departmentMemberRepository;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<Department>>> getDepartments(
            @AuthenticationPrincipal UserProfile p, @RequestParam(required = false) String companyId) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        List<Department> depts = companyId != null
                ? departmentRepository.findByCompanyId(UUID.fromString(companyId))
                : departmentRepository.findAll();
        return ResponseEntity.ok(ApiResponse.ok(depts));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<Department>> createDepartment(
            @AuthenticationPrincipal UserProfile p, @RequestBody Map<String, String> body) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        String name = body.get("name"); String companyId = body.get("companyId");
        if (name == null || companyId == null) return ResponseEntity.badRequest().body(ApiResponse.fail("name e companyId são obrigatórios"));
        String slug = name.toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
        Department department = new Department();
        department.setCompanyId(UUID.fromString(companyId));
        department.setName(name);
        department.setSlug(slug);
        return ResponseEntity.ok(ApiResponse.ok(departmentRepository.save(department)));
    }

    @SuppressWarnings("null")
    @DeleteMapping
    public ResponseEntity<ApiResponse<Void>> deleteDepartment(
            @AuthenticationPrincipal UserProfile p, @RequestParam String id) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        departmentRepository.deleteById(UUID.fromString(id));
        return ResponseEntity.ok(ApiResponse.ok(null));
    }

    // ==================== Department Members ====================

    @GetMapping("/{departmentId}/members")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getDeptMembers(
            @AuthenticationPrincipal UserProfile p, @PathVariable String departmentId) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        List<Map<String, Object>> result = departmentMemberRepository
                .findByDepartmentIdWithProfile(UUID.fromString(departmentId))
                .stream().map(dm -> {
                    Map<String, Object> map = new LinkedHashMap<>();
                    map.put("id", dm.getId());
                    map.put("department_id", dm.getDepartmentId());
                    map.put("user_profile_id", dm.getUserProfileId());
                    map.put("joined_at", dm.getJoinedAt());
                    if (dm.getUserProfile() != null) {
                        Map<String, Object> up = new LinkedHashMap<>();
                        up.put("id", dm.getUserProfile().getId());
                        up.put("display_name", dm.getUserProfile().getDisplayName());
                        up.put("email", dm.getUserProfile().getEmail());
                        up.put("avatar_url", dm.getUserProfile().getAvatarUrl());
                        map.put("user_profile", up);
                    }
                    return map;
                }).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @PostMapping("/{departmentId}/members")
    public ResponseEntity<ApiResponse<Map<String, Object>>> addDeptMember(
            @AuthenticationPrincipal UserProfile p, @PathVariable String departmentId,
            @RequestBody Map<String, String> body) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        String userProfileId = body.get("user_profile_id");
        if (userProfileId == null || userProfileId.isBlank())
            return ResponseEntity.badRequest().body(ApiResponse.fail("user_profile_id é obrigatório"));

        UUID dId = UUID.fromString(departmentId);
        UUID uId = UUID.fromString(userProfileId);

        if (departmentMemberRepository.existsByDepartmentIdAndUserProfileId(dId, uId))
            return ResponseEntity.badRequest().body(ApiResponse.fail("Usuário já é membro deste departamento"));

        DepartmentMember dm = new DepartmentMember();
        dm.setDepartmentId(dId);
        dm.setUserProfileId(uId);
        DepartmentMember saved = departmentMemberRepository.save(dm);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", saved.getId());
        result.put("department_id", saved.getDepartmentId());
        result.put("user_profile_id", saved.getUserProfileId());
        result.put("joined_at", saved.getJoinedAt());
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @Transactional
    @DeleteMapping("/{departmentId}/members/{userProfileId}")
    public ResponseEntity<ApiResponse<Void>> removeDeptMember(
            @AuthenticationPrincipal UserProfile p, @PathVariable String departmentId,
            @PathVariable String userProfileId) {
        if (p == null) return ResponseEntity.status(401).body(ApiResponse.fail("Unauthorized"));
        departmentMemberRepository.deleteByDepartmentIdAndUserProfileId(
                UUID.fromString(departmentId), UUID.fromString(userProfileId));
        return ResponseEntity.ok(ApiResponse.ok(null));
    }
}

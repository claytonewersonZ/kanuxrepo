package com.kanux.controller;

import com.kanux.entity.UserProfile;
import com.kanux.repository.UserProfileRepository;
import com.kanux.security.JwtService;
import io.jsonwebtoken.Claims;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
public class HealthController {

    @Value("${supabase.jwt-secret:NOT_SET}")
    private String jwtSecret;

    private final JwtService jwtService;
    private final UserProfileRepository userProfileRepository;

    public HealthController(JwtService jwtService, UserProfileRepository userProfileRepository) {
        this.jwtService = jwtService;
        this.userProfileRepository = userProfileRepository;
    }

    /** Public health check — use to verify backend is online and JWT secret is configured. */
    @GetMapping("/api/health")
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("status", "ok");
        info.put("jwtSecretConfigured", jwtSecret != null && !jwtSecret.equals("NOT_SET") && jwtSecret.length() > 10);
        info.put("jwtSecretLength", jwtSecret == null ? 0 : jwtSecret.length());
        String algo = jwtService.getResolvedAlgo();
        info.put("jwtAlgorithm", algo != null ? algo : "not-yet-resolved");
        return ResponseEntity.ok(info);
    }

    /**
     * Debug endpoint: validates a Bearer token without requiring auth.
     * POST /api/debug/jwt  body: { "token": "..." }
     */
    @PostMapping("/api/debug/jwt")
    public ResponseEntity<Map<String, Object>> debugJwt(@RequestBody Map<String, String> body) {
        Map<String, Object> result = new LinkedHashMap<>();
        String token = body.get("token");
        if (token == null || token.isBlank()) {
            result.put("error", "token is required");
            return ResponseEntity.badRequest().body(result);
        }
        try {
            var claims = jwtService.getClaims(token);
            result.put("valid", true);
            result.put("sub", claims.getSubject());
            result.put("email", claims.get("email"));
            result.put("role", claims.get("role"));
            result.put("exp", claims.getExpiration());
        } catch (Exception e) {
            result.put("valid", false);
            result.put("error", e.getClass().getSimpleName() + ": " + e.getMessage());
        }
        return ResponseEntity.ok(result);
    }

    /**
     * Debug endpoint: simulates the FULL JwtAuthFilter flow (JWT parse + DB lookup/create).
     * GET /api/debug/auth-test  with Authorization: Bearer &lt;token&gt;
     */
    @GetMapping("/api/debug/auth-test")
    public ResponseEntity<Map<String, Object>> authTest(
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        Map<String, Object> result = new LinkedHashMap<>();

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            result.put("step", "header");
            result.put("error", "Missing or invalid Authorization header");
            return ResponseEntity.badRequest().body(result);
        }

        String token = authHeader.substring(7);

        // Step 1: Parse JWT
        Claims claims;
        try {
            claims = jwtService.getClaims(token);
            result.put("step1_jwt", "OK");
            result.put("sub", claims.getSubject());
            result.put("email", claims.get("email"));
        } catch (Exception e) {
            result.put("step1_jwt", "FAILED");
            result.put("error", e.getClass().getSimpleName() + ": " + e.getMessage());
            return ResponseEntity.ok(result);
        }

        // Step 2: UUID parse
        UUID authUserId;
        try {
            authUserId = UUID.fromString(claims.getSubject());
            result.put("step2_uuid", "OK");
        } catch (Exception e) {
            result.put("step2_uuid", "FAILED");
            result.put("error", e.getClass().getSimpleName() + ": " + e.getMessage());
            return ResponseEntity.ok(result);
        }

        // Step 3: DB lookup
        try {
            Optional<UserProfile> profileOpt = userProfileRepository.findByAuthUserId(authUserId);
            result.put("step3_db_lookup", "OK");
            result.put("profileFound", profileOpt.isPresent());
            if (profileOpt.isPresent()) {
                UserProfile p = profileOpt.get();
                result.put("profileId", p.getId());
                result.put("profileEmail", p.getEmail());
                result.put("profileName", p.getDisplayName());
                result.put("isSuperAdmin", p.isSuperAdmin());
            }
        } catch (Exception e) {
            result.put("step3_db_lookup", "FAILED");
            result.put("error", e.getClass().getSimpleName() + ": " + e.getMessage());
            StringWriter sw = new StringWriter();
            e.printStackTrace(new PrintWriter(sw));
            result.put("stackTrace", sw.toString().substring(0, Math.min(sw.toString().length(), 2000)));
            return ResponseEntity.ok(result);
        }

        // Step 4: Auto-provision if not found
        if (!(boolean) result.get("profileFound")) {
            try {
                UserProfile profile = new UserProfile();
                profile.setAuthUserId(authUserId);
                String email = claims.get("email", String.class);
                profile.setEmail(email);
                if (email != null) profile.setDisplayName(email.split("@")[0]);
                profile = userProfileRepository.save(profile);
                result.put("step4_provision", "OK");
                result.put("newProfileId", profile.getId());
            } catch (Exception e) {
                result.put("step4_provision", "FAILED");
                result.put("error", e.getClass().getSimpleName() + ": " + e.getMessage());
                StringWriter sw = new StringWriter();
                e.printStackTrace(new PrintWriter(sw));
                result.put("stackTrace", sw.toString().substring(0, Math.min(sw.toString().length(), 2000)));
                return ResponseEntity.ok(result);
            }
        }

        result.put("overall", "SUCCESS — filter should authenticate this token");
        return ResponseEntity.ok(result);
    }

    /** Debug: check Flyway migration status and test ticket query */
    @GetMapping("/api/debug/db-status")
    public ResponseEntity<Map<String, Object>> dbStatus() {
        Map<String, Object> result = new LinkedHashMap<>();
        try {
            long profileCount = userProfileRepository.count();
            result.put("user_profiles_count", profileCount);
        } catch (Exception e) {
            result.put("user_profiles_error", e.getClass().getSimpleName() + ": " + e.getMessage());
        }
        result.put("status", "ok");
        return ResponseEntity.ok(result);
    }
}
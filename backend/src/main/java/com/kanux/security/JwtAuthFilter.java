package com.kanux.security;

import java.io.IOException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.kanux.entity.UserProfile;
import com.kanux.repository.UserProfileRepository;

import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(JwtAuthFilter.class);

    private final JwtService jwtService;
    private final UserProfileRepository userProfileRepository;

    public JwtAuthFilter(JwtService jwtService, UserProfileRepository userProfileRepository) {
        this.jwtService = jwtService;
        this.userProfileRepository = userProfileRepository;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain) throws ServletException, IOException {
        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }
        String token = authHeader.substring(7);
        try {
            Claims claims = jwtService.getClaims(token);
            UUID authUserId = UUID.fromString(claims.getSubject());

            // Find existing profile or create one on first login (with retry for transient DB errors)
            UserProfile profile = null;
            Exception lastError = null;
            for (int attempt = 0; attempt < 3; attempt++) {
                try {
                    Optional<UserProfile> profileOpt = userProfileRepository.findByAuthUserId(authUserId);
                    if (profileOpt.isPresent()) {
                        profile = profileOpt.get();
                    } else {
                        // Auto-provision profile from Supabase JWT claims
                        profile = new UserProfile();
                        profile.setAuthUserId(authUserId);

                        String email = claims.get("email", String.class);
                        if (email == null || email.isBlank()) {
                            try {
                                @SuppressWarnings("unchecked")
                                java.util.Map<String, Object> meta =
                                        (java.util.Map<String, Object>) claims.get("user_metadata");
                                if (meta != null && meta.get("email") instanceof String s) email = s;
                            } catch (Exception ignored) {}
                        }
                        profile.setEmail(email);

                        try {
                            @SuppressWarnings("unchecked")
                            java.util.Map<String, Object> meta =
                                    (java.util.Map<String, Object>) claims.get("user_metadata");
                            if (meta != null) {
                                String name = null;
                                if (meta.get("full_name") instanceof String s) name = s;
                                else if (meta.get("name") instanceof String s) name = s;
                                else if (meta.get("display_name") instanceof String s) name = s;
                                if (name != null && !name.isBlank()) profile.setDisplayName(name);
                            }
                        } catch (Exception ignored) {}

                        if (profile.getDisplayName() == null && email != null) {
                            profile.setDisplayName(email.split("@")[0]);
                        }

                        profile = userProfileRepository.save(profile);
                        log.info("Auto-provisioned profile for user {}", authUserId);
                    }
                    lastError = null;
                    break; // success
                } catch (Exception dbError) {
                    lastError = dbError;
                    log.warn("DB lookup attempt {} failed for user {}: {}", attempt + 1, authUserId, dbError.getMessage());
                    if (attempt < 2) {
                        try { Thread.sleep(100 * (attempt + 1)); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); break; }
                    }
                }
            }

            if (profile == null && lastError != null) {
                log.error("All DB attempts failed for JWT user {}: {}", authUserId, lastError.getMessage());
                filterChain.doFilter(request, response);
                return;
            }

            @SuppressWarnings("null")
            var auth = new UsernamePasswordAuthenticationToken(
                    profile, null,
                    profile.isSuperAdmin()
                            ? List.of(new SimpleGrantedAuthority("ROLE_SUPER_ADMIN"), new SimpleGrantedAuthority("ROLE_USER"))
                            : List.of(new SimpleGrantedAuthority("ROLE_USER"))
            );
            SecurityContextHolder.getContext().setAuthentication(auth);

        } catch (Exception e) {
            log.error("JWT auth failed [{}]: {} — {}", request.getRequestURI(), e.getClass().getSimpleName(), e.getMessage(), e);
        }
        filterChain.doFilter(request, response);
    }

}

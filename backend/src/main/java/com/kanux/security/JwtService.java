package com.kanux.security;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.UUID;

import javax.crypto.SecretKey;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

@Service
public class JwtService {

    private static final Logger log = LoggerFactory.getLogger(JwtService.class);

    @Value("${supabase.jwt-secret}")
    private String jwtSecret;

    private volatile SecretKey resolvedKey;

    public UUID extractUserId(String token) {
        return UUID.fromString(parseClaims(token).getSubject());
    }

    public boolean isValid(String token) {
        try { parseClaims(token); return true; }
        catch (Exception e) { log.debug("JWT inválido: {}", e.getMessage()); return false; }
    }

    /** Returns full claims so the filter can extract email and other data. */
    public Claims getClaims(String token) {
        return parseClaims(token);
    }

    private Claims parseClaims(String token) {
        SecretKey key = getOrResolveKey(token);
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    /**
     * Supabase JWT secrets can be either raw UTF-8 strings or base64-encoded.
     * Tries raw first; on SignatureException tries base64-decoded; caches whichever works.
     */
    private SecretKey getOrResolveKey(String token) {
        if (resolvedKey != null) return resolvedKey;

        String secret = jwtSecret.trim();

        // Try 1: raw UTF-8 bytes (most common for older Supabase projects)
        SecretKey rawKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        try {
            Jwts.parser().verifyWith(rawKey).build().parseSignedClaims(token);
            resolvedKey = rawKey;
            log.info("JWT key resolved: raw UTF-8 ({} chars)", secret.length());
            return resolvedKey;
        } catch (io.jsonwebtoken.security.SignatureException e) {
            // signature mismatch — try base64
        } catch (io.jsonwebtoken.JwtException | IllegalArgumentException e) {
            // other error (expired, malformed) but signature was OK
            resolvedKey = rawKey;
            log.info("JWT key resolved: raw UTF-8 ({} chars)", secret.length());
            return resolvedKey;
        }

        // Try 2: base64-decoded bytes (newer Supabase projects)
        try {
            byte[] decoded = Base64.getDecoder().decode(secret);
            SecretKey b64Key = Keys.hmacShaKeyFor(decoded);
            Jwts.parser().verifyWith(b64Key).build().parseSignedClaims(token);
            resolvedKey = b64Key;
            log.info("JWT key resolved: base64-decoded ({} bytes)", decoded.length);
            return resolvedKey;
        } catch (io.jsonwebtoken.security.SignatureException | IllegalArgumentException e2) {
            // signature also failed or not valid base64
        } catch (io.jsonwebtoken.JwtException e2) {
            // other error (expired, malformed) but base64 key signature was OK
            try {
                byte[] decoded = Base64.getDecoder().decode(secret);
                resolvedKey = Keys.hmacShaKeyFor(decoded);
                log.info("JWT key resolved: base64-decoded ({} bytes)", decoded.length);
                return resolvedKey;
            } catch (IllegalArgumentException ignored) {}
        }

        // Fallback: use raw key and let the caller handle the error
        log.warn("JWT key could not be resolved — falling back to raw UTF-8");
        resolvedKey = rawKey;
        return resolvedKey;
    }
}

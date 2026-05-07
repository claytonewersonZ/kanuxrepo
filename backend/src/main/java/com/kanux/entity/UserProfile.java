package com.kanux.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.Instant;
import java.time.LocalTime;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "user_profiles")
public class UserProfile {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "auth_user_id", nullable = false, unique = true)
    private UUID authUserId;

    @Column(name = "display_name")
    private String displayName;

    private String email;

    @Column(name = "avatar_url")
    private String avatarUrl;

    private String phone;
    private String position;
    private String department;

    @JsonProperty("is_super_admin")
    @Column(name = "is_super_admin", nullable = false)
    private boolean superAdmin = false;

    @JsonProperty("push_token")
    @Column(name = "push_token")
    private String pushToken;

    @JsonProperty("work_start_time")
    @JsonFormat(pattern = "HH:mm")
    @Column(name = "work_start_time")
    private LocalTime workStartTime;

    @JsonProperty("work_end_time")
    @JsonFormat(pattern = "HH:mm")
    @Column(name = "work_end_time")
    private LocalTime workEndTime;

    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }
}

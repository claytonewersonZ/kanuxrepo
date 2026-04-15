package com.kanux.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "company_members")
public class CompanyMember {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "company_id", nullable = false)
    private UUID companyId;

    @Column(name = "user_profile_id", nullable = false)
    private UUID userProfileId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private MemberRole role = MemberRole.MEMBER;

    @Column(name = "joined_at", updatable = false)
    private Instant joinedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_profile_id", insertable = false, updatable = false)
    private UserProfile userProfile;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", insertable = false, updatable = false)
    private Company company;

    @PrePersist
    protected void onCreate() {
        if (joinedAt == null) joinedAt = Instant.now();
    }

    public enum MemberRole { MEMBER, MANAGER, ADMIN, SUPER_ADMIN }
}

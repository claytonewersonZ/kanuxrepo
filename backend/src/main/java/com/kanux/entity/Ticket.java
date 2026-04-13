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
@Table(name = "tickets")
public class Ticket {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(insertable = false, updatable = false)
    private String number;

    @Column(name = "company_id", nullable = false)
    private UUID companyId;

    @Column(name = "department_id")
    private UUID departmentId;

    @Column(name = "creator_profile_id", nullable = false)
    private UUID creatorProfileId;

    @Column(name = "assignee_profile_id")
    private UUID assigneeProfileId;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Convert(converter = TicketStatusConverter.class)
    @Column(nullable = false)
    private TicketStatus status = TicketStatus.OPEN;

    @Convert(converter = TicketPriorityConverter.class)
    @Column(nullable = false)
    private TicketPriority priority = TicketPriority.MEDIUM;

    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @PrePersist
    protected void onCreate() {
        Instant now = Instant.now();
        if (createdAt == null) createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }

    public enum TicketStatus { OPEN, PENDING, RESOLVED, CLOSED }
    public enum TicketPriority { LOW, MEDIUM, HIGH }
}

package com.kanux.repository;

import com.kanux.entity.TicketComment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.UUID;

public interface TicketCommentRepository extends JpaRepository<TicketComment, UUID> {
    List<TicketComment> findByTicketIdOrderByCreatedAtAsc(UUID ticketId);

    @Query("SELECT c FROM TicketComment c LEFT JOIN FETCH c.userProfile WHERE c.ticketId = :ticketId ORDER BY c.createdAt ASC")
    List<TicketComment> findByTicketIdWithProfileOrderByCreatedAtAsc(@Param("ticketId") UUID ticketId);
}

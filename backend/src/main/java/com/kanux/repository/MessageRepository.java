package com.kanux.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.kanux.entity.Message;

public interface MessageRepository extends JpaRepository<Message, UUID> {
    @Query("SELECT m FROM Message m WHERE m.chatId = :chatId ORDER BY m.createdAt ASC")
    List<Message> findByChatIdOrderByCreatedAt(@Param("chatId") UUID chatId);

    @Query("SELECT COUNT(m) FROM Message m WHERE m.chatId IN :chatIds")
    long countByChatIdIn(@Param("chatIds") List<UUID> chatIds);

    @Query("SELECT COUNT(m) FROM Message m WHERE m.chatId IN :chatIds AND m.createdAt >= :since")
    long countByChatIdInAndCreatedAtAfter(@Param("chatIds") List<UUID> chatIds, @Param("since") Instant since);

    @Query("SELECT m FROM Message m WHERE m.chatId IN :chatIds ORDER BY m.createdAt DESC")
    List<Message> findByChatIdInOrderByCreatedAtDesc(@Param("chatIds") List<UUID> chatIds, org.springframework.data.domain.Pageable pageable);

    @Query("SELECT m FROM Message m WHERE m.chatId = :chatId AND m.userProfileId = :userProfileId AND m.clientMessageId = :clientMessageId")
    Optional<Message> findByChatIdAndUserProfileIdAndClientMessageId(
            @Param("chatId") UUID chatId,
            @Param("userProfileId") UUID userProfileId,
            @Param("clientMessageId") String clientMessageId
    );
}

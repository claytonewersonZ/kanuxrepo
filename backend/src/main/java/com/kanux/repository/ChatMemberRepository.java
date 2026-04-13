package com.kanux.repository;

import com.kanux.entity.ChatMember;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChatMemberRepository extends JpaRepository<ChatMember, UUID> {
    List<ChatMember> findByChatId(UUID chatId);

    @Query("SELECT cm FROM ChatMember cm JOIN FETCH cm.userProfile WHERE cm.chatId = :chatId")
    List<ChatMember> findByChatIdWithProfile(@Param("chatId") UUID chatId);

    Optional<ChatMember> findByChatIdAndUserProfileId(UUID chatId, UUID userProfileId);
    boolean existsByChatIdAndUserProfileId(UUID chatId, UUID userProfileId);
    void deleteByChatIdAndUserProfileId(UUID chatId, UUID userProfileId);
}

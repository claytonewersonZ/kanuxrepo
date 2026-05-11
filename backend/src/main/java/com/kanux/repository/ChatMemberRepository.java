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

    @Query("SELECT cm FROM ChatMember cm WHERE cm.userProfileId = :userId")
    List<ChatMember> findByUserProfileId(@Param("userId") UUID userId);

    Optional<ChatMember> findByChatIdAndUserProfileId(UUID chatId, UUID userProfileId);
    boolean existsByChatIdAndUserProfileId(UUID chatId, UUID userProfileId);
    void deleteByChatIdAndUserProfileId(UUID chatId, UUID userProfileId);

    /** Retorna membros do chat que possuem push_token, excluindo o remetente. */
    @Query("SELECT cm FROM ChatMember cm JOIN FETCH cm.userProfile up " +
           "WHERE cm.chatId = :chatId AND cm.userProfileId <> :senderId " +
           "AND up.pushToken IS NOT NULL AND up.pushToken <> ''")
    List<ChatMember> findMembersWithPushTokenExcludingSender(
            @Param("chatId") UUID chatId, @Param("senderId") UUID senderId);
}

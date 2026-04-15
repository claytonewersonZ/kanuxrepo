package com.kanux.repository;

import com.kanux.entity.CompanyMember;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CompanyMemberRepository extends JpaRepository<CompanyMember, UUID> {
    List<CompanyMember> findByCompanyId(UUID companyId);
    List<CompanyMember> findByUserProfileId(UUID userProfileId);
    Optional<CompanyMember> findByCompanyIdAndUserProfileId(UUID companyId, UUID userProfileId);
    boolean existsByCompanyIdAndUserProfileId(UUID companyId, UUID userProfileId);

    @Query("SELECT m FROM CompanyMember m JOIN FETCH m.userProfile WHERE m.companyId = :companyId")
    List<CompanyMember> findByCompanyIdWithProfile(@Param("companyId") UUID companyId);
}

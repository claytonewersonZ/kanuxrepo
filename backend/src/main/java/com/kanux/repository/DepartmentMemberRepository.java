package com.kanux.repository;

import com.kanux.entity.DepartmentMember;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface DepartmentMemberRepository extends JpaRepository<DepartmentMember, UUID> {

    @Query("SELECT dm FROM DepartmentMember dm LEFT JOIN FETCH dm.userProfile WHERE dm.departmentId = :departmentId")
    List<DepartmentMember> findByDepartmentIdWithProfile(@Param("departmentId") UUID departmentId);

    boolean existsByDepartmentIdAndUserProfileId(UUID departmentId, UUID userProfileId);

    void deleteByDepartmentIdAndUserProfileId(UUID departmentId, UUID userProfileId);
}

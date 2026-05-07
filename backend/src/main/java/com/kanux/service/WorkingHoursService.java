package com.kanux.service;

import com.kanux.entity.UserProfile;
import com.kanux.exception.OutsideWorkingHoursException;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class WorkingHoursService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm");

    private final ZoneId zoneId;

    public WorkingHoursService(@Value("${app.working-hours.zone-id:America/Sao_Paulo}") String zoneId) {
        this.zoneId = ZoneId.of(zoneId);
    }

    public boolean isRestricted(UserProfile userProfile) {
        return userProfile != null
                && !userProfile.isSuperAdmin()
                && userProfile.getWorkStartTime() != null
                && userProfile.getWorkEndTime() != null;
    }

    public boolean isWithinWorkingHours(UserProfile userProfile) {
        if (!isRestricted(userProfile)) {
            return true;
        }

        LocalTime start = userProfile.getWorkStartTime();
        LocalTime end = userProfile.getWorkEndTime();
        LocalTime now = LocalTime.now(zoneId);

        if (start.equals(end)) {
            return true;
        }
        if (start.isBefore(end)) {
            return !now.isBefore(start) && now.isBefore(end);
        }
        return !now.isBefore(start) || now.isBefore(end);
    }

    public Optional<String> getRestrictionMessage(UserProfile userProfile, String actionLabel) {
        if (isWithinWorkingHours(userProfile)) {
            return Optional.empty();
        }
        return Optional.of(String.format(
                "Fora do horário de trabalho. Você só pode %s entre %s e %s.",
                actionLabel,
                userProfile.getWorkStartTime().format(TIME_FORMATTER),
                userProfile.getWorkEndTime().format(TIME_FORMATTER)));
    }

    public void ensureAllowed(UserProfile userProfile, String actionLabel) {
        getRestrictionMessage(userProfile, actionLabel)
                .ifPresent(message -> {
                    throw new OutsideWorkingHoursException(message);
                });
    }
}
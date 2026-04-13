package com.kanux.entity;

import com.kanux.entity.Ticket.TicketPriority;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter(autoApply = true)
public class TicketPriorityConverter implements AttributeConverter<TicketPriority, String> {

    @Override
    public String convertToDatabaseColumn(TicketPriority attribute) {
        return attribute == null ? null : attribute.name();
    }

    @Override
    public TicketPriority convertToEntityAttribute(String dbData) {
        if (dbData == null || dbData.isBlank()) return null;
        return TicketPriority.valueOf(dbData.trim().toUpperCase());
    }
}

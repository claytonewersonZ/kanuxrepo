package com.kanux.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class CreateChatRequest {
    private String type;
    private String name;
    private String companyId;
    private String departmentId;

    @JsonProperty("is_private")
    @JsonAlias({"isPrivate", "private"})
    private boolean isPrivate;
}

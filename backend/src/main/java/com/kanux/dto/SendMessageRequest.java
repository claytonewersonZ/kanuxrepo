package com.kanux.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class SendMessageRequest {
    private String content;

    @JsonProperty("user_profile_id")
    private String userProfileId;

    /** Tipo da mensagem: "text", "image", "audio", "document" */
    @JsonProperty("message_type")
    private String messageType;

    /** URL pública da mídia (quando não for texto puro) */
    @JsonProperty("media_url")
    private String mediaUrl;

    /** Nome original do arquivo (para documentos) */
    @JsonProperty("media_name")
    private String mediaName;
}

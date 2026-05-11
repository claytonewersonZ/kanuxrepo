package com.kanux.config;

import com.kanux.security.JwtService;
import com.kanux.entity.UserProfile;
import com.kanux.repository.UserProfileRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.lang.NonNull;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import java.security.Principal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private static final Logger log = LoggerFactory.getLogger(WebSocketConfig.class);

    private final JwtService jwtService;
    private final UserProfileRepository userProfileRepository;

    public WebSocketConfig(JwtService jwtService, UserProfileRepository userProfileRepository) {
        this.jwtService = jwtService;
        this.userProfileRepository = userProfileRepository;
    }

    @Override
    public void registerStompEndpoints(@NonNull StompEndpointRegistry registry) {
        // Endpoint de conexão WebSocket — mobile conecta em /ws
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns("*")
                .withSockJS(); // fallback para ambientes sem WebSocket nativo

  
                // Endpoint puro (sem SockJS) para React Native com @stomp/stompjs
        registry.addEndpoint("/ws-native")
                .setAllowedOriginPatterns("*");
    }

    @Override
    public void configureMessageBroker(@NonNull MessageBrokerRegistry config) {
        // Prefixo para mensagens enviadas pelo cliente → servidor
        config.setApplicationDestinationPrefixes("/app");

        // Broker em memória para tópicos e fila de usuário específico
        config.enableSimpleBroker("/topic", "/queue")
                .setHeartbeatValue(new long[]{10000, 10000});

        // Destinos específicos de usuário (notificações privadas)
        config.setUserDestinationPrefix("/user");
    }

    @Override
    public void configureClientInboundChannel(@NonNull ChannelRegistration registration) {
        registration.interceptors(new ChannelInterceptor() {
            @Override
            public Message<?> preSend(@NonNull Message<?> message, @NonNull MessageChannel channel) {
                StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

                if (accessor == null) return message;

                if (StompCommand.CONNECT.equals(accessor.getCommand())) {
                    log.debug("[WS] CONNECT frame recebido, processando autenticação...");
                    
                    // Extrai token JWT do header Authorization ou do native header
                    List<String> authHeaders = accessor.getNativeHeader("Authorization");
                    
                    if (authHeaders == null || authHeaders.isEmpty()) {
                        log.warn("[WS] Nenhum header Authorization encontrado na conexão WebSocket");
                        return message;
                    }
                    
                    String header = authHeaders.get(0);
                    if (header == null || !header.startsWith("Bearer ")) {
                        log.warn("[WS] Header Authorization malformado: {}", header != null ? header.substring(0, Math.min(20, header.length())) : "null");
                        return message;
                    }
                    
                    String token = header.substring(7);
                    log.debug("[WS] Token JWT extraído, comprimento: {}", token.length());

                    try {
                        UUID authUserId = jwtService.extractUserId(token);
                        log.debug("[WS] UserId extraído do token: {}", authUserId);
                        
                        Optional<UserProfile> profileOptional = userProfileRepository.findByAuthUserId(authUserId);
                        if (profileOptional.isPresent()) {
                            UserProfile profile = profileOptional.get();
                            Principal principal = () -> profile.getId().toString();
                            accessor.setUser(principal);
                            log.info("[WS] ✓ Conexão autenticada com sucesso: {} ({})", profile.getDisplayName(), profile.getId());
                        } else {
                            log.warn("[WS] ✗ Perfil de usuário não encontrado para authUserId: {}", authUserId);
                        }
                    } catch (IllegalArgumentException e) {
                        log.warn("[WS] ✗ Token JWT malformado ou expirado: {}", e.getMessage());
                    } catch (Exception e) {
                        log.error("[WS] ✗ Erro ao processar token JWT na autenticação WebSocket", e);
                    }
                }
                return message;
            }
        });
    }
}

# Guia Completo: WebSocket no Backend Java (Spring Boot)

## Estrutura e Arquivos do Projeto

### 1. WebSocketConfig.java
**Local:** backend/src/main/java/com/kanux/config/WebSocketConfig.java

- **Função:** Configura o endpoint WebSocket, integra STOMP, define regras de CORS, autenticação e tópicos.
- **Linhas principais:**
  - `@Configuration` e `@EnableWebSocketMessageBroker`: ativam o suporte a WebSocket/STOMP.
  - `registerStompEndpoints`: define o endpoint (ex: `/ws-native`).
  - `configureMessageBroker`: configura tópicos e filas (ex: `/topic`, `/queue`).
  - `configureClientInboundChannel`: pode adicionar autenticação customizada.

---

### 2. ChatWebSocketController.java
**Local:** backend/src/main/java/com/kanux/ws/ChatWebSocketController.java

- **Função:** Handler principal de mensagens STOMP relacionadas a chats.
- **Linhas principais:**
  - `@Controller("chatWebSocketControllerWs")`: registra o bean com nome customizado.
  - Métodos com `@MessageMapping`: recebem mensagens dos clientes.
  - Métodos com `@SendToUser` ou `messagingTemplate.convertAndSend`: enviam respostas.
  - Exemplo:
    ```java
    @MessageMapping("/chats.list")
    @SendToUser("/topic/chats")
    public List<ChatDTO> listChats(@Payload(required = false) ChatDTO req, Principal principal) { ... }
    ```

---

### 3. ApiWebSocketController.java
**Local:** backend/src/main/java/com/kanux/ws/ApiWebSocketController.java

- **Função:** Handler para APIs WebSocket de recursos diversos (empresas, tickets, etc).
- **Linhas principais:**
  - Métodos com `@MessageMapping` para cada recurso (ex: `/companies.list`, `/tickets.list`).
  - Métodos com `@SendToUser` para resposta privada.
  - Exemplo:
    ```java
    @MessageMapping("/companies.list")
    @SendToUser("/topic/companies")
    public List<Map<String, Object>> listCompanies(@Payload Map<String, Object> req, Principal principal) { ... }
    ```

---

### 4. DTOs de Mensagem
**Local:** backend/src/main/java/com/kanux/ws/dto/

- **Função:** Estruturas de dados para trafegar mensagens entre frontend e backend.
- **Exemplo:**
  - `ChatDTO.java`, `MessageDTO.java`, etc.
  - Campos anotados com `@JsonProperty` (opcional) para serialização.

---

### 5. application.yml
**Local:** backend/src/main/resources/application.yml

- **Função:** Configurações do broker, limites, portas, etc.
- **Exemplo:**
  ```yaml
  spring:
    websocket:
      message-broker:
        enabled: true
  ```

---

## Como transformar uma API REST em WebSocket (usando seu projeto)

### Exemplo: Listar Chats

#### 1. Antes (REST)
```java
@RestController
@RequestMapping("/api/chats")
public class ChatRestController {
    @GetMapping
    public List<ChatDTO> listChats(Principal principal) {
        // ...
    }
}
```

#### 2. Depois (WebSocket)
```java
@Controller("chatWebSocketControllerWs")
public class ChatWebSocketController {
    @MessageMapping("/chats.list")
    @SendToUser("/topic/chats")
    public List<ChatDTO> listChats(@Payload(required = false) ChatDTO req, Principal principal) {
        // ...
    }
}
```
- O frontend envia uma mensagem STOMP para `/app/chats.list`.
- O backend responde em `/user/{id}/topic/chats`.

---

## Passo a passo para criar uma rota WebSocket

1. **Crie um DTO para a mensagem:**
   - Exemplo: `ChatDTO.java`
2. **Adicione um método no Controller:**
   - Use `@MessageMapping("/sua.rota")`.
   - Use `@SendToUser("/topic/sua-rota")` para resposta privada.
3. **Implemente a lógica de negócio normalmente.**
4. **No frontend, envie uma mensagem STOMP para `/app/sua.rota` e escute `/user/topic/sua-rota`.**

---

## Dicas e Boas Práticas
- Nunca duplique destinos STOMP entre controllers.
- Use nomes claros para os tópicos.
- Sempre documente as rotas e exemplos de payloads.
- Use DTOs para garantir tipagem e segurança.
- Configure autenticação no WebSocket para proteger os canais.

---

## Arquivos criados para WebSocket neste projeto
- `config/WebSocketConfig.java` (configuração do canal)
- `ws/ChatWebSocketController.java` (handler principal de chat)
- `ws/ApiWebSocketController.java` (handler de recursos gerais)
- `ws/dto/ChatDTO.java`, `ws/dto/MessageDTO.java` (modelos de mensagem)
- `application.yml` (configuração global)

---

## Como evoluir uma API REST para WebSocket
1. Identifique o endpoint REST que deseja migrar.
2. Crie um método equivalente em um controller WebSocket usando `@MessageMapping`.
3. Ajuste o frontend para enviar mensagens STOMP ao invés de requisições HTTP.
4. Teste e monitore os canais/tópicos.

---

**Este guia cobre toda a estrutura e exemplos reais do seu projeto. Para dúvidas ou exemplos práticos, consulte este arquivo ou peça exemplos específicos.**

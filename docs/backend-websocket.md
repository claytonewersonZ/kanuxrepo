# Histórico de Conflito de Destino STOMP

## 2026-05-23 - Correção de conflito /chats.list

**Problema:**
Dois métodos estavam anotados com `@MessageMapping("/chats.list")`:
- `ChatWebSocketController.listChats` (`List<ChatDTO>`, destino: `/chats.list`)
- `ApiWebSocketController.listChats` (`List<Map<String, Object>>`, destino: `/chats.list`)

**Sintoma:**
Erro de deploy: `Ambiguous mapping found. Cannot map ... There is already ... mapped.`

**Solução:**
- O método em `ApiWebSocketController` foi alterado para:
    - `@MessageMapping("/api.chats.list")`
    - `@SendToUser("/topic/api-chats")`
- O método em `ChatWebSocketController` permanece como handler principal de `/chats.list`.

**Lição:**
Nunca duplique destinos STOMP entre controllers. Cada destino deve ser único no backend.

---
# Backend WebSocket API (Spring Boot)

## Visão Geral
Este documento descreve a arquitetura, canais e handlers WebSocket do backend Kanux, implementados em Spring Boot. Sempre que houver alteração no código, esta nota deve ser atualizada.

---

## Arquivo principal: ApiWebSocketController.java

- Local: `backend/src/main/java/com/kanux/ws/ApiWebSocketController.java`
- Função: Expõe todos os canais WebSocket equivalentes aos endpoints REST para chats, tickets, empresas, membros, comentários, departamentos e admin.

### Canais e Handlers

| Canal STOMP                  | Handler Java                      | Payload esperado         | Observação |
|-----------------------------|-----------------------------------|-------------------------|------------|
| `/app/profile.get`          | getProfile                        | -                       | Retorna perfil do usuário autenticado |
| `/app/companies.list`       | listCompanies                     | -                       | Lista empresas do usuário             |
| `/app/company.members`      | listCompanyMembers                | `{ companyId }`         | Lista membros de uma empresa          |
| `/app/chats.list`           | listChats                         | `{ companyId? }`        | Lista chats do usuário                |
| `/app/chat.messages.list`   | listChatMessages                  | `{ chatId }`            | Lista mensagens de um chat            |
| `/app/chat.message.send`    | sendChatMessage                   | `{ chatId, content, ...}` | Envia mensagem para um chat         |
| `/app/tickets.list`         | listTickets                       | `{ companyId? }`        | Lista tickets                         |
| `/app/ticket.create`        | createTicket                      | `{ ... }`               | Cria novo ticket                      |
| `/app/ticket.comments.list` | listTicketComments                | `{ ticketId }`          | Lista comentários de ticket           |
| `/app/ticket.comment.send`  | sendTicketComment                 | `{ ticketId, content }` | Envia comentário para ticket          |
| `/app/departments.list`     | listDepartments                   | `{ companyId? }`        | Lista departamentos                   |
| `/app/admin.invite-user`    | inviteUser                        | `{ email, companyId }`  | Envia convite admin                   |

- Todos os métodos usam `@MessageMapping` e, quando resposta privada, `@SendToUser`.
- Métodos de envio (mensagem, ticket, comentário) usam `messagingTemplate.convertAndSend` para broadcast.

---

## Exemplo de Handler
```java
@MessageMapping("/chat.message.send")
public void sendChatMessage(@Payload Map<String, Object> msg, Principal principal) {
    messagingTemplate.convertAndSend("/topic/chat-messages", (Object) java.util.Objects.requireNonNull(msg));
}
```

---

## Observações
- Todos os handlers validam autenticação via Principal (JWT).
- Para adicionar novos canais, criar novo método com `@MessageMapping` e atualizar esta nota.
- Para alterações, sempre documentar o motivo e o payload esperado.

---

## Histórico de Alterações
- 2026-05-23: Criação inicial da documentação dos canais WebSocket.
- Sempre atualizar ao modificar ApiWebSocketController.java ou canais relacionados.

---

## Histórico de Decisões Técnicas - WebSocket Kanux

## 2026-05-23: Conflito de Bean Corrigido

Foi identificado um conflito de beans no contexto Spring Boot devido à existência de dois controllers WebSocket com o mesmo nome de bean (`chatWebSocketController`):

- `com.kanux.controller.ChatWebSocketController` (handler principal, com lógica de negócio completa)
- `com.kanux.ws.ChatWebSocketController` (handlers de API/dto, estrutura simplificada)

**Decisão:**
O bean do controller em `com.kanux.ws` foi explicitamente renomeado para `chatWebSocketControllerWs` usando `@Controller("chatWebSocketControllerWs")`, permitindo coexistência dos dois controllers sem sobrescrever beans no contexto Spring.

**Motivo:**
- Evitar falha de inicialização do Spring Boot (ConflictingBeanDefinitionException)
- Permitir evolução da API WebSocket sem quebrar handlers legados

**Ação:**
- Código alterado em: `backend/src/main/java/com/kanux/ws/ChatWebSocketController.java`
- Documentação atualizada em: `docs/backend-websocket.md` (este arquivo)

---

## Como proceder em futuras alterações
- Sempre analisar esta documentação antes de criar/renomear controllers WebSocket.
- Se criar novo controller, defina bean name único se houver risco de conflito.
- Após qualquer alteração, registre aqui a decisão e o motivo.

---

## Referências
- [Spring WebSocket Docs](https://docs.spring.io/spring-framework/docs/current/reference/html/web.html#websocket)
- [STOMP Protocol](https://stomp.github.io/)

# Estrutura do Backend Kanux

## Visão Geral
O backend do Kanux é construído em Spring Boot, estruturado para suportar comunicação WebSocket (STOMP/SockJS) e REST (em transição para 100% WebSocket). Abaixo, a estrutura dos principais diretórios e arquivos.

---

## Estrutura de Pastas

```
backend/
  src/
    main/
      java/
        com/kanux/
          ws/                  # Controllers WebSocket
            ApiWebSocketController.java
            ChatWebSocketController.java
          config/              # Configurações (WebSocket, JWT, etc)
          security/            # Serviços de autenticação JWT
          controller/          # REST controllers (legado)
          dto/                 # Data Transfer Objects
      resources/
        application.yml        # Configuração Spring Boot
    test/
      java/                   # Testes automatizados
  pom.xml                     # Dependências Maven
```

---

## Principais Arquivos

- **ApiWebSocketController.java**: Handlers WebSocket para todos os recursos principais.
- **ChatWebSocketController.java**: Handlers WebSocket específicos para chats/mensagens.
- **WebSocketConfig.java**: Configuração de endpoints, autenticação JWT no handshake, interceptors.
- **JwtService.java**: Validação e extração de claims do token JWT.
- **pom.xml**: Gerenciamento de dependências (Spring Boot, STOMP, etc).

---

## Observações
- Sempre que criar ou alterar arquivos nesta estrutura, atualizar esta nota.
- Para handlers/canais, detalhar no arquivo `backend-websocket.md`.
- Para DTOs, criar/atualizar `backend-dtos.md`.

---

## Histórico de Migrações Flyway

- **2026-05-23:** Corrigido erro de deploy causado por duplicidade de versão nas migrations Flyway.
    - Antes: Existiam dois arquivos `V2__*.sql` (`add_password_hash_to_user_profiles` e `seed_super_admin`).
    - Agora: `V2__add_password_hash_to_user_profiles.sql` (adiciona coluna), `V3__add_missing_profile_columns.sql` (adiciona colunas extras), `V4__seed_super_admin.sql` (insere super admin).
    - Motivo: O Flyway exige versões únicas para cada migration. A duplicidade impedia o deploy.
    - Ação: Arquivo de seed renomeado para V4 e registrado aqui.

---

## Histórico de Problemas e Soluções Flyway

- **2026-05-23:**
    - Problema: Erro de checksum ou descrição em migrations Flyway após renomear, editar ou mover arquivos.
    - Sintoma: "Migration checksum mismatch" ou "Migration description mismatch" no deploy.
    - Solução:
        1. Execute o comando SQL para corrigir a descrição diretamente no banco:
           ```sql
           UPDATE flyway_schema_history
           SET description = 'add password hash to user profiles'
           WHERE version = '2';
           ```
        2. Se o erro for de checksum, rode `flyway repair` ou delete o registro da migration e deixe o Flyway reaplicar.
        3. Sempre que renomear ou alterar migrations já aplicadas, alinhe o histórico do banco com o código.
    - Referência: [[backend-websocket.md]]

---

## Histórico de Alterações
- 2026-05-23: Estrutura inicial documentada.

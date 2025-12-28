# Soul Clean Setup

## Services
- Admin UI: `/ui`
- API: `/api/*`
- MCP: `/mcp`, `/mcp/sse`, `/mcp/message`

## Environment
- `SOUL_ROOT=/soul` (read-only in UI)
- `PUBLIC_BASE_URL=https://sowon.mooo.com`
- `ADMIN_TOKEN` (optional, UI에서 입력)

## Run (Docker)
```
docker compose up -d --build
```

## MCP Tools
- `log_one` (single)
- `log_many` (batch)
- `list_stores`

## Notes
- 저장소 관리는 UI에서 추가/수정/삭제.
- `/soul/config/config.json`에 저장됨.

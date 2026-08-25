.PHONY: setup up down restart logs chat shell dash config status clean
setup:    ; ./setup.sh
up:       ; docker compose up -d
down:     ; docker compose down
restart:  ; docker compose up -d --force-recreate
logs:     ; docker compose logs -f --tail=50
chat:     ; docker compose exec luna hermes
shell:    ; docker compose exec luna bash
config:   ; docker compose exec luna hermes config
status:   ; @docker compose ps && docker stats --no-stream --format "{{.Name}}: {{.MemUsage}}" luna
dash:     ; @echo "http://127.0.0.1:$$(grep -E '^DASHBOARD_PORT=' .env | cut -d= -f2-)"
clean:    ; docker compose down -v

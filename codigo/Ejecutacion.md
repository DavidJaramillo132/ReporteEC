Ejecutar Backend
	uv run fastapi dev app/main.py                                            # la API
	uv run python -m app.workers.historical_worker                           # el worker diario, una sola vez
	uv run python -m app.workers.historical_worker --loop --interval-hours 24 # el worker diario, en bucle
	uv run pytest                                                             # tests

Ejecutar Frontend

	bun run dev

Ejecutar todo con Docker (desde codigo/)

	docker compose up --build                    # postgres+postgis, martin, backend, frontend
	docker compose --profile worker up -d worker # + el worker diario (perfil aparte: no arranca solo)
	docker compose down                          # detener (los datos de la base se conservan)
	docker compose down -v                       # detener y BORRAR la base de datos

	Requiere codigo/.env (copiar de .env.example y poner tus valores)
	Frontend http://localhost:5173 · API http://localhost:8000/docs · Teselas http://localhost:3000/catalog

# diagram-db

Ferramenta estilo **DrawSQL**, focada em **PostgreSQL**, baseada no guia em `project.txt`.

## Rodar (MVP – API + export SQL)

## Rodar tudo só com Docker Compose

```bash
docker compose up --build
```

- Web: `http://localhost:5173`
- API: `http://localhost:3000/health`

### 1) Subir Postgres (opcional no MVP)

```bash
docker compose up -d db
```

Para usar o Postgres como persistência, instale dependências e rode a API com `DATABASE_URL` (o `docker-compose.yml` já injeta a env no container):

```bash
npm install
DATABASE_URL=postgresql://admin:password@localhost:5432/diagram_db npm run dev:node
```

### 2) Rodar a API

Sem Bun (Node 22+):

```bash
npm run dev:node
```

Com Bun (se instalado):

```bash
bun run dev
```

A API sobe em `http://localhost:3000`.

## Rodar o Frontend (React Flow)

Requer instalar dependências (inclui React Flow + Zustand):

```bash
npm install
npm run dev:web
```

O Vite sobe em `http://localhost:5173` e faz proxy para a API em `http://localhost:3000`.

## Exportar SQL via CLI (a partir de um JSON)

```bash
node packages/shared/src/postgres/cli-generate-sql.js caminho/do/diagrama.json
```

Exemplo:

```bash
node packages/shared/src/postgres/cli-generate-sql.js examples/sample-diagram.json
```

## Persistência

- `STORAGE=auto` (default): tenta Postgres se `DATABASE_URL` existir; se falhar, usa arquivo
- `STORAGE=file`: sempre arquivo
- `STORAGE=postgres`: exige Postgres

No modo arquivo, salva em `apps/api/data/projects.json` (por padrão).

## Estrutura do diagrama (contrato JSON)

- `nodes`: tabelas (`type: "tableNode"`) e anotações (`type: "annotationNode"`; ignoradas no SQL)
- `edges`: relacionamentos (FK e `n:n`)
- `databaseConfig.enums`: enums globais (gerados antes das tabelas)

O gerador fica em `packages/shared/src/postgres/generateSql.js`.

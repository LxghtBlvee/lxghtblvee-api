# lxghtblvee-api

Personal API for LxghtBlvee. Includes Swagger UI docs and a `now-playing` endpoint powered by Last.fm.

## Features
- Fastify + TypeScript (ESM)
- Swagger UI at `/docs`
- OpenAPI JSON at `/docs/json`
- Health endpoint at `/health`
- Music endpoint at `/v1/music/now-playing` (Last.fm)

## Requirements
- Node.js 20+

## Setup

1) Install deps
```bash
npm i
```

2) Create `.env` (copy from `.env.example`)
```bash
cp .env.example .env
```

3) Fill in:
- `LASTFM_API_KEY`
- `LASTFM_USERNAME`

4) Run dev
```bash
npm run dev
```

Open:
- Swagger UI: `http://localhost:4010/docs`
- Now playing: `http://localhost:4010/v1/music/now-playing`

## Env
See `.env.example`.

## Notes
- Last.fm "now playing" is detected via the `@attr.nowplaying` flag from `user.getrecenttracks`.
- Last.fm does not provide track progress, so the API returns `isNowPlaying` plus metadata and timestamps.


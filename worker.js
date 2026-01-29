export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      // CORS preflight
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }

      // Normalize trailing slash
      const path =
        url.pathname.endsWith("/") && url.pathname !== "/"
          ? url.pathname.slice(0, -1)
          : url.pathname;

      // Soft rate limit (per instance)
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const now = Date.now();
      globalThis.__rl ??= new Map();
      const bucket = globalThis.__rl.get(ip) || { count: 0, reset: now + 10_000 };
      if (now > bucket.reset) {
        bucket.count = 0;
        bucket.reset = now + 10_000;
      }
      bucket.count++;
      globalThis.__rl.set(ip, bucket);

      if (bucket.count > 60) {
        return json({ error: "Rate limited" }, 429, 1);
      }

      // Health
      if (path === "/" || path === "/health") {
        return text("ok");
      }

      // ================= Discord Status API =================
      // Public: returns KV status if available; else env fallback
      if (path === "/api/discord/status") {
        const status = await readDiscordStatus(env);
        return json(status, 200, 0);
      }

      // Public: explicitly KV read (useful for debugging)
      if (path === "/api/discord/status-kv") {
        if (!env.STATUS_KV) return json({ error: "KV not configured" }, 500, 0);
        const status = await readDiscordStatusFromKV(env);
        return json(status, 200, 0);
      }

      // Protected: update status (writes to KV)
      if (path === "/api/discord/status/update" && request.method === "POST") {
        const auth =
          request.headers.get("Authorization") ||
          request.headers.get("authorization") ||
          "";

        if (!env.ADMIN_TOKEN) return json({ error: "ADMIN_TOKEN not set" }, 500, 0);
        if (auth !== `Bearer ${env.ADMIN_TOKEN}`) return json({ error: "Unauthorized" }, 401, 0);
        if (!env.STATUS_KV) return json({ error: "KV not configured" }, 500, 0);

        const body = await request.json().catch(() => ({}));

        const workingOn =
          typeof body.workingOn === "string" && body.workingOn.trim().length
            ? body.workingOn.trim()
            : null;

        const state =
          typeof body.state === "string" && body.state.trim().length
            ? body.state.trim()
            : null;

        const updated = await writeDiscordStatusToKV(env, { workingOn, state });

        return json({ ok: true, status: updated }, 200, 0);
      }
      // =======================================================

      // Debug: env presence (does NOT expose secret values)
      if (path === "/debug/env") {
        return json(
          {
            hasLastfmKey: !!env.LASTFM_API_KEY,
            lastfmUser: env.LASTFM_USER || null,
            robloxUserId: env.ROBLOX_USER_ID || null,
            githubUser: env.GITHUB_USER || null,
            hasAdminToken: !!env.ADMIN_TOKEN,
            hasStatusKV: !!env.STATUS_KV,
          },
          200,
          0,
        );
      }

      // Debug: lastfm raw call
      if (path === "/debug/lastfm") {
        const out = await debugLastfm(env);
        return json(out, 200, 0);
      }

      // Routes
      if (path === "/now-playing") {
        return handleCached(request, ctx, 5, () => getNowPlaying(env));
      }

      if (path === "/roblox") {
        return handleCached(request, ctx, 10, () => getRoblox(env));
      }

      if (path === "/github") {
        return handleCached(request, ctx, 30, () => getGitHub(env));
      }

      if (path === "/feed") {
        return handleCached(request, ctx, 5, async () => {
          const [np, rbx, gh] = await Promise.all([
            getNowPlaying(env).catch((e) => ({ _error: String(e) })),
            getRoblox(env).catch((e) => ({ _error: String(e) })),
            getGitHub(env).catch((e) => ({ items: [], _error: String(e) })),
          ]);

          const items = [];

          // Music
          if (np?.title) {
            items.push({
              type: np.nowPlaying ? "music_now" : "music_last",
              title: np.nowPlaying ? `Listening: ${np.title}` : `Last played: ${np.title}`,
              subtitle: np.artist || "",
              url: np.url || "",
              image: np.albumArt || "",
              durationMs: np.durationMs || 0,
              trackKey: np.trackKey || "",
              ts: Date.now(),
            });
          }

          // Roblox
          if (rbx?.name) {
            items.push({
              type: "roblox",
              title: rbx.title || (rbx.isOnline ? "Roblox: Online" : "Roblox: Offline"),
              subtitle: rbx.subtitle || `${rbx.displayName} (@${rbx.name})`,
              url: rbx.gameUrl || rbx.profileUrl,
              image: rbx.gameIcon || rbx.avatar || "",
              ts: Date.now(),
              presenceType: rbx.presenceType ?? 0,
              lastLocation: rbx.lastLocation || "",
              placeId: rbx.placeId ?? null,
            });
          }

          // GitHub
          if (gh?.items?.length) {
            for (const it of gh.items.slice(0, 3)) items.push({ ...it, ts: it.ts || Date.now() });
          }

          // Presence summary
          const presence = {
            music: np?.nowPlaying ? "listening" : "idle",
            roblox:
              rbx?.presenceType === 2
                ? "in_game"
                : rbx?.isOnline
                  ? "online"
                  : "offline",
            updatedAt: Date.now(),
          };

          return { presence, items, _debug: { np: np?._error || null, rbx: rbx?._error || null } };
        });
      }

      return json({ error: "Not found", path }, 404, 1);
    } catch (err) {
      // Prevent Error 1101 forever
      return json(
        {
          error: "Worker threw",
          message: err?.message || String(err),
          stack: (err?.stack || "").split("\n").slice(0, 6).join("\n"),
        },
        500,
        0,
      );
    }
  },
};

// ---------------- Helpers ----------------
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  };
}

function text(body, status = 200) {
  return new Response(body, {
    status,
    headers: { ...corsHeaders(), "Content-Type": "text/plain; charset=utf-8" },
  });
}

function json(data, status = 200, cacheSeconds = 5) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=0, s-maxage=${cacheSeconds}`,
    },
  });
}

async function handleCached(request, ctx, seconds, producer) {
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).toString(), request);

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const data = await producer();
  const res = json(data, 200, seconds);
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

// ---------------- Discord Status (KV) ----------------
async function readDiscordStatus(env) {
  // Prefer KV if configured
  if (env.STATUS_KV) return readDiscordStatusFromKV(env);

  // Fallback: env defaults (static)
  return {
    workingOn: env.WORKING_ON || "Chilling 😴",
    state: env.STATE || "idle", // idle | coding | deploying | offline
    updatedAt: env.UPDATED_AT || new Date().toISOString(),
  };
}

async function readDiscordStatusFromKV(env) {
  const raw = await env.STATUS_KV.get("status");
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      // ignore corrupted KV
    }
  }
  return {
    workingOn: "Chilling 😴",
    state: "idle",
    updatedAt: new Date().toISOString(),
  };
}

async function writeDiscordStatusToKV(env, patch) {
  const current = await readDiscordStatusFromKV(env);

  const next = {
    workingOn: patch.workingOn ?? current.workingOn ?? "Chilling 😴",
    state: patch.state ?? current.state ?? "idle",
    updatedAt: new Date().toISOString(),
  };

  await env.STATUS_KV.put("status", JSON.stringify(next));
  return next;
}

// ---------------- Last.fm ----------------
async function debugLastfm(env) {
  try {
    const apiKey = env.LASTFM_API_KEY;
    const username = env.LASTFM_USER || "LxghtBlvee";

    if (!apiKey) return { ok: false, reason: "MISSING_LASTFM_API_KEY", username };

    const recentUrl =
      `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks` +
      `&user=${encodeURIComponent(username)}` +
      `&api_key=${encodeURIComponent(apiKey)}` +
      `&format=json&limit=1`;

    const res = await fetch(recentUrl);
    const text = await res.text();

    return {
      ok: res.ok,
      status: res.status,
      username,
      sample: text.slice(0, 1000),
    };
  } catch (e) {
    return { ok: false, reason: "EXCEPTION", message: e?.message || String(e) };
  }
}

async function getNowPlaying(env) {
  const apiKey = env.LASTFM_API_KEY;
  const username = env.LASTFM_USER || "LxghtBlvee";

  if (!apiKey) {
    return { nowPlaying: false, title: "", artist: "", albumArt: "", url: "", durationMs: 0, trackKey: "" };
  }

  const recentUrl =
    `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks` +
    `&user=${encodeURIComponent(username)}` +
    `&api_key=${encodeURIComponent(apiKey)}` +
    `&format=json&limit=1`;

  const data = await fetch(recentUrl).then((r) => r.json());
  const track = data?.recenttracks?.track?.[0];

  const title = track?.name || "";
  const artist = track?.artist?.["#text"] || "";
  const nowPlaying = track?.["@attr"]?.nowplaying === "true";
  const url = track?.url || "";

  const images = track?.image || [];
  const albumArt =
    images.find((i) => i.size === "extralarge")?.["#text"] ||
    images.find((i) => i.size === "large")?.["#text"] ||
    images.find((i) => i.size === "medium")?.["#text"] ||
    "";

  const trackKey = title && artist ? `${artist} — ${title}` : "";

  let durationMs = 0;
  if (title && artist) {
    try {
      const infoUrl =
        `https://ws.audioscrobbler.com/2.0/?method=track.getInfo` +
        `&api_key=${encodeURIComponent(apiKey)}` +
        `&artist=${encodeURIComponent(artist)}` +
        `&track=${encodeURIComponent(title)}` +
        `&autocorrect=1&format=json`;

      const info = await fetch(infoUrl).then((r) => r.json());
      const d = Number(info?.track?.duration || 0);
      if (Number.isFinite(d) && d > 0) durationMs = d;
    } catch {
      durationMs = 0;
    }
  }

  return { nowPlaying, title, artist, albumArt, url, durationMs, trackKey };
}

// ---------------- Roblox ----------------
async function getRoblox(env) {
  const userId = env.ROBLOX_USER_ID || "9519944913";

  const u = await fetch(`https://users.roblox.com/v1/users/${userId}`).then((r) => r.json());

  const thumb = await fetch(
    `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`,
  ).then((r) => r.json());

  const avatar = thumb?.data?.[0]?.imageUrl || "";

  let presenceType = 0;
  let lastLocation = "";
  let placeId = null;

  try {
    const pres = await fetch(`https://presence.roblox.com/v1/presence/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: [Number(userId)] }),
    }).then((r) => r.json());

    const p = pres?.userPresences?.[0];
    if (p) {
      presenceType = Number(p.userPresenceType ?? 0);
      lastLocation = p.lastLocation || "";
      placeId = p.placeId ?? null;
    }
  } catch {}

  const isOnline = presenceType === 1 || presenceType === 2 || presenceType === 3;

  let title = "Roblox: Offline";
  if (presenceType === 1) title = "Roblox: Online";
  if (presenceType === 2) title = "Roblox: In game";
  if (presenceType === 3) title = "Roblox: In Studio";

  const subtitle = lastLocation
    ? `${u?.displayName || u?.name || "Unknown"} (@${u?.name || "Unknown"}) • ${lastLocation}`
    : `${u?.displayName || u?.name || "Unknown"} (@${u?.name || "Unknown"})`;

  const profileUrl = `https://www.roblox.com/users/${userId}/profile`;
  const gameUrl = placeId ? `https://www.roblox.com/games/${placeId}` : null;

  let gameIcon = "";
  if (placeId) {
    try {
      const icon = await fetch(
        `https://thumbnails.roblox.com/v1/places/gameicons?placeIds=${placeId}&size=150x150&format=Png`,
      ).then((r) => r.json());
      gameIcon = icon?.data?.[0]?.imageUrl || "";
    } catch {
      gameIcon = "";
    }
  }

  return {
    userId,
    name: u?.name || "Unknown",
    displayName: u?.displayName || u?.name || "Unknown",
    avatar,
    isOnline,
    presenceType,
    lastLocation,
    placeId,
    profileUrl,
    gameUrl,
    gameIcon,
    title,
    subtitle,
  };
}

// ---------------- GitHub ----------------
async function getGitHub(env) {
  const user = env.GITHUB_USER || "LxghtBlvee";

  const events = await fetch(`https://api.github.com/users/${user}/events/public`, {
    headers: { "User-Agent": "portfolio-site" },
  }).then((r) => r.json());

  const items = (Array.isArray(events) ? events : [])
    .slice(0, 6)
    .map((e) => {
      const repo = e?.repo?.name || "";
      const type = e?.type || "Event";
      let title = `GitHub: ${type}`;
      let subtitle = repo;

      if (type === "PushEvent") title = `Pushed code`;
      if (type === "PullRequestEvent") title = `Pull request activity`;
      if (type === "IssuesEvent") title = `Issue activity`;

      return {
        type: "github",
        title,
        subtitle,
        url: repo ? `https://github.com/${repo}` : `https://github.com/${user}`,
        image:
          type === "PushEvent"
            ? "https://cdn-icons-png.flaticon.com/512/25/25231.png"
            : "https://cdn-icons-png.flaticon.com/512/5968/5968866.png",
        ts: Date.parse(e?.created_at) || Date.now(),
      };
    });

  return { items };
}

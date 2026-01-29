export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const path =
      url.pathname.endsWith("/") && url.pathname !== "/"
        ? url.pathname.slice(0, -1)
        : url.pathname;

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

    if (bucket.count > 40) {
      return json({ error: "Rate limited" }, 429, 1);
    }

    if (path === "/" || path === "/health") {
      return text("ok");
    }

    if (path === "/now-playing") {
      return handleCached(request, ctx, 5, () => getNowPlaying(env));
    }

    if (path === "/roblox") {
      return handleCached(request, ctx, 5, () => getRoblox(env));
    }

    if (path === "/github") {
      return handleCached(request, ctx, 30, () => getGitHub(env));
    }

    if (path === "/feed") {
      return handleCached(request, ctx, 5, async () => {
        const [np, rbx, gh] = await Promise.all([
          getNowPlaying(env).catch(() => null),
          getRoblox(env).catch(() => null),
          getGitHub(env).catch(() => null),
        ]);

        const items = [];

        if (np?.title) {
  items.push({
    type: np.nowPlaying ? "music_now" : "music_last",
    title: np.nowPlaying ? `Listening: ${np.title}` : `Last played: ${np.title}`,
    subtitle: np.artist || "",
    url: np.url || "",
    image: np.albumArt || "",
    ts: Date.now(),
    durationMs: np.durationMs || 0,
    trackKey: np.trackKey || "",
  });
}


        if (rbx?.name) {
  items.push({
    type: "roblox",
    title: rbx.title || (rbx.isOnline ? "Roblox: Online" : "Roblox: Offline"),
    subtitle: rbx.subtitle || `${rbx.displayName} (@${rbx.name})`,
    url: rbx.gameUrl || rbx.profileUrl,  
    image: rbx.gameIcon || rbx.avatar,
    ts: Date.now(),
    placeId: rbx.placeId || null,
    lastLocation: rbx.lastLocation || "",
  });
}

        if (gh?.items?.length) {
          for (const it of gh.items.slice(0, 3)) {
            items.push({ ...it, ts: it.ts || Date.now() });
          }
        }

        const presence = {
  music: np?.nowPlaying ? "listening" : "idle",
  roblox: rbx?.isOnline ? (rbx?.presenceType === 2 ? "in_game" : "online") : "offline",
  updatedAt: Date.now(),
};

        return { presence, items };
      });
    }

    return json({ error: "Not found", path }, 404, 1);
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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

  const res = await fetch(recentUrl);
  const data = await res.json();

  const track = data?.recenttracks?.track?.[0];
  const title = track?.name || "";
  const artist = track?.artist?.["#text"] || "";

  const images = track?.image || [];
  const albumArt =
    images.find((i) => i.size === "extralarge")?.["#text"] ||
    images.find((i) => i.size === "large")?.["#text"] ||
    images.find((i) => i.size === "medium")?.["#text"] ||
    "";

  const nowPlaying = track?.["@attr"]?.nowplaying === "true";
  const url = track?.url || "";
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

  return {
    nowPlaying,
    title,
    artist,
    albumArt,
    url,
    durationMs,
    trackKey,
  };
}

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

  const gameUrl = placeId ? `https://www.roblox.com/games/${placeId}` : null;


  let gameIcon = "";
  if (placeId) {
    try {
      const icon = await fetch(
        `https://thumbnails.roblox.com/v1/places/gameicons?placeIds=${placeId}&size=150x150&format=Png`,
      ).then((r) => r.json());

      gameIcon = icon?.data?.[0]?.imageUrl || "";
    } catch {}
  }

  let title = "Roblox: Offline";
  if (presenceType === 1) title = "Roblox: Online";
  if (presenceType === 2) title = "Roblox: In game";
  if (presenceType === 3) title = "Roblox: In Studio";

  const subtitle = lastLocation
    ? `${u?.displayName || u?.name || "Unknown"} (@${u?.name || "Unknown"}) • ${lastLocation}`
    : `${u?.displayName || u?.name || "Unknown"} (@${u?.name || "Unknown"})`;

  return {
    userId,
    name: u?.name || "Unknown",
    displayName: u?.displayName || u?.name || "Unknown",
    avatar,
    isOnline,
    presenceType,
    lastLocation,
    placeId,
    profileUrl: `https://www.roblox.com/users/${userId}/profile`,
    gameUrl,
    gameIcon,
    title,
    subtitle,
  };
}


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

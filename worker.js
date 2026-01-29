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

    //  Basic rate limit (best-effort) 
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

    //  Routing 
    if (path === "/" || path === "/health") {
      return text("ok");
    }

    if (path === "/now-playing") {
      return handleCached(request, ctx, 5, () => getNowPlaying(env));
    }

    if (path === "/roblox") {
      return handleCached(request, ctx, 30, () => getRoblox(env));
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
          });
        }

        if (rbx?.name) {
          items.push({
            type: "roblox",
            title: rbx.isOnline ? `Roblox: Online` : `Roblox: Offline`,
            subtitle: `${rbx.displayName} (@${rbx.name})`,
            url: rbx.profileUrl,
            image: rbx.avatar,
            ts: Date.now(),
          });
        }

        if (gh?.items?.length) {
          for (const it of gh.items.slice(0, 3)) {
            items.push({ ...it, ts: it.ts || Date.now() });
          }
        }

        const presence = {
          music: np?.nowPlaying ? "listening" : "idle",
          roblox: rbx?.isOnline ? "online" : "offline",
          updatedAt: Date.now(),
        };

        return { presence, items };
      });
    }

    return json({ error: "Not found", path }, 404, 1);
  },
};

//  Response helpers 
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

//  Now Playing (Last.fm) 
async function getNowPlaying(env) {
  const apiKey = env.LASTFM_API_KEY;
  const username = env.LASTFM_USER || "LxghtBlvee";

  if (!apiKey) return { nowPlaying: false, title: "", artist: "", albumArt: "", url: "" };

  const apiUrl =
    `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks` +
    `&user=${encodeURIComponent(username)}` +
    `&api_key=${encodeURIComponent(apiKey)}` +
    `&format=json&limit=1`;

  const res = await fetch(apiUrl);
  const data = await res.json();

  const track = data?.recenttracks?.track?.[0];
  const images = track?.image || [];
  const albumArt =
    images.find((i) => i.size === "extralarge")?.["#text"] ||
    images.find((i) => i.size === "large")?.["#text"] ||
    images.find((i) => i.size === "medium")?.["#text"] ||
    "";

  return {
    nowPlaying: track?.["@attr"]?.nowplaying === "true",
    title: track?.name || "",
    artist: track?.artist?.["#text"] || "",
    albumArt,
    url: track?.url || "",
  };
}

//  Roblox 
async function getRoblox(env) {
  const userId = env.ROBLOX_USER_ID || "9519944913";

  const u = await fetch(`https://users.roblox.com/v1/users/${userId}`).then((r) => r.json());

  const thumb = await fetch(
    `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`
  ).then((r) => r.json());

  const avatar = thumb?.data?.[0]?.imageUrl || "";

  let isOnline = false;
  try {
    const online = await fetch(`https://api.roblox.com/users/${userId}/onlinestatus/`).then((r) => r.json());
    isOnline = !!online?.IsOnline;
  } catch {
    isOnline = false;
  }

  return {
    userId,
    name: u?.name || "Unknown",
    displayName: u?.displayName || u?.name || "Unknown",
    avatar,
    isOnline,
    profileUrl: `https://www.roblox.com/users/${userId}/profile`,
  };
}

// github
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

const VALID_STATIONS = ['northpoint', 'meifoo', 'admiralty', 'diamondhill', 'kowloontong'];
const VALID_DIFFS = ['easy', 'normal', 'hard'];

function sortEntries(list) {
  return list.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.survivalTime !== a.survivalTime) return b.survivalTime - a.survivalTime;
    if (a.collisions !== b.collisions) return a.collisions - b.collisions;
    return a.updatedAt - b.updatedAt;
  });
}

async function handleLeaderboard(request, env) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!env.LEADERBOARD_KV) {
    return new Response(
      JSON.stringify({ ok: false, error: '尚未綁定 LEADERBOARD_KV' }),
      { status: 500, headers: corsHeaders }
    );
  }

  const url = new URL(request.url);

  if (request.method === 'GET') {
    const game = url.searchParams.get('game') || 'mtr_transfer_survival';
    const station = url.searchParams.get('station') || 'northpoint';
    const difficulty = url.searchParams.get('difficulty') || 'normal';

    if (!VALID_STATIONS.includes(station) || !VALID_DIFFS.includes(difficulty)) {
      return new Response(JSON.stringify({ ok: false, error: '無效車站或難度參數' }), { status: 400, headers: corsHeaders });
    }

    const kvKey = `lb:${game}:${station}:${difficulty}`;
    const raw = await env.LEADERBOARD_KV.get(kvKey);
    const entries = raw ? JSON.parse(raw) : [];
    return new Response(JSON.stringify({ ok: true, entries }), { headers: corsHeaders });
  }

  if (request.method === 'POST') {
    try {
      const body = await request.json();
      const game = String(body.game || 'mtr_transfer_survival').slice(0, 40);
      const username = String(body.username || '').trim().slice(0, 16);
      const station = String(body.station || '');
      const difficulty = String(body.difficulty || '');

      if (!username) {
        return new Response(JSON.stringify({ ok: false, error: '未提供 Username' }), { status: 400, headers: corsHeaders });
      }
      if (!VALID_STATIONS.includes(station) || !VALID_DIFFS.includes(difficulty)) {
        return new Response(JSON.stringify({ ok: false, error: '無效車站或難度' }), { status: 400, headers: corsHeaders });
      }

      const newRecord = {
        username,
        station,
        difficulty,
        score: Math.max(0, Math.floor(Number(body.score) || 0)),
        survivalTime: Math.max(0, Number((Number(body.survivalTime) || 0).toFixed(1))),
        collisions: Math.max(0, Math.floor(Number(body.collisions) || 0)),
        dodged: Math.max(0, Math.floor(Number(body.dodged) || 0)),
        skin: String(body.skin || 'suit').slice(0, 20),
        updatedAt: Date.now()
      };

      const kvKey = `lb:${game}:${station}:${difficulty}`;
      const raw = await env.LEADERBOARD_KV.get(kvKey);
      const entries = raw ? JSON.parse(raw) : [];

      const idx = entries.findIndex(e => e.username.toLowerCase() === username.toLowerCase());
      let updated = true;
      let bestScore = newRecord.score;

      if (idx !== -1) {
        const prev = entries[idx];
        const isBetter =
          newRecord.score > prev.score ||
          (newRecord.score === prev.score && newRecord.survivalTime > prev.survivalTime) ||
          (newRecord.score === prev.score && newRecord.survivalTime === prev.survivalTime && newRecord.collisions < prev.collisions);

        if (isBetter) {
          entries[idx] = newRecord;
        } else {
          updated = false;
          bestScore = prev.score;
        }
      } else {
        entries.push(newRecord);
      }

      const topEntries = sortEntries(entries).slice(0, 100);
      await env.LEADERBOARD_KV.put(kvKey, JSON.stringify(topEntries));

      return new Response(
        JSON.stringify({ ok: true, updated, bestScore, entries: topEntries }),
        { headers: corsHeaders }
      );
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: '資料格式錯誤' }), { status: 400, headers: corsHeaders });
    }
  }

  return new Response(JSON.stringify({ ok: false, error: 'Method Not Allowed' }), { status: 405, headers: corsHeaders });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/leaderboard' || url.pathname === '/api/leaderboard/') {
      return handleLeaderboard(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};

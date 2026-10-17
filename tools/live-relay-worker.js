// Optional relay for Live Game mode (Cloudflare Workers, free tier).
// Browsers block a page from reading another site's live stats unless that
// site allows it. This tiny worker fetches the play-by-play page for you and
// adds the header that lets the game read it.
//
// Deploy: create a Worker at dash.cloudflare.com, paste this file, deploy.
// Then in Live Game > LIVE STATS LINK, set Relay to:
//   https://<your-worker>.workers.dev/?url=
const ALLOWED = ['gojohnnies.com', 'uwrfsports.com', 'sidearmstats.com'];

export default {
  async fetch(request) {
    const target = new URL(request.url).searchParams.get('url');
    if (!target) return new Response('Add ?url=<play-by-play page>', { status: 400 });
    const host = new URL(target).hostname.replace(/^www\./, '');
    if (!ALLOWED.some(h => host === h || host.endsWith('.' + h))) return new Response('Host not allowed', { status: 403 });
    const upstream = await fetch(target, { headers: { 'user-agent': 'Mozilla/5.0 (BorderBowl live relay)' }, cf: { cacheTtl: 10 } });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
    });
  },
};

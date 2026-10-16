#!/usr/bin/env node
// Inline style.css and js/*.js into a single self-contained HTML file.
// Usage: node tools/bundle.js [out.html] [--fragment]
//   --fragment  emit only the head tags + body content (no <html>/<head>/<body> wrapper)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const out = args.find(a => !a.startsWith('--')) || path.join(root, 'dist', 'border-bowl.html');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
let body = html.split('<!--BODY-->')[1].split('<!--/BODY-->')[0];
body = body.replace(/<script src="([^"]+)"><\/script>/g, (_, src) =>
  `<script>\n${fs.readFileSync(path.join(root, src), 'utf8')}\n</script>`);
const head = html.match(/<title>[\s\S]*?<link rel="stylesheet" href="https:\/\/fonts[^>]+>/)[0];

const doc = fragment
  ? `${head}\n<style>\n${css}\n</style>\n${body}`
  : html.replace('<link rel="stylesheet" href="style.css">', `<style>\n${css}\n</style>`)
      .replace(/<!--BODY-->[\s\S]*<!--\/BODY-->/, body);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, doc);
console.log('wrote', out, (doc.length / 1024).toFixed(1) + ' KB');

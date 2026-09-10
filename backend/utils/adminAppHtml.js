module.exports = (html) => html
  .replace(/<title>.*?<\/title>/, '<title>Warriors Admin Login</title>')
  .replace(/<link\b[^>]*\brel=["']manifest["'][^>]*>/gi, '')
  .replace('</head>', '<link rel="manifest" href="/admin-manifest.webmanifest" /></head>')
  .replace(/(<meta\s+name="apple-mobile-web-app-title"\s+content=")[^"]*("\s*\/?>)/, '$1Admin$2');

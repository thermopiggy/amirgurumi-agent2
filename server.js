const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

// Configuration
const PORT = process.env.PORT || 3000;
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '359000000000';

// Load product data and translations
const products = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'products.json'), 'utf-8'),
);
const translations = {
  bg: JSON.parse(
    fs.readFileSync(path.join(__dirname, 'locales', 'bg.json'), 'utf-8'),
  ),
  en: JSON.parse(
    fs.readFileSync(path.join(__dirname, 'locales', 'en.json'), 'utf-8'),
  ),
};

// Sessions object to keep carts in memory. Each session id maps to { cart: { productId: quantity } }
const sessions = {};

// Helper: translation function. Takes language and a dotted key string.
function t(lang, key) {
  const parts = key.split('.');
  let obj = translations[lang] || translations.bg;
  for (const part of parts) {
    obj = obj && obj[part];
  }
  return obj || key;
}

// Helper: parse cookies from request headers
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  const pairs = cookieHeader.split(';');
  pairs.forEach((pair) => {
    const idx = pair.indexOf('=');
    const name = pair.substring(0, idx).trim();
    const value = decodeURIComponent(pair.substring(idx + 1).trim());
    cookies[name] = value;
  });
  return cookies;
}

// Helper: generate unique session id
function generateSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

// Helper: serve static files
function serveStatic(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    // Determine content type based on extension
    const ext = path.extname(filePath).toLowerCase();
    let contentType = 'text/plain';
    if (ext === '.html') contentType = 'text/html';
    else if (ext === '.css') contentType = 'text/css';
    else if (ext === '.js') contentType = 'application/javascript';
    else if (ext === '.json') contentType = 'application/json';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.svg') contentType = 'image/svg+xml';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// Helper: render page layout. Accepts inner HTML content, language, and optional title
function renderLayout(content, lang, title = '') {
  const brandName = t(lang, 'brandName');
  const navHome = t(lang, 'navHome');
  const navCatalog = t(lang, 'navCatalog');
  const navCart = t(lang, 'navCart');
  const footerText = t(lang, 'footerText');
  // Basic HTML layout with Bootstrap CDN
  return `<!DOCTYPE html>
  <html lang="${lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title ? title + ' - ' + brandName : brandName}</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" integrity="sha384-1CmrxMRARb6aLqgBO7YkQnTvsm2K+6J7zi10BGSAdoo6gWQKxn53eTr9jcig6a3P" crossorigin="anonymous" />
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <nav class="navbar navbar-expand-lg navbar-light bg-light fixed-top">
      <div class="container">
        <a class="navbar-brand" href="/?lang=${lang}">${brandName}</a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navbarNav">
          <ul class="navbar-nav me-auto mb-2 mb-lg-0">
            <li class="nav-item">
              <a class="nav-link" href="/?lang=${lang}">${navHome}</a>
            </li>
            <li class="nav-item">
              <a class="nav-link" href="/catalog?lang=${lang}">${navCatalog}</a>
            </li>
            <li class="nav-item">
              <a class="nav-link" href="/cart?lang=${lang}">${navCart}</a>
            </li>
          </ul>
          <ul class="navbar-nav">
            <li class="nav-item dropdown">
              <a class="nav-link dropdown-toggle" href="#" id="languageDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">${lang.toUpperCase()}</a>
              <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="languageDropdown">
                <li><a class="dropdown-item" href="/?lang=bg">BG</a></li>
                <li><a class="dropdown-item" href="/?lang=en">EN</a></li>
              </ul>
            </li>
          </ul>
        </div>
      </div>
    </nav>
    ${content}
    <footer class="footer">
      <div class="container">
        <p class="mb-0">${footerText}</p>
      </div>
    </footer>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js" integrity="sha384-ENjdO4Dr2bkBIFxQpeoM9A1qUzzr3MOeBjzlj/wzlhKRxU5VnLYA4uH8aXW9CLvL" crossorigin="anonymous"></script>
  </body>
  </html>`;
}

// Render index page
function renderIndex(lang) {
  const heroText = t(lang, 'heroText');
  const welcomeText = t(lang, 'welcomeText');
  const catalogLabel = t(lang, 'navCatalog');
  const content = `
    <div class="hero">
      <div class="container">
        <h1 class="text-white mb-3">${heroText}</h1>
        <p class="text-white lead">${welcomeText}</p>
        <a class="btn btn-primary mt-4" href="/catalog?lang=${lang}">${catalogLabel}</a>
      </div>
    </div>
  `;
  return renderLayout(content, lang, 'Home');
}

// Render catalog page
function renderCatalog(lang, categoryFilter) {
  // Filter products
  let filtered = products;
  if (categoryFilter && ['animals', 'people', 'fantasy'].includes(categoryFilter)) {
    filtered = products.filter((p) => p.category === categoryFilter);
  }
  // Build category navigation
  const categoryNames = {
    animals: t(lang, 'categories.animals'),
    people: t(lang, 'categories.people'),
    fantasy: t(lang, 'categories.fantasy'),
  };
  let categoriesNav = '<ul class="nav nav-pills mb-4">';
  categoriesNav += `<li class="nav-item"><a class="nav-link ${!categoryFilter ? 'active' : ''}" href="/catalog?lang=${lang}">All</a></li>`;
  ['animals', 'people', 'fantasy'].forEach((cat) => {
    const active = categoryFilter === cat ? 'active' : '';
    categoriesNav += `<li class="nav-item"><a class="nav-link ${active}" href="/catalog?category=${cat}&lang=${lang}">${categoryNames[cat]}</a></li>`;
  });
  categoriesNav += '</ul>';
  // Build products grid
  let productGrid = '';
  if (filtered.length > 0) {
    productGrid += '<div class="row g-4">';
    filtered.forEach((product) => {
      const name = product.name[lang] || product.name.bg;
      const desc = product.description[lang] || product.description.bg;
      productGrid += `
        <div class="col-sm-6 col-md-4">
          <div class="product-card d-flex flex-column">
            <img class="product-image" src="/${product.image}" alt="${name}" />
            <h5 class="mt-2">${name}</h5>
            <p class="flex-grow-1">${desc}</p>
            <p class="fw-bold mt-2">${t(lang, 'price')}: ${product.price.toFixed(2)} лв.</p>
            <form action="/add-to-cart?id=${product.id}&lang=${lang}" method="GET">
              <button class="btn btn-success" type="submit">${t(lang, 'addToCart')}</button>
            </form>
          </div>
        </div>`;
    });
    productGrid += '</div>';
  } else {
    productGrid += `<p class="text-muted">${t(lang, 'cartEmpty')}</p>`;
  }
  const content = `<div class="container mt-4"><h2 class="mb-3">${t(lang, 'navCatalog')}</h2>${categoriesNav}${productGrid}</div>`;
  return renderLayout(content, lang, t(lang, 'navCatalog'));
}

// Render cart page
function renderCart(lang, cartObj) {
  // Build items array
  const items = [];
  let total = 0;
  for (const idStr in cartObj) {
    const id = parseInt(idStr, 10);
    const qty = cartObj[idStr];
    const product = products.find((p) => p.id === id);
    if (product) {
      const lineTotal = product.price * qty;
      total += lineTotal;
      items.push({ product, quantity: qty, lineTotal });
    }
  }
  // Build HTML for cart
  let html = `<div class="container mt-4"><h2 class="mb-3">${t(lang, 'cartTitle')}</h2>`;
  if (items.length > 0) {
    html += '<table class="table cart-table">';
    html += '<thead><tr><th>' + t(lang, 'description') + '</th><th class="text-center">' + t(lang, 'price') + '</th><th class="text-center">Qty</th><th class="text-center">' + t(lang, 'total') + '</th><th></th></tr></thead><tbody>';
    items.forEach((item) => {
      const name = item.product.name[lang] || item.product.name.bg;
      const desc = item.product.description[lang] || item.product.description.bg;
      html += '<tr>';
      html += '<td><strong>' + name + '</strong><br><span class="text-muted small">' + desc + '</span></td>';
      html += '<td class="text-center">' + item.product.price.toFixed(2) + ' лв.</td>';
      html += '<td class="text-center">' + item.quantity + '</td>';
      html += '<td class="text-center">' + item.lineTotal.toFixed(2) + ' лв.</td>';
      html += '<td class="text-center">';
      html += '<a class="btn btn-sm btn-outline-danger" href="/remove-from-cart?id=' + item.product.id + '&lang=' + lang + '">' + t(lang, 'remove') + '</a>';
      html += '</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
    html += '<p class="fw-bold mt-3">' + t(lang, 'total') + ': ' + total.toFixed(2) + ' лв.</p>';
    // Build WhatsApp message
    let message = t(lang, 'checkoutMessageIntro');
    items.forEach((item) => {
      const name = item.product.name[lang] || item.product.name.bg;
      message += '\n- ' + name + ' x' + item.quantity + ' = ' + item.lineTotal.toFixed(2) + ' лв.';
    });
    message += '\n\n' + t(lang, 'checkoutMessageTotal') + total.toFixed(2) + ' лв.';
    const encodedMessage = encodeURIComponent(message);
    const whatsappLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodedMessage}`;
    html += '<a class="btn btn-primary mt-3" target="_blank" href="' + whatsappLink + '">' + t(lang, 'orderWhatsApp') + '</a>';
  } else {
    html += '<p class="text-muted">' + t(lang, 'cartEmpty') + '</p>';
  }
  html += '</div>';
  return renderLayout(html, lang, t(lang, 'navCart'));
}

// Main HTTP server
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;
  const cookies = parseCookies(req.headers.cookie);
  // Determine language
  let lang = 'bg';
  if (query.lang && ['bg', 'en'].includes(query.lang)) {
    lang = query.lang;
  } else if (cookies.lang && ['bg', 'en'].includes(cookies.lang)) {
    lang = cookies.lang;
  }
  // Prepare Set-Cookie headers
  const setCookies = [];
  if (!cookies.lang || cookies.lang !== lang) {
    setCookies.push(`lang=${lang}; Path=/`);
  }
  // Session handling
  let sid = cookies.sid;
  if (!sid || !sessions[sid]) {
    sid = generateSessionId();
    sessions[sid] = { cart: {} };
    setCookies.push(`sid=${sid}; Path=/`);
  }
  const session = sessions[sid];
  // Routing
  if (pathname === '/' || pathname === '/index.html') {
    const html = renderIndex(lang);
    res.writeHead(200, { 'Content-Type': 'text/html', 'Set-Cookie': setCookies });
    res.end(html);
  }
  else if (pathname === '/catalog') {
    const categoryFilter = query.category;
    const html = renderCatalog(lang, categoryFilter);
    res.writeHead(200, { 'Content-Type': 'text/html', 'Set-Cookie': setCookies });
    res.end(html);
  }
  else if (pathname === '/cart') {
    const html = renderCart(lang, session.cart);
    res.writeHead(200, { 'Content-Type': 'text/html', 'Set-Cookie': setCookies });
    res.end(html);
  }
  else if (pathname === '/add-to-cart') {
    const id = parseInt(query.id, 10);
    if (!isNaN(id)) {
      session.cart[id] = (session.cart[id] || 0) + 1;
    }
    // Redirect back to referring page or catalog
    const redirectUrl = req.headers.referer || `/catalog?lang=${lang}`;
    res.writeHead(302, { Location: redirectUrl, 'Set-Cookie': setCookies });
    res.end();
  }
  else if (pathname === '/remove-from-cart') {
    const id = parseInt(query.id, 10);
    if (!isNaN(id)) {
      delete session.cart[id];
    }
    res.writeHead(302, { Location: `/cart?lang=${lang}`, 'Set-Cookie': setCookies });
    res.end();
  }
  else if (pathname.startsWith('/data/')) {
    // Serve JSON data
    const filePath = path.join(__dirname, pathname);
    if (fs.existsSync(filePath)) {
      serveStatic(filePath, res);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  }
  else if (pathname.startsWith('/images/') || pathname.startsWith('/css/') || pathname.startsWith('/js/')) {
    const filePath = path.join(__dirname, 'public', pathname.substring(1));
    if (fs.existsSync(filePath)) {
      serveStatic(filePath, res);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  }
  else {
    // Not found
    res.writeHead(404, { 'Content-Type': 'text/html', 'Set-Cookie': setCookies });
    res.end(renderLayout(`<div class="container mt-4"><h2>404</h2><p>Page not found.</p></div>`, lang, '404'));
  }
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
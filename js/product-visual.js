const THEME_BY_CATEGORY = Object.freeze({
  "Comunicação Visual": "graphic",
  "Gráfica": "print",
  "Eventos": "event",
  "Papelaria": "paper",
  "Presentes": "gift",
  "Eletrônicos": "tech",
  "Digital": "digital"
});

const PHOTO_FALLBACK_BY_CATEGORY = Object.freeze({
  "Comunicação Visual": "https://images.pexels.com/photos/9307677/pexels-photo-9307677.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "Gráfica": "https://images.pexels.com/photos/8490095/pexels-photo-8490095.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "Eventos": "https://images.pexels.com/photos/11503488/pexels-photo-11503488.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "Papelaria": "https://images.pexels.com/photos/4219132/pexels-photo-4219132.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "Presentes": "https://images.pexels.com/photos/6478824/pexels-photo-6478824.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "Eletrônicos": "https://images.pexels.com/photos/27559516/pexels-photo-27559516.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "Digital": "https://images.pexels.com/photos/890065/pexels-photo-890065.jpeg?auto=compress&cs=tinysrgb&w=1200"
});
const DEFAULT_PHOTO = "https://images.pexels.com/photos/8490095/pexels-photo-8490095.jpeg?auto=compress&cs=tinysrgb&w=1200";

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>\"']/g, function(char) {
    return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char];
  });
}

function isAssetPath(value) {
  return typeof value === "string" && /^(https?:|\/|\.\/|\.\.\/)/.test(value);
}

function visualConfig(item) {
  return item && item.visual && typeof item.visual === "object" ? item.visual : {};
}

function visualBadges(item, visual) {
  var configured = Array.isArray(visual.selos) ? visual.selos : [];
  var source = configured.length ? configured : (Array.isArray(item.destaques) ? item.destaques.slice(0, 2).map(function(texto, index) {
    return {texto: texto, tipo: index === 0 ? "primary" : "info"};
  }) : []);
  return source.map(function(badge) {
    return typeof badge === "string" ? {texto: badge, tipo: "info"} : badge;
  }).filter(function(badge) {
    return badge && badge.texto;
  }).slice(0, 2);
}

export function renderProductVisual(item) {
  var visual = visualConfig(item);
  var theme = visual.tema || THEME_BY_CATEGORY[item.categoria] || "brand";
  var mode = visual.modo || (visual.produto ? "recorte" : "foto");
  var productSrc = isAssetPath(visual.produto) ? visual.produto : (item.imagem || PHOTO_FALLBACK_BY_CATEGORY[item.categoria] || DEFAULT_PHOTO);
  var backgroundSrc = isAssetPath(visual.fundo) ? visual.fundo : "";
  var badges = visualBadges(item, visual);
  var title = escapeHtml(item.nome || "Produto Croma");
  var productLayer = '<img class="media-product ' + (mode === "recorte" ? "media-cutout" : "media-photo") + '" src="' + escapeHtml(productSrc) + '" alt="' + title + '" loading="lazy" decoding="async">';
  var backgroundLayer = backgroundSrc
    ? '<img class="media-background-image" src="' + escapeHtml(backgroundSrc) + '" alt="" loading="lazy" decoding="async">'
    : '';
  var badgeLayer = badges.length
    ? '<div class="media-badges" aria-label="Informações rápidas de ' + title + '">' + badges.map(function(badge) {
        return '<span class="media-badge media-badge-' + escapeHtml(badge.tipo || "info") + '">' + escapeHtml(badge.texto) + '</span>';
      }).join('') + '</div>'
    : '';
  var shadowLayer = mode === "recorte" && visual.sombra !== false ? '<span class="media-shadow" aria-hidden="true"></span>' : '';
  return '<div class="product-media-layered theme-' + escapeHtml(theme) + ' mode-' + escapeHtml(mode) + '" data-visual-mode="' + escapeHtml(mode) + '">' +
    '<div class="media-background" aria-hidden="true">' + backgroundLayer + '</div>' +
    shadowLayer +
    '<div class="media-product-layer">' + productLayer + '</div>' +
    badgeLayer +
  '</div>';
}
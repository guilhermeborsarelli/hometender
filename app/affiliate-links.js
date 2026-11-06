// Coloque aqui os links de produtos da sua conta Amazon Associados.
// As chaves são os ids dos ingredientes em data.js (gin, campari, vermute_tinto...).
// Exemplo de estrutura: gin: 'seu link HTTPS completo da Amazon ou amzn.to'.
// Sem link configurado, o ingrediente continua no carrinho com a indicação "Em breve".
export const AMAZON_AFFILIATE_LINKS = {};

const hosts = new Set(['amazon.com.br', 'www.amazon.com.br', 'amazon.com', 'www.amazon.com', 'amzn.to', 'amzn.eu', 'a.co']);
export function amazonLinkFor(id, links = AMAZON_AFFILIATE_LINKS) {
  if (typeof links[id] !== 'string') return null;
  try {
    const url = new URL(links[id]);
    return url.protocol === 'https:' && !url.username && !url.password && hosts.has(url.hostname) ? url.href : null;
  } catch { return null; }
}

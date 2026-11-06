# Home Tender

Os coquetéis clássicos da lista oficial da IBA (International Bartenders Association), com história, receita em folha de cardápio, copo, utensílios, sugestões a partir do seu bar e versões em português, inglês e espanhol.

* Publicado (GitHub Pages): `https://guilhermeborsarelli.github.io/hometender/`
* O app fica em `app/`: módulos ES estáticos, sem framework e sem dependências em tempo de execução.

## Rodar e publicar

```sh
npm run dev       # http://localhost:5173/  (pasta app/, sem service worker)
npm test          # testes de dados, traduções, receitas e contas
npm run build     # gera dist/ com versão carimbada (import map + service worker)
npm run preview   # http://localhost:4173/  (o build, com uso sem internet)
```

Cada push na `main` roda os testes, gera o build e publica no GitHub Pages (`.github/workflows/pages.yml`).
Para ativar a primeira vez: Settings → Pages → Source: **GitHub Actions**.

## Conteúdo

* **Receitas**: os 102 coquetéis da lista oficial da IBA (34 em cada categoria: The Unforgettables, Contemporary Classics, New Era Drinks), conferidos um a um com as fichas de iba-world.com (copo, medidas, guarnição; cópia em `tools/generate-photos/iba-specs.json`), em ml, mais variações consagradas fora da lista, cada uma ligada ao clássico de origem (`parent`).
* **Histórias e "por que este copo"**: `stories/` (português, inglês e espanhol). Origens disputadas são apresentadas como tal.
* **Introdução**: `content.js`. Conceito, linha do tempo, livros de referência (Jerry Thomas, Savoy, Embury, DeGroff, Wondrich, Dave Arnold, Cocktail Codex) e a tendência de fazer drinks em casa.

## Idiomas

`i18n.js` traz a interface e os dados traduzidos; `steps-i18n.js`, os passos de preparo. O seletor PT/EN/ES fica no canto superior direito e a escolha é salva no aparelho.

## Marca e ícone do app

O emblema HT com taça de coquetel usa dourado champanhe sobre preto e aparece na capa, na barra superior e no cabeçalho HOMETENDER da tela Início. Os ícones PNG do aplicativo, do iPhone e o favicon usam a mesma marca; a versão maskable mantém margem para os recortes do sistema.

Arquivos para usar a marca fora do app, em `docs/brand/`:

- `ht-icon-1024.png`: símbolo quadrado em alta resolução.
- `logo-hometender.svg`: marca completa com símbolo e nome, em arquivo independente.
- `logo-hometender.png`: marca completa em PNG, com fundo preto.

O emblema foi criado com geração de imagem por IA. O SVG da marca completa mantém a tipografia como texto e inclui o emblema PNG incorporado.

## Fotos dos drinks

`app/img/drinks/<id>.webp` traz imagens fotorrealistas dos drinks, geradas com IA em estilo de fotografia de produto: fundo preto, bancada espelhada, vidro, gelo e guarnição. A origem das novas imagens fica em `app/img/drinks/sources.json`; `photos.json` protege as imagens aprovadas contra substituição pelo render geométrico.

O estúdio 3D original continua disponível para criar imagens provisórias de novos drinks:

```sh
npm run render:drinks            # drinks sem imagem aprovada
npm run render:drinks -- negroni # um drink, se ainda não tiver imagem aprovada
npm run render:drinks -- --force negroni # substitui uma imagem aprovada pelo render geométrico
```

O script (`tools/render-drinks/`) monta a cena em Three.js e renderiza no Chromium headless. A cor do líquido vem de `color`/`color2` em `data.js`; copo, gelo, espuma e guarnições também vêm dos dados do drink.

## Login

Hoje a conta é **local**: nome, e-mail e um hash PBKDF2-SHA256 da senha ficam no `localStorage` do aparelho, e cada conta tem o seu "Meu Bar". Isso não fecha o conteúdo (os arquivos do site são públicos) e a conta não acompanha o usuário em outro aparelho.

Para um app pago é preciso um backend:

1. **Autenticação**: Supabase Auth ou Firebase Auth (e-mail/senha, Google, Apple).
2. **Conteúdo protegido**: receitas, histórias e fotos servidas por API ou banco com regra de acesso por assinatura (por exemplo, Supabase com Row Level Security), não como arquivos públicos.
3. **Pagamento**: Stripe ou Mercado Pago (assinatura), com webhook que marca o usuário como assinante.
4. **Hospedagem**: Vercel, Netlify ou Cloudflare Pages com funções serverless; para lojas de aplicativos, empacotar como PWA/TWA ou com Capacitor.

## Arquivos

| Arquivo | Conteúdo |
| --- | --- |
| `data.js` | Ingredientes, copos, utensílios e receitas |
| `engine.js` | Correspondência com o bar do usuário, utensílios, preparo em 3 idiomas |
| `i18n.js`, `steps-i18n.js` | Traduções |
| `stories/` | Histórias e o porquê de cada copo |
| `content.js` | Introdução e créditos das fotos |
| `auth.js` | Contas locais |
| `art.js` | Ícones dos utensílios |
| `img/` | Fotos de abertura (Wikimedia Commons, créditos no app) e imagens fotorrealistas dos drinks |

Testes de dados: `tests/drinks.test.js` (rodam com `npm test`).

Testes de navegador do menu e das coleções: `npm run test:ui`. Usam Playwright com Chromium; defina `CHROMIUM_PATH` se necessário. Na nuvem, o Chromium do sistema em `/usr/bin/chromium` é detectado automaticamente. Em outra máquina, instale o Chromium do Playwright com `npx playwright install chromium`.

Histórico: o projeto nasceu dentro do repositório `fintrack` (pasta `public/drinks/`) e foi separado em um repositório próprio.

## Fotos feitas à mão (ChatGPT ou outra ferramenta)

1. Os roteiros estão em `docs/FOTOS-ROTEIROS.txt`, numerados de 001 a 143.
2. Salve cada imagem com o número do roteiro (ex.: `017.png`) ou com o nome do drink (ex.: `negroni.jpg`) e junte tudo num `.zip`.
3. Importe com `node tools/generate-photos/import.mjs fotos.zip` (use `--dry` para só conferir).
   Cada imagem é recortada em 4:5, reduzida para 960×1200, salva em WebP em `app/img/drinks/<id>.webp`
   e entra em `photos.json`, que impede o render 3D de sobrescrevê-la. O número → drink está em
   `tools/generate-photos/numbers.json`. Precisa do ImageMagick (`convert`).

## App instalável e sem internet

- `manifest.webmanifest` com ícones PNG (192, 512 e maskable) e `apple-touch-icon.png` para o iPhone.
- `sw.js` (service worker): a página vem da rede quando há conexão; módulos, imagens e ícones ficam guardados no aparelho.
  O build (`tools/version-drinks.mjs`) carimba a versão e a lista de arquivos; versões antigas são apagadas sozinhas.
  O service worker só é registrado na versão publicada (com import map), nunca no servidor de desenvolvimento.
- Na tela Início aparece o convite para instalar (botão no Android/Chrome; instruções no iPhone). Fechar o convite é lembrado.

## Favoritos, "Já fiz" e quantidade

- Favoritos e "Já fiz" ficam por usuário em `hometender.fav.<email>` e `hometender.done.<email>`; aparecem em "Meus drinks", no topo do Meu Bar. A seção começa recolhida e abre ao tocar no título.
  Concluir todos os passos da receita marca "Já fiz" sozinho.
- O nome do usuário na barra superior abre um submenu com contadores e páginas próprias para Favoritos, Drinks feitos e Carrinho de compras. O menu funciona no celular, fecha com Escape ou ao clicar fora e mantém a opção Sair.
- A folha da receita tem o seletor 1 / 2 / 4 / 6 drinks: multiplica as medidas em ml e a medida caseira; doses em texto ganham "× n".

## Bares por local e carrinho

Na aba Meu Bar, cada pessoa pode criar espaços como Apartamento e Casa de campo, alternar entre eles, renomeá-los e excluir um bar com confirmação. Cada espaço tem sua lista de ingredientes; as sugestões e as indicações nas receitas usam apenas o bar selecionado. É mantido pelo menos um bar por perfil.

Sua prateleira mantém a busca, o botão Limpar tudo e a seleção individual de ingredientes, sem os atalhos de preenchimento. Limpar tudo afeta apenas a prateleira do bar selecionado.

Os bares, o bar selecionado e um carrinho único da conta são salvos em `hometender.profile.<email>` no `localStorage`. A lista anterior em `hometender.bar.<email>` é recuperada no primeiro bar, sem apagar o registro antigo. O legado sem dono `barnoir.bar` só é recuperado para o visitante. O login continua local: esses dados persistem neste aparelho, sem sincronização entre dispositivos.

Em Quase lá, cada ingrediente faltante tem um botão Adicionar ao carrinho. O mesmo ingrediente entra apenas uma vez, mesmo quando falta em várias receitas ou locais. Adicionar ao carrinho não marca o produto como disponível na prateleira. O carrinho permite remover itens e limpar a lista.

### Links da Amazon Associados

Preencha o objeto `AMAZON_AFFILIATE_LINKS` em `app/affiliate-links.js`, usando o id do ingrediente em `data.js` como chave (por exemplo, `gin` ou `campari`) e o link HTTPS completo do produto gerado pelo seu programa de associados como valor. A tag do link é preservada. São aceitos links da Amazon Brasil, Amazon.com e os atalhos `amzn.to`, `amzn.eu` e `a.co`.

Quando um produto tem link configurado, aparece Ver na Amazon, abrindo a loja em uma nova aba. Sem link, o produto continua salvo no carrinho com indicação de disponibilidade futura. Não há checkout nem pagamento dentro do app. O aviso de afiliado aparece quando há links ativos.

`npm test` inclui os testes de migração, persistência, isolamento entre contas e links. `npm run test:ui` também cobre os bares por local, o carrinho e telas pequenas.

## Entrada sem cadastro (só durante o desenvolvimento)

`DEV_FREE_ENTRY = true` em `app/app.js` mostra na capa o botão "Entrar sem cadastro (versão de teste)".
Mude para `false` antes do lançamento.

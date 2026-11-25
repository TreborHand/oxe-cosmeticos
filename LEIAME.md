# Oxe Cosméticos: vitrine com sacola no WhatsApp

Site estático. Não coleta nenhum dado do visitante. O cliente monta a sacola e o pedido segue pelo WhatsApp da loja.

## Estrutura

- `index.html`: estrutura da página (sem código dentro dela).
- `assets/style.css`: visual.
- `assets/app.js`: monta a vitrine e a sacola a partir do catálogo.
- `assets/fonts/`: fontes hospedadas no próprio site.
- `data/catalogo.json`: **todo o conteúdo editável** (produtos, kits, preços, banner, número do WhatsApp). O futuro admin vai editar este conteúdo.
- `.htaccess`: cabeçalhos de segurança para hospedagem Apache.

## Testar no computador

Abrir o `index.html` direto no navegador não funciona (o navegador bloqueia a leitura do catálogo). Rodar um servidor local na pasta:

    python3 -m http.server 8000

e abrir http://localhost:8000

## Como editar o catálogo (enquanto não há admin)

Abrir `data/catalogo.json` e editar. Campos principais de cada produto:

- `ativo`: `false` tira o produto da vitrine.
- `esgotado`: `true` mostra "Esgotado" e bloqueia a compra.
- `imagem`: caminho da foto, por exemplo `imagens/sugar-scrub.jpg`. Vazio mostra o emoji.
- `fragrancias`: lista de ids que existem em `fragrancias`.
- `tag`: `hot` (mais vendido), `new` (novo) ou vazio.

Cuidado com vírgulas e aspas, o JSON é rígido. Depois de editar, recarregar a página.

## Itens que dependem da dona antes de publicar

- Preços e kits são **fictícios**.
- `banner.ativo` está `false`. Só ligar se cupom e frete grátis forem cumpridos.
- `depoimentos` está vazio. Só incluir depoimentos reais, com autorização.
- Selos (100% Natural, Cruelty Free, Vegano): confirmar que pode afirmar.
- `loja.razaoSocial`, `cnpjOuCpf`, `endereco`: preencher para aparecer no rodapé.

## Segurança embutida

- CSP: a página só carrega recursos do próprio domínio.
- Nenhum texto do catálogo vira HTML (tudo entra como texto), então nomes com aspas ou símbolos não quebram nem executam código.
- O preço da sacola é sempre relido do catálogo. Alterar o valor guardado no navegador não muda nada.
- Limites: 20 por item, 25 itens diferentes.
- Links externos com `noopener noreferrer`. Nenhuma requisição a terceiros (fontes locais).

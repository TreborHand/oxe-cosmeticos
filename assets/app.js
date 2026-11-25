/*
 * Oxe Cosméticos: vitrine com sacola que fecha no WhatsApp.
 *
 * Todo o conteúdo (produtos, kits, preços, banner, número do WhatsApp, cores)
 * vem de data/catalogo.json. O site nunca monta HTML a partir de texto: tudo
 * entra via textContent / setAttribute, então nome de produto com aspas ou
 * símbolos não quebra a página nem executa código. O preço mostrado na sacola
 * é sempre relido do catálogo, nunca do que está salvo no navegador.
 */
(function () {
  'use strict';

  var CATALOGO_URL = 'data/catalogo.json';
  var CHAVE_SACOLA = 'oxe_sacola_v1';
  var MAX_QTD = 20;      // por item
  var MAX_LINHAS = 25;   // itens diferentes na sacola
  var SVGNS = 'http://www.w3.org/2000/svg';

  var ICONES = ['folha', 'coelho', 'broto', 'mao', 'instagram', 'sacola', 'whatsapp', 'lixeira', 'fechar', 'check', 'presente', 'brilho', 'seta'];
  var EMBALAGENS = ['pote', 'pump', 'spray', 'lata', 'frasco', 'barra'];
  var TEMA_PERMITIDO = ['verde-escuro', 'verde-musgo', 'verde-medio', 'verde-claro', 'verde-palido', 'creme', 'creme-escuro', 'dourado', 'dourado-claro', 'dourado-titulo', 'dourado-texto', 'texto-escuro', 'texto-medio', 'texto-claro', 'rodape'];

  var catalogo = null;
  var sacola = []; // [{tipo:'produto'|'kit', id, frag, qtd}]
  var focoAnterior = null;

  /* ---------- utilidades ---------- */

  function $(id) { return document.getElementById(id); }

  function h(tag, props, kids) {
    var e = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'on') Object.keys(v).forEach(function (ev) { e.addEventListener(ev, v[ev]); });
        else e.setAttribute(k, v === true ? '' : String(v));
      });
    }
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }

  function s(tag, attrs) {
    var e = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, String(attrs[k])); });
    return e;
  }

  function icone(nome, classe) {
    var n = ICONES.indexOf(nome) === -1 ? 'folha' : nome;
    var svg = s('svg', { class: 'ico' + (classe ? ' ' + classe : ''), 'aria-hidden': 'true', focusable: 'false' });
    var use = s('use', { href: '#i-' + n });
    svg.appendChild(use);
    return svg;
  }

  function limpar(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function brl(n) { return 'R$ ' + Number(n).toFixed(2).replace('.', ','); }

  function texto(v, max) {
    return typeof v === 'string' ? v.slice(0, max || 300) : '';
  }

  function numero(v) {
    var n = Number(v);
    return isFinite(n) && n >= 0 && n < 100000 ? Math.round(n * 100) / 100 : 0;
  }

  function cor(v, padrao) {
    return typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : padrao;
  }

  // Só aceita caminho relativo do próprio site ou https. (A CSP ainda limita o resto.)
  function urlImagem(v) {
    if (typeof v !== 'string' || !v) return '';
    if (/^https:\/\/[^\s"'<>]+$/.test(v)) return v;
    if (/^[\w\-./%]+$/.test(v) && v.indexOf('//') !== 0 && v.indexOf('..') === -1) return v;
    return '';
  }

  /* ---------- fotos ----------
   * Cada produto ou kit pode ter uma lista "fotos". Formato (é o que o admin grava):
   *   { "src": "imagens/produtos/sugar-scrub-amora-{w}.webp", "larguras": [400, 800],
   *     "fragrancia": "amora", "tipo": "produto" | "textura" | "uso", "alt": "..." }
   * {w} é trocado por cada largura, gerando o srcset (o navegador baixa só o tamanho
   * que precisa). Sem "fragrancia", a foto vale para todas as fragrâncias do produto. */

  var TIPOS_FOTO = ['produto', 'textura', 'uso'];

  function normalizarFotos(lista, imagemAntiga) {
    var fotos = (Array.isArray(lista) ? lista : []).slice(0, 30).map(function (f) {
      if (!f || typeof f !== 'object') return null;
      var larguras = (Array.isArray(f.larguras) ? f.larguras : [])
        .map(function (n) { return parseInt(n, 10); })
        .filter(function (n) { return n > 0 && n <= 4000; })
        .sort(function (a, b) { return a - b; })
        .slice(0, 4);
      var src = typeof f.src === 'string' ? f.src : '';
      if (src.indexOf('{w}') !== -1 && !larguras.length) return null;
      if (src.indexOf('{w}') === -1) larguras = [];
      var exemplo = urlImagem(src.replace('{w}', String(larguras[0] || '')));
      if (!exemplo) return null;
      return {
        src: src,
        larguras: larguras,
        fragrancia: texto(f.fragrancia, 60),
        tipo: TIPOS_FOTO.indexOf(f.tipo) === -1 ? 'produto' : f.tipo,
        alt: texto(f.alt, 140)
      };
    }).filter(Boolean);
    // compatibilidade com o campo antigo "imagem" (uma foto só)
    var antiga = urlImagem(imagemAntiga);
    if (antiga && !fotos.length) fotos.push({ src: antiga, larguras: [], fragrancia: '', tipo: 'produto', alt: '' });
    return fotos;
  }

  // Escolhe a foto do tipo pedido: primeiro a da fragrância, depois a geral.
  function fotoPara(item, fragId, tipo) {
    var fotos = (item && item.fotos) || [];
    var t = tipo || 'produto';
    for (var i = 0; i < fotos.length; i++) if (fotos[i].tipo === t && fragId && fotos[i].fragrancia === fragId) return fotos[i];
    for (var j = 0; j < fotos.length; j++) if (fotos[j].tipo === t && !fotos[j].fragrancia) return fotos[j];
    return null;
  }

  function imgFoto(foto, tamanhos, extra) {
    var props = { alt: foto.alt || '', decoding: 'async', loading: 'lazy', draggable: 'false' };
    if (foto.larguras.length) {
      props.src = foto.src.replace('{w}', String(foto.larguras[foto.larguras.length - 1]));
      props.srcset = foto.larguras.map(function (w) { return foto.src.replace('{w}', String(w)) + ' ' + w + 'w'; }).join(', ');
      props.sizes = tamanhos || '100vw';
    } else {
      props.src = foto.src;
    }
    Object.keys(extra || {}).forEach(function (k) { props[k] = extra[k]; });
    var img = h('img', props);
    img.addEventListener('error', function () { if (img.parentNode) img.parentNode.removeChild(img); });
    return img;
  }

  function porId(lista, id) {
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
    return null;
  }

  function reduzMovimento() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ---------- ilustrações de embalagem ----------
   * Enquanto não há foto, cada produto aparece como a silhueta da sua
   * embalagem, colorida com as cores da fragrância escolhida.
   * c1 = cor clara (corpo), c2 = cor escura (tampa / detalhes). */

  function ilustracao(tipo, c1, c2) {
    var t = EMBALAGENS.indexOf(tipo) === -1 ? 'pote' : tipo;
    var svg = s('svg', { class: 'ilustra', viewBox: '0 0 120 140', 'aria-hidden': 'true', focusable: 'false' });
    var linha = 'rgba(30,45,30,.14)';
    function add(tag, a) { svg.appendChild(s(tag, a)); }
    function rotulo(x, y, w, hgt) {
      add('rect', { x: x, y: y, width: w, height: hgt, rx: 5, fill: '#FBF8F2', stroke: linha, 'stroke-width': 1 });
      var cx = x + w / 2, cy = y + hgt * 0.38;
      add('path', { d: 'M' + (cx - 7) + ',' + (cy + 3) + ' C' + (cx - 7) + ',' + (cy - 2) + ' ' + (cx - 3) + ',' + (cy - 6) + ' ' + cx + ',' + (cy - 6) + ' C' + cx + ',' + (cy - 1) + ' ' + (cx - 3) + ',' + (cy + 3) + ' ' + (cx - 7) + ',' + (cy + 3) + ' Z', fill: '#6B8F5E' });
      add('path', { d: 'M' + cx + ',' + (cy - 6) + ' C' + (cx + 3) + ',' + (cy - 6) + ' ' + (cx + 7) + ',' + (cy - 2) + ' ' + (cx + 7) + ',' + (cy + 3) + ' C' + (cx + 3) + ',' + (cy + 3) + ' ' + cx + ',' + (cy - 1) + ' ' + cx + ',' + (cy - 6) + ' Z', fill: '#2D4A2D' });
      add('rect', { x: cx - w * 0.3, y: cy + hgt * 0.2, width: w * 0.6, height: 2.2, rx: 1.1, fill: '#2D4A2D', opacity: 0.55 });
      add('rect', { x: cx - w * 0.2, y: cy + hgt * 0.2 + 5, width: w * 0.4, height: 2, rx: 1, fill: '#C9A84C', opacity: 0.9 });
    }
    // sombra no chão
    add('ellipse', { cx: 60, cy: 132, rx: 42, ry: 5, fill: 'rgba(30,45,30,.12)' });

    if (t === 'pote') {
      add('rect', { x: 20, y: 50, width: 80, height: 80, rx: 16, fill: c1, stroke: linha });
      add('rect', { x: 24, y: 34, width: 72, height: 20, rx: 6, fill: c2 });
      add('rect', { x: 24, y: 50, width: 72, height: 4, fill: 'rgba(0,0,0,.08)' });
      add('rect', { x: 26, y: 58, width: 6, height: 62, rx: 3, fill: 'rgba(255,255,255,.28)' });
      rotulo(36, 66, 48, 42);
    } else if (t === 'pump') {
      add('rect', { x: 34, y: 50, width: 52, height: 80, rx: 16, fill: c1, stroke: linha });
      add('rect', { x: 50, y: 38, width: 20, height: 14, rx: 3, fill: c2 });
      add('rect', { x: 56, y: 22, width: 8, height: 18, fill: c2 });
      add('path', { d: 'M48,18 h36 a4,4 0 0 1 0,8 h-36 z', fill: c2 });
      add('rect', { x: 39, y: 58, width: 5, height: 62, rx: 2.5, fill: 'rgba(255,255,255,.3)' });
      rotulo(42, 70, 36, 40);
    } else if (t === 'spray') {
      add('rect', { x: 38, y: 46, width: 44, height: 84, rx: 20, fill: c1, stroke: linha });
      add('rect', { x: 50, y: 18, width: 20, height: 30, rx: 6, fill: c2 });
      add('rect', { x: 43, y: 56, width: 5, height: 62, rx: 2.5, fill: 'rgba(255,255,255,.32)' });
      rotulo(45, 70, 30, 38);
    } else if (t === 'lata') {
      add('rect', { x: 22, y: 86, width: 76, height: 44, rx: 9, fill: c1, stroke: linha });
      add('rect', { x: 20, y: 72, width: 80, height: 18, rx: 7, fill: c2 });
      add('rect', { x: 28, y: 92, width: 5, height: 32, rx: 2.5, fill: 'rgba(255,255,255,.3)' });
      rotulo(40, 94, 40, 30);
    } else if (t === 'frasco') {
      add('rect', { x: 36, y: 44, width: 48, height: 86, rx: 12, fill: c1, stroke: linha });
      add('rect', { x: 44, y: 24, width: 32, height: 22, rx: 4, fill: c2 });
      add('rect', { x: 44, y: 22, width: 32, height: 5, rx: 2.5, fill: 'rgba(0,0,0,.12)' });
      add('rect', { x: 41, y: 52, width: 5, height: 70, rx: 2.5, fill: 'rgba(255,255,255,.3)' });
      rotulo(44, 66, 32, 42);
    } else if (t === 'barra') {
      add('rect', { x: 14, y: 80, width: 92, height: 50, rx: 22, fill: c1, stroke: linha });
      add('rect', { x: 18, y: 76, width: 84, height: 44, rx: 20, fill: c1, stroke: linha });
      add('rect', { x: 30, y: 82, width: 40, height: 5, rx: 2.5, fill: 'rgba(255,255,255,.5)' });
      add('path', { d: 'M48,104 C48,96 54,90 60,90 C60,97 55,104 48,104 Z M60,90 C66,90 72,96 72,104 C65,104 60,97 60,90 Z', fill: 'none', stroke: c2, 'stroke-width': 1.6 });
    }
    return svg;
  }

  /* ---------- catálogo ---------- */

  // Aceita o formato antigo ("Esfoliante corporal — 250ml") e o novo (categoria + tamanho).
  function separarDescricao(p) {
    var cat = texto(p.categoria, 60);
    var tam = texto(p.tamanho, 30);
    if (!cat && typeof p.descricao === 'string') {
      var partes = p.descricao.split(/\s[—–-]\s/);
      cat = texto(partes[0], 60);
      if (!tam && partes[1]) tam = texto(partes[1], 30);
    }
    return { categoria: cat, tamanho: tam };
  }

  function normalizar(bruto) {
    var c = bruto && typeof bruto === 'object' ? bruto : {};
    var loja = c.loja || {};
    var zap = String(loja.whatsapp || '').replace(/\D/g, '');
    var insta = /^https:\/\/(www\.)?instagram\.com\/[\w.\-\/]*$/.test(loja.instagram || '') ? loja.instagram : '';

    var tema = {};
    if (c.tema && typeof c.tema === 'object') {
      TEMA_PERMITIDO.forEach(function (k) { var v = cor(c.tema[k], ''); if (v) tema[k] = v; });
    }

    var fragrancias = (Array.isArray(c.fragrancias) ? c.fragrancias : []).map(function (f) {
      return {
        id: texto(f.id, 60),
        nome: texto(f.nome, 60),
        tipo: texto(f.tipo, 60),
        cores: [cor(f.cores && f.cores[0], '#E8F0E4'), cor(f.cores && f.cores[1], '#A8C49A')],
        oculta: f.ocultarNaVitrine === true
      };
    }).filter(function (f) { return f.id && f.nome; });

    var produtos = (Array.isArray(c.produtos) ? c.produtos : []).map(function (p) {
      var d = separarDescricao(p);
      return {
        id: texto(p.id, 60),
        nome: texto(p.nome, 80),
        categoria: d.categoria,
        tamanho: d.tamanho,
        preco: numero(p.preco),
        embalagem: EMBALAGENS.indexOf(p.embalagem) === -1 ? 'pote' : p.embalagem,
        fotos: normalizarFotos(p.fotos, p.imagem),
        tag: p.tag === 'hot' || p.tag === 'new' ? p.tag : '',
        ativo: p.ativo !== false,
        esgotado: p.esgotado === true,
        fragrancias: (Array.isArray(p.fragrancias) ? p.fragrancias : []).filter(function (id) {
          return porId(fragrancias, id);
        })
      };
    }).filter(function (p) { return p.id && p.nome && p.preco > 0 && p.ativo; });

    var kits = (Array.isArray(c.kits) ? c.kits : []).map(function (k) {
      return {
        id: texto(k.id, 60),
        nome: texto(k.nome, 80),
        descricao: texto(k.descricao, 300),
        itens: (Array.isArray(k.itens) ? k.itens : []).map(function (i) { return texto(i, 100); }).filter(Boolean).slice(0, 12),
        precoDe: numero(k.precoDe),
        preco: numero(k.preco),
        fotos: normalizarFotos(k.fotos, k.imagem),
        ativo: k.ativo !== false,
        esgotado: k.esgotado === true,
        destaque: k.destaque === true
      };
    }).filter(function (k) { return k.id && k.nome && k.preco > 0 && k.ativo; });

    return {
      loja: {
        nome: texto(loja.nome, 80) || 'Oxe Cosméticos',
        whatsapp: /^\d{10,15}$/.test(zap) ? zap : '',
        instagram: insta,
        razaoSocial: texto(loja.razaoSocial, 120),
        cnpjOuCpf: texto(loja.cnpjOuCpf, 30),
        endereco: texto(loja.endereco, 200),
        site: /^https:\/\/[^\s"'<>]+$/.test(loja.site || '') ? loja.site : ''
      },
      tema: tema,
      banner: {
        ativo: !!(c.banner && c.banner.ativo === true),
        mensagens: ((c.banner && c.banner.mensagens) || []).map(function (m) { return texto(m, 120); }).filter(Boolean).slice(0, 4)
      },
      selos: (Array.isArray(c.selos) ? c.selos : []).slice(0, 4).map(function (s2) {
        return { icone: texto(s2.icone, 20), texto: texto(s2.texto, 40) };
      }).filter(function (s2) { return s2.texto; }),
      fragrancias: fragrancias,
      destaques: (Array.isArray(c.destaques) ? c.destaques : []).slice(0, 3).map(function (d) {
        return { produto: d.produto, fragrancia: d.fragrancia, rotulo: texto(d.rotulo, 60), maisVendido: d.mais_vendido === true };
      }),
      produtos: produtos,
      kits: kits,
      passos: (Array.isArray(c.passos) ? c.passos : []).slice(0, 6).map(function (p) {
        return { titulo: texto(p.titulo, 40), texto: texto(p.texto, 240) };
      }).filter(function (p) { return p.titulo; }),
      depoimentos: (Array.isArray(c.depoimentos) ? c.depoimentos : []).slice(0, 6).map(function (d) {
        return { texto: texto(d.texto, 400), autor: texto(d.autor, 80) };
      }).filter(function (d) { return d.texto && d.autor; })
    };
  }

  function coresDe(fragId) {
    var f = fragId ? porId(catalogo.fragrancias, fragId) : null;
    return f ? f.cores : ['#E8F0E4', '#A8C49A'];
  }

  /* ---------- sacola ---------- */

  function chave(i) { return i.tipo + '|' + i.id + '|' + (i.frag || ''); }

  // Descobre nome e preço do item sempre a partir do catálogo atual.
  function resolver(i) {
    if (i.tipo === 'kit') {
      var k = porId(catalogo.kits, i.id);
      if (!k || k.esgotado) return null;
      return { nome: k.nome, detalhe: k.itens.length + ' produtos', preco: k.preco, kit: true, foto: fotoPara(k, '', 'produto') };
    }
    var p = porId(catalogo.produtos, i.id);
    if (!p || p.esgotado) return null;
    var f = i.frag ? porId(catalogo.fragrancias, i.frag) : null;
    if (i.frag && !f) return null;
    if (f && p.fragrancias.indexOf(f.id) === -1) return null;
    var det = [f && !f.oculta ? f.nome : '', p.tamanho].filter(Boolean).join(' · ');
    return { nome: p.nome, detalhe: det, fragNome: f ? f.nome : '', preco: p.preco, embalagem: p.embalagem, cores: coresDe(f ? f.id : ''), foto: fotoPara(p, f ? f.id : '', 'produto') };
  }

  function salvar() {
    try { localStorage.setItem(CHAVE_SACOLA, JSON.stringify(sacola)); } catch (e) { /* sem armazenamento: segue sem salvar */ }
  }

  function carregar() {
    var lista = [];
    try {
      var bruto = JSON.parse(localStorage.getItem(CHAVE_SACOLA) || '[]');
      if (Array.isArray(bruto)) lista = bruto;
    } catch (e) { lista = []; }
    sacola = [];
    lista.slice(0, MAX_LINHAS).forEach(function (i) {
      if (!i || (i.tipo !== 'produto' && i.tipo !== 'kit') || typeof i.id !== 'string') return;
      var item = {
        tipo: i.tipo,
        id: i.id,
        frag: typeof i.frag === 'string' ? i.frag : '',
        qtd: Math.min(MAX_QTD, Math.max(1, parseInt(i.qtd, 10) || 1))
      };
      if (resolver(item)) sacola.push(item);
    });
  }

  function aviso(msg) {
    var p = $('cart-limit');
    if (!msg) { p.hidden = true; return; }
    p.textContent = msg;
    p.hidden = false;
  }

  function pulsarContador() {
    var b = $('cart-badge');
    b.classList.remove('pulsar');
    void b.offsetWidth; // reinicia a animação
    b.classList.add('pulsar');
  }

  function adicionar(tipo, id, frag) {
    var novo = { tipo: tipo, id: id, frag: frag || '', qtd: 1 };
    if (!resolver(novo)) return;
    var existente = null;
    sacola.forEach(function (i) { if (chave(i) === chave(novo)) existente = i; });
    aviso('');
    if (existente) {
      if (existente.qtd >= MAX_QTD) { aviso('Quantidade máxima por item: ' + MAX_QTD + '. Para mais, combine direto no WhatsApp.'); }
      else existente.qtd++;
    } else {
      if (sacola.length >= MAX_LINHAS) { aviso('Sua sacola chegou ao limite de itens diferentes. Finalize este pedido e faça outro, se precisar.'); }
      else sacola.push(novo);
    }
    salvar();
    desenharSacola();
    pulsarContador();
    abrirSacola();
  }

  function alterarQtd(item, delta) {
    aviso('');
    var nova = item.qtd + delta;
    if (nova > MAX_QTD) { aviso('Quantidade máxima por item: ' + MAX_QTD + '.'); return; }
    if (nova <= 0) { remover(item); return; }
    item.qtd = nova;
    salvar();
    desenharSacola();
  }

  function remover(item) {
    aviso('');
    sacola = sacola.filter(function (i) { return i !== item; });
    salvar();
    desenharSacola();
  }

  function total() {
    return sacola.reduce(function (soma, i) {
      var r = resolver(i);
      return soma + (r ? r.preco * i.qtd : 0);
    }, 0);
  }

  function miniatura(r) {
    var thumb = h('div', { class: 'ci-thumb' + (r.kit ? ' kit' : ''), 'aria-hidden': 'true' });
    function desenho() {
      limpar(thumb);
      thumb.appendChild(r.kit ? icone('presente') : ilustracao(r.embalagem, r.cores[0], r.cores[1]));
    }
    if (r.foto) {
      thumb.classList.add('com-foto');
      var img = imgFoto({ src: r.foto.src, larguras: r.foto.larguras, alt: '' }, '60px');
      img.addEventListener('error', function () { thumb.classList.remove('com-foto'); desenho(); });
      thumb.appendChild(img);
    } else {
      desenho();
    }
    return thumb;
  }

  function desenharSacola() {
    var itens = $('cart-items');
    var rodape = $('cart-footer');
    var qtdTotal = sacola.reduce(function (soma, i) { return soma + i.qtd; }, 0);
    $('cart-badge').textContent = String(qtdTotal);
    $('btn-cart').setAttribute('aria-label', 'Abrir sacola, ' + qtdTotal + (qtdTotal === 1 ? ' item' : ' itens'));
    limpar(itens);

    if (!sacola.length) {
      itens.appendChild(h('div', { class: 'cart-empty' }, [
        h('div', { class: 'ce-icon' }, [icone('sacola')]),
        h('p', { text: 'Sua sacola está vazia. Escolha seus produtos favoritos para começar.' })
      ]));
      rodape.hidden = true;
      return;
    }

    sacola.forEach(function (item) {
      var r = resolver(item);
      if (!r) return;
      itens.appendChild(h('div', { class: 'cart-item' }, [
        miniatura(r),
        h('div', { class: 'ci-info' }, [
          h('div', { class: 'ci-name', text: r.nome }),
          h('div', { class: 'ci-frag', text: r.detalhe }),
          h('div', { class: 'ci-qty' }, [
            h('button', { class: 'btn-qty', type: 'button', text: '−', 'aria-label': 'Diminuir quantidade de ' + r.nome, on: { click: function () { alterarQtd(item, -1); } } }),
            h('span', { class: 'qty-num', text: String(item.qtd), 'aria-live': 'polite' }),
            h('button', { class: 'btn-qty', type: 'button', text: '+', 'aria-label': 'Aumentar quantidade de ' + r.nome, on: { click: function () { alterarQtd(item, 1); } } })
          ])
        ]),
        h('div', { class: 'ci-right' }, [
          h('div', { class: 'ci-price', text: brl(r.preco * item.qtd) }),
          h('button', { class: 'btn-rm', type: 'button', 'aria-label': 'Remover ' + r.nome + ' da sacola', on: { click: function () { remover(item); } } }, [icone('lixeira')])
        ])
      ]));
    });
    $('cart-total-val').textContent = brl(total());
    rodape.hidden = false;
  }

  function enviarWhatsApp() {
    if (!sacola.length || !catalogo.loja.whatsapp) return;
    var linhas = [];
    sacola.forEach(function (i) {
      var r = resolver(i);
      if (!r) return;
      var det = r.kit ? '' : (r.fragNome ? ' (' + r.fragNome + ')' : '');
      linhas.push('• ' + r.nome + det + ' x' + i.qtd + ' = ' + brl(r.preco * i.qtd));
    });
    var msg = 'Olá! Gostaria de fazer um pedido na ' + catalogo.loja.nome + ' 🌿\n\n' +
      linhas.join('\n') +
      '\n\n*Total: ' + brl(total()) + '*\n(valores sujeitos a confirmação)\n\nPoderia me ajudar a finalizar? 😊';
    var a = document.createElement('a');
    a.href = 'https://wa.me/' + catalogo.loja.whatsapp + '?text=' + encodeURIComponent(msg);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /* ---------- gaveta da sacola (foco e teclado) ---------- */

  function sacolaAberta() { return $('cart-overlay').classList.contains('animating'); }

  function abrirSacola() {
    var ov = $('cart-overlay');
    if (sacolaAberta()) return;
    focoAnterior = document.activeElement;
    ov.classList.add('open');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        ov.classList.add('animating');
        $('btn-close-cart').focus();
      });
    });
    document.addEventListener('keydown', teclasSacola);
  }

  function fecharSacola() {
    var ov = $('cart-overlay');
    if (!sacolaAberta()) return;
    ov.classList.remove('animating');
    document.removeEventListener('keydown', teclasSacola);
    setTimeout(function () { ov.classList.remove('open'); }, reduzMovimento() ? 0 : 350);
    if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
  }

  function teclasSacola(e) {
    if (e.key === 'Escape') { fecharSacola(); return; }
    if (e.key !== 'Tab') return;
    var foc = $('cart-overlay').querySelectorAll('button:not([hidden]):not([disabled])');
    var visiveis = Array.prototype.filter.call(foc, function (b) { return b.offsetParent !== null; });
    if (!visiveis.length) return;
    var primeiro = visiveis[0];
    var ultimo = visiveis[visiveis.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    else if (!$('cart-overlay').contains(document.activeElement)) { e.preventDefault(); primeiro.focus(); }
  }

  /* ---------- vitrine ---------- */

  function aplicarTema() {
    Object.keys(catalogo.tema).forEach(function (k) {
      document.documentElement.style.setProperty('--' + k, catalogo.tema[k]);
    });
  }

  function desenharBanner() {
    var b = $('banner');
    if (catalogo.banner.ativo && catalogo.banner.mensagens.length) {
      b.textContent = catalogo.banner.mensagens.join('  ·  ');
      b.hidden = false;
    } else {
      b.hidden = true;
    }
  }

  function desenharHero() {
    var alvo = $('hero-vitrine');
    limpar(alvo);
    var escolhido = null;
    catalogo.destaques.some(function (d) {
      var p = porId(catalogo.produtos, d.produto);
      var f = porId(catalogo.fragrancias, d.fragrancia);
      if (!p || p.esgotado || (f && p.fragrancias.indexOf(f.id) === -1)) return false;
      escolhido = { p: p, f: f, d: d };
      return true;
    });
    if (!escolhido) { alvo.hidden = true; return; }
    var p = escolhido.p, f = escolhido.f, d = escolhido.d;
    var cores = coresDe(f ? f.id : '');

    var arco = h('div', { class: 'hero-arco' });
    arco.appendChild(ilustracao(p.embalagem, cores[0], cores[1]));
    // No destaque vale foto do produto; se não houver, a de textura ou de uso.
    var fh = fotoPara(p, f ? f.id : '', 'produto') || fotoPara(p, f ? f.id : '', 'textura') || fotoPara(p, f ? f.id : '', 'uso');
    if (fh) {
      arco.classList.add('com-foto');
      arco.appendChild(imgFoto(fh, '(max-width: 920px) 320px, 360px', { loading: 'eager', fetchpriority: 'high', alt: fh.alt || (p.nome + (f ? ' ' + f.nome : '')) }));
    }

    var info = h('div', { class: 'hero-info' }, [
      d.maisVendido ? h('span', { class: 'selo-vendido', text: 'Mais vendido' }) : null,
      h('div', {}, [
        h('div', { class: 'hi-nome', text: d.rotulo || (p.nome + (f ? ' ' + f.nome : '')) }),
        h('div', { class: 'hi-det' }, [h('strong', { text: brl(p.preco) }), p.tamanho ? ' · ' + p.tamanho : ''])
      ]),
      h('button', {
        class: 'btn-mini', type: 'button',
        'aria-label': 'Adicionar à sacola: ' + p.nome + (f ? ' ' + f.nome : ''),
        on: { click: function () { adicionar('produto', p.id, f ? f.id : ''); } }
      }, [icone('sacola'), 'Adicionar'])
    ]);
    alvo.appendChild(h('div', { class: 'hero-destaque' }, [arco, info]));
  }

  function desenharSelos() {
    var alvo = $('selos');
    limpar(alvo);
    alvo.hidden = !catalogo.selos.length;
    catalogo.selos.forEach(function (sl) {
      alvo.appendChild(h('div', { class: 'selo' }, [
        icone(sl.icone),
        h('div', { class: 'selo-label', text: sl.texto })
      ]));
    });
  }

  function desenharFragrancias() {
    var alvo = $('frag-grid');
    limpar(alvo);
    var vis = catalogo.fragrancias.filter(function (f) { return !f.oculta; });
    $('fragrancias').hidden = !vis.length;
    vis.forEach(function (f) {
      var dot = h('div', { class: 'frag-dot', 'aria-hidden': 'true' });
      dot.style.background = 'linear-gradient(140deg,' + f.cores[0] + ' 15%,' + f.cores[1] + ' 100%)';
      alvo.appendChild(h('div', { class: 'frag-card' }, [
        dot,
        h('h3', { class: 'frag-name', text: f.nome }),
        h('div', { class: 'frag-type', text: f.tipo })
      ]));
    });
  }

  function desenharProdutos() {
    var grade = $('prod-grid');
    limpar(grade);
    if (!catalogo.produtos.length) {
      grade.appendChild(h('p', { class: 'vazio', text: 'Nossos produtos estão sendo atualizados. Volte em breve!' }));
      return;
    }
    catalogo.produtos.forEach(function (p) {
      var fragEscolhida = p.fragrancias[0] || '';
      var area = h('div', { class: 'prod-img' });
      var desenho = null, fotoAtual = null, texturaAtual = null;
      var TAM = '(max-width: 600px) 50vw, (max-width: 920px) 45vw, 380px';
      // Mostra a foto da fragrância escolhida; sem foto, o desenho da embalagem.
      // Se existir foto de textura, ela aparece ao passar o mouse.
      function redesenhar() {
        var cores = coresDe(fragEscolhida);
        var novo = ilustracao(p.embalagem, cores[0], cores[1]);
        if (desenho) area.replaceChild(novo, desenho); else area.insertBefore(novo, area.firstChild);
        desenho = novo;
        [fotoAtual, texturaAtual].forEach(function (el) { if (el && el.parentNode) el.parentNode.removeChild(el); });
        fotoAtual = texturaAtual = null;
        var fp = fotoPara(p, fragEscolhida, 'produto');
        var ft = fotoPara(p, fragEscolhida, 'textura');
        var nomeF = fragEscolhida ? (porId(catalogo.fragrancias, fragEscolhida) || {}).nome : '';
        if (fp) {
          fotoAtual = imgFoto(fp, TAM, { class: 'foto-produto', alt: fp.alt || (p.nome + (nomeF ? ' ' + nomeF : '')) });
          desenho.after(fotoAtual);
        }
        if (ft) {
          texturaAtual = imgFoto(ft, TAM, { class: 'foto-textura', alt: '' });
          (fotoAtual || desenho).after(texturaAtual);
        }
        area.classList.toggle('com-foto', !!fp);
        area.classList.toggle('com-textura', !!ft);
      }
      redesenhar();
      if (p.esgotado) area.appendChild(h('span', { class: 'selo-vendido selo-esgotado', text: 'Esgotado' }));
      else if (p.tag === 'hot') area.appendChild(h('span', { class: 'selo-vendido', text: 'Mais vendido' }));
      else if (p.tag === 'new') area.appendChild(h('span', { class: 'selo-vendido selo-novo', text: 'Novo' }));

      // Fragrâncias: bolinhas de cor quando há mais de uma; texto simples quando há só uma.
      var visiveis = p.fragrancias.filter(function (fid) { return !porId(catalogo.fragrancias, fid).oculta; });
      var escolha = null;
      if (visiveis.length) {
        var nomeAtual = h('strong', { text: porId(catalogo.fragrancias, fragEscolhida).nome });
        var rot = h('div', { class: 'frag-rotulo' }, ['Fragrância: ', nomeAtual]);
        escolha = h('div', { class: 'frag-escolha' }, [rot]);
        if (visiveis.length > 1) {
          var grupo = h('div', { class: 'swatches', role: 'group', 'aria-label': 'Escolha a fragrância de ' + p.nome });
          var botoes = [];
          visiveis.forEach(function (fid, fi) {
            var f = porId(catalogo.fragrancias, fid);
            var b = h('button', { class: 'swatch', type: 'button', title: f.nome, 'aria-label': f.nome, 'aria-pressed': fi === 0 ? 'true' : 'false' });
            b.style.background = 'linear-gradient(140deg,' + f.cores[0] + ' 20%,' + f.cores[1] + ' 100%)';
            b.addEventListener('click', function () {
              fragEscolhida = fid;
              botoes.forEach(function (o) { o.setAttribute('aria-pressed', 'false'); });
              b.setAttribute('aria-pressed', 'true');
              nomeAtual.textContent = f.nome;
              redesenhar();
            });
            botoes.push(b);
            grupo.appendChild(b);
          });
          escolha.appendChild(grupo);
        }
      }

      var rotuloBtn = p.esgotado ? 'Indisponível' : 'Adicionar';
      var btnAdd = h('button', { class: 'btn-add', type: 'button', disabled: p.esgotado, 'aria-label': 'Adicionar ' + p.nome + ' à sacola' }, [icone('sacola'), rotuloBtn]);
      var timer = null;
      btnAdd.addEventListener('click', function () {
        adicionar('produto', p.id, fragEscolhida);
        limpar(btnAdd);
        btnAdd.appendChild(icone('check'));
        btnAdd.appendChild(document.createTextNode('Adicionado'));
        btnAdd.classList.add('added');
        clearTimeout(timer);
        timer = setTimeout(function () {
          limpar(btnAdd);
          btnAdd.appendChild(icone('sacola'));
          btnAdd.appendChild(document.createTextNode('Adicionar'));
          btnAdd.classList.remove('added');
        }, 1500);
      });

      grade.appendChild(h('article', { class: 'prod-card' + (p.esgotado ? ' esgotado' : '') }, [
        area,
        h('div', { class: 'prod-info' }, [
          h('div', { class: 'prod-cat', text: [p.categoria, p.tamanho].filter(Boolean).join(' · ') }),
          h('h3', { class: 'prod-name', text: p.nome }),
          escolha,
          h('div', { class: 'prod-footer' }, [
            h('div', { class: 'prod-price', text: brl(p.preco) }),
            btnAdd
          ])
        ])
      ]));
    });
  }

  function desenharKits() {
    var grade = $('kits-grid');
    limpar(grade);
    $('kits').hidden = !catalogo.kits.length;
    catalogo.kits.forEach(function (k) {
      var precos = [];
      if (k.precoDe > k.preco) precos.push(h('div', { class: 'kit-price-old', text: 'De ' + brl(k.precoDe) }));
      precos.push(h('div', { class: 'kit-price-new', text: brl(k.preco) }));
      if (k.precoDe > k.preco) precos.push(h('span', { class: 'kit-economia', text: 'Economize ' + brl(k.precoDe - k.preco) }));
      var fk = fotoPara(k, '', 'produto');
      var topo = fk
        ? h('div', { class: 'kit-foto' }, [imgFoto(fk, '(max-width: 920px) 90vw, 380px', { alt: fk.alt || k.nome })])
        : h('div', { class: 'kit-icone' }, [icone('presente')]);
      grade.appendChild(h('article', { class: 'kit-card' + (k.destaque ? ' destaque' : '') + (fk ? ' com-foto' : '') }, [
        topo,
        h('h3', { class: 'kit-name', text: k.nome }),
        h('p', { class: 'kit-desc', text: k.descricao }),
        h('ul', { class: 'kit-items' }, k.itens.map(function (i) { return h('li', { class: 'kit-item' }, [icone('check'), i]); })),
        h('div', { class: 'kit-footer' }, [
          h('div', {}, precos),
          h('button', {
            class: 'btn-kit', type: 'button',
            text: k.esgotado ? 'Indisponível' : 'Quero esse!',
            disabled: k.esgotado,
            'aria-label': 'Adicionar ' + k.nome + ' à sacola',
            on: { click: function () { adicionar('kit', k.id, ''); } }
          })
        ])
      ]));
    });
  }

  function desenharPassos() {
    var alvo = $('passos');
    limpar(alvo);
    $('como-usar').hidden = !catalogo.passos.length;
    catalogo.passos.forEach(function (p, i) {
      alvo.appendChild(h('li', { class: 'passo' }, [
        h('div', { class: 'passo-num', text: String(i + 1).padStart(2, '0'), 'aria-hidden': 'true' }),
        h('h3', { class: 'passo-title', text: p.titulo }),
        h('p', { class: 'passo-desc', text: p.texto })
      ]));
    });
  }

  function desenharDepoimentos() {
    var alvo = $('depo-grid');
    limpar(alvo);
    $('depoimentos').hidden = !catalogo.depoimentos.length;
    catalogo.depoimentos.forEach(function (d) {
      var estrelas = h('div', { class: 'depo-stars', role: 'img', 'aria-label': '5 estrelas' });
      for (var i = 0; i < 5; i++) {
        var st = s('svg', { class: 'ico', viewBox: '0 0 24 24', 'aria-hidden': 'true' });
        st.appendChild(s('path', { d: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z' }));
        estrelas.appendChild(st);
      }
      alvo.appendChild(h('figure', { class: 'depo-card' }, [
        estrelas,
        h('blockquote', { class: 'depo-text', text: '“' + d.texto + '”' }),
        h('figcaption', { class: 'depo-author', text: d.autor })
      ]));
    });
  }

  function desenharRodape() {
    var l = catalogo.loja;
    document.querySelectorAll('.js-instagram').forEach(function (a) {
      if (l.instagram) a.setAttribute('href', l.instagram); else a.hidden = true;
    });
    document.querySelectorAll('.js-whatsapp').forEach(function (a) {
      if (l.whatsapp) a.setAttribute('href', 'https://wa.me/' + l.whatsapp); else a.hidden = true;
    });
    $('ano').textContent = String(new Date().getFullYear());
    var partes = [l.razaoSocial, l.cnpjOuCpf, l.endereco].filter(Boolean);
    var info = 'Este site é uma vitrine. Não coletamos dados pessoais: o pedido é finalizado e combinado direto com a vendedora pelo WhatsApp.';
    $('footer-info').textContent = partes.length ? partes.join(' · ') + '. ' + info : info;
    $('btn-enviar').disabled = !l.whatsapp;
  }

  // Dados estruturados (schema.org) para o Google mostrar nome e preço dos produtos.
  // É um bloco de dados, não executa código, e é gerado a partir do catálogo.
  function dadosEstruturados() {
    var base = catalogo.loja.site || (location.origin + location.pathname);
    var itens = catalogo.produtos.map(function (p) {
      return {
        '@type': 'Product',
        name: p.nome,
        description: [p.categoria, p.tamanho].filter(Boolean).join(', '),
        brand: { '@type': 'Brand', name: catalogo.loja.nome },
        offers: {
          '@type': 'Offer',
          price: p.preco.toFixed(2),
          priceCurrency: 'BRL',
          availability: p.esgotado ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
          url: base + '#produtos'
        }
      };
    });
    if (!itens.length) return;
    var el = document.createElement('script');
    el.type = 'application/ld+json';
    el.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': itens });
    document.head.appendChild(el);
  }

  function mostrarErro() {
    var alvo = $('prod-grid');
    limpar(alvo);
    alvo.appendChild(h('div', { class: 'erro-catalogo' }, [
      h('h2', { text: 'Não conseguimos carregar os produtos' }),
      h('p', { text: 'Tente recarregar a página em instantes ou fale com a gente pelo Instagram @oxecosmeticoos.' })
    ]));
  }

  /* ---------- navegação ---------- */

  function ligarNavegacao() {
    var menu = $('nav-links');
    var toggle = $('nav-toggle');
    toggle.addEventListener('click', function () {
      var aberto = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', aberto ? 'true' : 'false');
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a')) { menu.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }
    });
    document.querySelectorAll('[data-scroll]').forEach(function (b) {
      b.addEventListener('click', function () {
        var alvo = $(b.getAttribute('data-scroll'));
        if (alvo) alvo.scrollIntoView({ behavior: reduzMovimento() ? 'auto' : 'smooth' });
      });
    });
    $('btn-cart').addEventListener('click', function () { if (sacolaAberta()) fecharSacola(); else abrirSacola(); });
    $('btn-close-cart').addEventListener('click', fecharSacola);
    $('btn-enviar').addEventListener('click', enviarWhatsApp);
    $('cart-overlay').addEventListener('click', function (e) { if (e.target === $('cart-overlay')) fecharSacola(); });
  }

  /* ---------- início ---------- */

  function iniciar() {
    ligarNavegacao();
    fetch(CATALOGO_URL, { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (bruto) {
        catalogo = normalizar(bruto);
        aplicarTema();
        desenharBanner();
        desenharHero();
        desenharSelos();
        desenharProdutos();
        desenharFragrancias();
        desenharKits();
        desenharPassos();
        desenharDepoimentos();
        desenharRodape();
        dadosEstruturados();
        carregar();
        desenharSacola();
      })
      .catch(function () { catalogo = null; mostrarErro(); });
  }

  iniciar();
})();

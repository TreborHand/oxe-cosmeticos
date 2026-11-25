/*
 * Oxe Cosméticos: vitrine com sacola que fecha no WhatsApp.
 *
 * Todo o conteúdo (produtos, kits, preços, banner, número do WhatsApp) vem de
 * data/catalogo.json. O site nunca monta HTML a partir de texto: tudo entra via
 * textContent / setAttribute, então nome de produto com aspas ou símbolos não
 * quebra a página nem executa código. O preço mostrado na sacola é sempre
 * relido do catálogo, nunca do que está salvo no navegador.
 */
(function () {
  'use strict';

  var CATALOGO_URL = 'data/catalogo.json';
  var CHAVE_SACOLA = 'oxe_sacola_v1';
  var MAX_QTD = 20;      // por item
  var MAX_LINHAS = 25;   // itens diferentes na sacola
  var FUNDOS = ['#FFF8E8', '#FDE8F0', '#E8F5E0', '#FFF3E0', '#F0F4FF', '#F0FFF4'];

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

  function porId(lista, id) {
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
    return null;
  }

  function reduzMovimento() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ---------- catálogo ---------- */

  function normalizar(bruto) {
    var c = bruto && typeof bruto === 'object' ? bruto : {};
    var loja = c.loja || {};
    var zap = String(loja.whatsapp || '').replace(/\D/g, '');
    var insta = /^https:\/\/(www\.)?instagram\.com\/[\w.\-\/]*$/.test(loja.instagram || '') ? loja.instagram : '';

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
      return {
        id: texto(p.id, 60),
        nome: texto(p.nome, 80),
        descricao: texto(p.descricao, 120),
        preco: numero(p.preco),
        emoji: texto(p.emoji, 8) || '🌿',
        imagem: urlImagem(p.imagem),
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
        emojis: texto(k.emojis, 12),
        itens: (Array.isArray(k.itens) ? k.itens : []).map(function (i) { return texto(i, 100); }).filter(Boolean).slice(0, 12),
        precoDe: numero(k.precoDe),
        preco: numero(k.preco),
        imagem: urlImagem(k.imagem),
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
        endereco: texto(loja.endereco, 200)
      },
      banner: {
        ativo: !!(c.banner && c.banner.ativo === true),
        mensagens: ((c.banner && c.banner.mensagens) || []).map(function (m) { return texto(m, 120); }).filter(Boolean).slice(0, 4)
      },
      selos: (Array.isArray(c.selos) ? c.selos : []).slice(0, 4).map(function (s) {
        return { icone: texto(s.icone, 8), texto: texto(s.texto, 40) };
      }).filter(function (s) { return s.texto; }),
      fragrancias: fragrancias,
      destaques: (Array.isArray(c.destaques) ? c.destaques : []).slice(0, 3).map(function (d) {
        return { produto: d.produto, fragrancia: d.fragrancia, rotulo: texto(d.rotulo, 60), maisVendido: d.mais_vendido === true };
      }),
      produtos: produtos,
      kits: kits,
      passos: (Array.isArray(c.passos) ? c.passos : []).slice(0, 6).map(function (p) {
        return { icone: texto(p.icone, 8), titulo: texto(p.titulo, 40), texto: texto(p.texto, 240) };
      }).filter(function (p) { return p.titulo; }),
      depoimentos: (Array.isArray(c.depoimentos) ? c.depoimentos : []).slice(0, 6).map(function (d) {
        return { texto: texto(d.texto, 400), autor: texto(d.autor, 80) };
      }).filter(function (d) { return d.texto && d.autor; })
    };
  }

  /* ---------- sacola ---------- */

  function chave(i) { return i.tipo + '|' + i.id + '|' + (i.frag || ''); }

  // Descobre nome e preço do item sempre a partir do catálogo atual.
  function resolver(i) {
    if (i.tipo === 'kit') {
      var k = porId(catalogo.kits, i.id);
      if (!k || k.esgotado) return null;
      return { nome: k.nome, detalhe: k.itens.length + ' produtos', preco: k.preco, emoji: (k.emojis || '🎁').slice(0, 2), imagem: k.imagem };
    }
    var p = porId(catalogo.produtos, i.id);
    if (!p || p.esgotado) return null;
    var f = i.frag ? porId(catalogo.fragrancias, i.frag) : null;
    if (i.frag && !f) return null;
    if (f && p.fragrancias.indexOf(f.id) === -1) return null;
    return { nome: p.nome, detalhe: f ? f.nome : '', preco: p.preco, emoji: p.emoji, imagem: p.imagem };
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
    return sacola.reduce(function (s, i) {
      var r = resolver(i);
      return s + (r ? r.preco * i.qtd : 0);
    }, 0);
  }

  function desenharSacola() {
    var itens = $('cart-items');
    var rodape = $('cart-footer');
    var qtdTotal = sacola.reduce(function (s, i) { return s + i.qtd; }, 0);
    $('cart-badge').textContent = String(qtdTotal);
    $('btn-cart').setAttribute('aria-label', 'Abrir sacola, ' + qtdTotal + (qtdTotal === 1 ? ' item' : ' itens'));
    limpar(itens);

    if (!sacola.length) {
      itens.appendChild(h('div', { class: 'cart-empty' }, [
        h('div', { class: 'ce-icon', text: '🌿', 'aria-hidden': 'true' }),
        h('p', { text: 'Sua sacola está vazia. Adicione produtos para começar!' })
      ]));
      rodape.hidden = true;
      return;
    }

    sacola.forEach(function (item) {
      var r = resolver(item);
      if (!r) return;
      var thumb = h('div', { class: 'ci-emoji', 'aria-hidden': 'true' });
      if (r.imagem) {
        var img = h('img', { src: r.imagem, alt: '', loading: 'lazy', decoding: 'async' });
        img.addEventListener('error', function () { limpar(thumb); thumb.textContent = r.emoji; });
        thumb.appendChild(img);
      } else {
        thumb.textContent = r.emoji;
      }
      itens.appendChild(h('div', { class: 'cart-item' }, [
        thumb,
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
          h('button', { class: 'btn-rm', type: 'button', text: '🗑', 'aria-label': 'Remover ' + r.nome + ' da sacola', on: { click: function () { remover(item); } } })
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
      var det = r.detalhe ? ' (' + r.detalhe + ')' : '';
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

  function desenharBanner() {
    var b = $('banner');
    if (catalogo.banner.ativo && catalogo.banner.mensagens.length) {
      b.textContent = '🌿 ' + catalogo.banner.mensagens.join('  |  ');
      b.hidden = false;
    } else {
      b.hidden = true;
    }
  }

  function desenharHero() {
    var alvo = $('hero-cards');
    limpar(alvo);
    var cards = [];
    catalogo.destaques.forEach(function (d) {
      var p = porId(catalogo.produtos, d.produto);
      var f = porId(catalogo.fragrancias, d.fragrancia);
      if (!p || p.esgotado || (f && p.fragrancias.indexOf(f.id) === -1)) return;
      cards.push({ p: p, f: f, d: d });
    });
    cards.forEach(function (c, idx) {
      var destaque = idx === 0;
      var rotulo = c.d.rotulo || (c.f ? c.f.nome : c.p.nome);
      var corpo = [];
      if (destaque && c.d.maisVendido) corpo.push(h('div', { class: 'hpc-badge', text: '⭐ Mais vendido' }));
      corpo.push(h('div', { class: 'hpc-cat', text: c.p.nome }));
      corpo.push(h('div', { class: 'hpc-name', text: rotulo }));
      corpo.push(h('div', { class: 'hpc-price', text: brl(c.p.preco) + (destaque && c.p.descricao ? ' — ' + c.p.descricao.split('—').pop().trim() : '') }));
      var kids = destaque
        ? [h('span', { class: 'hpc-emoji-feat', text: c.p.emoji, 'aria-hidden': 'true' }), h('div', {}, corpo)]
        : [h('span', { class: 'hpc-emoji', text: c.p.emoji, 'aria-hidden': 'true' })].concat(corpo);
      alvo.appendChild(h('button', {
        class: 'hero-prod-card' + (destaque ? ' featured' : ''),
        type: 'button',
        'aria-label': 'Adicionar à sacola: ' + c.p.nome + (c.f ? ' ' + c.f.nome : ''),
        on: { click: function () { adicionar('produto', c.p.id, c.f ? c.f.id : ''); } }
      }, kids));
    });
  }

  function desenharSelos() {
    var alvo = $('selos');
    limpar(alvo);
    alvo.hidden = !catalogo.selos.length;
    catalogo.selos.forEach(function (s) {
      alvo.appendChild(h('div', { class: 'selo' }, [
        h('div', { class: 'selo-icon', text: s.icone, 'aria-hidden': 'true' }),
        h('div', { class: 'selo-label', text: s.texto })
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
      dot.style.background = 'linear-gradient(135deg,' + f.cores[0] + ',' + f.cores[1] + ')';
      alvo.appendChild(h('div', { class: 'frag-card' }, [
        dot,
        h('div', { class: 'frag-name', text: f.nome }),
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
    catalogo.produtos.forEach(function (p, idx) {
      var fragEscolhida = p.fragrancias[0] || '';
      var img = h('div', { class: 'prod-img' });
      img.style.background = FUNDOS[idx % FUNDOS.length];
      var emoji = h('span', { text: p.emoji, 'aria-hidden': 'true' });
      img.appendChild(emoji);
      if (p.imagem) {
        var foto = h('img', { src: p.imagem, alt: p.nome, loading: 'lazy', decoding: 'async' });
        foto.addEventListener('load', function () { emoji.hidden = true; });
        foto.addEventListener('error', function () { if (foto.parentNode) foto.parentNode.removeChild(foto); });
        img.appendChild(foto);
      }
      if (p.esgotado) img.appendChild(h('div', { class: 'prod-tag-soldout', text: 'Esgotado' }));
      else if (p.tag === 'hot') img.appendChild(h('div', { class: 'prod-tag-hot', text: '🔥 Mais vendido' }));
      else if (p.tag === 'new') img.appendChild(h('div', { class: 'prod-tag-new', text: 'Novo' }));

      var pilulas = h('div', { class: 'frag-select', role: 'group', 'aria-label': 'Fragrância de ' + p.nome });
      var botoes = [];
      p.fragrancias.forEach(function (fid, fi) {
        var f = porId(catalogo.fragrancias, fid);
        var b = h('button', {
          class: 'frag-pill' + (fi === 0 ? ' active' : ''),
          type: 'button',
          text: f.nome,
          'aria-pressed': fi === 0 ? 'true' : 'false'
        });
        b.addEventListener('click', function () {
          fragEscolhida = fid;
          botoes.forEach(function (o) { o.classList.remove('active'); o.setAttribute('aria-pressed', 'false'); });
          b.classList.add('active');
          b.setAttribute('aria-pressed', 'true');
        });
        botoes.push(b);
        pilulas.appendChild(b);
      });

      var btnAdd = h('button', { class: 'btn-add', type: 'button', text: p.esgotado ? 'Indisponível' : '+ Sacola', disabled: p.esgotado, 'aria-label': 'Adicionar ' + p.nome + ' à sacola' });
      var timer = null;
      btnAdd.addEventListener('click', function () {
        adicionar('produto', p.id, fragEscolhida);
        btnAdd.textContent = '✓ Adicionado';
        btnAdd.classList.add('added');
        clearTimeout(timer);
        timer = setTimeout(function () { btnAdd.textContent = '+ Sacola'; btnAdd.classList.remove('added'); }, 1500);
      });

      grade.appendChild(h('article', { class: 'prod-card' + (p.esgotado ? ' esgotado' : '') }, [
        img,
        h('div', { class: 'prod-info' }, [
          h('div', { class: 'prod-cat', text: p.descricao }),
          h('h3', { class: 'prod-name', text: p.nome }),
          pilulas,
          h('div', { class: 'prod-footer' }, [
            h('div', { class: 'prod-price' }, [brl(p.preco) + ' ', h('span', { text: '/ unid.' })]),
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
      if (k.precoDe > k.preco) precos.push(h('div', { class: 'kit-price-old', text: brl(k.precoDe) }));
      precos.push(h('div', { class: 'kit-price-new', text: brl(k.preco) }));
      grade.appendChild(h('article', { class: 'kit-card' + (k.destaque ? ' destaque' : '') }, [
        h('div', { class: 'kit-emojis', text: k.emojis, 'aria-hidden': 'true' }),
        h('h3', { class: 'kit-name', text: k.nome }),
        h('div', { class: 'kit-desc', text: k.descricao }),
        h('ul', { class: 'kit-items' }, k.itens.map(function (i) { return h('li', { class: 'kit-item', text: i }); })),
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
      alvo.appendChild(h('div', { class: 'passo' }, [
        h('div', { class: 'passo-num', text: String(i + 1) }),
        h('div', { class: 'passo-icon', text: p.icone, 'aria-hidden': 'true' }),
        h('h3', { class: 'passo-title', text: p.titulo }),
        h('div', { class: 'passo-desc', text: p.texto })
      ]));
    });
  }

  function desenharDepoimentos() {
    var alvo = $('depo-grid');
    limpar(alvo);
    $('depoimentos').hidden = !catalogo.depoimentos.length;
    catalogo.depoimentos.forEach(function (d) {
      alvo.appendChild(h('figure', { class: 'depo-card' }, [
        h('div', { class: 'depo-stars', text: '★★★★★', 'aria-label': '5 estrelas' }),
        h('blockquote', { class: 'depo-text', text: '“' + d.texto + '”' }),
        h('figcaption', { class: 'depo-author', text: '— ' + d.autor })
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
    $('footer-info').textContent = partes.length ? partes.join(' · ') + ' — ' + info : info;
    $('btn-enviar').disabled = !l.whatsapp;
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
      if (e.target.tagName === 'A') { menu.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }
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
        desenharBanner();
        desenharHero();
        desenharSelos();
        desenharFragrancias();
        desenharProdutos();
        desenharKits();
        desenharPassos();
        desenharDepoimentos();
        desenharRodape();
        carregar();
        desenharSacola();
      })
      .catch(function () { catalogo = null; mostrarErro(); });
  }

  iniciar();
})();

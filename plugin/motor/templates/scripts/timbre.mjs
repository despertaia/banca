/**
 * Papel timbrado do escritório no .docx: o do PRÓPRIO escritório (caminho
 * principal; o transplante mora em `timbre-proprio.mjs`) e o modelo B · Lateral
 * (o reserva, para quem não tem papel timbrado, e o que entra quando o papel do
 * escritório não pode ser lido: a peça nunca sai sem timbre, calada).
 *
 * Camada Desperta (Fase 0B, bloco 3). Cópia IDÊNTICA em
 * `templates/scripts/timbre.mjs`: o empacotador roda dentro do projeto do
 * advogado, onde `src/` não existe em caminho previsível. `tests/timbre.test.js`
 * reprova as duas cópias diferentes (conserto: `cp scripts/timbre.mjs
 * templates/scripts/timbre.mjs`).
 *
 * Lê o que `banca escritorio aplicar` gravou no `estilo-escritorio.json`:
 *   cabecalho: { escritorio, oab, endereco, linhas_extras, logo, modelo: "lateral" | "proprio", papel, tamanho_pt }
 *   assinatura: { cidade, uf, nome, oab, cargo }
 * e o logo em `_legalsquad/escritorio/<cabecalho.logo>`; com `modelo: "proprio"`,
 * o papel em `_legalsquad/escritorio/<cabecalho.papel>`.
 *
 * Sem dependência declarada: a biblioteca `docx` chega por parâmetro (o
 * empacotador já a carregou), e o JSZip do transplante vem com ela.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

import { carregarJSZip, transplantar } from './timbre-proprio.mjs';

export const CREATOR = 'Banca · Desperta.IA';
export const MARCADOR_ASSINATURA = '{{assinatura}}';
export const LIMITE_DO_LOGO = 2 * 1024 * 1024;
export const ARQUIVO_DO_PAPEL = 'papel-timbrado.docx';
// A peça feita com o caso de treino (fictício) se anuncia: o aviso é o primeiro parágrafo
// do corpo, e no lugar do bloco de assinatura vai uma linha que diz que não há assinatura.
export const AVISO_DE_TREINO = 'PEÇA DE TREINO · caso fictício · não assinar nem protocolar';
export const SEM_ASSINATURA_NO_TREINO = 'Peça de treino: sem assinatura.';
const ARQUIVO_CORTADO = 'o arquivo parece incompleto (o download pode ter sido interrompido)';
const ALTURA_DO_LOGO_CM = 1.6;
const PX_POR_CM = 96 / 2.54; // a biblioteca `docx` mede imagem em pixels a 96 dpi
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/**
 * Tipo e dimensões de uma imagem pelos bytes: PNG (assinatura + IHDR) ou JPEG
 * (SOI + primeiro SOF). Outro formato, ou imagem cortada (PNG sem o bloco IEND,
 * JPEG sem o marcador FFD9 depois do quadro: download interrompido; bytes
 * depois do marcador são tolerados), é recusado com
 * mensagem em português. Devolve `{ tipo: 'png'|'jpg', largura, altura }`.
 */
export function lerImagem(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 24) throw new Error('o arquivo é pequeno demais para ser uma imagem');
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    if (buf.toString('latin1', 12, 16) !== 'IHDR') throw new Error('PNG sem cabeçalho IHDR (arquivo corrompido?)');
    const largura = buf.readUInt32BE(16);
    const altura = buf.readUInt32BE(20);
    if (!largura || !altura) throw new Error('PNG com largura ou altura zero');
    // Fim do PNG: o bloco IEND tem de existir (percorre os blocos a partir do IHDR).
    // Bytes depois do IEND são tolerados; PNG sem IEND é download interrompido.
    let achouIend = false;
    for (let pos = 8; pos + 8 <= buf.length;) {
      const comprimento = buf.readUInt32BE(pos);
      if (buf.toString('latin1', pos + 4, pos + 8) === 'IEND') { achouIend = pos + 12 + comprimento <= buf.length; break; }
      pos += 12 + comprimento;
    }
    if (!achouIend) throw new Error(ARQUIVO_CORTADO);
    return { tipo: 'png', largura, altura };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) throw new Error('JPEG com segmento inválido (arquivo corrompido?)');
      const marcador = buf[i + 1];
      if (marcador === 0xff) { i += 1; continue; } // byte de preenchimento
      if (marcador === 0xd8 || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) { i += 2; continue; } // sem comprimento
      if (marcador === 0xd9 || marcador === 0xda) break; // fim da imagem ou começo dos dados, sem SOF antes
      const tamanho = buf.readUInt16BE(i + 2);
      // SOF0..SOF15, menos DHT (C4), JPG (C8) e DAC (CC): altura e largura do quadro.
      if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
        const altura = buf.readUInt16BE(i + 5);
        const largura = buf.readUInt16BE(i + 7);
        if (!largura || !altura) throw new Error('JPEG com largura ou altura zero');
        // O marcador de fim (FFD9) tem de existir depois do quadro; bytes depois dele são tolerados.
        if (buf.indexOf(Buffer.from([0xff, 0xd9]), i + 2 + tamanho) < 0) throw new Error(ARQUIVO_CORTADO);
        return { tipo: 'jpg', largura, altura };
      }
      i += 2 + tamanho;
    }
    throw new Error('JPEG sem as dimensões do quadro (arquivo corrompido?)');
  }
  throw new Error('formato não aceito: o logo precisa ser PNG ou JPEG');
}

/**
 * Lê o logo do escritório para o cabeçalho. Logo presente mas inválido (texto,
 * GIF, pasta no lugar do arquivo, acima de 2 MB) derruba o pacote, e a mensagem
 * diz qual arquivo e como trocar: nenhuma peça sai sem timbre em silêncio.
 */
function lerLogoDoEscritorio(caminho) {
  const falha = (motivo) => new Error(`logo do escritório (${caminho}): ${motivo}; troque o logo com \`npx banca escritorio logo <arquivo>\``);
  let bytes;
  try {
    const st = statSync(caminho);
    if (st.isDirectory()) throw falha('no lugar do arquivo há uma pasta');
    if (st.size > LIMITE_DO_LOGO) throw falha(`o arquivo tem ${(st.size / (1024 * 1024)).toFixed(1).replace('.', ',')} MB, e o limite é 2 MB`);
    bytes = readFileSync(caminho);
  } catch (e) {
    if (e.message.startsWith('logo do escritório')) throw e;
    throw falha('não foi possível ler o arquivo');
  }
  try {
    return { bytes, img: lerImagem(bytes) };
  } catch (e) {
    throw falha(e.message);
  }
}

/** "27 de setembro de 2026" (data local). */
export function dataPorExtenso(data = new Date()) {
  return `${data.getDate()} de ${MESES[data.getMonth()]} de ${data.getFullYear()}`;
}

// Fechamento com OAB: "OAB/MT 12345", "OAB-MT nº 12.345", "OAB/MT n. 12345", "OAB 12345/MT".
const RE_FECHAMENTO_COM_OAB = /\bOAB\s*(?:[/-]\s*[A-Z]{2}\b|n?[º°.]?\s*\d)/i;

/** A peça já tem assinatura? Marcador `{{assinatura}}`, ou OAB numa das últimas 15 linhas não vazias. */
export function temAssinatura(texto) {
  const t = String(texto ?? '');
  if (t.includes(MARCADOR_ASSINATURA)) return true;
  const linhas = t.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim());
  return linhas.slice(-15).some((l) => RE_FECHAMENTO_COM_OAB.test(l));
}

/** As linhas do bloco de assinatura, em texto. `null` quando o estilo não tem assinatura. */
export function linhasDaAssinatura(assinatura, data = new Date()) {
  const a = assinatura || {};
  if (!a.nome) return null;
  const lugar = a.cidade ? `${a.cidade}${a.uf ? `/${a.uf}` : ''}, ` : '';
  return [`${lugar}${dataPorExtenso(data)}.`, '_______________________________________', a.nome, a.oab || a.cargo || null].filter(Boolean);
}

/**
 * Um campo de número de página (`PAGE` ou `NUMPAGES`) como o Word o grava: o
 * começo, a instrução, o separador, o RESULTADO e o fim, cada um no seu run, todos
 * com o mesmo `formato` (fonte e tamanho). A biblioteca `docx` põe o campo
 * inteiro num run só e sem resultado; o Word aceita, mas o LibreOffice (que faz
 * o PDF) desenha os dígitos com a formatação do último texto da peça, maiores
 * que o resto do rodapé (e em itálico ou negrito, conforme a peça terminava).
 * O resultado gravado ("1") é só o valor inicial: Word e LibreOffice recalculam
 * ao abrir. Devolve a lista de runs; numa `docx` sem `ImportedXmlComponent`,
 * cai no campo de um run só, como era.
 */
export function campoDePagina(d, instrucao, formato = {}) {
  const atalho = { PAGE: d.PageNumber.CURRENT, NUMPAGES: d.PageNumber.TOTAL_PAGES }[instrucao];
  if (typeof d.ImportedXmlComponent !== 'function') return [new d.TextRun({ ...formato, children: [atalho] })];
  const marca = (tipo) => new d.ImportedXmlComponent('w:fldChar', { 'w:fldCharType': tipo });
  const texto = new d.ImportedXmlComponent('w:instrText', { 'xml:space': 'preserve' });
  texto.push(instrucao);
  const run = (filho) => new d.TextRun({ ...formato, children: [filho] });
  return [run(marca('begin')), run(texto), run(marca('separate')), new d.TextRun({ ...formato, text: '1' }), run(marca('end'))];
}

/**
 * O aviso da peça de treino, em destaque: negrito, centralizado, com borda e
 * sombreado (cinza, para sair igual em qualquer impressora). Vale com qualquer
 * papel, e também sem timbre: `d` é a biblioteca `docx` já carregada.
 */
export function avisoDeTreino(d, fonte) {
  const borda = { style: d.BorderStyle.SINGLE, size: 12, color: '000000', space: 6 };
  return new d.Paragraph({
    alignment: d.AlignmentType.CENTER,
    keepNext: true,
    keepLines: true,
    spacing: { before: 0, after: 360, line: 240 },
    border: { top: borda, bottom: borda, left: borda, right: borda },
    shading: { type: d.ShadingType.CLEAR, color: 'auto', fill: 'D9D9D9' },
    children: [new d.TextRun({ text: AVISO_DE_TREINO, bold: true, font: fonte })],
  });
}

// Avisos do papel do escritório que não pôde ser usado: o empacotador os lê e
// mostra (uma vez cada), para a troca pelo modelo lateral nunca ser silenciosa.
const avisos = new Set();
/** Os avisos desde a última leitura; ler esvazia (com `manter`, só olha: o empacotador os põe no termo e no manifesto antes de devolvê-los). */
export function avisosDoPapel({ manter = false } = {}) {
  const lista = [...avisos];
  if (!manter) avisos.clear();
  return lista;
}

/**
 * A peça pronta com o papel do escritório. Qualquer falha (arquivo que sumiu,
 * corrompido, com senha, sem cabeçalho) vira aviso, e a peça sai pelo `reserva`
 * (o modelo lateral): nunca sem timbre, e nunca sem dizer.
 */
async function vestirComPapel(buffer, raiz, arquivo, reserva) {
  const nome = basename(String(arquivo || ARQUIVO_DO_PAPEL));
  try {
    const caminho = join(raiz, '_legalsquad', 'escritorio', nome);
    if (!existsSync(caminho)) throw new Error('o arquivo não está mais na pasta do escritório');
    return (await transplantar(await carregarJSZip(raiz), buffer, readFileSync(caminho))).buffer;
  } catch (e) {
    avisos.add(`o papel timbrado do escritório (${nome}) não pôde ser usado: ${e.message}. O documento saiu com o modelo lateral (nome, OAB e contato do escritório). Para voltar ao papel do escritório, mande o arquivo em Word (.docx) ao Lex.`);
    return reserva();
  }
}

/**
 * O timbre para o `markdownParaDocx`, ou `null` quando o estilo não pede
 * (`cabecalho.modelo` diferente de "lateral" e de "proprio"): aí o cabeçalho só
 * de texto de sempre continua igual. `d` é a biblioteca `docx` já carregada.
 *
 * Devolve `{ headers, footers, blocoAssinatura(texto), paragrafosDaAssinatura(), creator, vestir }`.
 * `blocoAssinatura(texto)` devolve [] quando a peça já tem fechamento com OAB
 * ou o marcador; `paragrafosDaAssinatura()` é o bloco sempre (troca o marcador).
 * `vestir(buffer, reserva)` só existe com "proprio": põe no .docx pronto o
 * papel do escritório; `reserva(estilo)` gera a peça de novo com o estilo dado
 * (o lateral), e é chamado só quando o papel não pode ser usado.
 *
 * Com `treino` (a peça do caso fictício), o bloco de assinatura nunca entra: no
 * lugar dele (no fim da peça, ou onde estiver o marcador) vai a linha «Peça de
 * treino: sem assinatura.», uma vez só, mesmo que o texto já feche com OAB.
 */
export function montarTimbre(d, estilo, raiz, { data = new Date(), treino = false } = {}) {
  const cab = { tamanho_pt: 9, linhas_extras: [], ...(estilo.cabecalho || {}) };
  if (cab.modelo !== 'lateral' && cab.modelo !== 'proprio') return null;
  const fonte = estilo.fonte.familia;
  const hp = (pt) => Math.round(Number(pt) * 2);
  const cm = (v) => Math.round(Number(v) * 567);

  const paragrafosDaAssinatura = () => {
    const l = linhasDaAssinatura(estilo.assinatura, data);
    if (!l) return [];
    const [local, traco, ...resto] = l;
    const p = (t, extra = {}, run = {}) => new d.Paragraph({ alignment: d.AlignmentType.CENTER, keepNext: true, keepLines: true, spacing: { line: 240, after: 0 }, ...extra, children: [new d.TextRun({ text: t, font: fonte, ...run })] });
    return [
      p(local, { spacing: { before: 360, after: 0, line: 240 } }),
      p(traco, { spacing: { before: 720, after: 0, line: 240 } }),
      ...resto.map((t, i) => p(t, i === resto.length - 1 ? { keepNext: false } : {}, i === 0 ? { bold: true } : {})),
    ];
  };
  const semAssinatura = () => [new d.Paragraph({ alignment: d.AlignmentType.CENTER, spacing: { before: 360, after: 0, line: 240 }, children: [new d.TextRun({ text: SEM_ASSINATURA_NO_TREINO, italics: true, font: fonte })] })];
  const assinatura = treino
    ? { blocoAssinatura: (textoDaPeca) => (String(textoDaPeca ?? '').includes(MARCADOR_ASSINATURA) ? [] : semAssinatura()), paragrafosDaAssinatura: semAssinatura, creator: CREATOR }
    : { blocoAssinatura: (textoDaPeca) => (temAssinatura(textoDaPeca) ? [] : paragrafosDaAssinatura()), paragrafosDaAssinatura, creator: CREATOR };

  // Papel do próprio escritório: a peça é gerada sem cabeçalho nem rodapé e vestida depois.
  if (cab.modelo === 'proprio') {
    const lateral = { ...estilo, cabecalho: { ...estilo.cabecalho, modelo: 'lateral' } };
    return { headers: undefined, footers: undefined, ...assinatura, vestir: (buffer, reserva) => vestirComPapel(buffer, raiz, cab.papel, () => reserva(lateral)) };
  }
  const largura = cm(estilo.pagina.largura_cm - estilo.margens_cm.esquerda - estilo.margens_cm.direita);
  const linhaFina = { style: d.BorderStyle.SINGLE, size: 4, color: '808080', space: 4 };
  const nada = { style: d.BorderStyle.NONE, size: 0, color: 'FFFFFF' };

  // Bloco da direita: nome em negrito, "Responsável · OAB/UF", contato.
  const texto = (t, extra = {}) => new d.TextRun({ text: t, font: fonte, size: hp(cab.tamanho_pt), ...extra });
  const linhas = [
    cab.escritorio && texto(cab.escritorio, { bold: true, size: hp(cab.tamanho_pt + 2) }),
    cab.oab && texto(cab.oab),
    ...(Array.isArray(cab.linhas_extras) ? cab.linhas_extras : []).filter((l) => typeof l === 'string' && l.trim()).map((l) => texto(l)),
  ].filter(Boolean);
  const direita = (borda) => linhas.map((run, i) => new d.Paragraph({
    alignment: d.AlignmentType.RIGHT,
    spacing: { line: 240, after: 0 },
    border: borda && i === linhas.length - 1 ? { bottom: linhaFina } : undefined,
    children: [run],
  }));

  // Logo à esquerda: 1,6 cm de altura, largura pela proporção (até 40% da linha).
  let logo = null;
  const arquivoDoLogo = cab.logo ? join(raiz, '_legalsquad', 'escritorio', String(cab.logo)) : null;
  if (arquivoDoLogo && existsSync(arquivoDoLogo)) {
    const { bytes, img } = lerLogoDoEscritorio(arquivoDoLogo);
    let alturaPx = ALTURA_DO_LOGO_CM * PX_POR_CM;
    let larguraPx = alturaPx * (img.largura / img.altura);
    const maxPx = (largura * 0.4 / 567) * PX_POR_CM;
    if (larguraPx > maxPx) { alturaPx *= maxPx / larguraPx; larguraPx = maxPx; }
    logo = { run: new d.ImageRun({ type: img.tipo, data: bytes, transformation: { width: Math.round(larguraPx), height: Math.round(alturaPx) } }), larguraTw: Math.round((larguraPx / PX_POR_CM) * 567) };
  }

  let cabecalho;
  if (logo) {
    const esquerda = Math.min(Math.round(largura * 0.4), logo.larguraTw + cm(0.3));
    const celula = (w, filhos, alinhamento) => new d.TableCell({
      width: { size: w, type: d.WidthType.DXA },
      verticalAlign: d.VerticalAlign.CENTER,
      borders: { top: nada, left: nada, right: nada }, // a de baixo é a linha fina da tabela
      children: filhos.length ? filhos : [new d.Paragraph({ alignment: alinhamento, children: [] })],
    });
    cabecalho = [
      new d.Table({
        width: { size: largura, type: d.WidthType.DXA },
        columnWidths: [esquerda, largura - esquerda],
        layout: d.TableLayoutType.FIXED,
        borders: { top: nada, left: nada, right: nada, insideHorizontal: nada, insideVertical: nada, bottom: { style: d.BorderStyle.SINGLE, size: 4, color: '808080' } },
        rows: [new d.TableRow({ children: [
          celula(esquerda, [new d.Paragraph({ alignment: d.AlignmentType.LEFT, children: [logo.run] })], d.AlignmentType.LEFT),
          celula(largura - esquerda, direita(false), d.AlignmentType.RIGHT),
        ] })],
      }),
      new d.Paragraph({ children: [], spacing: { after: 0 } }), // o Word exige parágrafo depois de tabela
    ];
  } else {
    cabecalho = direita(true);
  }
  const headers = cabecalho.length ? { default: new d.Header({ children: cabecalho }) } : undefined;

  // Rodapé: endereço à esquerda e "Página n de total" à direita, por tabulação.
  const rod = { numeracao_de_pagina: true, formato: 'Página {n} de {total}', tamanho_pt: 9, ...(estilo.rodape || {}) };
  const r = (extra) => new d.TextRun({ font: fonte, size: hp(rod.tamanho_pt), ...extra });
  const formato = { font: fonte, size: hp(rod.tamanho_pt) };
  const pagina = rod.numeracao_de_pagina
    ? String(rod.formato || 'Página {n} de {total}').split(/(\{n\}|\{total\})/).filter(Boolean).flatMap((p) => {
      if (p === '{n}') return campoDePagina(d, 'PAGE', formato);
      if (p === '{total}') return campoDePagina(d, 'NUMPAGES', formato);
      return r({ text: p });
    })
    : [];
  const rodapeRuns = [...(cab.endereco ? [r({ text: cab.endereco })] : []), ...(pagina.length ? [r({ children: [new d.Tab()] }), ...pagina] : [])];
  const footers = rodapeRuns.length
    ? { default: new d.Footer({ children: [new d.Paragraph({ tabStops: [{ type: d.TabStopType.RIGHT, position: largura }], children: rodapeRuns })] }) }
    : undefined;
  return { headers, footers, ...assinatura, vestir: null };
}

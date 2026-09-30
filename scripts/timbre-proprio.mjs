/**
 * Papel timbrado do PRÓPRIO escritório: o transplante.
 *
 * Camada Desperta (Fase 0B, bloco 3, desenho §6.8.2). Cópia IDÊNTICA em
 * `templates/scripts/timbre-proprio.mjs` (o empacotador roda dentro do projeto
 * do advogado); `tests/timbre-proprio.test.js` reprova as duas cópias
 * diferentes (conserto: `cp scripts/timbre-proprio.mjs templates/scripts/`).
 *
 * A peça é gerada como sempre (corpo, estilos e numeração do motor) e depois
 * recebe, do .docx/.dotx que o escritório já usa:
 *   - as partes de cabeçalho e rodapé (`word/header*.xml`, `word/footer*.xml`),
 *     com as relações delas e tudo o que elas usam (imagens de `word/media`,
 *     e o que mais houver, com as relações e os tipos próprios), sem colisão
 *     de nome;
 *   - os tipos em `[Content_Types].xml`;
 *   - do `sectPr`, só o que é do papel: tamanho da página, margens, distância
 *     do cabeçalho e do rodapé, bordas de página e primeira página diferente
 *     (colunas, grade, numeração de página e o resto continuam os da peça);
 *   - páginas pares e ímpares (liga e desliga, conforme o papel);
 *   - o tema do papel (cores das formas e dos textos do timbre), quando a peça
 *     não tem tema; se tiver, as cores de tema do timbre viram valores fixos.
 * O texto que estiver no corpo do papel timbrado é ignorado.
 *
 * O cabeçalho de um papel feito no Word apoia-se nos estilos e nos padrões do
 * documento DELE (fonte, espaçamento, tabulação). Para ele sair igual dentro da
 * peça, cujos padrões são os do estilo forense (justificado, entrelinha 1,5),
 * os estilos que o cabeçalho usa vêm junto, renomeados com o prefixo `Papel`, e
 * os padrões do papel viram o estilo `PapelBase`.
 *
 * Como o módulo se protege (o papel vem de fora, feito por qualquer um):
 *   1. NA ENTRADA, todo XML lido passa por um verificador de boa formação
 *      linear, que recusa DOCTYPE. O do papel é devolvido numa forma canônica
 *      (sem comentário, instrução nem CDATA; atributo sempre com aspas duplas
 *      e sem `>` dentro; elemento vazio sempre `<x/>`, fechamento sempre
 *      `</x>`): é sobre essa forma que
 *      as trocas cirúrgicas abaixo trabalham; sem ela, uma expressão regular
 *      de marca não é confiável. As alterações controladas do papel são
 *      ACEITAS aí (`semRevisoes`): vale o papel como ele está hoje. O da peça
 *      (que é do empacotador) é só conferido: o corpo não é reescrito.
 *   2. Nada do papel é descomprimido sem teto (por parte e no total), e só o
 *      que é usado é lido; as buscas de elemento são varreduras lineares.
 *   3. NA SAÍDA, a conferência final relê do pacote cada parte gravada: XML mal
 *      formado, prefixo sem declaração, relação sem alvo ou `r:id` sem relação
 *      viram `ErroDoPapel('corrompido')`. Nunca sai arquivo que não abre.
 *
 * Sem dependência declarada: o JSZip chega por parâmetro. Ele é dependência da
 * biblioteca `docx` e é achado a partir dela (`carregarJSZip`), nos mesmos
 * lugares em que o empacotador acha o `docx`.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { crc32 } from 'node:zlib';

/**
 * Erro que o advogado entende. `codigo` diz ao Lex o que oferecer em seguida;
 * `detalhe` (quando há) é técnico, para quem depura, e não vai na mensagem.
 */
export class ErroDoPapel extends Error {
  constructor(codigo, mensagem, detalhe = null) {
    super(mensagem);
    this.name = 'ErroDoPapel';
    this.codigo = codigo;
    if (detalhe) this.detalhe = detalhe;
  }
}

/** Erro da PEÇA (o documento gerado não abre, ou não é um .docx inteiro): não é culpa do papel timbrado. */
export class ErroDaPeca extends Error {
  constructor(mensagem, detalhe = null) {
    super(mensagem);
    this.name = 'ErroDaPeca';
    if (detalhe) this.detalhe = detalhe;
  }
}

export const MENSAGENS_DO_PAPEL = Object.freeze({
  'doc-antigo-ou-senha': 'o arquivo está no formato antigo do Word (.doc) ou protegido por senha. Abra-o no Word, tire a senha se houver, e use «Salvar como» → «Documento do Word (.docx)»',
  'nao-e-word': 'o arquivo não é um documento do Word (.docx ou .dotx)',
  corrompido: 'o arquivo não pôde ser aberto (parece corrompido). Abra-o no Word e salve de novo como «Documento do Word (.docx)»',
  'sem-cabecalho': 'o arquivo não tem cabeçalho nem rodapé: o desenho do papel deve estar solto no corpo da página. Mande uma imagem (PNG ou JPG) da página inteira, ou o arquivo com o timbre dentro do cabeçalho',
  'formato-estrito': 'o arquivo foi salvo como «Strict Open XML». Abra-o no Word e use «Salvar como» → «Documento do Word (.docx)»',
  'parece-logo': 'a imagem parece um logo, não um papel timbrado (não é uma faixa larga de cabeçalho nem uma página inteira). Use-a como logo: o modelo lateral monta o papel com ela',
  'grande-demais': 'o arquivo é grande demais por dentro para um papel timbrado: depois de aberto, ele (ou uma parte dele) passa do limite de tamanho. Salve o papel com as imagens em resolução menor e sem texto no corpo, e mande de novo',
});
// Mesmo código `sem-cabecalho`: o cabeçalho existe, mas não tem nada (o Word cria o cabeçalho vazio com facilidade).
const MENSAGEM_DO_CABECALHO_VAZIO = 'o papel não tem nada no cabeçalho nem no rodapé: o desenho deve estar solto no corpo da página. No Word, o logo precisa estar dentro do cabeçalho (menu Inserir → Cabeçalho). Ou mande uma imagem (PNG ou JPG) da página inteira';
// Idem, quando o papel tem «Primeira página diferente» e é o cabeçalho (e o rodapé) DA PRIMEIRA PÁGINA que está vazio.
const MENSAGEM_DA_PRIMEIRA_PAGINA_VAZIA = 'o papel usa «Primeira página diferente» e o cabeçalho da primeira página está vazio: o timbre da primeira página deve estar solto no corpo do documento. No Word, ponha o logo dentro do cabeçalho da primeira página, ou desmarque «Primeira página diferente» (na guia Cabeçalho e Rodapé). Ou mande uma imagem (PNG ou JPG) da página inteira';
// Mesmo código `corrompido`: a imagem do timbre não está dentro do arquivo (o Word a vinculou a um arquivo de fora).
const MENSAGEM_DA_IMAGEM_DE_FORA = 'uma imagem do cabeçalho ou do rodapé do papel não está guardada dentro do arquivo: está vinculada a um arquivo do computador ou da internet, e sumiria do documento em outra máquina. No Word, insira a imagem de novo (menu Inserir → Imagens, botão «Inserir», e não «Vincular ao Arquivo»), salve e mande outra vez';
// Idem, quando a imagem está só vinculada a uma parte de dentro do arquivo: o LibreOffice (que faz o PDF) não a desenha.
const MENSAGEM_DA_IMAGEM_SO_VINCULADA = 'uma imagem do cabeçalho ou do rodapé do papel está só vinculada, e não inserida: ela não sairia no documento. No Word, insira a imagem de novo no cabeçalho (menu Inserir → Imagens, botão «Inserir», e não «Vincular ao Arquivo»), salve e mande outra vez';
const MENSAGEM_DA_PECA = 'o documento gerado não pôde ser aberto para receber o papel timbrado';
// Mesmo código `corrompido`: a conferência final reprovou o que ia sair.
const MENSAGEM_DA_CONFERENCIA = 'o papel timbrado tem algo que não pôde ser levado para o documento sem estragá-lo. Abra o papel no Word, aceite as alterações controladas (se houver), salve de novo como «Documento do Word (.docx)» e mande outra vez';
const erro = (codigo, detalhe = null) => new ErroDoPapel(codigo, MENSAGENS_DO_PAPEL[codigo], detalhe);

// ---------------------------------------------------------------------------
// Que arquivo é este (pelos bytes, nunca pela extensão)
// ---------------------------------------------------------------------------
const ASSINATURA_OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 'zip' (.docx/.dotx são zip), 'ole' (.doc antigo ou arquivo com senha), 'pdf', 'png', 'jpg' ou 'desconhecido'. */
export function tipoDoArquivo(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 8) return 'desconhecido';
  if (buf[0] === 0x50 && buf[1] === 0x4b && [0x03, 0x05, 0x07].includes(buf[2])) return 'zip';
  if (buf.subarray(0, 8).equals(ASSINATURA_OLE)) return 'ole';
  if (buf.toString('latin1', 0, 5) === '%PDF-') return 'pdf';
  if (buf.subarray(0, 8).equals(ASSINATURA_PNG)) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  return 'desconhecido';
}

// ---------------------------------------------------------------------------
// JSZip: dependência da biblioteca `docx`, achada a partir dela
// ---------------------------------------------------------------------------
let jszipCache = null;
/**
 * O JSZip, dos mesmos lugares em que o empacotador acha o `docx`: o
 * `node_modules/` do projeto, o do motor (pelo atalho `_legalsquad/motor/motor.json`
 * ou pelo registro da máquina, `~/.legalsquad/motor.json`) e o deste arquivo. Em
 * cada lugar tenta o `jszip` direto e, se não estiver à vista, a partir do `docx`.
 */
export async function carregarJSZip(raiz = process.cwd(), env = process.env) {
  if (jszipCache) return jszipCache;
  const bases = [join(raiz, 'package.json'), join(process.cwd(), 'package.json')];
  for (const registro of [join(raiz, '_legalsquad', 'motor', 'motor.json'), join(env.HOME || env.USERPROFILE || '', '.legalsquad', 'motor.json')]) {
    try {
      const bin = JSON.parse(readFileSync(registro, 'utf8')).bin;
      if (bin) bases.push(bin);
    } catch { /* sem registro */ }
  }
  bases.push(import.meta.url);
  for (const base of bases) {
    let exigir;
    try { exigir = createRequire(base); } catch { continue; }
    for (const achar of [() => exigir.resolve('jszip'), () => createRequire(exigir.resolve('docx')).resolve('jszip')]) {
      try {
        const modulo = await import(pathToFileURL(achar()).href);
        jszipCache = modulo.default || modulo;
        return jszipCache;
      } catch { /* não está aqui */ }
    }
  }
  throw new Error('biblioteca `jszip` (que vem com a `docx`) não encontrada nem no projeto nem no motor; rode `banca update` nesta pasta');
}

// ---------------------------------------------------------------------------
// XML: o verificador de boa formação (linear) e a forma canônica
// ---------------------------------------------------------------------------
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const escaparTexto = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Para valor de atributo: além do de sempre, tabulação e quebra de linha viram referência (senão o leitor as troca por espaço). */
const escapar = (s) => escaparTexto(s).replace(/[\t\n\r]/g, (c) => `&#${c.charCodeAt(0)};`);
const caractereValido = (c) => c === 9 || c === 10 || c === 13 || (c >= 0x20 && c <= 0xd7ff) || (c >= 0xe000 && c <= 0xfffd) || (c >= 0x10000 && c <= 0x10ffff);
const ENTIDADES = Object.freeze({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" });
/** O valor que um atributo (ou texto) quer dizer: as cinco entidades e as referências numéricas (`&#227;`, `&#xE3;`), numa passada só. */
const desescapar = (s) => String(s).replace(/&(?:(amp|lt|gt|quot|apos)|#([0-9]{1,7})|#x([0-9A-Fa-f]{1,6}));/g, (tudo, nome, decimal, hexa) => {
  if (nome) return ENTIDADES[nome];
  const codigo = decimal ? Number(decimal) : parseInt(hexa, 16);
  return caractereValido(codigo) ? String.fromCodePoint(codigo) : tudo;
});

const NOME_XML = '[A-Za-z_\\u00C0-\\uD7FF\\uF900-\\uFFFD][-.\\w\\u00B7\\u00C0-\\uD7FF\\uF900-\\uFFFD]*';
const RE_ABERTURA = new RegExp(`<(?:(${NOME_XML}):)?${NOME_XML}`, 'y');
const RE_ATRIBUTO = new RegExp(`(\\s+)(?:(${NOME_XML}):)?(${NOME_XML})(\\s*=\\s*)(?:"([^<"]*)"|'([^<']*)')`, 'y');
const RE_FIM_DA_MARCA = /\s*(\/?)>/y;
const RE_ALVO_DA_INSTRUCAO = new RegExp(`<\\?(${NOME_XML})(?=\\s|\\?>)`, 'y');
const RE_DECLARACAO = /^<\?xml\s+version\s*=\s*(["'])1\.[0-9]+\1(?:\s+encoding\s*=\s*(["'])([A-Za-z][-A-Za-z0-9._]*)\2)?(?:\s+standalone\s*=\s*(["'])(?:yes|no)\4)?\s*\?>$/;
const RE_FECHAMENTO = new RegExp(`</((?:${NOME_XML}:)?${NOME_XML})\\s*>`, 'y');
// eslint-disable-next-line no-control-regex
const RE_CONTROLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/;
const RE_E_COMERCIAL = /&(?:(?:amp|lt|gt|quot|apos);|#([0-9]{1,7});|#x([0-9A-Fa-f]{1,6});)?/g;
function soEspacos(xml, de, ate) {
  for (let k = de; k < ate; k++) {
    const c = xml.charCodeAt(k);
    if (c !== 32 && c !== 9 && c !== 10 && c !== 13) return false;
  }
  return true;
}

/**
 * Confere a boa formação de um XML numa passada só (custo linear): marcas
 * balanceadas, um elemento raiz, atributos com aspas e sem repetição, prefixos
 * de namespace declarados, `&` só em referência válida, nenhum caractere de
 * controle e nenhum DOCTYPE. Devolve `{ problema, texto, prologo, original }`:
 * `problema` é null quando está bem formado; `texto` é a forma canônica (ver o
 * topo do arquivo), sem a declaração `<?xml …?>`, que fica em `prologo`;
 * `original` é o XML como veio, só sem a declaração.
 */
function analisarXml(bruto) {
  const xml = bruto.charCodeAt(0) === 0xfeff ? bruto.slice(1) : bruto;
  let pos = 0;
  const falha = (problema, onde = pos) => ({ problema: `${problema} (posição ${onde})`, texto: null, prologo: '', original: null });
  if (RE_CONTROLE.test(xml)) return falha('caractere de controle', xml.search(RE_CONTROLE));
  const abertos = []; // [nome, prefixos declarados no elemento | null, onde a marca de abertura acabou]
  const ativos = new Map(); // prefixo → quantas declarações estão valendo
  const ajustes = []; // [de, até, texto no lugar], em ordem
  const literais = []; // [de, até] onde `&` é texto comum (comentário, CDATA, instrução)
  let prologo = '';
  let raizes = 0;
  while (pos < xml.length) {
    const i = xml.indexOf('<', pos);
    const ate = i < 0 ? xml.length : i;
    if (!abertos.length && ate > pos && !soEspacos(xml, pos, ate)) return falha('texto fora do elemento raiz');
    if (i < 0) break;
    const c = xml.charCodeAt(i + 1);
    if (c === 33) { // <!
      if (xml.startsWith('<!--', i)) {
        const fim = xml.indexOf('-->', i + 4);
        if (fim < 0) return falha('comentário sem fim', i);
        ajustes.push([i, fim + 3, '']);
        literais.push([i, fim + 3]);
        pos = fim + 3;
      } else if (abertos.length && xml.startsWith('<![CDATA[', i)) {
        const fim = xml.indexOf(']]>', i + 9);
        if (fim < 0) return falha('CDATA sem fim', i);
        ajustes.push([i, fim + 3, escaparTexto(xml.slice(i + 9, fim))]);
        literais.push([i, fim + 3]);
        pos = fim + 3;
      } else {
        return falha('DOCTYPE (ou outra declaração) não é aceito', i);
      }
    } else if (c === 63) { // <?
      const fim = xml.indexOf('?>', i + 2);
      if (fim < 0) return falha('instrução sem fim', i);
      const instrucao = xml.slice(i, fim + 2);
      RE_ALVO_DA_INSTRUCAO.lastIndex = 0;
      const alvo = RE_ALVO_DA_INSTRUCAO.exec(instrucao)?.[1];
      if (!alvo) return falha('instrução mal formada', i);
      if (/^xml$/i.test(alvo)) {
        const declaracao = RE_DECLARACAO.exec(instrucao);
        if (i !== 0 || !declaracao) return falha('declaração XML fora do início ou mal formada', i);
        if (declaracao[3] && !/^utf-?8$/i.test(declaracao[3])) return falha(`codificação não aceita: ${declaracao[3]}`, i);
        prologo = instrucao;
      }
      ajustes.push([i, fim + 2, '']);
      literais.push([i, fim + 2]);
      pos = fim + 2;
    } else if (c === 47) { // </
      RE_FECHAMENTO.lastIndex = i;
      const m = RE_FECHAMENTO.exec(xml);
      const aberto = abertos.pop();
      if (!m || !aberto || aberto[0] !== m[1]) return falha('fechamento sem a abertura correspondente', i);
      if (aberto[1]) for (const p of aberto[1]) ativos.set(p, ativos.get(p) - 1);
      if (aberto[2] === i) ajustes.push([i - 1, RE_FECHAMENTO.lastIndex, '/>']); // <x></x> → <x/>
      else if (RE_FECHAMENTO.lastIndex - i !== m[1].length + 3) ajustes.push([i, RE_FECHAMENTO.lastIndex, `</${m[1]}>`]); // </x > → </x>
      pos = RE_FECHAMENTO.lastIndex;
    } else {
      RE_ABERTURA.lastIndex = i;
      const m = RE_ABERTURA.exec(xml);
      if (!m) return falha('marca inválida', i);
      if (!abertos.length && raizes++) return falha('mais de um elemento raiz', i);
      const usados = m[1] ? [m[1]] : [];
      let declarados = null;
      let primeiro = null;
      let vistos = null;
      let k = RE_ABERTURA.lastIndex;
      for (;;) {
        RE_ATRIBUTO.lastIndex = k;
        const a = RE_ATRIBUTO.exec(xml);
        if (!a) break;
        const nome = a[2] ? `${a[2]}:${a[3]}` : a[3];
        if (primeiro === null) primeiro = nome;
        else {
          if (!vistos) vistos = new Set([primeiro]);
          if (vistos.has(nome)) return falha('atributo repetido', k);
          vistos.add(nome);
        }
        if (a[2] === 'xmlns') {
          (declarados ||= []).push(a[3]);
          ativos.set(a[3], (ativos.get(a[3]) || 0) + 1);
        } else if (a[2] && a[2] !== 'xml') usados.push(a[2]);
        const simples = a[6] !== undefined;
        const valor = simples ? a[6] : a[5];
        if (simples || a[4] !== '=' || valor.includes('>')) {
          ajustes.push([k + a[1].length + nome.length, RE_ATRIBUTO.lastIndex, `="${(simples ? valor.replace(/"/g, '&quot;') : valor).replace(/>/g, '&gt;')}"`]);
        }
        k = RE_ATRIBUTO.lastIndex;
      }
      RE_FIM_DA_MARCA.lastIndex = k;
      const f = RE_FIM_DA_MARCA.exec(xml);
      if (!f) return falha('marca mal formada', k);
      for (const p of usados) if (!(ativos.get(p) > 0)) return falha(`prefixo sem declaração: ${p}`, i);
      if (f[1]) {
        if (declarados) for (const p of declarados) ativos.set(p, ativos.get(p) - 1);
      } else {
        abertos.push([m[0].slice(1), declarados, RE_FIM_DA_MARCA.lastIndex]);
      }
      pos = RE_FIM_DA_MARCA.lastIndex;
    }
  }
  if (abertos.length) return falha('elemento sem fechamento', xml.length);
  if (raizes !== 1) return falha('sem elemento raiz', 0);
  if (xml.includes('&')) {
    let k = 0;
    RE_E_COMERCIAL.lastIndex = 0;
    for (let m; (m = RE_E_COMERCIAL.exec(xml));) {
      while (k < literais.length && literais[k][1] <= m.index) k += 1;
      if (k < literais.length && literais[k][0] <= m.index) continue;
      if (m[0] === '&') return falha('`&` fora de referência', m.index);
      const codigo = m[1] ? Number(m[1]) : m[2] ? parseInt(m[2], 16) : null;
      if (codigo !== null && !caractereValido(codigo)) return falha('referência a caractere inválido', m.index);
    }
  }
  const original = xml.slice(prologo.length);
  if (!ajustes.length) return { problema: null, texto: xml, prologo, original };
  const pedacos = [];
  let de = 0;
  for (const [inicio, fim, novo] of ajustes) {
    pedacos.push(xml.slice(de, inicio), novo);
    de = fim;
  }
  pedacos.push(xml.slice(de));
  return { problema: null, texto: pedacos.join(''), prologo, original };
}

/** O problema de boa formação de um XML, em uma frase; null quando está bem formado. */
export function problemaDoXml(xml) {
  return analisarXml(String(xml ?? '')).problema;
}

// ---------------------------------------------------------------------------
// XML, só o que o transplante precisa: leitura e troca cirúrgicas sobre a forma
// canônica, sem reescrever o resto. Busca de elemento é varredura linear
// (`indexOf`), nunca `[\s\S]*?` repetido.
// ---------------------------------------------------------------------------
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_DE_RELACOES = 'http://schemas.openxmlformats.org/package/2006/relationships';
const NS_DE_TIPOS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const TIPO_DE_CONTEUDO = Object.freeze({
  header: 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml',
  footer: 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml',
  theme: 'application/vnd.openxmlformats-officedocument.theme+xml',
});
const TIPO_POR_EXTENSAO = Object.freeze({
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
  emf: 'image/x-emf', wmf: 'image/x-wmf', svg: 'image/svg+xml',
});
/** Valor de um atributo numa tag (aspas duplas ou simples); null quando não há. */
function atributo(tag, nome) {
  const m = new RegExp(`(?:^|\\s)${nome}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(tag);
  return m ? desescapar(m[1] ?? m[2]) : null;
}
const semAtributo = (tag, nome) => tag.replace(new RegExp(`\\s${nome}\\s*=\\s*(?:"[^"]*"|'[^']*')`), '');

/** Onde começa o próximo elemento `nome` (a marca `<nome` seguida de espaço, `/` ou `>`), a partir de `de`; -1 se não há. */
function proximoElemento(xml, nome, de = 0) {
  const abre = `<${nome}`;
  for (let i = xml.indexOf(abre, de); i >= 0; i = xml.indexOf(abre, i + abre.length)) {
    const c = xml.charCodeAt(i + abre.length);
    if (c === 62 || c === 47 || c === 32 || c === 9 || c === 10 || c === 13) return i;
  }
  return -1;
}
/** O elemento `nome` começa exatamente em `pos`? (Sem busca: custo constante.) */
function comecaEm(xml, nome, pos) {
  if (!xml.startsWith(`<${nome}`, pos)) return false;
  const c = xml.charCodeAt(pos + nome.length + 1);
  return c === 62 || c === 47 || c === 32 || c === 9 || c === 10 || c === 13;
}
/** Os elementos `nome` do XML, na ordem: `[{ inicio, fim }]`. Vale para elemento que não se aninha em si mesmo. */
function elementos(xml, nome) {
  const lista = [];
  const fecha = `</${nome}>`;
  for (let i = proximoElemento(xml, nome); i >= 0;) {
    const marca = xml.indexOf('>', i);
    if (marca < 0) break;
    let fim = marca + 1;
    if (xml.charCodeAt(marca - 1) !== 47) {
      const f = xml.indexOf(fecha, marca);
      if (f < 0) break;
      fim = f + fecha.length;
    }
    lista.push({ inicio: i, fim });
    i = proximoElemento(xml, nome, fim);
  }
  return lista;
}
/** O XML sem os trechos `[{ inicio, fim }]` (em ordem). */
function semTrechos(xml, trechos) {
  if (!trechos.length) return xml;
  const pedacos = [];
  let de = 0;
  for (const t of trechos) {
    pedacos.push(xml.slice(de, t.inicio));
    de = t.fim;
  }
  pedacos.push(xml.slice(de));
  return pedacos.join('');
}
const semElementos = (xml, nome) => (xml.includes(`<${nome}`) ? semTrechos(xml, elementos(xml, nome)) : xml);
/** A marca de abertura do primeiro elemento `nome` (`<nome …>` ou `<nome …/>`); '' quando não há. */
function marcaDe(xml, nome) {
  const i = proximoElemento(xml, nome);
  return i < 0 ? '' : xml.slice(i, xml.indexOf('>', i) + 1);
}
/** O primeiro elemento `nome`, inteiro; '' quando não há. */
function primeiroElemento(xml, nome) {
  const [e] = elementos(xml, nome);
  return e ? xml.slice(e.inicio, e.fim) : '';
}
/** O que vai dentro de um elemento (sem a marca de abertura nem a de fechamento). */
function miolo(elemento) {
  const marca = elemento.indexOf('>');
  return marca < 0 || elemento.charCodeAt(marca - 1) === 47 ? '' : elemento.slice(marca + 1, elemento.lastIndexOf('</'));
}
/** Os filhos diretos de um trecho de XML bem formado: `[{ nome, xml }]`. */
function filhos(xml) {
  const lista = [];
  let inicio = -1;
  let nome = '';
  let nivel = 0;
  for (let i = xml.indexOf('<'); i >= 0;) {
    const marca = xml.indexOf('>', i);
    if (marca < 0) break;
    const fecha = xml.charCodeAt(i + 1) === 47;
    if (!fecha && nivel === 0) {
      inicio = i;
      nome = /^<([^\s/>]+)/.exec(xml.slice(i, Math.min(marca + 1, i + 256)))?.[1] || '';
    }
    if (fecha) nivel -= 1;
    else if (xml.charCodeAt(marca - 1) !== 47) nivel += 1;
    if (nivel <= 0 && inicio >= 0) {
      lista.push({ nome, xml: xml.slice(inicio, marca + 1) });
      inicio = -1;
      nivel = 0;
    }
    i = xml.indexOf('<', marca + 1);
  }
  return lista;
}
/** Elemento liga/desliga do Word (`<w:titlePg/>`, `<w:evenAndOddHeaders w:val="0"/>`): está ligado? */
function ligado(xml, nome) {
  const marca = marcaDe(xml, nome);
  return !!marca && !['0', 'false', 'off'].includes(atributo(marca, 'w:val') ?? '');
}

const RE_PPR_VAZIO = /\s*<w:pPr\s*\/>/y;
const RE_PPR_ABERTO = /\s*<w:pPr(?:\s[^>]*)?>/y;
/**
 * Todos os elementos `nome`, inclusive os aninhados neles mesmos, em ordem de
 * início: `[{ inicio, abre, fim, vazio, nivel }]` (`abre` = onde acaba a marca
 * de abertura; `nivel` = quantos elementos `nome` estão abertos em volta).
 * Uma passada só, com dois cursores (aberturas e fechamentos).
 */
function elementosAninhados(xml, nome) {
  const lista = [];
  const abertos = [];
  const fecha = `</${nome}>`;
  let a = proximoElemento(xml, nome);
  let f = xml.indexOf(fecha);
  while (a >= 0 || f >= 0) {
    if (a >= 0 && (f < 0 || a < f)) {
      const marca = xml.indexOf('>', a);
      if (marca < 0) break;
      const vazio = xml.charCodeAt(marca - 1) === 47;
      const e = { inicio: a, abre: marca + 1, fim: vazio ? marca + 1 : -1, vazio, nivel: abertos.length };
      lista.push(e);
      if (!vazio) abertos.push(e);
      a = proximoElemento(xml, nome, marca + 1);
    } else {
      const e = abertos.pop();
      if (e) e.fim = f + fecha.length;
      f = xml.indexOf(fecha, f + fecha.length);
    }
  }
  return lista.filter((e) => e.fim >= 0);
}
/** O XML com as trocas `[de, até, texto]` aplicadas (em qualquer ordem, sem sobreposição). */
function comTrocas(xml, trocas) {
  if (!trocas.length) return xml;
  const pedacos = [];
  let de = 0;
  for (const [inicio, fim, texto] of [...trocas].sort((x, y) => x[0] - y[0])) {
    pedacos.push(xml.slice(de, inicio), texto);
    de = fim;
  }
  pedacos.push(xml.slice(de));
  return pedacos.join('');
}

// ---------------------------------------------------------------------------
// Alterações controladas do papel: ACEITAS na leitura
// ---------------------------------------------------------------------------
// O Word, na exibição padrão, esconde do advogado as marcas de «Controlar
// alterações» do próprio papel; o PDF do pacote (feito pelo LibreOffice) as
// mostraria em toda página: o endereço antigo riscado, o novo sublinhado. Vale
// o papel como ele está hoje, isto é, com todas as alterações aceitas.
//
// A versão ANTERIOR de uma propriedade, que aninha um elemento igual ao pai (`sectPr` dentro de `sectPr`…):
const VERSOES_ANTERIORES = ['w:sectPrChange', 'w:pPrChange', 'w:rPrChange', 'w:tblPrChange', 'w:tblPrExChange', 'w:tcPrChange', 'w:trPrChange', 'w:tblGridChange', 'w:numberingChange'];
const RE_TEM_REVISAO = /<w:(?:ins|del|moveFrom|moveTo|delText|delInstrText|cellIns|cellDel|cellMerge|customXml(?:Ins|Del|Move)[A-Za-z]*|move(?:From|To)Range[A-Za-z]*|[A-Za-z]+Change)[\s/>]/;
// O invólucro do que foi inserido (ou movido para cá), com ou sem conteúdo: sai, o conteúdo fica.
const RE_INVOLUCRO_DE_INSERCAO = /<\/?w:(?:ins|moveTo)(?:[\s/][^>]*)?>/g;
// As marcas vazias que sobram: parágrafo ou linha de tabela excluídos, célula alterada, faixas de movimentação.
const RE_MARCA_VAZIA_DE_REVISAO = /<w:(?:del|moveFrom|cellIns|cellDel|cellMerge)(?:\s[^>]*)?\/>/g;
// As faixas de movimentação e de customXml: o Word as grava também ENTRE parágrafos; saem antes de juntar parágrafos.
const RE_FAIXA_DE_REVISAO = /<w:(?:move(?:From|To)Range(?:Start|End)|customXml(?:Ins|Del|MoveFrom|MoveTo)Range(?:Start|End))(?:\s[^>]*)?\/>/g;
// Marcadores vazios que podem ficar entre dois parágrafos sem separá-los (vão para dentro do parágrafo que sobra).
const RE_ENTRE_PARAGRAFOS = /(?:\s*<w:(?:bookmarkStart|bookmarkEnd|proofErr|permStart|permEnd|commentRangeStart|commentRangeEnd)(?:\s[^>]*)?\/>)*\s*/y;
const RE_MARCA_DE_EXCLUSAO = /<w:(?:del|moveFrom)[\s/]/;
const RE_ESPACOS = /\s*/y;
const FIM_DE_PARAGRAFO = '</w:p>';

/**
 * Parágrafo cuja marca de fim foi excluída (`w:del` no `w:rPr` do `w:pPr`)
 * junta-se ao parágrafo seguinte, como no Word: fica a marca (as propriedades)
 * do seguinte, com o conteúdo dos dois. Assim, a linha inteira excluída some
 * em vez de deixar um parágrafo vazio no cabeçalho. Sem parágrafo logo em
 * seguida (fim da célula, tabela depois), o parágrafo fica.
 */
function juntarParagrafos(xml) {
  if (!RE_MARCA_DE_EXCLUSAO.test(xml)) return xml;
  const paragrafos = elementosAninhados(xml, 'w:p');
  const porInicio = new Map(paragrafos.map((p) => [p.inicio, p]));
  for (const p of paragrafos) { // onde começa o conteúdo (depois do `w:pPr`), e se a marca de fim foi excluída
    p.conteudo = p.abre;
    p.excluida = false;
    if (p.vazio) continue;
    RE_PPR_VAZIO.lastIndex = p.abre;
    RE_PPR_ABERTO.lastIndex = p.abre;
    const vazio = RE_PPR_VAZIO.exec(xml);
    const aberto = vazio ? null : RE_PPR_ABERTO.exec(xml);
    if (vazio) p.conteudo = RE_PPR_VAZIO.lastIndex;
    if (!aberto) continue;
    const fim = xml.indexOf('</w:pPr>', p.abre);
    if (fim < 0 || fim > p.fim) continue;
    p.conteudo = fim + '</w:pPr>'.length;
    p.excluida = RE_MARCA_DE_EXCLUSAO.test(xml.slice(p.abre, p.conteudo));
  }
  // O parágrafo irmão logo depois (entre eles, só espaço e marcadores vazios, que ficam guardados em `p.entre`).
  const seguinte = (p) => {
    RE_ENTRE_PARAGRAFOS.lastIndex = p.fim;
    const entre = RE_ENTRE_PARAGRAFOS.exec(xml)[0];
    p.entre = entre.replace(/>\s+</g, '><').trim();
    return porInicio.get(RE_ENTRE_PARAGRAFOS.lastIndex) || null;
  };
  const trocas = [];
  const vistos = new Set();
  for (const primeiro of paragrafos) {
    if (!primeiro.excluida || vistos.has(primeiro)) continue;
    // A cadeia: este e os irmãos seguintes de marca excluída; o alvo é o primeiro cuja marca fica.
    const cadeia = [];
    let alvo = primeiro;
    while (alvo && alvo.excluida) {
      cadeia.push(alvo);
      vistos.add(alvo);
      alvo = seguinte(alvo);
    }
    if (!alvo) alvo = cadeia.pop(); // o último da cadeia não tem com quem juntar: a marca dele fica
    if (!cadeia.length) continue;
    const cabeca = alvo.vazio ? xml.slice(alvo.inicio, alvo.fim).replace(/\s*\/>$/, '>') : xml.slice(alvo.inicio, alvo.conteudo);
    trocas.push([primeiro.inicio, primeiro.conteudo, cabeca]);
    cadeia.forEach((p, i) => {
      const proximo = cadeia[i + 1] || alvo;
      if (proximo.vazio) trocas.push([p.fim - FIM_DE_PARAGRAFO.length, proximo.fim, `${p.entre}${FIM_DE_PARAGRAFO}`]); // o alvo era `<w:p/>`
      else trocas.push([p.fim - FIM_DE_PARAGRAFO.length, proximo.conteudo, p.entre]);
    });
  }
  return comTrocas(xml, trocas);
}

/**
 * O `w:trPr` de uma linha de tabela, lido logo depois da marca de abertura
 * (pulando o `w:tblPrEx`, que vem antes dele no esquema); '' quando não há.
 * Nada de busca que ande pelo resto do documento: cada linha custa o próprio
 * começo.
 */
function propriedadesDaLinha(xml, linha) {
  let pos = linha.abre;
  const pular = () => {
    RE_ESPACOS.lastIndex = pos;
    RE_ESPACOS.exec(xml);
    pos = RE_ESPACOS.lastIndex;
  };
  pular();
  if (comecaEm(xml, 'w:tblPrEx', pos)) {
    const marca = xml.indexOf('>', pos);
    pos = xml.charCodeAt(marca - 1) === 47 ? marca + 1 : xml.indexOf('</w:tblPrEx>', marca) + '</w:tblPrEx>'.length;
    pular();
  }
  if (pos >= linha.fim || !comecaEm(xml, 'w:trPr', pos)) return '';
  const marca = xml.indexOf('>', pos);
  return xml.charCodeAt(marca - 1) === 47 ? xml.slice(pos, marca + 1) : xml.slice(pos, xml.indexOf('</w:trPr>', marca) + '</w:trPr>'.length);
}

/** Linha de tabela excluída (`w:del` no `w:trPr`) sai; tabela que fica sem linha nenhuma sai também. */
function semLinhasExcluidas(xml) {
  if (!xml.includes('<w:trPr>') || !RE_MARCA_DE_EXCLUSAO.test(xml)) return xml;
  const saem = [];
  let ate = 0;
  for (const linha of elementosAninhados(xml, 'w:tr')) {
    if (linha.vazio || linha.inicio < ate || !RE_MARCA_DE_EXCLUSAO.test(propriedadesDaLinha(xml, linha))) continue;
    saem.push(linha);
    ate = linha.fim;
  }
  if (!saem.length) return xml;
  const t = semTrechos(xml, saem);
  // Que tabelas ainda têm linha? Uma passada só: cada linha marca a tabela mais de dentro que está aberta em volta dela.
  const tabelas = elementosAninhados(t, 'w:tbl').filter((e) => !e.vazio);
  const linhas = elementosAninhados(t, 'w:tr');
  const abertas = [];
  let k = 0;
  for (const tabela of tabelas) {
    for (; k < linhas.length && linhas[k].inicio < tabela.inicio; k++) {
      while (abertas.length && abertas[abertas.length - 1].fim <= linhas[k].inicio) abertas.pop();
      if (abertas.length) abertas[abertas.length - 1].temLinha = true;
    }
    while (abertas.length && abertas[abertas.length - 1].fim <= tabela.inicio) abertas.pop();
    abertas.push(tabela);
  }
  for (; k < linhas.length; k++) {
    while (abertas.length && abertas[abertas.length - 1].fim <= linhas[k].inicio) abertas.pop();
    if (abertas.length) abertas[abertas.length - 1].temLinha = true;
  }
  const vazias = [];
  ate = 0;
  for (const tabela of tabelas) {
    if (tabela.temLinha || tabela.inicio < ate) continue;
    vazias.push(tabela);
    ate = tabela.fim;
  }
  return semTrechos(t, vazias);
}

/**
 * O XML (documento, cabeçalho ou rodapé do papel, na forma canônica) com as
 * alterações controladas ACEITAS: sai o que foi excluído ou movido daqui
 * (`w:del`, `w:moveFrom`, com o conteúdo; `w:delText` solto também); fica o
 * que foi inserido ou movido para cá (`w:ins`, `w:moveTo`: sai só o invólucro);
 * parágrafo de marca excluída junta-se ao seguinte; linha de tabela excluída
 * sai; e saem as versões anteriores de propriedades (`w:pPrChange`…) e todas
 * as marcas vazias de revisão. (Célula excluída ou mesclada sob controle fica
 * como está: sai só a marca.)
 */
function semRevisoes(xml) {
  if (!RE_TEM_REVISAO.test(xml)) return xml;
  let t = xml;
  for (const nome of VERSOES_ANTERIORES) t = semElementos(t, nome);
  for (const nome of ['w:del', 'w:moveFrom']) {
    if (t.includes(`<${nome}`)) t = semTrechos(t, elementosAninhados(t, nome).filter((e) => !e.vazio && e.nivel === 0));
  }
  for (const nome of ['w:delText', 'w:delInstrText']) t = semElementos(t, nome);
  t = t.replace(RE_INVOLUCRO_DE_INSERCAO, '');
  t = semLinhasExcluidas(juntarParagrafos(t.replace(RE_FAIXA_DE_REVISAO, '')));
  return t.replace(RE_MARCA_VAZIA_DE_REVISAO, '');
}

/** As relações de um `.rels`: [{ id, tipo, alvo, externo }]. */
function lerRelacoes(xml) {
  return [...String(xml || '').matchAll(/<Relationship\b[^>]*>/g)].map(([tag]) => ({
    id: atributo(tag, 'Id'),
    tipo: atributo(tag, 'Type') || '',
    alvo: atributo(tag, 'Target') || '',
    externo: atributo(tag, 'TargetMode') === 'External',
  }));
}
const relacao = ({ id, tipo, alvo, externo }) => `<Relationship Id="${escapar(id)}" Type="${escapar(tipo)}" Target="${escapar(alvo)}"${externo ? ' TargetMode="External"' : ''}/>`;
const escreverRelacoes = (lista) => `${XML}<Relationships xmlns="${NS_DE_RELACOES}">${lista.map(relacao).join('')}</Relationships>`;
/** Caminho de uma parte dentro do zip, a partir da pasta da parte que a cita (`word/`). */
const caminhoDaParte = (pasta, alvo) => (alvo.startsWith('/') ? posix.normalize(alvo.slice(1)) : posix.normalize(posix.join(pasta, alvo)));
const arquivoDeRelacoes = (parte) => posix.join(posix.dirname(parte), '_rels', `${posix.basename(parte)}.rels`);
const donaDasRelacoes = (arquivo) => posix.join(posix.dirname(posix.dirname(arquivo)), posix.basename(arquivo, '.rels'));
const ehArquivoDeRelacoes = (nome) => /(?:^|\/)_rels\/[^/]+\.rels$/.test(nome);

/** `[Content_Types].xml`: `{ padroes: Map<extensão, tipo>, proprios: Map<'/parte', tipo> }`. */
function lerTipos(xml) {
  const padroes = new Map();
  const proprios = new Map();
  for (const [tag] of String(xml || '').matchAll(/<Default\b[^>]*>/g)) {
    const extensao = atributo(tag, 'Extension');
    if (extensao) padroes.set(extensao.toLowerCase(), atributo(tag, 'ContentType') || '');
  }
  for (const [tag] of String(xml || '').matchAll(/<Override\b[^>]*>/g)) {
    const parte = atributo(tag, 'PartName');
    if (parte) proprios.set(parte, atributo(tag, 'ContentType') || '');
  }
  return { padroes, proprios };
}
// `Default` vem antes de `Override` no esquema.
const escreverTipos = ({ padroes, proprios }) => `${XML}<Types xmlns="${NS_DE_TIPOS}">`
  + `${[...padroes].map(([extensao, tipo]) => `<Default Extension="${escapar(extensao)}" ContentType="${escapar(tipo)}"/>`).join('')}`
  + `${[...proprios].map(([parte, tipo]) => `<Override PartName="${escapar(parte)}" ContentType="${escapar(tipo)}"/>`).join('')}</Types>`;

const RE_REFERENCIA = /<w:(header|footer)Reference\b[^>]*\/>/g;
const ORDEM_DAS_REFERENCIAS = ['header:default', 'header:first', 'header:even', 'footer:default', 'footer:first', 'footer:even'];
// A seção que manda na página: a do timbre das páginas comuns, depois a da primeira página, depois a das pares.
const ORDEM_DE_QUEM_MANDA = ['header:default', 'footer:default', 'header:first', 'footer:first', 'header:even', 'footer:even'];
// Os filhos de `w:sectPr`, na ordem do esquema.
const ORDEM_DA_SECAO = ['w:headerReference', 'w:footerReference', 'w:footnotePr', 'w:endnotePr', 'w:type', 'w:pgSz', 'w:pgMar', 'w:paperSrc', 'w:pgBorders', 'w:lnNumType', 'w:pgNumType', 'w:cols', 'w:formProt', 'w:vAlign', 'w:noEndnote', 'w:titlePg', 'w:textDirection', 'w:bidi', 'w:rtlGutter', 'w:docGrid', 'w:printerSettings', 'w:sectPrChange'];
// O que vem ANTES de `w:evenAndOddHeaders` em `w:settings`, no esquema.
const ANTES_DE_PARES_E_IMPARES = new Set(['writeProtection', 'view', 'zoom', 'removePersonalInformation', 'removeDateAndTime', 'doNotDisplayPageBoundaries', 'displayBackgroundShape', 'printPostScriptOverText', 'printFractionalCharacterWidth', 'printFormsData', 'embedTrueTypeFonts', 'embedSystemFonts', 'saveSubsetFonts', 'saveFormsData', 'mirrorMargins', 'alignBordersAndEdges', 'bordersDoNotSurroundHeader', 'bordersDoNotSurroundFooter', 'gutterAtTop', 'hideSpellingErrors', 'hideGrammaticalErrors', 'activeWritingStyle', 'proofState', 'formsDesign', 'attachedTemplate', 'linkStyles', 'stylePaneFormatFilter', 'stylePaneSortMethod', 'documentType', 'mailMerge', 'revisionView', 'trackRevisions', 'doNotTrackMoves', 'doNotTrackFormatting', 'documentProtection', 'autoFormatOverride', 'styleLockTheme', 'styleLockQFSet', 'defaultTabStop', 'autoHyphenation', 'consecutiveHyphenLimit', 'hyphenationZone', 'doNotHyphenateCaps', 'showEnvelope', 'summaryLength', 'clickAndTypeStyle', 'defaultTableStyle'].map((n) => `w:${n}`));

/** Twips → centímetros, com duas casas. */
const emCm = (twips) => Math.round((Number(twips) / 567) * 100) / 100;
const inteiro = (tag, nome, comSinal = false) => {
  const v = (atributo(tag, nome) ?? '').trim();
  return (comSinal ? /^-?\d+$/ : /^\d+$/).test(v) ? Number(v) : null;
};
/**
 * A página e as margens de um `sectPr`, em twips, como estão no arquivo (null
 * para o que falta ou não é número). Margem do alto ou de baixo NEGATIVA é
 * válida: o sinal diz ao Word que a medida é exata (o cabeçalho não empurra o
 * texto). Margem zero também é válida.
 */
function geometriaDe(sectPr) {
  const tamanho = marcaDe(sectPr, 'w:pgSz');
  const margem = marcaDe(sectPr, 'w:pgMar');
  return {
    largura: inteiro(tamanho, 'w:w') || null, altura: inteiro(tamanho, 'w:h') || null,
    esquerda: inteiro(margem, 'w:left'), direita: inteiro(margem, 'w:right'), superior: inteiro(margem, 'w:top', true), inferior: inteiro(margem, 'w:bottom', true),
  };
}
function larguraDoTexto(g) {
  if (!g.largura || g.esquerda == null || g.direita == null) return null;
  const largura = g.largura - g.esquerda - g.direita;
  return largura > 0 ? largura : null;
}
/** `w:pgSz` do papel, refeito só com o que é dele e é número; '' quando não serve (fica o da peça). */
function tamanhoDaPagina(marca) {
  const largura = inteiro(marca, 'w:w');
  const altura = inteiro(marca, 'w:h');
  if (!largura || !altura) return '';
  const orientacao = atributo(marca, 'w:orient');
  const codigo = inteiro(marca, 'w:code');
  return `<w:pgSz w:w="${largura}" w:h="${altura}"${['portrait', 'landscape'].includes(orientacao) ? ` w:orient="${orientacao}"` : ''}${codigo != null ? ` w:code="${codigo}"` : ''}/>`;
}
/** `w:pgMar` do papel, refeito; o que ele não disser (distância do cabeçalho, do rodapé, medianiz) vem de `reserva`. '' quando não serve. */
function margensDaPagina(marca, reserva) {
  const lados = { top: inteiro(marca, 'w:top', true), right: inteiro(marca, 'w:right'), bottom: inteiro(marca, 'w:bottom', true), left: inteiro(marca, 'w:left') };
  if (Object.values(lados).some((v) => v == null)) return '';
  const resto = {};
  for (const [nome, padrao] of [['header', 708], ['footer', 708], ['gutter', 0]]) resto[nome] = inteiro(marca, `w:${nome}`) ?? inteiro(reserva, `w:${nome}`) ?? padrao;
  return `<w:pgMar ${Object.entries({ ...lados, ...resto }).map(([nome, v]) => `w:${nome}="${v}"`).join(' ')}/>`;
}

// ---------------------------------------------------------------------------
// Tetos: entrada hostil ou quebrada não trava nem estoura a memória
// ---------------------------------------------------------------------------
const MB = 1024 * 1024;
const TETO_POR_PARTE = 50 * MB; // o que uma parte (imagem, XML) pode ter, descomprimida
const TETO_TOTAL = 200 * MB; // o que o papel inteiro pode declarar, e o que o transplante pode ler
const TETO_DO_XML = 20 * MB; // XML que é lido e revirado (documento, estilos, cabeçalho, tema…)

/**
 * O conteúdo de uma entrada do zip, descomprimido aos poucos e só até `teto`
 * bytes: passou disso, para e recusa (`grande-demais`). O tamanho que o zip
 * DECLARA pode mentir; este é o teto que vale.
 */
function lerComTeto(arquivo, teto) {
  return new Promise((resolve, reject) => {
    const pedacos = [];
    let total = 0;
    let acabou = false;
    const fluxo = arquivo.internalStream('nodebuffer');
    const parar = (e) => {
      if (acabou) return;
      acabou = true;
      try { fluxo.pause(); } catch { /* já parou */ }
      reject(e);
    };
    fluxo.on('data', (pedaco) => {
      if (acabou) return;
      total += pedaco.length;
      if (total > teto) parar(erro('grande-demais'));
      else pedacos.push(pedaco);
    }).on('error', (e) => parar(erro('corrompido', String(e?.message || e)))).on('end', () => {
      if (acabou) return;
      acabou = true;
      resolve(Buffer.concat(pedacos, total));
    });
    fluxo.resume();
  });
}

/**
 * Leitor do papel: confere os tamanhos declarados de TODAS as entradas (sem
 * descomprimir nenhuma) e devolve `{ nome(caminho), bytes(nome, teto), xml(nome) }`.
 * `nome` acha a entrada que um alvo de relação quer dizer (o alvo é um URI:
 * pode vir com `%20`, e nome de parte não diferencia maiúsculas); null se não
 * há. Cada leitura tem teto, confere a soma (CRC-32) e conta para o teto
 * total; `xml` devolve a forma canônica (ou lança `corrompido`). Parte que
 * não existe: null.
 */
function abrirLeitor(zip) {
  let semCaixa = null;
  const nome = (caminho) => {
    if (!caminho) return null;
    if (zip.file(caminho)) return caminho;
    let decodificado = caminho;
    try { decodificado = decodeURIComponent(caminho); } catch { /* não era %XX */ }
    if (zip.file(decodificado)) return decodificado;
    semCaixa ||= new Map(Object.keys(zip.files).filter((n) => !zip.files[n].dir).map((n) => [n.toLowerCase(), n]));
    return semCaixa.get(decodificado.toLowerCase()) || null;
  };
  const declarado = (arquivo) => {
    const n = arquivo?._data?.uncompressedSize;
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  let total = 0;
  for (const arquivo of Object.values(zip.files)) {
    if (arquivo.dir) continue;
    total += declarado(arquivo);
    if (declarado(arquivo) > TETO_POR_PARTE || total > TETO_TOTAL) throw erro('grande-demais');
  }
  let lido = 0;
  const textos = new Map();
  async function bytes(entrada, teto = TETO_POR_PARTE) {
    const arquivo = entrada ? zip.file(entrada) : null;
    if (!arquivo) return null;
    if (declarado(arquivo) > teto) throw erro('grande-demais');
    const conteudo = await lerComTeto(arquivo, Math.min(teto, TETO_TOTAL - lido));
    lido += conteudo.length;
    const soma = arquivo._data?.crc32;
    if (Number.isFinite(soma) && (soma >>> 0) !== crc32(conteudo)) throw erro('corrompido', `soma de verificação: ${entrada}`);
    return conteudo;
  }
  async function xml(entrada) {
    if (textos.has(entrada)) return textos.get(entrada);
    const conteudo = await bytes(entrada, TETO_DO_XML);
    let texto = null;
    if (conteudo) {
      const analise = analisarXml(conteudo.toString('utf8'));
      if (analise.problema) throw erro('corrompido', `${entrada}: ${analise.problema}`);
      texto = analise.texto.trim();
    }
    textos.set(entrada, texto);
    return texto;
  }
  return { nome, bytes, xml };
}

// ---------------------------------------------------------------------------
// Ler o papel timbrado
// ---------------------------------------------------------------------------
const RE_TEXTO = /<w:t(?:\s[^>]*)?>[^<]*[^\s<]/;
const RE_DESENHO_OU_CAMPO = /<(?:w:drawing|w:pict|w:object|w:sym|w:fldSimple|w:instrText|m:oMath)[\s/>]/;
const RE_BORDA = /<w:(?:top|left|bottom|right|insideH|insideV|between|bar)\s[^>]*w:val="(?!nil"|none")[^"]+"/;
const RE_FUNDO = /<w:shd\s[^>]*(?:w:fill="(?!auto"|FFFFFF"|ffffff")[^"]+"|w:themeFill=)/;
const temTraco = (xml) => RE_BORDA.test(xml) || RE_FUNDO.test(xml);
/** Um cabeçalho ou rodapé tem alguma coisa para mostrar (texto, desenho, imagem, campo, traço ou fundo)? */
const temConteudo = (xml) => RE_TEXTO.test(xml) || RE_DESENHO_OU_CAMPO.test(xml) || temTraco(xml);

/** Os estilos de `styles.xml`: Map<id, { corpo, tipo, padrao, basedOn }> (o primeiro de cada id). */
function lerEstilos(xml) {
  const estilos = new Map();
  for (const e of elementos(xml, 'w:style')) {
    const bloco = xml.slice(e.inicio, e.fim);
    const abertura = bloco.slice(0, bloco.indexOf('>') + 1);
    const id = atributo(abertura, 'w:styleId');
    if (!id || estilos.has(id)) continue;
    const corpo = miolo(bloco);
    estilos.set(id, {
      corpo,
      tipo: atributo(abertura, 'w:type') || 'paragraph',
      padrao: ['1', 'true', 'on'].includes(atributo(abertura, 'w:default') || ''),
      basedOn: atributo(marcaDe(corpo, 'w:basedOn'), 'w:val'),
    });
  }
  return estilos;
}
/**
 * Devolve a função que diz se uma parte mostra traço ou fundo que vem dos
 * ESTILOS do papel: do estilo de parágrafo ou de tabela que ela usa (com a
 * cadeia `basedOn`), do estilo padrão (para parágrafo ou tabela sem estilo)
 * ou dos padrões do documento.
 */
function tracoPorEstilo(estilosXml) {
  const estilos = lerEstilos(estilosXml);
  const memoria = new Map();
  // Cada estilo da cadeia `basedOn` percorrida fica com a resposta (todos herdam o mesmo traço, ou a falta dele):
  // uma cadeia longa é andada uma vez só, e não uma vez por estilo que a usa.
  const tem = (id) => {
    const caminho = [];
    const noCaminho = new Set();
    let achou = false;
    for (let atual = id; atual != null;) {
      if (memoria.has(atual)) {
        achou = memoria.get(atual);
        break;
      }
      const e = estilos.get(atual);
      if (!e || noCaminho.has(atual)) break; // estilo que não existe, ou cadeia em círculo
      caminho.push(atual);
      noCaminho.add(atual);
      if (temTraco(e.corpo)) {
        achou = true;
        break;
      }
      atual = e.basedOn;
    }
    for (const visitado of caminho) memoria.set(visitado, achou);
    return achou;
  };
  const padrao = (tipo) => [...estilos].find(([, e]) => e.padrao && e.tipo === tipo)?.[0];
  const deParagrafo = temTraco(primeiroElemento(estilosXml, 'w:docDefaults')) || (padrao('paragraph') !== undefined && tem(padrao('paragraph')));
  const deTabela = padrao('table') !== undefined && tem(padrao('table'));
  return (xml) => {
    if ((deParagrafo && proximoElemento(xml, 'w:p') >= 0) || (deTabela && proximoElemento(xml, 'w:tbl') >= 0)) return true;
    for (const m of xml.matchAll(RE_USO_DE_ESTILO)) if (m[1] !== 'rStyle' && tem(desescapar(m[2]))) return true;
    return false;
  };
}

const RE_IMAGEM = /<(a:blip|v:imagedata)\s[^>]*>/g;
/**
 * A parte tem imagem que não sairia no documento? `'fora'`: vinculada a um
 * arquivo de fora (do computador ou da internet), sem cópia embutida, ou
 * «embutida» apontando para fora; `'vinculada'`: só vinculada, mesmo que a uma
 * parte de dentro do arquivo (o LibreOffice, que faz o PDF, não desenha imagem
 * só vinculada; regravar o vínculo como imagem embutida seria adivinhar);
 * null quando toda imagem está inserida. Inserida E vinculada serve.
 */
function temImagemDeFora(xml, relacoes = new Map()) {
  const deFora = (id) => relacoes.get(id)?.externo === true;
  for (const [marca, qual] of xml.matchAll(RE_IMAGEM)) {
    // A imagem guardada (`r:embed`; em VML, `r:id`/`o:relid`) e a vinculada (`r:link`; em VML, `r:href` ou o endereço em `o:href`).
    const guardadas = (qual === 'a:blip' ? [atributo(marca, 'r:embed')] : [atributo(marca, 'r:id'), atributo(marca, 'o:relid')]).filter((v) => v != null);
    const vinculada = qual === 'a:blip' ? atributo(marca, 'r:link') : atributo(marca, 'r:href');
    const endereco = qual === 'a:blip' ? null : atributo(marca, 'o:href');
    const guardada = guardadas.find(Boolean);
    if (guardada) {
      if (deFora(guardada)) return 'fora'; // `r:embed` que aponta para relação de fora (TargetMode="External")
      continue;
    }
    if (vinculada && relacoes.has(vinculada) && !deFora(vinculada)) return 'vinculada'; // só vinculada, a uma parte de dentro
    if (vinculada != null || endereco != null || guardadas.length) return 'fora';
  }
  return null;
}

const CORES_DO_TEMA = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
/**
 * As cores do tema (`{ accent1: '7A1C2E', … }`) e a fonte latina dos títulos e
 * do texto. `completo`: tem os três esquemas (cores, fontes, formatos); tema
 * pela metade não é levado para a peça.
 */
function lerTema(xml) {
  const tema = { major: null, minor: null, cores: {}, completo: false };
  if (!xml) return tema;
  tema.completo = ['a:clrScheme', 'a:fontScheme', 'a:fmtScheme'].every((nome) => proximoElemento(xml, nome) >= 0);
  for (const qual of ['major', 'minor']) tema[qual] = atributo(marcaDe(primeiroElemento(xml, `a:${qual}Font`), 'a:latin'), 'typeface') || null;
  const esquema = primeiroElemento(xml, 'a:clrScheme');
  for (const nome of CORES_DO_TEMA) {
    const cor = primeiroElemento(esquema, `a:${nome}`);
    const valor = atributo(marcaDe(cor, 'a:srgbClr'), 'val') || atributo(marcaDe(cor, 'a:sysClr'), 'lastClr');
    if (valor && /^[0-9A-Fa-f]{6}$/.test(valor)) tema.cores[nome] = valor.toUpperCase();
  }
  return tema;
}

/**
 * Abre o papel timbrado e acha o que será transplantado. Lança `ErroDoPapel`
 * quando o arquivo não serve. Devolve
 * `{ zip, sectPr, referencias: [{ tag, tipo, parte }], estilos, tema, paresEImpares, titlePg, geometria }`
 * (`sectPr` é o da seção de onde o timbre veio; `tema` = `{ major, minor, cores, completo, parte }`).
 *
 * Com várias seções, vale para cada tipo (cabeçalho ou rodapé; comum, de
 * primeira página, de páginas pares) a última referência que TEM conteúdo;
 * seção sem referência herda a da anterior, como no Word. Só vêm as que
 * valem: a de primeira página, se houver «primeira página diferente»; a de
 * páginas pares, se o papel liga pares e ímpares. Se o que aparece na
 * primeira página está vazio, o papel é recusado (`sem-cabecalho`).
 */
export async function lerPapel(JSZip, buf) {
  const tipo = tipoDoArquivo(buf);
  if (tipo === 'ole') throw erro('doc-antigo-ou-senha');
  if (tipo !== 'zip') throw erro('nao-e-word');
  let zip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch (e) {
    throw erro('corrompido', String(e?.message || e));
  }
  const leitor = abrirLeitor(zip);

  // O documento principal é o que `_rels/.rels` diz (relação `officeDocument`); `word/document.xml` é só o costume.
  const daRaiz = lerRelacoes(await leitor.xml('_rels/.rels')).find((r) => !r.externo && r.tipo.endsWith('/officeDocument'));
  const principal = leitor.nome(daRaiz && caminhoDaParte('', daRaiz.alvo)) || leitor.nome('word/document.xml');
  if (!principal) throw erro('nao-e-word');
  const lido = await leitor.xml(principal);
  if (lido.includes('purl.oclc.org/ooxml')) throw erro('formato-estrito');
  if (proximoElemento(lido, 'w:document') < 0) throw erro('nao-e-word');
  const documento = semRevisoes(lido);
  const todas = elementos(documento, 'w:sectPr').map((e) => documento.slice(e.inicio, e.fim));
  if (!todas.length) throw erro('sem-cabecalho');

  const pasta = posix.dirname(principal);
  const relacoes = new Map(lerRelacoes(await leitor.xml(arquivoDeRelacoes(principal))).map((r) => [r.id, r]));
  const parteDoTipo = (sufixo, costume) => {
    const rel = [...relacoes.values()].find((r) => !r.externo && r.tipo.endsWith(sufixo));
    return leitor.nome(rel && caminhoDaParte(pasta, rel.alvo)) || leitor.nome(costume && posix.join(pasta, costume));
  };
  const paresEImpares = ligado((await leitor.xml(parteDoTipo('/settings', 'settings.xml') || '')) || '', 'w:evenAndOddHeaders');
  const estilos = (await leitor.xml(parteDoTipo('/styles', 'styles.xml') || '')) || '';
  const temTracoDeEstilo = tracoPorEstilo(estilos);

  // Para cada tipo, a última referência com conteúdo (na falta, a última).
  const xmlDasPartes = new Map();
  const escolhidas = new Map();
  for (const [secao, xml] of todas.entries()) {
    for (const [tag, qual] of xml.matchAll(RE_REFERENCIA)) {
      const rel = relacoes.get(atributo(tag, 'r:id'));
      const qualTipo = atributo(tag, 'w:type') || 'default';
      // Só vale referência a uma parte que É cabeçalho (ou rodapé): pela relação e pelo elemento raiz.
      if (!rel || rel.externo || !rel.tipo.endsWith(`/${qual}`) || !['default', 'first', 'even'].includes(qualTipo)) continue;
      const parte = leitor.nome(caminhoDaParte(pasta, rel.alvo));
      if (!parte || parte === principal) continue;
      if (!xmlDasPartes.has(parte)) xmlDasPartes.set(parte, semRevisoes(await leitor.xml(parte)));
      if (!marcaDe(xmlDasPartes.get(parte), qual === 'header' ? 'w:hdr' : 'w:ftr')) continue;
      const vazia = !temConteudo(xmlDasPartes.get(parte)) && !temTracoDeEstilo(xmlDasPartes.get(parte));
      const atual = escolhidas.get(`${qual}:${qualTipo}`);
      if (!atual || !vazia || atual.vazia) escolhidas.set(`${qual}:${qualTipo}`, { tag: qual, tipo: qualTipo, parte, secao, vazia });
    }
  }
  if (!escolhidas.size) throw erro('sem-cabecalho');

  // A página e as margens acompanham a seção de onde o timbre veio.
  const comPrimeira = todas.map((xml) => ligado(xml, 'w:titlePg'));
  const quemManda = ORDEM_DE_QUEM_MANDA.map((chave) => escolhidas.get(chave)).find((r) => r && !r.vazia)?.secao ?? todas.length - 1;
  const titlePg = comPrimeira[quemManda] || [...escolhidas.values()].some((r) => r.tipo === 'first' && comPrimeira[r.secao]);
  const valem = [...escolhidas.values()].filter((r) => r.tipo === 'default' || (r.tipo === 'first' && titlePg) || (r.tipo === 'even' && paresEImpares))
    .sort((a, b) => ORDEM_DAS_REFERENCIAS.indexOf(`${a.tag}:${a.tipo}`) - ORDEM_DAS_REFERENCIAS.indexOf(`${b.tag}:${b.tipo}`));
  // Cabeçalho vazio não é papel timbrado: o que aparece na primeira página tem de ter alguma coisa.
  if (!valem.some((r) => r.tipo === (titlePg ? 'first' : 'default') && !r.vazia)) {
    throw new ErroDoPapel('sem-cabecalho', titlePg && valem.some((r) => !r.vazia) ? MENSAGEM_DA_PRIMEIRA_PAGINA_VAZIA : MENSAGEM_DO_CABECALHO_VAZIO);
  }
  // Imagem só vinculada (sem cópia dentro do arquivo) sumiria da peça em outra máquina: o papel não serve assim.
  for (const r of valem) {
    const relacoesDaParte = new Map(lerRelacoes(await leitor.xml(leitor.nome(arquivoDeRelacoes(r.parte)))).map((x) => [x.id, x]));
    const imagem = temImagemDeFora(xmlDasPartes.get(r.parte), relacoesDaParte);
    if (imagem) throw new ErroDoPapel('corrompido', imagem === 'vinculada' ? MENSAGEM_DA_IMAGEM_SO_VINCULADA : MENSAGEM_DA_IMAGEM_DE_FORA);
  }

  const parteDoTema = parteDoTipo('/theme', null);
  const sectPr = todas[quemManda];
  return {
    zip,
    sectPr,
    referencias: valem.map(({ tag, tipo: qualTipo, parte }) => ({ tag, tipo: qualTipo, parte })),
    estilos,
    tema: { ...lerTema(parteDoTema ? await leitor.xml(parteDoTema) : null), parte: parteDoTema },
    paresEImpares,
    titlePg,
    geometria: geometriaDe(sectPr),
    interno: { leitor, principal, xmlDasPartes, tipos: lerTipos(await leitor.xml(leitor.nome('[Content_Types].xml'))) },
  };
}

// ---------------------------------------------------------------------------
// Estilos: o cabeçalho sai como no papel, e não como o corpo da peça
// ---------------------------------------------------------------------------
const ATRIBUTOS_DE_TEMA = [['w:asciiTheme', 'w:ascii'], ['w:hAnsiTheme', 'w:hAnsi'], ['w:eastAsiaTheme', 'w:eastAsia'], ['w:cstheme', 'w:cs']];
/** `w:asciiTheme="minorHAnsi"` → `w:ascii="Calibri"`: a fonte do cabeçalho não depende do tema. */
function semFontesDeTema(xml, tema) {
  return xml.replace(/<w:rFonts\b[^>]*\/>/g, (tag) => {
    let t = tag;
    for (const [doTema, direto] of ATRIBUTOS_DE_TEMA) {
      const v = atributo(t, doTema);
      if (v == null) continue;
      const fonte = v.startsWith('major') ? tema.major : tema.minor;
      t = semAtributo(t, doTema);
      if (fonte) t = `${semAtributo(t, direto).replace(/\s*\/>$/, '')} ${direto}="${escapar(fonte)}"/>`;
    }
    return t;
  });
}

// Os nomes de cor do WordprocessingML (`w:themeColor`) e do DrawingML (`a:schemeClr`) → os do tema.
const COR_DO_TEMA = Object.freeze({
  dark1: 'dk1', light1: 'lt1', dark2: 'dk2', light2: 'lt2', text1: 'dk1', background1: 'lt1', text2: 'dk2', background2: 'lt2', hyperlink: 'hlink', followedHyperlink: 'folHlink',
  tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2',
});
const corFixa = (cores, nome) => cores[COR_DO_TEMA[nome] || nome] || null;
const RE_COM_COR_DE_TEMA = /<w:[A-Za-z]+(?=\s)[^>]*\sw:theme(?:Color|Fill)="[^>]*>/g;
const RE_ATRIBUTO_DE_COR_DE_TEMA = /\sw:theme(?:Color|Tint|Shade|Fill|FillTint|FillShade)="[^"]*"/g;
/**
 * As cores de tema de um trecho (cabeçalho, estilo, bordas de página) viram
 * valores fixos, para quando a peça tem OUTRO tema. No WordprocessingML, fica
 * o valor já resolvido que o Word grava ao lado (`w:val`, `w:color`, `w:fill`);
 * se ele falta, entra a cor do tema do papel. No DrawingML, `a:schemeClr` vira
 * `a:srgbClr` (os ajustes de dentro, como `a:lumMod`, continuam valendo).
 */
function semCoresDeTema(xml, cores) {
  let t = xml.replace(RE_COM_COR_DE_TEMA, (tag) => {
    let nova = tag;
    for (const [doTema, fixoNaCor, fixo] of [['w:themeColor', 'w:val', 'w:color'], ['w:themeFill', 'w:fill', 'w:fill']]) {
      const nome = atributo(nova, doTema);
      if (nome == null) continue;
      const direto = doTema === 'w:themeColor' && /^<w:color\s/.test(nova) ? fixoNaCor : fixo;
      const cor = corFixa(cores, nome);
      const atual = atributo(nova, direto);
      if (cor && (atual == null || atual === 'auto')) nova = `${semAtributo(nova, direto).replace(/\s*(\/?)>$/, '')} ${direto}="${cor}"${nova.endsWith('/>') ? '/>' : '>'}`;
    }
    nova = nova.replace(RE_ATRIBUTO_DE_COR_DE_TEMA, '');
    // `w:color` exige `w:val`: sem tema nem valor ao lado, fica a cor automática.
    return /^<w:color[\s/>]/.test(nova) && atributo(nova, 'w:val') == null ? nova.replace(/\s*(\/?)>$/, (_, barra) => ` w:val="auto"${barra}>`) : nova;
  });
  if (!t.includes('<a:schemeClr')) return t;
  const pedacos = [];
  let de = 0;
  for (const e of elementos(t, 'a:schemeClr')) {
    const elemento = t.slice(e.inicio, e.fim);
    const cor = corFixa(cores, atributo(elemento.slice(0, elemento.indexOf('>') + 1), 'val') || '');
    if (!cor) continue;
    const vazio = elemento.endsWith('/>') && elemento.indexOf('>') === elemento.length - 1;
    pedacos.push(t.slice(de, e.inicio), vazio ? `<a:srgbClr val="${cor}"/>` : `<a:srgbClr val="${cor}">${miolo(elemento)}</a:srgbClr>`);
    de = e.fim;
  }
  pedacos.push(t.slice(de));
  t = pedacos.join('');
  return t;
}
const RE_USO_DE_TEMA = /\sw:(?:ascii|hAnsi|eastAsia)Theme="|\sw:cstheme="|\sw:theme(?:Color|Fill)="|<a:schemeClr\b|<a:fontRef\b/;

/** As declarações `xmlns:prefixo` de uma marca: Map<prefixo, URI>. */
const declaracoesDe = (marca) => new Map([...marca.matchAll(/\sxmlns:([^\s=]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const RE_PREFIXO_EM_USO = /<\/?([A-Za-z_][\w.-]*):|\s([A-Za-z_][\w.-]*):[\w.-]+="/g;
/** O trecho sem nada do prefixo `p` (elementos e atributos): é o que faz quem não conhece um namespace que pode ser ignorado. */
function semPrefixo(xml, p) {
  const t = xml.replace(new RegExp(`\\s${p}:[\\w.-]+="[^"]*"`, 'g'), '');
  const abre = `<${p}:`;
  const trechos = [];
  for (let i = t.indexOf(abre); i >= 0;) {
    const marca = t.indexOf('>', i);
    if (marca < 0) break;
    let fim = marca + 1;
    if (t.charCodeAt(marca - 1) !== 47) {
      const fecha = `</${/^<([^\s/>]+)/.exec(t.slice(i, marca + 1))[1]}>`;
      const f = t.indexOf(fecha, marca);
      if (f < 0) break;
      fim = f + fecha.length;
    }
    trechos.push({ inicio: i, fim });
    i = t.indexOf(abre, fim);
  }
  return semTrechos(t, trechos);
}

const RE_USO_DE_ESTILO = /<w:(pStyle|rStyle|tblStyle)\s+w:val="([^"]+)"\s*\/>/g;
const ID_BASE = 'PapelBase';
const NOME_DOS_ESTILOS = 'Papel timbrado ';
const SO_IDENTIDADE = /<w:(?:name|aliases|basedOn|next|link|autoRedefine|hidden|uiPriority|semiHidden|unhideWhenUsed|qFormat|locked|personal|personalCompose|personalReply|rsid)\b[^>]*\/>/g;

/** Os estilos que um transplante anterior pôs na peça (`Papel…`, de nome «Papel timbrado …»): `[{ inicio, fim }]`. */
function estilosDoPapelNaPeca(estilos) {
  return elementos(estilos, 'w:style').filter((e) => {
    const bloco = estilos.slice(e.inicio, e.fim);
    return (atributo(bloco.slice(0, bloco.indexOf('>') + 1), 'w:styleId') || '').startsWith('Papel') && (atributo(marcaDe(bloco, 'w:name'), 'w:val') || '').startsWith(NOME_DOS_ESTILOS);
  });
}

/**
 * Os estilos do papel que as partes transplantadas usam (com a cadeia `basedOn`
 * e o estilo de parágrafo padrão), renomeados com o prefixo `Papel`, mais o
 * `PapelBase` com os padrões do documento do papel. `raizDaPeca` é a marca
 * `<w:styles …>` da peça (para os prefixos de namespace) e `idsDaPeca`, os
 * estilos que ela já tem; com `cores`, as cores de tema viram fixas. Devolve
 * `{ xml, mapa: Map<id antigo, id novo>, padrao: id novo do parágrafo sem estilo }`.
 */
function estilosIsolados(papel, partesXml, { raizDaPeca = '', idsDaPeca = [], cores = null } = {}) {
  const doPapel = lerEstilos(papel.estilos);
  const paragrafoPadrao = [...doPapel].find(([, e]) => e.padrao && e.tipo === 'paragraph')?.[0] || null;
  const usados = new Set(paragrafoPadrao ? [paragrafoPadrao] : []);
  for (const xml of partesXml) for (const m of xml.matchAll(RE_USO_DE_ESTILO)) usados.add(desescapar(m[2]));
  for (const id of [...usados]) {
    for (let e = doPapel.get(id); e && e.basedOn && !usados.has(e.basedOn); e = doPapel.get(e.basedOn)) usados.add(e.basedOn);
  }
  // Ids novos: só letras e números, sem repetir (nem entre si nem com os da peça, sem diferenciar maiúsculas).
  const mapa = new Map();
  const tomados = new Set([ID_BASE, ...idsDaPeca].map((id) => id.toLowerCase()));
  for (const id of usados) {
    if (!doPapel.has(id)) continue;
    const limpo = `Papel${id.replace(/[^A-Za-z0-9]/g, '') || 'Estilo'}`;
    let novo = limpo;
    for (let n = 2; tomados.has(novo.toLowerCase()); n++) novo = `${limpo}${n}`;
    tomados.add(novo.toLowerCase());
    mapa.set(id, novo);
  }

  // PapelBase: os padrões do papel por cima de um ponto de partida neutro, para
  // nada dos padrões da peça (justificado, entrelinha 1,5) vazar para o cabeçalho.
  const padroes = primeiroElemento(papel.estilos, 'w:docDefaults');
  const pPr = primeiroElemento(padroes, 'w:pPrDefault');
  const rPr = primeiroElemento(padroes, 'w:rPrDefault');
  const espaco = marcaDe(pPr, 'w:spacing');
  const espacamento = { 'w:before': '0', 'w:after': '0', 'w:line': '240', 'w:lineRule': 'auto' };
  for (const nome of Object.keys(espacamento)) espacamento[nome] = atributo(espaco, nome) ?? espacamento[nome];
  const alinhamento = atributo(marcaDe(pPr, 'w:jc'), 'w:val') || 'left';
  const fontes = semFontesDeTema(marcaDe(rPr, 'w:rFonts'), papel.tema);
  const comFonte = /\sw:(?:ascii|hAnsi)\s*=/.test(fontes) ? fontes : '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/>';
  const tamanho = atributo(marcaDe(rPr, 'w:sz'), 'w:val') || '20'; // sem `sz`, o padrão do Word é 10 pt
  const tamanhoCs = atributo(marcaDe(rPr, 'w:szCs'), 'w:val') || tamanho;
  let xml = `<w:style w:type="paragraph" w:customStyle="1" w:styleId="${ID_BASE}"><w:name w:val="${NOME_DOS_ESTILOS}base"/><w:semiHidden/>`
    + `<w:pPr><w:spacing ${Object.entries(espacamento).map(([k, v]) => `${k}="${escapar(v)}"`).join(' ')}/><w:ind w:left="0" w:right="0" w:firstLine="0"/><w:jc w:val="${escapar(alinhamento)}"/></w:pPr>`
    + `<w:rPr>${comFonte}<w:sz w:val="${escapar(tamanho)}"/><w:szCs w:val="${escapar(tamanhoCs)}"/></w:rPr></w:style>`;

  // Prefixo que o estilo do papel usa e a folha de estilos da peça não declara
  // (igual): se o papel diz que pode ser ignorado, sai; se não, vem declarado.
  const raizDoPapel = marcaDe(papel.estilos, 'w:styles');
  const nsDoPapel = declaracoesDe(raizDoPapel);
  const nsDaPeca = declaracoesDe(raizDaPeca);
  const ignoraveis = new Set((atributo(raizDoPapel, 'mc:Ignorable') || '').split(/\s+/).filter(Boolean));

  for (const [id, novo] of mapa) {
    const e = doPapel.get(id);
    const base = e.basedOn && mapa.has(e.basedOn) ? mapa.get(e.basedOn) : (e.tipo === 'paragraph' ? ID_BASE : null);
    let corpo = semFontesDeTema(semElementos(e.corpo, 'w:numPr').replace(SO_IDENTIDADE, ''), papel.tema);
    if (cores) corpo = semCoresDeTema(corpo, cores);
    let declaracoes = '';
    for (const p of new Set([...corpo.matchAll(RE_PREFIXO_EM_USO)].map((m) => m[1] || m[2]))) {
      if (p === 'w' || p === 'xml' || p === 'xmlns' || !nsDoPapel.has(p) || nsDaPeca.get(p) === nsDoPapel.get(p)) continue;
      if (ignoraveis.has(p)) corpo = semPrefixo(corpo, p);
      else declaracoes += ` xmlns:${p}="${escapar(desescapar(nsDoPapel.get(p)))}"`;
    }
    xml += `<w:style w:type="${escapar(e.tipo)}" w:customStyle="1" w:styleId="${novo}"${declaracoes}><w:name w:val="${NOME_DOS_ESTILOS}${novo.slice('Papel'.length)}"/>`
      + `${base ? `<w:basedOn w:val="${base}"/>` : ''}<w:semiHidden/>${corpo}</w:style>`;
  }
  return { xml, mapa, padrao: (paragrafoPadrao && mapa.get(paragrafoPadrao)) || ID_BASE };
}

const RE_PARAGRAFO_VAZIO = /<w:p(\s[^>]*?)?\/>/g;
const RE_PARAGRAFO = /<w:p(?:\s[^>]*)?>/g;
/**
 * Uma parte de cabeçalho ou rodapé pronta para a peça: os estilos trocados
 * pelos `Papel…` (o que o papel não define não vale: parágrafo cai no padrão
 * do papel, caractere e tabela ficam sem estilo), todo parágrafo com estilo,
 * sem numeração (apontaria para a da peça) e sem fonte de tema; com `cores`,
 * também sem cor de tema.
 */
function vestirParte(xml, { mapa, padrao }, tema, cores = null) {
  let t = semElementos(semFontesDeTema(xml, tema), 'w:numPr').replace(RE_USO_DE_ESTILO, (tudo, qual, id) => {
    const novo = mapa.get(desescapar(id));
    if (novo) return `<w:${qual} w:val="${novo}"/>`;
    return qual === 'pStyle' ? `<w:pStyle w:val="${padrao}"/>` : '';
  });
  if (cores) t = semCoresDeTema(t, cores);
  const estilo = `<w:pStyle w:val="${padrao}"/>`;
  // Parágrafo vazio (`<w:p/>`), depois os abertos (`<w:p>` e `<w:p w:rsidR="…">`; nunca `<w:pPr>`, `<w:pict>`…).
  t = t.replace(RE_PARAGRAFO_VAZIO, (_, atributos = '') => `<w:p${atributos}><w:pPr>${estilo}</w:pPr></w:p>`);
  const pedacos = [];
  let cursor = 0;
  for (const m of t.matchAll(RE_PARAGRAFO)) {
    const depois = m.index + m[0].length;
    pedacos.push(t.slice(cursor, depois));
    cursor = depois;
    RE_PPR_VAZIO.lastIndex = depois;
    const vazio = RE_PPR_VAZIO.exec(t);
    RE_PPR_ABERTO.lastIndex = depois;
    const aberto = vazio ? null : RE_PPR_ABERTO.exec(t);
    if (vazio) {
      pedacos.push(`<w:pPr>${estilo}</w:pPr>`);
      cursor += vazio[0].length;
    } else if (aberto) {
      const fim = t.indexOf('</w:pPr>', depois);
      if (fim < 0 || !t.slice(depois, fim).includes('<w:pStyle')) {
        pedacos.push(`${aberto[0]}${estilo}`);
        cursor += aberto[0].length;
      }
    } else {
      pedacos.push(`<w:pPr>${estilo}</w:pPr>`);
    }
  }
  pedacos.push(t.slice(cursor));
  return pedacos.join('');
}

// ---------------------------------------------------------------------------
// O transplante
// ---------------------------------------------------------------------------
/** Tabelas do corpo com largura fixa: encolhem quando o papel tem menos largura de texto. */
function encolherTabelas(documento, fator) {
  return documento.replace(/<w:(?:tblW|tcW|gridCol)\b[^>]*\/>/g, (tag) => {
    if (/^<w:(?:tblW|tcW)\b/.test(tag) && atributo(tag, 'w:type') !== 'dxa') return tag;
    const w = Number(atributo(tag, 'w:w'));
    return Number.isFinite(w) && w > 0 ? tag.replace(/(\sw:w\s*=\s*)(?:"[^"]*"|'[^']*')/, (_, antes) => `${antes}"${Math.round(w * fator)}"`) : tag;
  });
}

/**
 * O `sectPr` novo da peça: do papel, as referências, o tamanho da página, as
 * margens, as bordas de página e a primeira página diferente; da peça, todo o
 * resto (colunas, grade, numeração de página…), que rege o corpo. Na ordem do
 * esquema. O que o papel não traz de tamanho ou margem fica o da peça.
 * `primeiraPaginaDiferente`: se esta seção leva o `w:titlePg` do papel.
 */
function secaoVestida(daPeca, papel, referencias, cores, primeiraPaginaDiferente = papel.titlePg) {
  const doPapel = new Map();
  for (const f of filhos(miolo(papel.sectPr))) if (!doPapel.has(f.nome)) doPapel.set(f.nome, f.xml);
  const atuais = filhos(miolo(daPeca));
  const tamanho = tamanhoDaPagina(doPapel.get('w:pgSz') || '');
  const margens = margensDaPagina(doPapel.get('w:pgMar') || '', atuais.find((f) => f.nome === 'w:pgMar')?.xml || '');
  // Das bordas de página, só o que é WordprocessingML (borda de arte tem `r:id`, que apontaria para o papel).
  let bordas = (doPapel.get('w:pgBorders') || '').replace(/\s(?!w:)[^\s=/>]+="[^"]*"/g, '');
  if (bordas && cores) bordas = semCoresDeTema(bordas, cores);
  const saem = new Set(['w:headerReference', 'w:footerReference', 'w:pgBorders', 'w:titlePg', ...(tamanho ? ['w:pgSz'] : []), ...(margens ? ['w:pgMar'] : [])]);
  const itens = [
    ...atuais.filter((f) => !saem.has(f.nome)),
    ...referencias,
    ...[['w:pgSz', tamanho], ['w:pgMar', margens], ['w:pgBorders', bordas], ['w:titlePg', primeiraPaginaDiferente ? '<w:titlePg/>' : '']].filter(([, xml]) => xml).map(([nome, xml]) => ({ nome, xml })),
  ];
  const posicao = (nome) => (ORDEM_DA_SECAO.includes(nome) ? ORDEM_DA_SECAO.indexOf(nome) : ORDEM_DA_SECAO.length);
  return `<w:sectPr>${itens.map((item, i) => ({ ...item, i })).sort((a, b) => posicao(a.nome) - posicao(b.nome) || a.i - b.i).map((item) => item.xml).join('')}</w:sectPr>`;
}

/** `w:settings` com pares e ímpares ligado (na posição do esquema) ou desligado (sem o elemento). */
function comParesEImpares(configuracao, ligar) {
  const raiz = marcaDe(configuracao, 'w:settings');
  if (!raiz) return null;
  const inicio = configuracao.indexOf(raiz);
  const dentro = raiz.endsWith('/>') ? [] : filhos(miolo(configuracao.slice(inicio))).filter((f) => f.nome !== 'w:evenAndOddHeaders');
  if (ligar) {
    let onde = 0;
    dentro.forEach((f, i) => { if (ANTES_DE_PARES_E_IMPARES.has(f.nome)) onde = i + 1; });
    dentro.splice(onde, 0, { nome: 'w:evenAndOddHeaders', xml: '<w:evenAndOddHeaders/>' });
  }
  return `${configuracao.slice(0, inicio)}${raiz.replace(/\s*\/?>$/, '>')}${dentro.map((f) => f.xml).join('')}</w:settings>`;
}

// Alvo de relação que não é coisa de cabeçalho: as entranhas do pacote.
const alvoProibido = (caminho, principal) => caminho === principal || caminho === '[Content_Types].xml' || caminho.startsWith('..') || caminho.startsWith('docProps/') || /(?:^|\/)_rels\//.test(caminho);
const TEMA_NA_PECA = 'theme/theme_papel.xml';
const ID_DO_TEMA = 'rIdPapelTema';

const RE_ID_DE_RELACAO = /\s(?:r:(?:id|embed|link|pict|href|dm|lo|qs|cs)|o:relid)="([^"]*)"/g;
/** Os Ids de relação que um XML usa (`r:id`, `r:embed`, `r:link`, `o:relid`…), sem repetição. */
const idsDeRelacao = (xml) => new Set([...xml.matchAll(RE_ID_DE_RELACAO)].map((m) => desescapar(m[1])));

/**
 * A conferência final, sobre o que ESTÁ no pacote (relido do zip): cada parte
 * gravada é XML bem formado; cada relação interna aponta para uma parte que
 * existe, sem `Id` repetido; cada `r:id`/`r:embed`… dos cabeçalhos e rodapés do
 * papel, e do documento, tem relação; cada tipo próprio posto pelo transplante é de uma parte
 * que existe; e a seção final leva às partes do papel. Qualquer falha lança `ErroDoPapel('corrompido')`.
 */
async function conferirSaida(peca, gravadas, referencias, jaPendentes) {
  const falha = (detalhe) => new ErroDoPapel('corrompido', MENSAGEM_DA_CONFERENCIA, detalhe);
  const textos = new Map();
  for (const nome of gravadas) {
    const arquivo = peca.file(nome);
    if (!arquivo) throw falha(`${nome}: a parte não foi gravada`);
    const xml = await arquivo.async('string');
    const problema = analisarXml(xml).problema;
    if (problema) throw falha(`${nome}: ${problema}`);
    textos.set(nome, xml);
  }
  const relacoesDe = new Map();
  for (const [nome, xml] of textos) {
    if (!ehArquivoDeRelacoes(nome)) continue;
    const dona = donaDasRelacoes(nome);
    const ids = new Map();
    const daPeca = nome === 'word/_rels/document.xml.rels'; // aqui, só as relações do papel (`rIdPapel…`) são cobradas
    for (const r of lerRelacoes(xml)) {
      if (!r.id || ids.has(r.id)) throw falha(`${nome}: relação sem Id ou de Id repetido`);
      ids.set(r.id, r);
      if (daPeca && !r.id.startsWith('rIdPapel')) continue;
      if (!r.externo && !peca.file(caminhoDaParte(posix.dirname(dona), r.alvo))) throw falha(`${nome}: ${r.id} aponta para uma parte que não existe`);
    }
    relacoesDe.set(dona, ids);
  }
  for (const [nome, xml] of textos) {
    if (!/^word\/(?:header|footer)_papel\d+\.xml$/.test(nome)) continue;
    const ids = relacoesDe.get(nome) || new Map();
    for (const id of idsDeRelacao(xml)) if (!ids.has(id)) throw falha(`${nome}: usa ${id || 'uma relação vazia'}, que não tem relação`);
  }
  for (const parte of lerTipos(textos.get('[Content_Types].xml')).proprios.keys()) {
    if (/\/(?:papel_|(?:header|footer|theme)_papel)[^/]*$/.test(parte) && !peca.file(parte.replace(/^\//, ''))) throw falha(`tipo de conteúdo de uma parte que não existe: ${parte}`);
  }
  const documento = textos.get('word/document.xml') || '';
  const doDocumento = relacoesDe.get('word/document.xml') || new Map();
  // Do documento, cobra-se o que o transplante deixou sem relação (o que a peça já trazia pendente não é culpa do papel).
  for (const id of idsDeRelacao(documento)) if (!doDocumento.has(id) && !jaPendentes.has(id)) throw falha(`word/document.xml: usa ${id}, que não tem relação`);
  const final = elementos(documento, 'w:sectPr').pop();
  const secao = final ? documento.slice(final.inicio, final.fim) : '';
  for (const { id, alvo } of referencias) {
    if (!secao.includes(`r:id="${id}"`) || doDocumento.get(id)?.alvo !== alvo) throw falha(`a seção final não leva ao papel (${id})`);
  }
}

/**
 * Põe na peça (`bufDaPeca`, um .docx gerado pelo empacotador) o cabeçalho, o
 * rodapé e as margens do papel timbrado (`bufDoPapel`, .docx ou .dotx). O corpo
 * da peça, a assinatura e o autor (`docProps/core.xml`) ficam como estão; o
 * cabeçalho, o rodapé e o papel que a peça tinha (com a mídia e os estilos
 * deles) saem. A entrada não é alterada. Lança `ErroDoPapel` quando o papel não
 * serve, ou quando o que ia sair não passa na conferência final; e `ErroDaPeca`
 * quando é a peça que não abre ou não está inteira. Devolve
 * `{ buffer, resumo: { cabecalhos, rodapes, midias, primeiraPaginaDiferente, paresEImpares, pagina_cm, margens_cm } }`
 * (o resumo descreve a peça como SAIU; margem negativa, que no Word quer dizer
 * «exata», entra pelo valor que vale na página).
 */
export async function transplantar(JSZip, bufDaPeca, bufDoPapel) {
  const papel = await lerPapel(JSZip, bufDoPapel);
  const { leitor, principal, xmlDasPartes, tipos: tiposDoPapel } = papel.interno;
  let peca;
  try {
    peca = await JSZip.loadAsync(bufDaPeca);
  } catch (e) {
    throw new ErroDaPeca(MENSAGEM_DA_PECA, String(e?.message || e));
  }
  // Toda leitura da peça: o zip pode abrir e uma parte não descomprimir; o erro sai em português (ErroDaPeca).
  const textoDaPeca = async (nome) => {
    const arquivo = peca.file(nome);
    if (!arquivo) return null;
    try {
      return await arquivo.async('string');
    } catch (e) {
      throw new ErroDaPeca(MENSAGEM_DA_PECA, `${nome}: ${String(e?.message || e)}`);
    }
  };
  /**
   * Uma parte XML da peça, conferida: `{ prologo, texto }`; null se não há. O texto é o que está na peça, sem
   * passar pela forma canônica: o corpo não é reescrito (a peça é do empacotador, e as trocas aqui tocam só a
   * seção final, as larguras de tabela, os estilos do papel e a configuração). Peça malformada não é culpa do papel.
   */
  const xmlDaPeca = async (nome) => {
    const bruto = await textoDaPeca(nome);
    if (bruto == null) return null;
    const analise = analisarXml(bruto);
    if (analise.problema) throw new ErroDaPeca('o documento gerado tem um defeito de formação e não pôde receber o papel timbrado', `${nome}: ${analise.problema}`);
    return { prologo: analise.prologo, texto: analise.original };
  };
  const gravadas = new Set();
  const gravar = (nome, conteudo) => {
    peca.file(nome, conteudo);
    if (typeof conteudo === 'string') gravadas.add(nome);
  };

  const doc = await xmlDaPeca('word/document.xml');
  const tiposXml = await xmlDaPeca('[Content_Types].xml');
  const relacoesXml = await xmlDaPeca('word/_rels/document.xml.rels');
  if (!doc || !tiposXml || !relacoesXml) throw new ErroDaPeca('o documento gerado não é um documento do Word completo: não há onde pôr o papel timbrado');
  const daPeca = elementos(doc.texto, 'w:sectPr');
  if (!daPeca.length) throw new ErroDaPeca('o documento gerado não tem seção: não há onde pôr o papel timbrado');
  const tipos = lerTipos(tiposXml.texto);
  let relacoes = lerRelacoes(relacoesXml.texto);
  // O que a peça já usa sem ter relação (defeito dela, não do papel): a conferência final não cobra.
  const jaPendentes = new Set([...idsDeRelacao(doc.texto)].filter((id) => !relacoes.some((r) => r.id === id)));
  // Sem `settings.xml` não há onde ligar pares e ímpares: o cabeçalho das páginas pares não valeria, e não vem.
  const semPares = papel.paresEImpares && !peca.file('word/settings.xml');
  const referenciasDoPapel = papel.referencias.filter((r) => !(semPares && r.tipo === 'even'));

  // 1. Sai o cabeçalho e o rodapé que a peça tinha (partes, relações e tipos), o tema de um papel
  //    anterior e tudo o que só eles usavam (a imagem do modelo lateral, a mídia do papel anterior).
  const candidatos = new Set();
  const retirar = async (parte) => {
    const arquivo = arquivoDeRelacoes(parte);
    for (const r of lerRelacoes(await textoDaPeca(arquivo))) if (!r.externo) candidatos.add(caminhoDaParte(posix.dirname(parte), r.alvo));
    peca.remove(parte);
    peca.remove(arquivo);
    tipos.proprios.delete(`/${parte}`);
  };
  const ficam = [];
  for (const r of relacoes) {
    const sai = !r.externo && (/\/(?:header|footer)$/.test(r.tipo) || (r.tipo.endsWith('/theme') && r.alvo === TEMA_NA_PECA));
    if (sai) await retirar(caminhoDaParte('word', r.alvo));
    else ficam.push(r);
  }
  relacoes = ficam;
  gravar('word/_rels/document.xml.rels', escreverRelacoes(relacoes));
  const emUso = async () => {
    const usados = new Set();
    for (const nome of Object.keys(peca.files)) {
      if (!ehArquivoDeRelacoes(nome) || peca.files[nome].dir) continue;
      for (const r of lerRelacoes(await textoDaPeca(nome))) if (!r.externo) usados.add(caminhoDaParte(posix.dirname(donaDasRelacoes(nome)), r.alvo));
    }
    return usados;
  };
  for (const alvo of candidatos) { // o conjunto cresce enquanto é percorrido: o que o órfão usava também é conferido
    if (peca.file(alvo) && !(await emUso()).has(alvo)) await retirar(alvo);
  }

  // 2. Os estilos: saem os de um papel anterior; os do papel novo entram no passo 5.
  const estilosDaPeca = await xmlDaPeca('word/styles.xml');
  const semOsAntigos = estilosDaPeca ? semTrechos(estilosDaPeca.texto, estilosDoPapelNaPeca(estilosDaPeca.texto)) : null;

  // 3. O tema. A peça sem tema (e que não usa tema em lugar nenhum) recebe o do papel: as formas e os
  //    textos do timbre continuam com as cores dele. Se a peça tem tema, as cores do timbre viram fixas.
  //    (As seções e os estilos de um papel anterior não contam: vão ser trocados.)
  const doQueFica = { 'word/document.xml': semTrechos(doc.texto, daPeca), 'word/styles.xml': semOsAntigos || '' };
  let pecaUsaTema = relacoes.some((r) => r.tipo.endsWith('/theme'));
  for (const nome of Object.keys(peca.files)) {
    if (pecaUsaTema || !/^word\/[^/]+\.xml$/.test(nome)) continue;
    pecaUsaTema = RE_USO_DE_TEMA.test(doQueFica[nome] ?? (await textoDaPeca(nome)));
  }
  const levarTema = !!papel.tema.parte && papel.tema.completo && !pecaUsaTema;
  const cores = levarTema ? null : papel.tema.cores;

  // 4. Entram as partes do papel, com nomes que não colidem com nada da peça, e tudo o que elas usam.
  const partes = [...new Set(referenciasDoPapel.map((r) => r.parte))];
  const estilos = estilosIsolados(papel, partes.map((p) => xmlDasPartes.get(p)), {
    raizDaPeca: semOsAntigos ? marcaDe(semOsAntigos, 'w:styles') : '',
    idsDaPeca: semOsAntigos ? elementos(semOsAntigos, 'w:style').map((e) => atributo(semOsAntigos.slice(e.inicio, semOsAntigos.indexOf('>', e.inicio) + 1), 'w:styleId') || '') : [],
    cores,
  });
  const livre = (caminho) => !peca.file(caminho);
  const copiados = new Map(); // arquivo do papel (mídia…) → caminho na peça
  const declararTipo = (destino, origem) => {
    const extensao = posix.extname(destino).slice(1);
    const proprio = tiposDoPapel.proprios.get(`/${origem}`);
    const tipo = proprio || tiposDoPapel.padroes.get(posix.extname(origem).slice(1).toLowerCase()) || TIPO_POR_EXTENSAO[extensao] || 'application/octet-stream';
    if (tipos.padroes.get(extensao) === tipo) return;
    if (!proprio && !tipos.padroes.has(extensao)) tipos.padroes.set(extensao, tipo);
    else tipos.proprios.set(`/${destino}`, tipo);
  };
  /** Copia para a peça um arquivo que uma parte do papel usa (com as relações DELE, e assim por diante); devolve o caminho novo. */
  async function copiar(alvo) {
    const origem = leitor.nome(alvo);
    if (!origem || alvoProibido(origem, principal)) throw erro('corrompido', `alvo de relação que não serve: ${alvo}`);
    if (copiados.has(origem)) return copiados.get(origem);
    const nome = posix.basename(origem);
    const extensao = nome.lastIndexOf('.') > 0 ? nome.slice(nome.lastIndexOf('.') + 1) : '';
    if (extensao && !/^[A-Za-z0-9]{1,8}$/.test(extensao)) throw erro('corrompido', `extensão que não é extensão: ${origem}`);
    const relativa = posix.relative('word', posix.dirname(origem));
    const pasta = !relativa || relativa.startsWith('..') || !/^[A-Za-z0-9_/-]+$/.test(relativa) ? 'media' : relativa;
    let k = copiados.size + 1;
    const destinoCom = (n) => `word/${pasta}/papel_${n}.${(extensao || 'bin').toLowerCase()}`;
    while (!livre(destinoCom(k))) k += 1;
    const destino = destinoCom(k);
    copiados.set(origem, destino);
    const conteudo = await leitor.bytes(origem);
    if (/^(?:xml|rels)$/i.test(extensao)) {
      const problema = analisarXml(conteudo.toString('utf8')).problema;
      if (problema) throw erro('corrompido', `${origem}: ${problema}`);
    }
    peca.file(destino, conteudo);
    declararTipo(destino, origem);
    await copiarRelacoes(origem, destino);
    return destino;
  }
  /** As relações de uma parte do papel, regravadas para a parte nova da peça (os alvos internos são copiados). */
  async function copiarRelacoes(origem, destino) {
    const lista = [];
    for (const r of lerRelacoes(await leitor.xml(leitor.nome(arquivoDeRelacoes(origem))))) {
      if (!r.id) continue;
      if (r.externo) lista.push(r);
      else lista.push({ ...r, alvo: posix.relative(posix.dirname(destino), await copiar(caminhoDaParte(posix.dirname(origem), r.alvo))) });
    }
    if (lista.length) gravar(arquivoDeRelacoes(destino), escreverRelacoes(lista));
  }
  const idsEmUso = new Set(relacoes.map((r) => r.id));
  const idLivre = () => {
    let n = 1;
    while (idsEmUso.has(`rIdPapel${n}`)) n += 1;
    idsEmUso.add(`rIdPapel${n}`);
    return `rIdPapel${n}`;
  };
  const idDaParte = new Map(); // parte do papel → Id da relação na peça
  const conferir = []; // o que a conferência final vai procurar na seção
  for (const parte of partes) {
    const tag = referenciasDoPapel.find((r) => r.parte === parte).tag;
    let n = 1;
    while (!livre(`word/${tag}_papel${n}.xml`)) n += 1;
    const nome = `${tag}_papel${n}.xml`;
    gravar(`word/${nome}`, `${XML}${vestirParte(xmlDasPartes.get(parte), estilos, papel.tema, cores)}`);
    await copiarRelacoes(parte, `word/${nome}`);
    tipos.proprios.set(`/word/${nome}`, TIPO_DE_CONTEUDO[tag]);
    const id = idLivre();
    idDaParte.set(parte, id);
    relacoes.push({ id, tipo: `${NS_REL}/${tag}`, alvo: nome, externo: false });
    conferir.push({ id, alvo: nome });
  }
  const midias = copiados.size;
  if (levarTema) {
    gravar(`word/${TEMA_NA_PECA}`, `${XML}${await leitor.xml(papel.tema.parte)}`);
    await copiarRelacoes(papel.tema.parte, `word/${TEMA_NA_PECA}`);
    tipos.proprios.set(`/word/${TEMA_NA_PECA}`, TIPO_DE_CONTEUDO.theme);
    relacoes.push({ id: ID_DO_TEMA, tipo: `${NS_REL}/theme`, alvo: TEMA_NA_PECA, externo: false });
  }

  // 5. As seções: do papel, só o que é do papel. A peça do empacotador tem uma seção só; se tiver mais, todas
  //    ficam com o papel (as referências antigas saíram com as relações delas), e a «primeira página diferente»
  //    é a da peça: vale na primeira seção. As tabelas do corpo encolhem se o texto ficou mais estreito.
  const referencias = referenciasDoPapel.map((r) => ({ nome: `w:${r.tag}Reference`, xml: `<w:${r.tag}Reference w:type="${r.tipo}" r:id="${idDaParte.get(r.parte)}"/>` }));
  const secoesNovas = daPeca.map((e, i) => secaoVestida(doc.texto.slice(e.inicio, e.fim), papel, referencias, cores, papel.titlePg && i === 0));
  let documento = comTrocas(doc.texto, daPeca.map((e, i) => [e.inicio, e.fim, secoesNovas[i]]));
  const ultima = daPeca[daPeca.length - 1];
  const antes = larguraDoTexto(geometriaDe(doc.texto.slice(ultima.inicio, ultima.fim)));
  const g = geometriaDe(secoesNovas[secoesNovas.length - 1]);
  const agora = larguraDoTexto(g);
  if (antes && agora && agora < antes) documento = encolherTabelas(documento, agora / antes);

  // 6. Páginas pares e ímpares (liga e desliga), e os estilos do papel.
  const configuracao = await xmlDaPeca('word/settings.xml');
  let paresEImpares = configuracao ? ligado(configuracao.texto, 'w:evenAndOddHeaders') : false;
  if (configuracao && paresEImpares !== papel.paresEImpares) {
    const nova = comParesEImpares(configuracao.texto, papel.paresEImpares);
    if (nova) {
      gravar('word/settings.xml', `${configuracao.prologo}${nova}`);
      paresEImpares = papel.paresEImpares;
    }
  }
  if (semOsAntigos != null) {
    const fim = semOsAntigos.lastIndexOf('</w:styles>');
    if (fim >= 0) gravar('word/styles.xml', `${estilosDaPeca.prologo}${semOsAntigos.slice(0, fim)}${estilos.xml}${semOsAntigos.slice(fim)}`);
  }

  gravar('word/document.xml', `${doc.prologo}${documento}`);
  gravar('[Content_Types].xml', escreverTipos(tipos));
  gravar('word/_rels/document.xml.rels', escreverRelacoes(relacoes));
  await conferirSaida(peca, gravadas, conferir, jaPendentes);
  let buffer;
  try {
    buffer = await peca.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  } catch (e) { // parte da peça que não foi lida (uma imagem) e não descomprime ao ser regravada
    throw new ErroDaPeca(MENSAGEM_DA_PECA, String(e?.message || e));
  }
  return {
    buffer,
    resumo: {
      cabecalhos: referenciasDoPapel.filter((r) => r.tag === 'header').map((r) => r.tipo),
      rodapes: referenciasDoPapel.filter((r) => r.tag === 'footer').map((r) => r.tipo),
      midias,
      primeiraPaginaDiferente: papel.titlePg,
      paresEImpares,
      pagina_cm: g.largura && g.altura ? { largura: emCm(g.largura), altura: emCm(g.altura) } : null,
      margens_cm: [g.superior, g.inferior, g.esquerda, g.direita].every((v) => v != null)
        ? { superior: emCm(Math.abs(g.superior)), inferior: emCm(Math.abs(g.inferior)), esquerda: emCm(g.esquerda), direita: emCm(g.direita) }
        : null,
    },
  };
}

// ---------------------------------------------------------------------------
// O logo de dentro do papel (para oferecer o modelo lateral quando o transplante não dá)
// ---------------------------------------------------------------------------
/**
 * A primeira imagem PNG ou JPEG (até `limite` bytes) do papel: as do cabeçalho
 * primeiro, depois as demais de `word/media`. `null` quando não há, ou quando o
 * arquivo não abre. Devolve `{ bytes, tipo: 'png' | 'jpg' }`. Nada é
 * descomprimido além do limite.
 */
export async function logoDoPapel(JSZip, buf, { limite = 2 * 1024 * 1024 } = {}) {
  if (tipoDoArquivo(buf) !== 'zip') return null;
  let zip;
  try { zip = await JSZip.loadAsync(buf); } catch { return null; }
  const ler = async (nome, teto) => {
    const arquivo = zip.file(nome);
    if (!arquivo) return null;
    try { return await lerComTeto(arquivo, teto); } catch { return null; }
  };
  const candidatos = [];
  for (const nome of Object.keys(zip.files).filter((n) => /^word\/_rels\/header[^/]*\.xml\.rels$/.test(n)).sort()) {
    for (const r of lerRelacoes((await ler(nome, MB))?.toString('utf8'))) if (!r.externo && r.tipo.endsWith('/image')) candidatos.push(caminhoDaParte('word', r.alvo));
  }
  candidatos.push(...Object.keys(zip.files).filter((n) => n.startsWith('word/media/') && !zip.files[n].dir).sort());
  for (const nome of [...new Set(candidatos)]) {
    const bytes = await ler(nome, limite);
    if (!bytes) continue;
    const tipo = tipoDoArquivo(bytes);
    if (tipo === 'png' || tipo === 'jpg') return { bytes, tipo };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Papel timbrado a partir de uma IMAGEM (faixa de cabeçalho ou página inteira)
// ---------------------------------------------------------------------------
const A4 = { largura: 11906, altura: 16838 }; // twips
const EMU_POR_TWIP = 635;

/**
 * 'faixa' (imagem bem larga: o cabeçalho de ponta a ponta), 'pagina' (em pé: a
 * página inteira) ou null (o meio-termo é logo: até um logo largo tem mais de
 * 30% de altura, e uma faixa de cabeçalho de 21 cm raramente passa de 6 cm).
 */
export function modoDaImagem({ largura, altura }) {
  const proporcao = altura / largura;
  if (proporcao < 0.3) return 'faixa';
  if (proporcao >= 1.2) return 'pagina';
  return null;
}

/**
 * Monta um papel timbrado .docx (A4) com a imagem no cabeçalho, atrás do texto:
 *   - 'faixa': a imagem ocupa a largura da página, no alto; o texto começa logo abaixo dela;
 *   - 'pagina': a imagem cobre a página inteira; o texto começa a `topoCm` do alto e
 *     termina a `baseCm` do fim (o Lex ajusta com o advogado, olhando a folha de teste).
 * `imagem` = `{ tipo: 'png'|'jpg', largura, altura }` (de `lerImagem`). Sem `modo`,
 * decide pela proporção; imagem que parece logo lança `ErroDoPapel('parece-logo')`.
 * O resultado passa pelo mesmo `transplantar` de um papel feito no Word.
 */
export async function papelDeImagem(JSZip, bytes, imagem, { modo = null, topoCm = 4.5, baseCm = 3, esquerdaCm = 3, direitaCm = 2 } = {}) {
  const como = modo || modoDaImagem(imagem);
  if (!como) throw erro('parece-logo');
  const tw = (cm) => Math.round(Number(cm) * 567);
  const cx = A4.largura * EMU_POR_TWIP;
  const cy = como === 'pagina' ? A4.altura * EMU_POR_TWIP : Math.round(cx * (imagem.altura / imagem.largura));
  const topo = como === 'pagina' ? tw(topoCm) : Math.max(tw(2.5), Math.round(cy / EMU_POR_TWIP) + tw(0.5));
  const ext = imagem.tipo === 'jpg' ? 'jpg' : 'png';
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="${ext}" ContentType="${TIPO_POR_EXTENSAO[ext]}"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="${TIPO_DE_CONTEUDO.header}"/></Types>`);
  zip.file('_rels/.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file('word/document.xml', `${XML}<w:document ${NS}><w:body><w:p/><w:sectPr><w:headerReference w:type="default" r:id="rId1"/><w:pgSz w:w="${A4.largura}" w:h="${A4.altura}"/><w:pgMar w:top="${topo}" w:right="${tw(direitaCm)}" w:bottom="${tw(como === 'pagina' ? baseCm : 2)}" w:left="${tw(esquerdaCm)}" w:header="0" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  zip.file('word/_rels/document.xml.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS_REL}/header" Target="header1.xml"/></Relationships>`);
  zip.file('word/header1.xml', `${XML}<w:hdr ${NS} xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:drawing>`
    + '<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="1" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/>'
    + '<wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>'
    + `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="1" name="Papel timbrado"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>`
    + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="Papel timbrado"/><pic:cNvPicPr/></pic:nvPicPr>'
    + `<pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p></w:hdr>`);
  zip.file('word/_rels/header1.xml.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS_REL}/image" Target="media/image1.${ext}"/></Relationships>`);
  zip.file(`word/media/image1.${ext}`, bytes);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

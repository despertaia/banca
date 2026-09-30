// A identidade do escritório: uma ficha só, e dela o resto.
//
// Camada Desperta (Fase 0B, bloco 3). A ficha mora em
// `_legalsquad/escritorio/ficha.json` (o logo, ao lado), FORA de `_memory/`: o
// hook `guarda-memoria.mjs` barra, de propósito, OAB com UF, e-mail e telefone
// escritos pelo Claude dentro de `_memory/`, que é a trava LGPD dos dados de
// cliente. A identidade profissional do próprio advogado é pública e não é dado
// de cliente; morando fora, a trava fica intacta, sem exceção.
//
// `banca escritorio aplicar` gera da ficha, de forma idempotente:
//   - `_legalsquad/_memory/company.md`: só a seção Identidade (entre marcadores),
//     a linha `Áreas de atuação` e o `Polo predominante`; o resto fica como está;
//   - `_legalsquad/_memory/djen.json`: `{oab, uf}`, só quando há OAB;
//   - `_legalsquad/estilo-escritorio.json`: `cabecalho` e `assinatura`, sem
//     tocar nas outras chaves;
//   - `preferences.json` (nome do responsável, se vazio) e `preferences.md`,
//     que passa a ser gerado do `.json` (o `.json` é a verdade).
// Quem grava é este código, não o Claude: o hook só inspeciona Write/Edit.
// O que o advogado escreveu à mão e a ficha substitui (o perfil sem marcadores,
// o cabeçalho de texto do estilo sem `modelo`, o `djen.json` com outra OAB)
// ganha uma cópia `.bak` antes, e um aviso diz onde ela ficou.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lerJson, lerTexto, motivoDoArquivo } from './escritorio-json.js';
import { ARQUIVO_DO_PAPEL } from '../scripts/timbre.mjs';
import { instalarLogo } from './escritorio-logo.js';
import { backupSync } from './fs-utils.js';

const RAIZ_DO_PACOTE = join(dirname(fileURLToPath(import.meta.url)), '..');

export const PASTA_DO_ESCRITORIO = join('_legalsquad', 'escritorio');
export const ARQUIVO_DA_FICHA = join(PASTA_DO_ESCRITORIO, 'ficha.json');
export const MARCADOR_INICIO = '<!-- BEGIN identidade (gerado da ficha do escritório) -->';
export const MARCADOR_FIM = '<!-- END identidade (gerado da ficha do escritório) -->';
export const NAO_INFORMADO = '(não informado)';
// Placeholder do modelo (`<preencher>`), sem pegar comentário HTML (`<!-- … -->`),
// que é o que os marcadores acima são.
export const RE_PLACEHOLDER = /<[^!>\n][^>\n]*>/g;

export const TIPOS = {
  escritorio: 'Escritório de advocacia',
  'ministerio-publico': 'Gabinete do Ministério Público',
  defensoria: 'Defensoria Pública',
  outro: 'Outro',
};
export const POLOS = {
  ativo: 'Polo ativo (autor, requerente, exequente, reclamante, acusação)',
  passivo: 'Polo passivo (réu, requerido, executado, reclamada, defesa)',
  misto: 'Varia por caso (misto: o caso decide)',
  consultivo: 'Consultivo/extrajudicial',
};
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

/** Rótulo em português de cada área do catálogo (os slugs de `banca acervo areas`). */
export const ROTULOS_DE_AREA = Object.freeze({
  'advocacia-extrajudicial': 'Extrajudicial (cartórios)',
  criminal: 'Criminal',
  'direito-administrativo': 'Administrativo',
  'direito-aeronautico': 'Aeronáutico',
  'direito-agrario': 'Agrário',
  'direito-ambiental': 'Ambiental',
  'direito-civil': 'Cível',
  'direito-constitucional': 'Constitucional',
  'direito-da-crianca-e-do-adolescente': 'Criança e adolescente',
  'direito-desportivo': 'Desportivo',
  'direito-digital': 'Digital',
  'direito-do-consumidor': 'Consumidor',
  'direito-do-trabalho': 'Trabalhista',
  'direito-eleitoral': 'Eleitoral',
  'direito-empresarial': 'Empresarial',
  'direito-financeiro': 'Financeiro',
  'direito-imobiliario': 'Imobiliário',
  'direito-internacional': 'Internacional',
  'direito-penal': 'Penal',
  'direito-previdenciario': 'Previdenciário',
  'direito-processual-civil': 'Processo civil',
  'direito-processual-do-trabalho': 'Processo do trabalho',
  'direito-processual-penal': 'Processo penal',
  'direito-tributario': 'Tributário',
  'direitos-humanos': 'Direitos humanos',
  eleitoral: 'Eleitoral',
  'execucao-penal': 'Execução penal',
  'execucao-trabalhista': 'Execução trabalhista',
  'familia-e-sucessoes': 'Família e sucessões',
  'medica-saude': 'Saúde',
  'recursos-trabalhistas': 'Recursos trabalhistas',
  'tutelas-trabalhistas': 'Tutelas trabalhistas',
});

export function rotuloDaArea(slug) {
  return ROTULOS_DE_AREA[slug] || slug;
}

const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

// ---------------------------------------------------------------------------
// A ficha
// ---------------------------------------------------------------------------

/** Lê a ficha. `{ ficha: null }` quando não existe; `{ erro }` quando o JSON é ilegível. */
export function lerFicha(raiz) {
  const caminho = join(raiz, ARQUIVO_DA_FICHA);
  if (!existsSync(caminho)) return { ficha: null, caminho };
  try {
    return { ficha: lerJson(caminho, 'a ficha'), caminho };
  } catch (e) {
    return { ficha: null, caminho, erro: e.message };
  }
}

/** Erros da ficha, em português, um por campo. Lista vazia: ficha boa. */
export function validarFicha(ficha) {
  if (!ehObjeto(ficha)) return ['a ficha precisa ser um objeto JSON: { "versao": 1, … }'];
  const erros = [];
  if (ficha.versao !== 1) erros.push('versao: use 1');
  if (!Object.hasOwn(TIPOS, ficha.tipo)) erros.push(`tipo: falta ou está errado (use ${Object.keys(TIPOS).join(', ')})`);
  if (!Object.hasOwn(POLOS, ficha.polo)) erros.push(`polo: falta ou está errado (use ${Object.keys(POLOS).join(', ')})`);
  if (!texto(ficha.nome)) erros.push('nome: falta o nome do escritório');
  const r = ficha.responsavel;
  if (!ehObjeto(r) || !texto(r.nome)) erros.push('responsavel.nome: falta o nome do responsável');
  const oab = ehObjeto(r) ? texto(r.oab) : null;
  const ufOab = ehObjeto(r) ? texto(r.uf) : null;
  if (ficha.tipo === 'escritorio' && !oab) erros.push('responsavel.oab: obrigatório para escritório de advocacia (só o número)');
  if (oab && !/^\d{1,6}(?:-?[A-Za-z])?$/.test(oab.replace(/[.\s]/g, ''))) erros.push('responsavel.oab: use só o número da inscrição (ex.: "12345")');
  if ((oab || ficha.tipo === 'escritorio') && !UFS.includes(String(ufOab || '').toUpperCase())) erros.push('responsavel.uf: a UF da OAB (ex.: "MT")');
  if (!Array.isArray(ficha.areas) || !ficha.areas.length) erros.push('areas: escolha ao menos uma área');
  else if (ficha.areas.some((a) => typeof a !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a))) erros.push('areas: use os slugs do catálogo (ex.: "direito-do-trabalho")');
  if (ficha.comarcas != null && (!Array.isArray(ficha.comarcas) || ficha.comarcas.some((c) => typeof c !== 'string'))) erros.push('comarcas: lista de textos, ex.: ["Cuiabá/MT"]');
  if (ficha.endereco != null) {
    if (!ehObjeto(ficha.endereco)) erros.push('endereco: { "linha", "cidade", "uf" } ou null');
    else if (ficha.endereco.uf != null && !UFS.includes(String(ficha.endereco.uf).toUpperCase())) erros.push('endereco.uf: UF de duas letras (ex.: "MT")');
  }
  if (ficha.contato != null) {
    if (!ehObjeto(ficha.contato)) erros.push('contato: { "telefone", "email" } ou null');
    else if (texto(ficha.contato.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ficha.contato.email.trim())) erros.push('contato.email: e-mail inválido');
  }
  if (ficha.logo != null && !/^logo\.(?:png|jpg)$/.test(String(ficha.logo))) erros.push('logo: "logo.png", "logo.jpg" ou null (use `npx banca escritorio logo <arquivo>`)');
  if (ficha.timbre != null) {
    if (!ehObjeto(ficha.timbre) || !['lateral', 'proprio'].includes(ficha.timbre.modelo)) erros.push('timbre.modelo: use "proprio" (o papel timbrado do escritório) ou "lateral"');
    else if (ficha.timbre.modelo === 'proprio' && ficha.timbre.arquivo !== ARQUIVO_DO_PAPEL) erros.push(`timbre.arquivo: com o papel do escritório, é "${ARQUIVO_DO_PAPEL}" (use \`npx banca escritorio papel <arquivo>\`)`);
  }
  // Opcional ausente vale null, nunca o marcador do modelo.
  const comMarcador = [];
  const varrer = (v, onde) => {
    if (typeof v === 'string' && /<[^>]*>|<…>/.test(v)) comMarcador.push(onde);
    else if (Array.isArray(v)) v.forEach((x, i) => varrer(x, `${onde}[${i}]`));
    else if (ehObjeto(v)) for (const [k, x] of Object.entries(v)) varrer(x, onde ? `${onde}.${k}` : k);
  };
  varrer(ficha, '');
  for (const onde of comMarcador) erros.push(`${onde}: ainda tem marcador <…>; campo sem valor fica null`);
  return erros;
}

/** A ficha com todos os campos presentes: opcional ausente vira null. Supõe ficha válida. */
export function normalizarFicha(ficha) {
  const r = ficha.responsavel || {};
  const e = ehObjeto(ficha.endereco) ? ficha.endereco : {};
  const c = ehObjeto(ficha.contato) ? ficha.contato : {};
  const oab = texto(r.oab) ? r.oab.replace(/[.\s]/g, '').toUpperCase() : null;
  return {
    versao: 1,
    tipo: ficha.tipo,
    polo: ficha.polo,
    nome: ficha.nome.trim(),
    responsavel: { nome: r.nome.trim(), oab, uf: texto(r.uf) ? r.uf.trim().toUpperCase() : null, cargo: texto(r.cargo) },
    areas: [...new Set(ficha.areas)],
    comarcas: Array.isArray(ficha.comarcas) ? ficha.comarcas.map((x) => x.trim()).filter(Boolean) : [],
    endereco: { linha: texto(e.linha), cidade: texto(e.cidade), uf: texto(e.uf) ? e.uf.trim().toUpperCase() : null },
    contato: { telefone: texto(c.telefone), email: texto(c.email) },
    logo: texto(ficha.logo),
    timbre: ehObjeto(ficha.timbre) && ficha.timbre.modelo === 'proprio' ? { modelo: 'proprio', arquivo: ARQUIVO_DO_PAPEL } : { modelo: 'lateral' },
  };
}

// Frases que mais de um derivado usa.
const linhaOab = (f) => (f.responsavel.oab ? `OAB/${f.responsavel.uf} ${f.responsavel.oab}` : null);
const linhaResponsavel = (f) => [f.responsavel.nome, linhaOab(f) || f.responsavel.cargo].filter(Boolean).join(' · ');
const linhaContato = (f) => [f.contato.telefone, f.contato.email].filter(Boolean).join(' · ') || null;
function linhaEndereco(f) {
  const lugar = f.endereco.cidade ? `${f.endereco.cidade}${f.endereco.uf ? `/${f.endereco.uf}` : ''}` : null;
  return [f.endereco.linha, lugar].filter(Boolean).join(', ') || null;
}
/** Cidade e UF da assinatura: do endereço; sem endereço, da primeira comarca "Cidade/UF". */
function localDaAssinatura(f) {
  if (f.endereco.cidade) return { cidade: f.endereco.cidade, uf: f.endereco.uf };
  const m = /^([^/]+)\/([A-Za-z]{2})$/.exec(f.comarcas[0] || '');
  return m ? { cidade: m[1].trim(), uf: m[2].toUpperCase() } : { cidade: null, uf: null };
}

// ---------------------------------------------------------------------------
// Derivados (funções puras: texto/objeto de entrada → texto/objeto de saída)
// ---------------------------------------------------------------------------

/** O miolo da seção Identidade do `company.md`, marcadores incluídos. */
export function secaoIdentidade(ficha) {
  const f = ficha;
  const nomeInstituicao = f.tipo === 'outro' ? `Outro${f.responsavel.cargo ? ` (${f.responsavel.cargo})` : ''}` : TIPOS[f.tipo];
  const responsavel = [f.responsavel.nome, linhaOab(f), f.responsavel.cargo].filter(Boolean).join(', ');
  return [
    MARCADOR_INICIO,
    `- Tipo de instituição: ${nomeInstituicao}`,
    `- Nome/denominação: ${f.nome}`,
    `- Responsável: ${responsavel}`,
    `- Contato: ${linhaContato(f) || NAO_INFORMADO}`,
    `- Endereço: ${linhaEndereco(f) || NAO_INFORMADO}`,
    `- Comarcas/Tribunais: ${f.comarcas.length ? f.comarcas.join(', ') : NAO_INFORMADO}`,
    MARCADOR_FIM,
  ].join('\n');
}

/** Troca a linha `- <rótulo>: …` (a primeira) ou a acrescenta no fim da seção `## <título>`. */
function trocarLinha(texto, rotulo, valor, tituloDaSecao) {
  const re = new RegExp(`^- ${rotulo}:.*$`, 'm');
  const linha = `- ${rotulo}: ${valor}`;
  if (re.test(texto)) return texto.replace(re, () => linha);
  const secao = new RegExp(`^## ${tituloDaSecao}[^\\n]*\\n`, 'm').exec(texto);
  if (secao) {
    const inicio = secao.index + secao[0].length;
    return `${texto.slice(0, inicio)}${linha}\n${texto.slice(inicio)}`;
  }
  return `${texto.replace(/\n*$/, '\n')}\n## ${tituloDaSecao}\n${linha}\n`;
}

// Campos da seção Identidade que a ficha gerencia (e as duas linhas que ela troca no lugar).
const CAMPOS_DA_FICHA = ['Tipo de instituição', 'Nome/denominação', 'Responsável', 'Contato', 'Endereço', 'Comarcas/Tribunais', 'Áreas de atuação', 'Polo predominante'];

/**
 * As linhas do corpo de uma seção que não são campos da ficha (nem continuação
 * deles). As linhas em branco ENTRE dois trechos do advogado ficam (é a
 * separação de parágrafos dele); as que vêm antes do primeiro, depois do último
 * ou coladas num campo da ficha, não.
 */
function linhasManuais(corpo) {
  const dele = [];
  let emCampo = false;
  let brancos = 0; // linhas em branco desde a última linha do advogado
  for (const linha of corpo.split('\n')) {
    if (!linha.trim()) { brancos += 1; continue; }
    const campo = /^- ([^:]+):/.exec(linha)?.[1]?.trim();
    if (campo && CAMPOS_DA_FICHA.includes(campo)) { emCampo = true; brancos = 0; continue; }
    if (emCampo && /^\s/.test(linha)) { brancos = 0; continue; } // continuação de um campo gerenciado
    emCampo = false;
    if (dele.length) for (let i = 0; i < brancos; i++) dele.push('');
    brancos = 0;
    dele.push(linha);
  }
  return dele;
}

/** O corpo da seção `## Identidade` de um perfil: `{ inicio, fim, corpo }` (`fim` < 0: vai até o fim do texto), ou null. */
function secaoDaIdentidade(t) {
  const secao = /^## Identidade[^\n]*\n/m.exec(t);
  if (!secao) return null;
  const inicio = secao.index + secao[0].length;
  const resto = t.slice(inicio);
  const fim = resto.search(/^## /m);
  return { inicio, fim, resto, corpo: fim >= 0 ? resto.slice(0, fim) : resto };
}

/** O que o advogado escreveu à mão na seção Identidade de um perfil ainda sem os marcadores (Sócios, Site…). */
export function linhasManuaisDaIdentidade(atual) {
  const secao = secaoDaIdentidade(String(atual ?? '').replace(/\r\n/g, '\n'));
  return secao ? linhasManuais(secao.corpo) : [];
}

/**
 * O `company.md` com a identidade da ficha. Com `atual` null, parte do `seed` e
 * troca todo marcador do modelo que sobrar por "(não informado)", para o perfil
 * passar no portão de completude. O que o advogado escreveu fora da seção
 * Identidade, da linha de áreas e da linha do polo fica intacto.
 */
export function companyComFicha(atual, ficha, seed) {
  let t = String(atual ?? seed).replace(/\r\n/g, '\n');
  const bloco = secaoIdentidade(ficha);
  const i = t.indexOf(MARCADOR_INICIO);
  const j = t.indexOf(MARCADOR_FIM);
  if (i >= 0 && j > i) {
    t = `${t.slice(0, i)}${bloco}${t.slice(j + MARCADOR_FIM.length)}`;
  } else {
    const secao = secaoDaIdentidade(t);
    if (secao) {
      const { inicio, fim, resto } = secao;
      // No perfil já escrito (sem `seed`), o que o advogado acrescentou à mão na
      // seção (Sócios, Site…) não é campo da ficha: fica logo depois do bloco.
      const dele = atual == null ? [] : linhasManuais(secao.corpo);
      t = `${t.slice(0, inicio)}${bloco}\n${dele.length ? `${dele.join('\n')}\n` : ''}${fim >= 0 ? `\n${resto.slice(fim)}` : ''}`;
    } else {
      const primeiraSecao = t.search(/^## /m);
      const novo = `## Identidade\n${bloco}\n\n`;
      t = primeiraSecao >= 0 ? `${t.slice(0, primeiraSecao)}${novo}${t.slice(primeiraSecao)}` : `${t.replace(/\n*$/, '\n')}\n${novo}`;
    }
  }
  t = trocarLinha(t, 'Áreas de atuação', ficha.areas.join(', '), 'Áreas de atuação');
  t = trocarLinha(t, 'Polo predominante', POLOS[ficha.polo], 'Polo de atuação');
  if (atual == null) t = t.replace(RE_PLACEHOLDER, NAO_INFORMADO);
  return t.endsWith('\n') ? t : `${t}\n`;
}

/** `djen.json` com a OAB da ficha, preservando outras chaves; null quando não há OAB. */
export function djenComFicha(atual, ficha) {
  if (!ficha.responsavel.oab) return null;
  return { ...(ehObjeto(atual) ? atual : {}), oab: ficha.responsavel.oab.replace(/\D/g, ''), uf: ficha.responsavel.uf };
}

/**
 * O `djen.json` atual traz uma OAB (e UF) diferente da ficha: a busca de
 * intimações vai mudar de OAB. Devolve o rótulo da OAB antiga (`OAB/SP 67890`)
 * ou null (sem OAB antiga, ou a mesma escrita de outro jeito).
 */
function oabAntigaDoDjen(atual, ficha) {
  if (!ehObjeto(atual) || !ficha.responsavel.oab) return null;
  const numero = String(atual.oab ?? '').replace(/\D/g, '');
  if (!numero) return null;
  const uf = String(atual.uf ?? '').trim().toUpperCase();
  if (numero === ficha.responsavel.oab.replace(/\D/g, '') && uf === ficha.responsavel.uf) return null;
  return `OAB${uf ? `/${uf}` : ''} ${numero}`;
}

/**
 * O cabeçalho do estilo foi escrito à mão (o da 1.2.0: texto em `escritorio`,
 * `oab`, `endereco` ou `linhas_extras`, sem `modelo`): na primeira aplicação,
 * a ficha o substitui, e o original tem de ficar guardado.
 */
function cabecalhoEscritoAMao(atual) {
  const cab = ehObjeto(atual) ? atual.cabecalho : null;
  if (typeof cab === 'string') return Boolean(cab.trim());
  if (!ehObjeto(cab) || cab.modelo) return false;
  const extras = Array.isArray(cab.linhas_extras) ? cab.linhas_extras : [cab.linhas_extras];
  return [cab.escritorio, cab.oab, cab.endereco, ...extras].some((v) => Boolean(texto(v)));
}

/** `estilo-escritorio.json` com `cabecalho` e `assinatura` da ficha; as outras chaves ficam. */
export function estiloComFicha(atual, ficha) {
  const base = ehObjeto(atual) ? atual : {};
  // `papel` só existe com o papel do próprio escritório; no lateral, a chave sai.
  const cab = { ...(ehObjeto(base.cabecalho) ? base.cabecalho : {}) };
  delete cab.papel;
  const proprio = ficha.timbre.modelo === 'proprio';
  const local = localDaAssinatura(ficha);
  return {
    ...base,
    cabecalho: {
      ...cab,
      escritorio: ficha.nome,
      oab: linhaResponsavel(ficha),
      endereco: linhaEndereco(ficha) || '',
      linhas_extras: linhaContato(ficha) ? [linhaContato(ficha)] : [],
      logo: ficha.logo,
      modelo: proprio ? 'proprio' : 'lateral',
      ...(proprio ? { papel: ficha.timbre.arquivo } : {}),
    },
    assinatura: {
      ...(ehObjeto(base.assinatura) ? base.assinatura : {}),
      cidade: local.cidade,
      uf: local.uf,
      nome: ficha.responsavel.nome,
      oab: linhaOab(ficha),
      cargo: linhaOab(ficha) ? null : ficha.responsavel.cargo,
    },
  };
}

/** O `preferences.md` gerado do `preferences.json` (o `.json` é a verdade). */
export function preferenciasEmMarkdown(prefs) {
  const p = ehObjeto(prefs) ? prefs : {};
  return `# Preferências da Banca

- **User Name:** ${p.userName || ''}
- **Output Language:** ${p.outputLanguage || ''}
- **IDEs:** ${Array.isArray(p.ides) ? p.ides.join(', ') : ''}
- **Date Format:** ${p.dateFormat || 'YYYY-MM-DD'}
`;
}

/**
 * Lê preferências como o motor lê: o `.json` vence; o `.md` preenche o que faltar.
 * `quebrado`: o `.json` existe, mas não é um objeto JSON legível (quem grava guarda cópia).
 */
function lerPreferencias(memoria) {
  let json = null;
  let quebrado = false;
  const caminhoJson = join(memoria, 'preferences.json');
  if (existsSync(caminhoJson)) {
    try {
      const p = lerJson(caminhoJson, 'preferences.json');
      if (ehObjeto(p)) json = p;
      else quebrado = true;
    } catch { quebrado = true; }
  }
  let md = {};
  try {
    const c = readFileSync(join(memoria, 'preferences.md'), 'utf8');
    const campo = (rotulo) => new RegExp(`\\*\\*${rotulo}:\\*\\*[ \\t]*(.*)`).exec(c)?.[1]?.trim() || null;
    const ides = campo('IDEs')?.split(/,\s*/).filter(Boolean);
    md = { userName: campo('User Name'), outputLanguage: campo('Output Language'), ides: ides?.length ? ides : null, dateFormat: campo('Date Format') };
    md = Object.fromEntries(Object.entries(md).filter(([, v]) => v));
  } catch { /* sem .md */ }
  // Os quatro campos sempre presentes: o .md gerado deste objeto relido dá o mesmo objeto.
  return { prefs: { userName: '', outputLanguage: '', ides: [], dateFormat: 'YYYY-MM-DD', ...md, ...(json || {}) }, quebrado };
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------

/** Grava só quando o conteúdo muda. Devolve 'criado' | 'atualizado' | 'igual'. Falha vira erro em português, com o nome do arquivo. */
function gravar(caminho, conteudo) {
  const antes = existsSync(caminho) ? lerTexto(caminho, basename(caminho)) : null;
  if (antes === conteudo) return 'igual';
  try {
    mkdirSync(dirname(caminho), { recursive: true });
    writeFileSync(caminho, conteudo, 'utf8');
  } catch (e) {
    throw new Error(`não foi possível gravar ${basename(caminho)}: ${motivoDoArquivo(e, caminho)}`);
  }
  return antes === null ? 'criado' : 'atualizado';
}
const json = (o) => `${JSON.stringify(o, null, 2)}\n`;

function lerJsonOpcional(caminho, rotulo) {
  if (!existsSync(caminho)) return null;
  try {
    return lerJson(caminho, rotulo);
  } catch (e) {
    throw new Error(`${e.message}; corrija ou apague o arquivo e rode de novo`);
  }
}

/**
 * Valida a ficha e grava os derivados. Idempotente: rodar de novo sem mudar a
 * ficha não muda nenhum arquivo. Devolve `{ success, erros, arquivos }`, com
 * `arquivos` = [{ arquivo, acao }] (caminho relativo com "/").
 */
export function aplicarFicha(raiz) {
  const lida = lerFicha(raiz);
  if (lida.erro) return { success: false, erros: [lida.erro], arquivos: [] };
  if (!lida.ficha) return { success: false, erros: [`não há ficha em ${ARQUIVO_DA_FICHA.replace(/\\/g, '/')}; a entrevista do Lex a cria`], arquivos: [] };
  const erros = validarFicha(lida.ficha);
  if (erros.length) return { success: false, erros, arquivos: [] };
  const ficha = normalizarFicha(lida.ficha);
  const memoria = join(raiz, '_legalsquad', '_memory');
  const arquivos = [];
  const avisos = [];
  const registrar = (rel, acao) => arquivos.push({ arquivo: rel.replace(/\\/g, '/'), acao });
  try {
    // 1) Ler e validar TUDO o que já existe, antes de gravar o primeiro arquivo:
    //    um derivado quebrado não pode deixar os outros pela metade.
    const companyPath = join(memoria, 'company.md');
    const sementes = [join(raiz, '_legalsquad', 'core', 'seeds', 'company.md'), join(RAIZ_DO_PACOTE, '_legalsquad', 'core', 'seeds', 'company.md')].filter((c) => existsSync(c));
    const seedPath = sementes[0];
    const atual = existsSync(companyPath) ? lerTexto(companyPath, 'company.md') : null;
    if (atual === null && !seedPath) throw new Error('modelo do perfil (seeds/company.md) não encontrado; rode `npx banca update` nesta pasta');
    const primeiraAbsorcao = atual !== null && !(atual.includes(MARCADOR_INICIO) && atual.includes(MARCADOR_FIM));
    // Perfil que é só a semente que o `init` copiou (nenhuma linha do advogado): nada a guardar nem a avisar.
    const igual = (a, b) => a.replace(/\r\n/g, '\n').trimEnd() === b.replace(/\r\n/g, '\n').trimEnd();
    const manuais = primeiraAbsorcao ? linhasManuaisDaIdentidade(atual) : [];
    const soSemente = primeiraAbsorcao && !manuais.length && sementes.some((c) => { try { return igual(atual, readFileSync(c, 'utf8')); } catch { return false; } });
    // A semente é gerada como se o perfil não existisse: os marcadores `<…>` do modelo viram "(não informado)".
    const company = atual === null || soSemente
      ? companyComFicha(null, ficha, atual ?? lerTexto(seedPath, 'o modelo do perfil'))
      : companyComFicha(atual, ficha, null);

    const djenPath = join(memoria, 'djen.json');
    const djenAtual = lerJsonOpcional(djenPath, 'djen.json');
    const djen = djenComFicha(djenAtual, ficha);
    const oabAntiga = djen ? oabAntigaDoDjen(djenAtual, ficha) : null;

    const estiloPath = join(raiz, '_legalsquad', 'estilo-escritorio.json');
    const estiloAtual = lerJsonOpcional(estiloPath, 'estilo-escritorio.json');
    const estilo = estiloComFicha(estiloAtual, ficha);
    const cabecalhoAMao = cabecalhoEscritoAMao(estiloAtual);

    const { prefs, quebrado } = lerPreferencias(memoria);
    if (!texto(prefs.userName)) prefs.userName = ficha.responsavel.nome;
    const prefsJsonPath = join(memoria, 'preferences.json');

    // 2) Gravar. Cópia (.bak, sufixo livre) do que vai ser reescrito de um jeito que perde texto.
    if (primeiraAbsorcao && !soSemente) {
      const bak = backupSync(companyPath);
      if (bak) avisos.push(`o perfil antigo foi guardado em ${basename(bak)}${manuais.length ? '; o que você escreveu na seção Identidade e não é campo da ficha foi mantido' : ': a seção Identidade foi refeita com os dados da ficha, e o resto do perfil ficou como estava'}`);
    }
    registrar(join('_legalsquad', '_memory', 'company.md'), gravar(companyPath, company));
    if (oabAntiga) {
      const bak = backupSync(djenPath);
      if (bak) avisos.push(`a busca de intimações usava outra OAB (${oabAntiga}); o arquivo antigo foi guardado em ${basename(bak)}, e a busca passa a usar a da ficha (${linhaOab(ficha)})`);
    }
    if (djen) registrar(join('_legalsquad', '_memory', 'djen.json'), gravar(djenPath, json(djen)));
    if (cabecalhoAMao) {
      const bak = backupSync(estiloPath);
      if (bak) avisos.push(`o cabeçalho que estava escrito à mão no estilo do escritório foi guardado em ${basename(bak)}; as peças passam a usar o timbre da ficha. Se faltou alguma linha dele (outra OAB, o site, uma filial), diga ao Lex`);
    }
    registrar(join('_legalsquad', 'estilo-escritorio.json'), gravar(estiloPath, json(estilo)));
    if (quebrado) {
      const bak = backupSync(prefsJsonPath);
      if (bak) avisos.push(`preferences.json estava ilegível; a cópia ficou em ${basename(bak)} e as preferências foram refeitas`);
    }
    registrar(join('_legalsquad', '_memory', 'preferences.json'), gravar(prefsJsonPath, json(prefs)));
    registrar(join('_legalsquad', '_memory', 'preferences.md'), gravar(join(memoria, 'preferences.md'), preferenciasEmMarkdown(prefs)));
  } catch (e) {
    return { success: false, erros: [e.message], arquivos };
  }
  return { success: true, erros: [], avisos, arquivos, ficha };
}

/** Resumo legível da ficha, para o Lex ler ao refazer um campo. */
export function resumoDaFicha(ficha) {
  const f = normalizarFicha(ficha);
  return [
    `${f.nome} · ${TIPOS[f.tipo]} · ${POLOS[f.polo].split(' (')[0]}`,
    `Responsável: ${linhaResponsavel(f)}`,
    `Áreas: ${f.areas.map(rotuloDaArea).join(', ')}`,
    `Comarcas: ${f.comarcas.length ? f.comarcas.join(', ') : NAO_INFORMADO}`,
    `Endereço: ${linhaEndereco(f) || NAO_INFORMADO}`,
    `Contato: ${linhaContato(f) || NAO_INFORMADO}`,
    `Logo: ${f.logo || 'sem logo'}`,
    f.timbre.modelo === 'proprio' ? `Papel timbrado: o do próprio escritório (${f.timbre.arquivo})` : 'Papel timbrado: lateral (logo à esquerda, nome e contato à direita)',
  ];
}

// ---------------------------------------------------------------------------
// Folha de teste do timbre
// ---------------------------------------------------------------------------
export const ARQUIVO_DA_FOLHA = join(PASTA_DO_ESCRITORIO, 'folha-de-teste-do-timbre.docx');
const TEXTO_DA_FOLHA = `# FOLHA DE TESTE DO PAPEL TIMBRADO

Esta página mostra como as peças do escritório vão sair: o logo e os dados no alto, o endereço e o número da página no rodapé, e o bloco de assinatura no fim.

Confira o nome, a OAB, o telefone, o e-mail e o endereço. Para mudar qualquer um deles, diga ao Lex, por exemplo: «Lex, muda o endereço» ou «Lex, troca o logo».

Este parágrafo é só um exemplo, para mostrar a fonte, o recuo da primeira linha e o espaçamento entre as linhas que as peças vão usar. O texto de uma peça de verdade ocupa o mesmo espaço, com as mesmas margens.
`;
const TEXTO_DA_FOLHA_NO_PAPEL_PROPRIO = `# FOLHA DE TESTE DO PAPEL TIMBRADO

Esta página mostra como as peças do escritório vão sair no papel timbrado que o escritório já usa: o cabeçalho, o rodapé e as margens vêm do arquivo que você mandou, e o bloco de assinatura fecha a peça.

Confira se o cabeçalho e o rodapé estão como no seu papel e se o texto não ficou em cima de nenhum desenho. Se algo saiu diferente, diga ao Lex, por exemplo: «Lex, o texto ficou em cima do cabeçalho» ou «Lex, troca o papel timbrado».

Este parágrafo é só um exemplo, para mostrar a fonte, o recuo da primeira linha e o espaçamento entre as linhas que as peças vão usar. O texto de uma peça de verdade ocupa o mesmo espaço, com as mesmas margens.
`;

/**
 * Gera `_legalsquad/escritorio/folha-de-teste-do-timbre.docx` pelo MESMO caminho
 * da peça: o empacotador do projeto (`<raiz>/scripts/empacotar.mjs`), ou o do
 * motor quando o projeto não tem um. Devolve `{ success, arquivo, empacotador,
 * papel, aviso }`: `papel` é o timbre que a folha ganhou ('proprio' ou
 * 'lateral'); `aviso` vem quando o papel do escritório não pôde ser usado e a
 * folha saiu com o lateral (o Lex lê o aviso ao advogado). Folha anterior aberta
 * no Word (o arquivo não aceita gravação): `{ success: false, erro }`, sem estourar.
 */
export async function gerarFolhaDeTeste(raiz) {
  const lida = lerFicha(raiz);
  if (lida.erro || !lida.ficha) return { success: false, erro: lida.erro || 'ainda não há ficha do escritório: a entrevista do Lex a cria' };
  const erros = validarFicha(lida.ficha);
  if (erros.length) return { success: false, erro: `a ficha tem campos a corrigir: ${erros.join('; ')}` };
  const doProjeto = join(raiz, 'scripts', 'empacotar.mjs');
  const temDoProjeto = existsSync(doProjeto);
  if (temDoProjeto && !existsSync(join(raiz, 'scripts', 'timbre.mjs'))) {
    return { success: false, erro: 'o empacotador desta pasta é anterior ao papel timbrado: rode `npx banca update` nesta pasta e gere a folha de novo' };
  }
  const emp = await import(pathToFileURL(temDoProjeto ? doProjeto : join(RAIZ_DO_PACOTE, 'scripts', 'empacotar.mjs')).href);
  const { estilo } = emp.carregarEstilo(raiz);
  const modelo = estilo.cabecalho ? estilo.cabecalho.modelo : null;
  if (modelo !== 'lateral' && modelo !== 'proprio') return { success: false, erro: 'o estilo do escritório ainda não tem o timbre: rode `npx banca escritorio aplicar` antes' };
  if (modelo === 'proprio' && typeof emp.avisosDoPapel !== 'function') {
    return { success: false, erro: 'o empacotador desta pasta é anterior ao papel timbrado do próprio escritório: rode `npx banca update` nesta pasta e gere a folha de novo' };
  }
  const arquivo = join(raiz, ARQUIVO_DA_FOLHA);
  mkdirSync(dirname(arquivo), { recursive: true });
  if (modelo === 'proprio') emp.avisosDoPapel(); // esvazia: só valem os avisos desta folha
  const texto = modelo === 'proprio' ? TEXTO_DA_FOLHA_NO_PAPEL_PROPRIO : TEXTO_DA_FOLHA;
  const folha = await emp.markdownParaDocx(texto, estilo, { titulo: 'Folha de teste do papel timbrado', quebraDePagina: false, raiz, assinar: true });
  try {
    writeFileSync(arquivo, folha);
  } catch (e) {
    // No Windows, a folha anterior aberta no Word não aceita gravação: não é erro do programa, é pedir para fechar.
    let ehPasta = false;
    try { ehPasta = statSync(arquivo).isDirectory(); } catch { /* não existe */ }
    if (!ehPasta && ['EBUSY', 'EPERM', 'EACCES'].includes(e.code)) return { success: false, erro: 'a folha de teste está aberta no Word; feche e peça de novo' };
    return { success: false, erro: `não foi possível gravar a folha de teste: ${motivoDoArquivo(e, arquivo)}` };
  }
  const avisos = modelo === 'proprio' ? emp.avisosDoPapel() : [];
  return { success: true, arquivo, empacotador: temDoProjeto ? 'projeto' : 'motor', papel: avisos.length ? 'lateral' : modelo, aviso: avisos[0] || null };
}

/**
 * Como abrir um arquivo no programa padrão, sem shell POSIX: `open` (macOS),
 * `cmd /c start "" "<arquivo>"` (Windows) e `xdg-open` (Linux).
 */
export function comandoParaAbrir(arquivo, plataforma = process.platform) {
  if (plataforma === 'darwin') return { comando: 'open', args: [arquivo], opcoes: {} };
  if (plataforma === 'win32') return { comando: 'cmd', args: ['/c', 'start', '""', `"${arquivo}"`], opcoes: { windowsVerbatimArguments: true } };
  return { comando: 'xdg-open', args: [arquivo], opcoes: {} };
}

/**
 * Abre sem esperar o programa fechar. Resolve `true` só quando o processo iniciou;
 * `false` se não deu para iniciá-lo (sem `xdg-open`, por exemplo): o caminho já foi
 * mostrado, então falhar aqui não é erro. `executar` existe para os testes.
 * Interruptor: com `BANCA_SEM_ABRIR=1` no ambiente (a suíte de testes e as provas o
 * ligam), o executor padrão não inicia nada e a resposta é `false`, como "não consegui
 * abrir sozinho". Assim nenhum teste abre o Word de verdade.
 * No Windows, caminho com `%` também é `false` sem iniciar nada: o `cmd` expande
 * `%VAR%` mesmo entre aspas e abriria outra coisa.
 */
export function abrirArquivo(arquivo, { executar, plataforma = process.platform } = {}) {
  if (plataforma === 'win32' && String(arquivo).includes('%')) return Promise.resolve(false);
  if (!executar) {
    if (process.env.BANCA_SEM_ABRIR === '1') return Promise.resolve(false);
    executar = spawn;
  }
  const { comando, args, opcoes } = comandoParaAbrir(arquivo, plataforma);
  return new Promise((resolver) => {
    try {
      const filho = executar(comando, args, { ...opcoes, detached: true, stdio: 'ignore', windowsHide: true });
      filho.once('error', () => resolver(false));
      filho.once('spawn', () => {
        filho.unref();
        resolver(true);
      });
    } catch {
      resolver(false);
    }
  });
}

// O que `banca escritorio abrir` aceita: documento que abre num leitor. Programa, script, atalho e
// documento com macro ficam de fora: o comando de abrir do sistema os EXECUTARIA (`start` no Windows).
// `.doc` e `.rtf` também: podem trazer macro ou objeto embutido.
const DOCUMENTOS = Object.freeze(['.docx', '.dotx', '.odt', '.pdf', '.txt', '.md', '.png', '.jpg', '.jpeg']);

/**
 * Abre no programa padrão um arquivo que está DENTRO da pasta do escritório
 * (uma peça pronta, em geral), para o Lex não montar linha de `cmd` à mão no
 * Windows. `arquivo`: caminho relativo à raiz ou absoluto. Recusa, sem abrir
 * nada: caminho fora da raiz (também por atalho/link que aponta para fora),
 * arquivo interno da pasta técnica `_legalsquad/` (aberto no Word, ele trava o
 * papel e a folha interna), pasta, arquivo que não existe e o que não é
 * documento. No Windows, caminho com `%` não vai ao `cmd`: a resposta é a de
 * "não consegui abrir sozinho". Devolve `{ success: true, arquivo, aberto: true }`
 * (`arquivo` relativo à raiz, com "/") ou `{ success: false, erro }`. `abrir` e
 * `plataforma` existem para os testes.
 */
export async function abrirDoEscritorio(raiz, arquivo, { abrir = abrirArquivo, plataforma = process.platform } = {}) {
  const pedido = String(arquivo ?? '').trim().replace(/^["']|["']$/g, '');
  if (!pedido) return { success: false, erro: 'diga o arquivo: `npx banca escritorio abrir "<arquivo>"` (por exemplo, a peça em «4 - Peças prontas»)' };
  const fora = (de, para) => { const r = relative(de, para); return r === '..' || r.startsWith(`..${sep}`) || isAbsolute(r); };
  // A barra invertida vale como separador em qualquer sistema: o caminho pode ter sido escrito à moda do Windows.
  const caminho = resolve(raiz, process.platform === 'win32' ? pedido : pedido.replace(/\\/g, '/'));
  if (fora(resolve(raiz), caminho)) return { success: false, erro: 'esse arquivo está fora da pasta do escritório: só abro o que está dentro dela' };
  const interno = await recusaDoInterno(relative(resolve(raiz), caminho));
  if (interno) return interno;
  let real;
  try {
    real = realpathSync(caminho);
    if (fora(realpathSync(raiz), real)) return { success: false, erro: 'esse arquivo é um atalho para fora da pasta do escritório: só abro o que está dentro dela' };
    const internoPeloAtalho = await recusaDoInterno(relative(realpathSync(raiz), real));
    if (internoPeloAtalho) return internoPeloAtalho;
    if (statSync(real).isDirectory()) return { success: false, erro: 'isso é uma pasta, não um arquivo: diga o arquivo que devo abrir' };
  } catch {
    return { success: false, erro: `não encontrei o arquivo «${pedido}» na pasta do escritório` };
  }
  if (!DOCUMENTOS.includes(extname(real).toLowerCase()) || !DOCUMENTOS.includes(extname(caminho).toLowerCase())) {
    return { success: false, erro: 'só abro documentos (Word, PDF, texto ou imagem); esse arquivo é de outro tipo' };
  }
  const rel = relative(resolve(raiz), caminho).replace(/\\/g, '/');
  const naoAbri = { success: false, erro: `não consegui abrir sozinho: o arquivo é «${rel}»; diga ao advogado onde ele está` };
  if (plataforma === 'win32' && caminho.includes('%')) return naoAbri;
  if (!(await abrir(caminho))) return { success: false, erro: `não consegui abrir sozinho: o arquivo é «${rel}»; diga ao advogado onde ele está` };
  return { success: true, arquivo: rel, aberto: true };
}

/**
 * Recusa de `abrirDoEscritorio` para o que está na pasta técnica `_legalsquad/`
 * (`rel`: relativo à raiz), ou `null`. A comparação ignora maiúsculas: no Windows
 * e no Mac, `_LEGALSQUAD` é a mesma pasta.
 */
async function recusaDoInterno(rel) {
  const partes = rel.split(/[\\/]/).filter(Boolean).map((p) => p.toLowerCase());
  if (partes[0] !== '_legalsquad') return null;
  if (partes.join('/') === ARQUIVO_DA_FOLHA.split(/[\\/]/).join('/').toLowerCase()) {
    const { COPIA_DA_FOLHA } = await import('./escritorio-pastas.js');
    const { PASTAS } = await import('./pasta-do-escritorio.js');
    return { success: false, erro: `essa é a folha de teste interna da Banca: aberta no Word, ela trava a próxima folha. A que o advogado vê é a cópia em «${PASTAS.identidade}»: npx banca escritorio abrir "${PASTAS.identidade}/${COPIA_DA_FOLHA}"` };
  }
  return { success: false, erro: 'esse é um arquivo interno da Banca (pasta técnica): não o abro, porque aberto no Word ele trava o trabalho do Lex' };
}

// ---------------------------------------------------------------------------
// CLI: `banca escritorio <sub>`
// ---------------------------------------------------------------------------
const SUBCOMANDOS = 'aplicar | mostrar | logo <arquivo> | papel [<arquivo>] [--como faixa|pagina] [--topo <cm>] [--base <cm>] | papel --remover | folha-de-teste [--abrir] | abrir "<arquivo>" | pastas | cliente "<nome>" [--novo] [--time <time>] | modelos [--aprender | --vistos] | papel --vistos "<arquivo>" | primeira-peca [--criar] [--caso treino|meu]';

/** `banca escritorio <sub> [...]`. Devolve `{ success }` (o bin põe o código de saída). `abrir` existe para os testes. */
export async function escritorioCli(sub, raiz, values = {}, args = [], { abrir = abrirArquivo } = {}) {
  const emJson = values.json === true;
  const sair = (obj, linhas) => {
    if (emJson) console.log(JSON.stringify(obj, null, 2));
    else for (const l of linhas) console.log(l);
    return obj;
  };
  if (sub === 'aplicar') {
    const r = aplicarFicha(raiz);
    if (!r.success) return sair({ success: false, erros: r.erros }, ['  ✖ A ficha do escritório não foi aplicada:', ...r.erros.map((e) => `    · ${e}`)]);
    const mudou = r.arquivos.filter((a) => a.acao !== 'igual');
    return sair({ success: true, avisos: r.avisos, arquivos: r.arquivos }, [
      `  ✓ Ficha aplicada: ${r.ficha.nome}`,
      ...r.avisos.map((a) => `    ! ${a}`),
      ...(mudou.length ? mudou.map((a) => `    ${a.acao === 'criado' ? '+' : '~'} ${a.arquivo}`) : ['    nada mudou (os arquivos já estavam em dia)']),
    ]);
  }
  if (sub === 'mostrar') {
    const lida = lerFicha(raiz);
    if (lida.erro) return sair({ success: false, existe: true, erros: [lida.erro] }, [`  ✖ ${lida.erro}`]);
    if (!lida.ficha) return sair({ success: true, existe: false }, ['  Ainda não há ficha do escritório. Peça ao Lex: «vamos montar a identidade do escritório».']);
    const erros = validarFicha(lida.ficha);
    if (erros.length) return sair({ success: false, existe: true, erros }, ['  ✖ A ficha tem campos a corrigir:', ...erros.map((e) => `    · ${e}`)]);
    return sair({ success: true, existe: true, ficha: normalizarFicha(lida.ficha), resumo: resumoDaFicha(lida.ficha) }, resumoDaFicha(lida.ficha).map((l) => `  ${l}`));
  }
  if (sub === 'logo') {
    const r = instalarLogo(raiz, args[0]);
    if (!r.success) return sair(r, [`  ✖ Logo não instalado: ${r.erro}`]);
    // Com ficha boa, o logo novo já vai para o timbre (troca de logo = um comando só).
    const lida = lerFicha(raiz);
    const aplicada = lida.ficha && !validarFicha(lida.ficha).length ? aplicarFicha(raiz).success : false;
    return sair({ ...r, aplicada }, [
      `  ✓ Logo instalado: ${PASTA_DO_ESCRITORIO.replace(/\\/g, '/')}/${r.logo} (${r.largura} × ${r.altura} px)`,
      ...(aplicada ? ['    ficha aplicada: o papel timbrado já usa este logo'] : []),
    ]);
  }
  if (sub === 'folha-de-teste') {
    const r = await gerarFolhaDeTeste(raiz);
    if (!r.success) return sair(r, [`  ✖ Folha de teste não gerada: ${r.erro}`]);
    // O advogado vê a folha na pasta 3 (a de `_legalsquad/escritorio/` fica escondida com a pasta técnica).
    const { copiarFolhaParaIdentidade } = await import('./escritorio-pastas.js');
    const copia = copiarFolhaParaIdentidade(raiz, r.arquivo);
    const pediu = values.abrir === true;
    // Só a CÓPIA da pasta 3 é aberta: o arquivo interno, aberto no Word, ficaria preso e quebraria a próxima folha.
    const aberto = pediu && copia ? await abrir(copia) : false;
    // Sem a cópia na pasta 3, o advogado não recebe o caminho técnico (fica no --json): recebe o que fazer.
    const { PASTAS: pastasDoEscritorio } = await import('./pasta-do-escritorio.js');
    const semCopia = existsSync(join(raiz, pastasDoEscritorio.identidade))
      ? `  ✓ Folha de teste do timbre gerada, mas não foi possível pôr a cópia em «${pastasDoEscritorio.identidade}»: feche a folha anterior no Word, se ela estiver aberta, e peça de novo ao Lex.`
      : `  ✓ Folha de teste do timbre gerada, mas a pasta «${pastasDoEscritorio.identidade}» não está nesta pasta do escritório: peça ao Lex para arrumar a pasta e peça a folha de novo.`;
    return sair({ ...r, copia, aberto }, [
      copia ? `  ✓ Folha de teste do timbre: ${copia}` : semCopia,
      `    ${r.papel === 'proprio' ? 'no papel timbrado do próprio escritório' : 'no modelo lateral'}`,
      ...(r.aviso ? [`    ATENÇÃO: ${r.aviso}`] : []),
      ...(aberto ? ['    aberta no programa padrão'] : pediu ? [copia ? `    não consegui abrir sozinho: abra «${basename(copia)}» na pasta «${pastasDoEscritorio.identidade}», pelo Explorador/Finder` : `    não abri a folha: sem a cópia na pasta «${pastasDoEscritorio.identidade}», não há o que mostrar ao advogado`] : []),
    ]);
  }
  if (sub === 'abrir') {
    const r = await abrirDoEscritorio(raiz, args.join(' '), { abrir });
    return sair(r, r.success ? [`  ✓ Aberto no programa padrão: ${r.arquivo}`] : [`  ✖ ${r.erro}`]);
  }
  if (sub === 'pastas' || sub === 'cliente' || sub === 'modelos' || (sub === 'papel' && (values.vistos === true || (!args[0] && values.remover !== true)))) {
    // Import tardio: src/escritorio-pastas.js importa este arquivo.
    const pastas = await import('./escritorio-pastas.js');
    const { PASTAS, estadoDaPasta, esconderPastas } = await import('./pasta-do-escritorio.js');
    if (sub === 'cliente') {
      const r = pastas.pastaDoCliente(raiz, args.join(' '), { novo: values.novo === true, time: typeof values.time === 'string' ? values.time : null });
      if (!r.success) return sair(r, [`  ✖ ${r.erro}`]);
      if (!r.pasta) return sair(r, [`  Não há pasta com esse nome, mas há parecida(s): ${r.parecidos.join(', ')}. Pergunte ao advogado se é um deles; se for cliente novo, repita com --novo.`]);
      return sair(r, [
        `  ✓ ${r.criada ? 'Pasta criada' : 'Pasta do cliente'}: ${r.pasta} (${r.documentos} documento(s))`,
        ...(r.caso ? [`    o time usa os documentos desta pasta (${r.caso}); as peças saem em ${PASTAS.prontas}/${r.cliente}`] : []),
        ...(r.documentos === 0 ? [`    Peça ao advogado para pôr os documentos do caso em «${r.pasta}».`] : []),
      ]);
    }
    if (sub === 'modelos') {
      if (values.aprender === true) {
        const r = await pastas.aprenderModelos(raiz);
        return sair({ success: true, ...r }, [
          `  ✓ ${r.aprendidos.length} modelo(s) levado(s) para o acervo do escritório${r.aprendidos.length ? ' (rode `npm run indexar-acervo` para o Lex passar a consultá-los)' : ''}`,
          ...r.aprendidos.map((a) => `    + ${a.arquivo} → ${a.destino}`),
          ...r.pendentes.map((p) => `    ! ${p.arquivo}: ${p.motivo}`),
        ]);
      }
      if (values.vistos === true) return sair({ success: true, marcados: pastas.marcarModelosVistos(raiz) }, ['  ✓ Modelos marcados como vistos.']);
      const r = pastas.modelosNovos(raiz);
      return sair({ success: true, ...r }, [r.novos.length ? `  ${r.novos.length} modelo(s) novo(s) em «${r.pasta}»: ${r.novos.join(', ')}` : `  Nenhum modelo novo em «${r.pasta}» (${r.total} no total).`]);
    }
    if (sub === 'papel') {
      // `--vistos "<arquivo>"`: o advogado recusou a oferta DESTE arquivo da pasta 3; o Lex não o oferece de novo.
      if (values.vistos === true) {
        const r = pastas.marcarIdentidadeVista(raiz, args.join(' '));
        return sair(r, r.success ? [`  ✓ «${r.arquivo}» marcado como já oferecido${r.marcados ? '' : ' (já estava)'}: o Lex não o oferece de novo.`] : [`  ✖ ${r.erro}`]);
      }
      const itens = pastas.arquivosDaIdentidade(raiz);
      const jaOferecido = (i) => (i.ja_oferecido ? ' (já oferecido ao advogado)' : '');
      return sair({ success: true, pasta: PASTAS.identidade, arquivos: itens }, itens.length
        ? [`  Em «${PASTAS.identidade}»:`, ...itens.map((i) => `    · ${i.arquivo}: ${i.serve === 'papel' ? `pode ser o papel timbrado (${i.tipo}): npx banca escritorio papel "${i.arquivo}"${jaOferecido(i)}` : i.serve === 'logo' ? `parece o logo: npx banca escritorio logo "${i.arquivo}"${jaOferecido(i)}` : i.motivo}`)]
        : [`  Nada em «${PASTAS.identidade}» ainda. O advogado põe lá o papel timbrado (Word, imagem ou PDF) ou o logo, ou arrasta o arquivo para a conversa.`]);
    }
    // `pastas`: tudo de uma vez, para o começo da conversa. `--mostrar`/`--esconder` são para o suporte.
    if (values.mostrar === true || values.esconder === true) {
      const r = esconderPastas(raiz, { mostrar: values.mostrar === true });
      return sair({ success: true, ...r }, [`  ✓ ${r.feitas.length} pasta(s) técnica(s) ${values.mostrar === true ? 'à vista' : 'escondida(s)'}${r.falhas.length ? `; ${r.falhas.length} falharam: ${r.falhas.map((f) => f.pasta).join(', ')}` : ''}${r.suportado ? '' : ' (neste sistema não há o que esconder)'}`]);
    }
    const estado = estadoDaPasta(raiz);
    const modelos = pastas.modelosNovos(raiz);
    const identidade = pastas.arquivosDaIdentidade(raiz);
    const clientes = pastas.listarClientes(raiz);
    return sair({ success: true, pastas: PASTAS, estado, clientes, modelos_novos: modelos.novos, identidade }, [
      `  Pasta do escritório: ${estado.faltam.length || estado.aVista.length ? `a arrumar (npx banca diagnostico --consertar)` : 'em ordem'}`,
      `  Clientes: ${clientes.length ? clientes.join(', ') : 'nenhuma pasta ainda'}`,
      `  Modelos novos: ${modelos.novos.length ? modelos.novos.join(', ') : 'nenhum'}`,
      `  Identidade: ${identidade.length ? identidade.map((i) => `${i.arquivo} (${i.serve})`).join(', ') : 'nada na pasta 3'}`,
    ]);
  }
  if (sub === 'papel') {
    // Import tardio: src/escritorio-papel.js importa este arquivo.
    const { registrarPapel, removerPapel } = await import('./escritorio-papel.js');
    if (values.remover === true) {
      const r = removerPapel(raiz);
      return sair(r, r.success ? ['  ✓ O papel timbrado voltou ao modelo lateral (o arquivo do papel do escritório continua guardado).'] : [`  ✖ ${r.erro}`]);
    }
    const numero = (v) => (v === undefined || v === true || !Number.isFinite(Number(String(v).replace(',', '.'))) ? null : Number(String(v).replace(',', '.')));
    const r = await registrarPapel(raiz, args[0], { como: typeof values.como === 'string' ? values.como : null, topoCm: numero(values.topo), baseCm: numero(values.base) });
    if (!r.success) {
      return sair(r, [
        `  ✖ O papel timbrado não foi trocado: ${r.erro}`,
        ...(r.logoExtraido ? [`    O logo de dentro do arquivo foi guardado em ${r.logoExtraido}: com ele dá para usar o modelo lateral (\`npx banca escritorio logo "${r.logoExtraido}"\`).`] : []),
        '    As peças continuam saindo com o timbre que já estava valendo.',
      ]);
    }
    const m = r.resumo.margens_cm;
    const cm = (n) => String(n).replace('.', ',');
    const de = { word: 'do arquivo do Word', imagem: `da imagem (${r.modo === 'pagina' ? 'página inteira, atrás do texto' : 'faixa no alto da página'})`, pdf: `do PDF (primeira página, convertida com ${r.conversor})` }[r.origem];
    return sair(r, [
      `  ✓ Papel timbrado do escritório guardado: ${PASTA_DO_ESCRITORIO.replace(/\\/g, '/')}/${r.arquivo} (${de})`,
      `    cabeçalho: ${r.resumo.cabecalhos.length ? 'sim' : 'não'} · rodapé: ${r.resumo.rodapes.length ? 'sim' : 'não'} · imagens: ${r.resumo.midias}${r.resumo.primeiraPaginaDiferente ? ' · primeira página diferente' : ''}${r.resumo.paresEImpares ? ' · páginas pares e ímpares' : ''}`,
      ...(m ? [`    margens do papel: ${cm(m.superior)} cm no alto, ${cm(m.inferior)} embaixo, ${cm(m.esquerda)} à esquerda, ${cm(m.direita)} à direita`] : []),
      ...(r.anterior ? [`    o papel que estava valendo antes ficou guardado: ${PASTA_DO_ESCRITORIO.replace(/\\/g, '/')}/${r.anterior}`] : []),
      ...(r.aviso ? [`    ! ${r.aviso}`] : []),
      '    Próximo: `npx banca escritorio folha-de-teste --abrir`, para o advogado ver a peça no papel dele.',
    ]);
  }
  if (sub === 'primeira-peca') {
    // Import tardio: src/primeira-peca.js importa este arquivo (e o squad-modelo).
    const { criarPrimeiraPeca } = await import('./primeira-peca.js');
    const r = criarPrimeiraPeca(raiz, { caso: typeof values.caso === 'string' ? values.caso : 'treino', criar: values.criar === true });
    if (!r.success) return sair(r, [`  ✖ ${r.erro}`]);
    if (!r.sugestao) return sair(r, [`  ${r.motivo}`]);
    const s = r.sugestao;
    if (!r.code) return sair(r, [`  Primeira peça: ${s.peca} (${s.rotulo}) · modelo ${s.modelo}${r.disponivel ? '' : ' (ainda não está nesta pasta)'} · caso de treino: ${s.casoDeTreino}`]);
    return sair(r, [`  ✓ Time criado: squads/${r.code} (${s.peca}, ${r.caso === 'treino' ? 'caso de treino fictício' : 'caso do escritório'})`, ...(r.autos ? [`    caso copiado para ${r.autos}`] : []), `    Próximo: ${r.proximo}`]);
  }
  return sair({ success: false, erro: `subcomando desconhecido: ${sub || '(nenhum)'}` }, [`  Uso: npx banca escritorio ${SUBCOMANDOS}`]);
}

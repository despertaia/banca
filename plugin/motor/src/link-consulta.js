// Link de consulta: o endereço que abre o julgado ou a súmula no site do tribunal,
// montado a partir do `tribunal` e do `processo` que o índice do acervo já guarda.
// A `fonte_url` do acervo aponta a publicação de onde o item foi extraído (a edição
// do informativo, o PDF de verbetes); este link leva o advogado ao próprio item, num
// clique, para conferir com os olhos dele. É navegação, não prova: a prova continua
// sendo a fonte oficial que o verificador abre por código.
//
// Só entram endereços que abrem sozinhos, sem sessão nem formulário, medidos no
// navegador em 12/10/2026:
//   STF processo       portal.stf.jus.br, classe e número → a página do processo (decisões, inteiro teor)
//   STF súmula e SV    jurisprudencia.stf.jus.br, base sumulas, "súmula 151" → 1 resultado
//   STJ súmula         processo.stj.jus.br/SCON, b=SUMU, @NUM=103 → o verbete
//   TST processo (CNJ) consultaprocessual.tst.jus.br, número único → o processo
// Ficam de fora, de propósito:
//   STJ acórdão: a busca por classe e número (a que scripts/fonte-oficial.mjs usa por
//     código) volta para a página inicial do SCON quando aberta no navegador; o link
//     que abre é o do inteiro teor, que exige registro e data de publicação, e esses
//     só `fonte-oficial.mjs --stj` resolve, uma consulta por julgado.
//   STF pela busca de jurisprudência (base acordaos): devolve antes os acórdãos que CITAM o
//     número; "ARE 663637" trouxe RE 614419 AgR, ARE 840225 AgR e AR 2597 no topo.
//   TSE: a busca por número no jurisprudencia.tse.jus.br não devolve o julgado.
//   OJ, PN e súmula do TST: sem endereço por número que abra o verbete.

const STF_BUSCA = 'https://jurisprudencia.stf.jus.br/pages/search';
const STF_PROCESSO = 'https://portal.stf.jus.br/processos/listarProcessos.asp';
const STJ_SUMULA = 'https://processo.stj.jus.br/SCON/pesquisar.jsp?acao=pesquisar&novaConsulta=true&i=1&b=SUMU&livre=@NUM=';
const TST_PROCESSO = 'https://consultaprocessual.tst.jus.br/consultaProcessual/consultaTstNumUnica.do?consulta=Consultar&conscsjt=';

// Classes do STF como o portal as escreve; a chave é a grafia minúscula que aparece no acervo.
const CLASSES_STF = {
  adi: 'ADI', adin: 'ADI', adc: 'ADC', ado: 'ADO', adpf: 'ADPF', re: 'RE', are: 'ARE', ai: 'AI',
  hc: 'HC', rhc: 'RHC', ms: 'MS', rms: 'RMS', mi: 'MI', rcl: 'Rcl', inq: 'Inq', ap: 'AP',
  aco: 'ACO', pet: 'Pet', ext: 'Ext', ac: 'AC', ss: 'SS', sta: 'STA', sl: 'SL', ao: 'AO',
  hd: 'HD', rhd: 'RHD', ar: 'AR', if: 'IF', psv: 'PSV', cc: 'CC',
};
const RE_CLASSE_STF = new RegExp(`(?:^|[^a-z])(${Object.keys(CLASSES_STF).join('|')})\\s*(?:n[º°o.]*\\s*)?(\\d[\\d.]*)`, 'i');
const RE_SUMULA = /s[úu]mula\s+(vinculante\s+)?(?:n[º°o.]*\s*)?(\d+)/i;
const RE_CNJ = /(\d{1,7})-(\d{2})\.(\d{4})\.(\d)\.(\d{2})\.(\d{4})/;

const buscaStf = (base, consulta) =>
  `${STF_BUSCA}?base=${base}&queryString=${encodeURIComponent(`"${consulta}"`)}&sort=_score&sortBy=desc`;

/**
 * `{ tribunal: 'STF', processo: 'RE 898.060/SC' }` → a URL que abre o item no site do
 * tribunal, ou `null` quando não há endereço confiável para ele (ver o cabeçalho).
 */
export function linkConsulta({ tribunal, processo } = {}) {
  const t = String(tribunal || '').toUpperCase();
  const p = String(processo || '').trim();
  if (!t || !p) return null;

  if (t === 'STF-SUM' || t === 'STF-SV') {
    const m = p.match(RE_SUMULA);
    if (!m) return null;
    return buscaStf('sumulas', `súmula ${t === 'STF-SV' ? 'vinculante ' : ''}${m[2]}`);
  }
  if (t === 'STF') {
    const m = p.match(RE_CLASSE_STF);
    if (!m) return null;
    return `${STF_PROCESSO}?classe=${CLASSES_STF[m[1].toLowerCase()]}&numeroProcesso=${m[2].replace(/\D/g, '')}`;
  }
  if (t === 'STJ-SUM') {
    const m = p.match(RE_SUMULA);
    return m ? `${STJ_SUMULA}${m[2]}` : null;
  }
  if (t === 'TST' || t === 'TST-EXEC') {
    const m = p.match(RE_CNJ);
    if (!m || m[4] !== '5') return null;
    const [, numero, digito, ano, , tribunalOrigem, vara] = m;
    return `${TST_PROCESSO}&numeroTst=${numero}&digitoTst=${digito}&anoTst=${ano}&orgaoTst=5&tribunalTst=${tribunalOrigem}&varaTst=${vara}`;
  }
  return null;
}

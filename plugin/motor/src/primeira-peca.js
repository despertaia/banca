// A primeira peça do escritório: da área para o modelo de time e o caso de treino.
//
// Camada Desperta (Fase 0B, bloco 3). No fim da entrevista, o Lex propõe a
// primeira peça da área do advogado (a primeira área da ficha que tem peça
// sugerida), com o caso de treino fictício como padrão ou com um caso real.
// `criarPrimeiraPeca` cria o time pelo `squad-modelo` e, no caso de treino,
// copia o caso para os documentos do time. O resto é o run de sempre, no ritmo
// rápido, com as paradas de decisão e a conferência de citações.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeLivre, instanciarModelo, listarModelos, proximoPasso } from './squad-modelo.js';
import { lerFicha, rotuloDaArea, validarFicha } from './escritorio.js';

const RAIZ_DO_PACOTE = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Os times de teste do motor: ficam no pacote, mas o `init` e o `update` não os levam ao escritório. */
export const TIMES_DE_TESTE = Object.freeze(['demo-squad', 'peca-modelo']);

/** Pasta dos casos de treino no escritório (o `init` copia de `templates/casos-de-treino/`). */
export const PASTA_DOS_CASOS = 'casos-de-treino';

/** Caso de treino → modelo de time e nome da peça, e os slugs de área que levam a ele. */
export const PRIMEIRAS_PECAS = Object.freeze({
  trabalhista: { modelo: 'trab-reclamacao-trabalhista', peca: 'Reclamação trabalhista', areas: ['direito-do-trabalho', 'direito-processual-do-trabalho', 'execucao-trabalhista', 'recursos-trabalhistas', 'tutelas-trabalhistas'] },
  consumidor: { modelo: 'cons-negativacao-indevida', peca: 'Ação por negativação indevida', areas: ['direito-do-consumidor'] },
  familia: { modelo: 'acao-alimentos', peca: 'Ação de alimentos', areas: ['familia-e-sucessoes', 'direito-da-crianca-e-do-adolescente'] },
  previdenciario: { modelo: 'prev-concessao-beneficio', peca: 'Ação de concessão de benefício previdenciário', areas: ['direito-previdenciario'] },
  civel: { modelo: 'peticao-inicial-jec', peca: 'Petição inicial no Juizado Especial Cível', areas: ['direito-civil', 'direito-processual-civil', 'direito-imobiliario'] },
  criminal: { modelo: 'crim-liberdade-provisoria', peca: 'Pedido de liberdade provisória', areas: ['criminal', 'direito-penal', 'direito-processual-penal', 'execucao-penal'] },
});

/** A chave do caso de treino de uma área (`direito-do-trabalho` → `trabalhista`), ou null. */
export function casoDaArea(slug) {
  return Object.keys(PRIMEIRAS_PECAS).find((k) => PRIMEIRAS_PECAS[k].areas.includes(slug)) || null;
}

/**
 * A primeira peça para as áreas da ficha, na ordem em que o advogado as
 * escolheu: vale a primeira área que tem peça sugerida. Null quando nenhuma tem.
 */
export function primeiraPeca(areas) {
  for (const area of Array.isArray(areas) ? areas : []) {
    const caso = casoDaArea(area);
    if (!caso) continue;
    const p = PRIMEIRAS_PECAS[caso];
    return { area, rotulo: rotuloDaArea(area), caso, modelo: p.modelo, peca: p.peca, casoDeTreino: `${PASTA_DOS_CASOS}/${caso}.md` };
  }
  return null;
}

/** Onde está o caso de treino: na pasta do escritório; sem ela, no pacote do motor. */
function arquivoDoCaso(raiz, caso) {
  return [join(raiz, PASTA_DOS_CASOS, `${caso}.md`), join(RAIZ_DO_PACOTE, 'templates', PASTA_DOS_CASOS, `${caso}.md`)].find((c) => existsSync(c)) || null;
}

/**
 * A sugestão (sem `criar`) ou o time criado. `caso`: 'treino' (padrão) copia o
 * caso fictício para `squads/<time>/autos/`; 'meu' cria o time vazio, e o
 * próximo passo diz onde pôr os documentos do cliente. `instanciar` existe para
 * os testes (o padrão é o `instanciarModelo` do `squad-modelo`).
 */
export function criarPrimeiraPeca(raiz, { caso = 'treino', criar = false, instanciar = instanciarModelo } = {}) {
  const lida = lerFicha(raiz);
  if (lida.erro || !lida.ficha || validarFicha(lida.ficha).length) return { success: false, erro: 'a ficha do escritório ainda não está pronta: termine a entrevista (ou rode `npx banca escritorio mostrar`)' };
  if (!['treino', 'meu'].includes(caso)) return { success: false, erro: `--caso: use "treino" (o fictício, padrão) ou "meu" (recebido: ${caso})` };
  const sugestao = primeiraPeca(lida.ficha.areas);
  if (!sugestao) return { success: true, sugestao: null, motivo: 'nenhuma área da ficha tem primeira peça sugerida: o Lex pergunta ao advogado que peça ele quer fazer primeiro e monta o time para ela' };
  const disponivel = listarModelos(raiz).some((m) => m.id === sugestao.modelo);
  if (!criar) return { success: true, sugestao, disponivel };
  if (!disponivel) return { success: false, sugestao, erro: `o modelo «${sugestao.modelo}» não está nesta pasta: rode \`npx banca acervo sync\` (ou \`npx banca acervo areas\`, se a área estiver desligada) e tente de novo` };
  let criado;
  try {
    criado = instanciar(sugestao.modelo, { cwd: raiz, code: codeLivre(raiz, `primeira-peca-${sugestao.caso}`) });
  } catch (e) {
    return { success: false, sugestao, erro: e.message };
  }
  const code = criado.code;
  const dir = join(raiz, 'squads', code);
  // Mesmo critério do `squad-modelo`: time com erro no check-squad não roda.
  const erros = (criado.check?.issues || []).filter((i) => i.severity === 'error');
  if (erros.length) return { success: false, sugestao, code, erro: `o time squads/${code} foi criado, mas o check-squad acusou ${erros.length} erro(s) (o primeiro: ${erros[0].detail}); rode \`npx banca check-squad ${code}\` e \`npx banca acervo ligar\`` };
  if (caso === 'meu') return { success: true, sugestao, caso, code, proximo: proximoPasso(dir) };
  const origem = arquivoDoCaso(raiz, sugestao.caso);
  if (!origem) return { success: false, sugestao, code, erro: `caso de treino ${sugestao.caso}.md não encontrado: rode \`npx banca update\` nesta pasta` };
  const destino = join(dir, 'autos', `caso-de-treino-${sugestao.caso}.md`);
  mkdirSync(dirname(destino), { recursive: true });
  copyFileSync(origem, destino);
  return {
    success: true,
    sugestao,
    caso,
    code,
    autos: `squads/${code}/autos/caso-de-treino-${sugestao.caso}.md`,
    proximo: `rode \`node scripts/indexar-autos.mjs squads/${code}\` e depois /banca run ${code}; na parada intake, escolha o ritmo rápido.`,
  };
}

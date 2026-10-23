// O logo do escritório: PNG ou JPEG, até 2 MB, reconhecido pelos bytes.
//
// Camada Desperta (Fase 0B, bloco 3). `banca escritorio logo <arquivo>` copia a
// imagem para `_legalsquad/escritorio/logo.png` (ou `.jpg`), grava nela (se já existe) o nome do
// arquivo e só depois apaga o logo da outra extensão. O
// leitor de bytes é o mesmo que o timbre usa ao montar o .docx
// (`scripts/timbre.mjs`), para os dois nunca discordarem sobre o que é imagem.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { LIMITE_DO_LOGO, lerImagem } from '../scripts/timbre.mjs';
import { gravarAtomico, lerJson } from './escritorio-json.js';

// Os mesmos caminhos de src/escritorio.js (sem importar de lá: ele importa este arquivo).
const PASTA_DO_ESCRITORIO = join('_legalsquad', 'escritorio');
const ARQUIVO_DA_FICHA = join(PASTA_DO_ESCRITORIO, 'ficha.json');

// Windows não diferencia maiúscula de minúscula em caminho. `plataforma` existe para os testes.
export const mesmoCaminho = (a, b, plataforma = process.platform) => (plataforma === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b));

const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(1).replace('.', ',');

/**
 * Instala o logo. `arquivo` pode vir entre aspas (arrastado para a conversa), e é
 * absoluto ou relativo à RAIZ do escritório (como em `papel`, `abrir` e `cliente`),
 * nunca à pasta de onde o comando rodou: o `logoExtraido` que o `papel` sugere e
 * os nomes da pasta 3 valem de qualquer subpasta. A barra invertida vale como
 * separador (caminho escrito à moda do Windows).
 * Devolve `{ success, logo, tipo, largura, altura }` ou `{ success: false, erro }`.
 */
export function instalarLogo(raiz, arquivo) {
  const pedido = String(arquivo || '').trim().replace(/^["']|["']$/g, '');
  const caminho = resolve(raiz, process.platform === 'win32' ? pedido : pedido.replace(/\\/g, '/'));
  if (!arquivo || !existsSync(caminho) || !statSync(caminho).isFile()) return { success: false, erro: `arquivo não encontrado: ${arquivo || '(nenhum)'}` };
  const tamanho = statSync(caminho).size;
  if (tamanho > LIMITE_DO_LOGO) return { success: false, erro: `o logo tem ${mb(tamanho)} MB, e o limite é 2 MB: salve uma versão menor (PNG ou JPEG) e mande de novo` };
  const bytes = readFileSync(caminho);
  let img;
  try {
    img = lerImagem(bytes);
  } catch (e) {
    return { success: false, erro: e.message };
  }
  const pasta = join(raiz, PASTA_DO_ESCRITORIO);
  const logo = `logo.${img.tipo}`;
  const fichaPath = join(raiz, ARQUIVO_DA_FICHA);

  // 1) Ficha existente: tem de estar legível ANTES de qualquer mudança em disco.
  //    Ficha ausente é caso válido (logo instalado antes da entrevista).
  let ficha = null;
  if (existsSync(fichaPath)) {
    try {
      ficha = lerJson(fichaPath, 'a ficha');
      if (!ficha || typeof ficha !== 'object' || Array.isArray(ficha)) throw new Error('a ficha não é um objeto JSON');
    } catch (e) {
      return { success: false, erro: `a ficha do escritório não pôde ser lida (${e.message}): conserte ou apague ${ARQUIVO_DA_FICHA.replace(/\\/g, '/')} e mande o logo de novo; nada foi alterado` };
    }
  }

  // 2) Copia o logo novo; 3) grava a ficha; 4) só então remove o logo da outra extensão.
  //    Assim ficha e arquivo nunca discordam, mesmo se algo falhar no meio.
  mkdirSync(pasta, { recursive: true });
  writeFileSync(join(pasta, logo), bytes);
  if (ficha && ficha.logo !== logo) {
    try {
      gravarAtomico(fichaPath, `${JSON.stringify({ ...ficha, logo }, null, 2)}\n`);
    } catch (e) {
      // Desfaz a cópia nova (a ficha ainda aponta para o logo antigo, que fica).
      if (!mesmoCaminho(join(pasta, logo), caminho)) rmSync(join(pasta, logo), { force: true });
      return { success: false, erro: `não consegui gravar a ficha do escritório (${e.code || e.message}): feche o arquivo se ele estiver aberto em outro programa e tente de novo; o logo antigo foi mantido` };
    }
  }
  const antigo = join(pasta, img.tipo === 'png' ? 'logo.jpg' : 'logo.png');
  if (!mesmoCaminho(antigo, caminho)) rmSync(antigo, { force: true }); // nunca apaga o arquivo que o advogado mandou
  return { success: true, logo, tipo: img.tipo, largura: img.largura, altura: img.altura };
}

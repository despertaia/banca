import { readFile, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const IDE = 'templates/ide-templates';

// Fonte única de cada corpo compartilhado: o modelo do Claude Code, que é o que
// chega do fornecedor e o que o merge semanal atualiza. (A pasta de corpos
// avulsos, templates/ide-assets/, não existe nesta base: o gerador lia de lá e
// quebrava.) Cada alvo recebe o corpo da sua fonte e guarda o PRÓPRIO
// frontmatter, que é de cada IDE. `npm run build:ide` propaga; `npm run
// build:ide -- --check` só confere e sai 1 se algum alvo divergir.
export const FONTES = {
  // "command body": o programa inteiro da skill.
  [`${IDE}/claude-code/.claude/skills/legalsquad/SKILL.md`]: [
    `${IDE}/gemini-cli/.gemini/skills/legalsquad/SKILL.md`,
    `${IDE}/qwen-code/.qwen/skills/legalsquad/SKILL.md`,
    `${IDE}/vscode-copilot/.github/prompts/legalsquad.prompt.md`,
    `${IDE}/antigravity/.agent/workflows/legalsquad.md`,
    // Cursor tem superfície de comando sob demanda (.cursor/commands/): o corpo
    // completo entra por ela. As rules (.mdc, alwaysApply) recebem só o
    // "instructions body": entram em toda conversa.
    `${IDE}/cursor/.cursor/commands/legalsquad.md`,
    `${IDE}/codex/AGENTS.md`,
    `${IDE}/opencode/AGENTS.md`,
  ],
  // "instructions body": as instruções que ficam em toda conversa.
  [`${IDE}/claude-code/CLAUDE.md`]: [
    `${IDE}/gemini-cli/GEMINI.md`,
    `${IDE}/qwen-code/QWEN.md`,
    `${IDE}/antigravity/.agent/rules/legalsquad.md`,
    `${IDE}/cursor/.cursor/rules/legalsquad.mdc`,
    // Trae só tem rules sempre aplicadas: é o único veículo que alcança este destino.
    `${IDE}/trae/.trae/rules/legalsquad.md`,
  ],
};

// CRLF-tolerant: a target edited on Windows (or git autocrlf) must not silently
// lose its IDE-specific frontmatter when the generator runs.
const FRONTMATTER_RE = /^(---\r?\n[\s\S]*?\r?\n---)\r?\n/;

/** O corpo de um arquivo: tudo depois do frontmatter e da linha em branco que o segue. */
export function corpo(conteudo) {
  const m = conteudo.match(FRONTMATTER_RE);
  return m ? conteudo.slice(m[0].length).replace(/^\r?\n/, '') : conteudo;
}

// Reassembles a target file: preserve its existing frontmatter (if any) and use
// the shared body. Frontmatter + blank line + body, or just the body.
function render(currentContent, body) {
  const match = currentContent.match(FRONTMATTER_RE);
  return match ? `${match[1]}\n\n${body}` : body;
}

// Regenera os alvos a partir das fontes. Com { check: true } nada é gravado:
// devolve os alvos fora de sincronia. `raiz` existe para os testes.
export async function buildIdeTemplates({ check = false, raiz = ROOT } = {}) {
  const changed = [];
  for (const [fonte, alvos] of Object.entries(FONTES)) {
    const body = corpo(await readFile(join(raiz, fonte), 'utf-8'));
    for (const rel of alvos) {
      const path = join(raiz, rel);
      const current = await readFile(path, 'utf-8');
      const next = render(current, body);
      if (next !== current) {
        changed.push(rel);
        if (!check) await writeFile(path, next, 'utf-8');
      }
    }
  }
  return changed;
}

// Run directly: `node src/build-ide-templates.js [--check]`
const isMain = process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const check = process.argv.includes('--check');
  const changed = await buildIdeTemplates({ check });
  if (check && changed.length) {
    console.error(
      `Modelos das IDEs fora de sincronia com o do Claude Code (${changed.length}):\n  ${changed.join('\n  ')}\n` +
        'Rode `npm run build:ide`.'
    );
    process.exit(1);
  }
  console.log(
    changed.length
      ? `Modelos das IDEs atualizados (${changed.length}):\n  ${changed.join('\n  ')}`
      : 'Modelos das IDEs em sincronia com o do Claude Code.'
  );
}

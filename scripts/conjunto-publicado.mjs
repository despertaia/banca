// O que vai para a árvore pública além de `package.json#files`. Mora aqui, e não
// dentro de build-dist.mjs, para que os testes (tests/marca.test.js) leiam a
// MESMA lista que o build usa: o build-dist não pode ser importado (roda ao carregar).

/** Documentos da raiz que quem instalou lê. */
export const DOCS = ['README.md', 'INSTALL.md', 'GUIA-ALUNO.md', 'LICENSE', 'LICENSE.md', 'CHANGELOG.md'];

/** O plugin do Claude Code e o marketplace que o serve (ver build-dist.mjs). */
export const PLUGIN_MARKETPLACE = ['.claude-plugin/', 'plugin/'];

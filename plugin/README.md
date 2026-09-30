<!-- ARQUIVO GERADO por scripts/build-plugin.mjs. Não edite aqui. -->

# Banca: plugin do Claude Code

Versão 1.3.0. Tudo o que a Banca precisa vem neste plugin, inclusive o motor: não é
preciso abrir o terminal, nem instalar nada pelo npm ou pelo git.

## Antes de começar: o Node.js

A Banca roda sobre o Node.js (versão 22.15 ou mais nova). Se o computador ainda não tem,
baixe o instalador da versão **LTS** em https://nodejs.org, instale com as opções padrão e feche e
abra o Claude. Se faltar, o próprio plugin avisa em português no início da conversa.

## Instalar pelo Claude Code

Numa conversa do Claude Code, digite estas duas linhas, uma de cada vez:

```text
/plugin marketplace add despertaia/banca
/plugin install banca@despertaia
```

A primeira cadastra a loja de plugins da despertaia (só uma vez por computador). A segunda abre a
ficha do plugin: escolha **Install for you (user scope)**, para ter a Banca em todas as
pastas. Se o Claude pedir, rode `/reload-plugins` ou abra uma conversa nova.

## Instalar pelo app Claude (aba Code)

Numa sessão local da aba **Code**, clique no **+** ao lado da caixa de mensagem, escolha
**Plugins** e depois **Add plugin**; procure `banca` e escolha o escopo do seu usuário. O
navegador de plugins do app mostra os plugins das lojas já cadastradas: se a loja da despertaia
ainda não aparecer, cadastre-a uma vez pelo Claude Code (`/plugin marketplace add
despertaia/banca`). O terminal, o app e o VS Code do mesmo computador leem as mesmas
configurações, então o plugin instalado em um aparece nos outros.

## Usar

Abra a pasta do escritório e peça em português o que precisa, ou digite
`/banca:banca` para o menu. Na primeira vez em cada pasta, o Claude pergunta antes de
prepará-la. Na primeira conversa depois de instalar, o plugin registra o motor neste computador;
não há mais nada a fazer.

## Atualizar

No Claude Code: `/plugin`, aba dos plugins instalados, `banca`, **Update now**. Para receber as
versões novas sem pedir, ative a atualização automática da loja `despertaia` na aba
**Marketplaces** do `/plugin` (lojas de terceiros vêm com ela desligada). A versão nova vale a
partir da conversa seguinte. As pastas dos projetos não mudam sozinhas: peça ao Claude
"atualiza a Banca nesta pasta" e ele roda o `banca update` nela.

## Quem tinha o plugin com o nome antigo

Se você instalou o plugin antes da Banca, ele aparece como `legalsquad` na lista de plugins.
Para passar ao nome novo, digite no Claude Code, uma linha de cada vez:

```text
/plugin marketplace update despertaia
/plugin uninstall legalsquad@despertaia
/plugin install banca@despertaia
```

Depois, abra uma conversa nova. As pastas do escritório continuam como estão; em seguida, rode
`banca update` (ou peça ao Lex: "atualiza esta pasta") em cada pasta de escritório.

## O que vem aqui

- `motor/`: o motor (o mesmo conjunto do pacote npm, sem `node_modules`);
- `bin/banca`: o comando `banca` no shell do Claude, enquanto o plugin está ativo (`bin/legalsquad` fica como apelido);
- `skills/banca/`: a skill `/banca:banca`, com os gates de citação e redação;
- `agents/`: os cinco agentes de núcleo (`verificador-citacoes`, `avaliador-squad`,
  `catalog-scout`, `verificador-persuasao`, `contraditor`);
- `scripts/`: os hooks determinísticos, byte a byte iguais aos do motor;
- `hooks/hooks.json`: a preparação do início da conversa, o backstop de citações e o disparador
  dos hooks do projeto;
- `package.json` e `package-lock.json`: as dependências do motor (`docx`, para a peça em
  .docx), que o Claude Code instala sozinho ao instalar ou atualizar o plugin.

## O que NÃO vem aqui

Nenhuma **matéria jurídica de área** (skills de matéria, squads, best-practices, acervo, agentes
especialistas): as áreas do Direito chegam como pacotes assinados pelo `banca acervo sync`,
que o Claude roda na primeira pasta preparada. Nem memória, nem `squads/*/output/`, nem
`skills/_evals/results/`.

Quem já instalou pelo npm (`banca install-global`) pode instalar o plugin também: os dois
convivem, e vale o motor de versão mais nova.

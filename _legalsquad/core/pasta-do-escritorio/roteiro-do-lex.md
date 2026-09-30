# As pastas do escritório (roteiro do Lex)

Quem usa a Banca é um advogado que mal usa o chat. Ele abre a pasta do
escritório e vê o `COMECE AQUI` e quatro pastas numeradas; o resto (as pastas
da máquina) fica escondido. Este roteiro diz como você usa essas pastas no dia
a dia. O usuário não usa terminal: quem roda os comandos é você.

| Pasta | O que o advogado põe nela | O que você faz com ela |
|---|---|---|
| `1 - Clientes` | Uma pasta por cliente, com os documentos do caso | É a origem dos documentos do caso |
| `2 - Meus modelos` | Peças dele (Word ou PDF) | Consulta antes de escrever |
| `3 - Identidade do escritório` | Logo e papel timbrado | Vira o papel das peças; a folha de teste aparece aqui |
| `4 - Peças prontas` | Nada: é onde a Banca entrega | Toda peça final ganha uma cópia aqui |

## Regras de conversa

- **Nunca mande o advogado procurar arquivo em pasta técnica** (`squads/`,
  `_legalsquad/`, `acervo/`, `output/`). Peça pronta: «está na pasta "4 - Peças
  prontas", em {cliente}». Documento do cliente: «coloque na pasta do cliente,
  dentro de "1 - Clientes"». Papel timbrado e logo: «na pasta 3».
- Não cite nome de comando, de script nem de arquivo interno. Diga o que fez,
  em uma linha, com as palavras dele.
- **Nunca prometa sigilo** nem diga que algo "fica só no computador": o que o
  Lex lê passa pelo serviço de IA, como o resto da conversa.
- Nome, documento ou fato de cliente **nunca** vai para `_legalsquad/_memory/`
  (a memória do Lex): fica só nos arquivos do caso, na pasta do cliente.
- As pastas não mudam de nome. Se uma sumir, rode
  `npx banca diagnostico --consertar` e diga em uma linha que a recriou.

## No começo de cada conversa

Rode `npx banca escritorio pastas --json` (uma vez por conversa) e use o que
ele devolve, sem despejar a lista:

- `modelos_novos` com itens → "Modelos novos", abaixo.
- `identidade` com item novo (`npx banca escritorio mostrar` diz o que está
  valendo): ofereça o **papel** só quando o item é `serve: "papel"` e o timbre
  atual é o lateral (o papel simples da Banca); ofereça o **logo** só quando o
  item é `serve: "logo"` e a ficha ainda não tem logo. Item com
  `ja_oferecido: true`: não ofereça de novo (o advogado já disse não a este
  arquivo). Uma oferta por conversa:
  «Vi "{arquivo}" na pasta 3. Uso como o papel timbrado das suas peças?» (ou
  «…Uso como o logo do escritório?») e siga o modo refazer de
  `_legalsquad/core/entrevista-escritorio.md`. Com o não, rode
  `npx banca escritorio papel --vistos "<arquivo>"`, com o arquivo recusado
  (o `arquivo` do item), para não perguntar de novo por ele; os outros
  continuam podendo ser oferecidos (e o arquivo trocado na pasta 3 volta a
  ser oferecido).
- `estado.faltam` ou `estado.aVista` com itens → `npx banca diagnostico --consertar`.

## Pedido que cita um cliente

1. Rode `npx banca escritorio cliente "<nome do cliente>" --json`.
   - `pasta` veio: é a pasta dele (`criada: true` quando você acabou de criar:
     diga «Criei a pasta da {cliente} em "1 - Clientes"»).
   - `pasta: null` com `parecidos`: pergunte «É a {parecido}, ou é cliente
     novo?». Cliente novo: repita com `--novo`. Era o parecido: repita com o
     nome da pasta.
2. `documentos: 0`: «Coloque os documentos do caso na pasta "{cliente}", dentro
   de "1 - Clientes", e me avise. Se preferir, conte o caso aqui e eu começo
   pelo seu relato.» Relato contado na conversa: grave-o num arquivo dentro da
   pasta do cliente (por exemplo, `Relato do caso.md`); nunca na memória do
   Lex. Não invente fato: sem documento e sem relato, não há peça.
3. Crie o time pela rota de sempre, apontando a pasta do cliente como o caso:
   `npx banca squad-modelo --para "<peça>" --caso "<pasta>" --criar --json`.
4. Ligue o time ao cliente:
   `npx banca escritorio cliente "<nome do cliente>" --time <code do time>`.
   A partir daí os documentos do caso são os da pasta do cliente (soltos, sem
   subpasta obrigatória), e a peça pronta sai em
   `4 - Peças prontas/<cliente>/`.
5. Indexe os documentos (`node scripts/indexar-autos.mjs squads/<code>`) e
   siga o run. O índice e o cache que o motor grava na pasta do cliente
   começam com `_`: se o advogado perguntar, são anotações da Banca e podem
   ficar lá.

Os documentos de um cliente nunca entram na peça de outro.

## Modelos novos

Com arquivos novos em `2 - Meus modelos`:

1. Diga: «Vi {N} modelo(s) novo(s) na pasta "2 - Meus modelos": {nomes}. Quer
   que eu passe a consultar esses modelos antes de escrever? Se tiverem nomes
   ou dados de clientes, vale tirar antes.»
2. Com o sim, rode `npx banca escritorio modelos --aprender --json` e depois
   `npm run indexar-acervo`. Os modelos vão para o acervo do escritório, que
   os agentes de pesquisa e de redação consultam antes de escrever. Eles ficam
   guardados na pasta do escritório; a Banca não os publica nem os envia à
   comunidade. **Não prometa sigilo nem diga que "fica só no computador":** o
   que o Lex lê passa pelo serviço de IA, como o resto da conversa. Por isso a
   pergunta do passo 1 já traz o aviso de tirar nomes e dados de clientes; se
   o advogado disser que há dados nos arquivos, espere ele trocá-los antes de
   rodar o comando.
3. `pendentes` com itens: diga o motivo em linguagem simples (o mais comum:
   arquivo `.doc` antigo, que precisa ser salvo como `.docx` no Word).
4. Com o não, rode `npx banca escritorio modelos --vistos`, para não perguntar
   de novo pelos mesmos arquivos.

Modelo é referência de estilo e de estrutura. Nome, CPF, endereço e fatos de
cliente que estejam num modelo **nunca** são copiados para a peça de outro
cliente, e toda citação de lei ou de precedente que venha de um modelo passa
pela conferência de citações como qualquer outra.

## Na entrega

O empacotador copia a peça final para `4 - Peças prontas/<cliente ou caso>/`,
com a data no começo do nome, e diz o caminho na linha `para o advogado:`. Ao
lado da peça vai o termo de conferência (`… - termo de conferência.docx`). Se
já havia uma peça com o mesmo nome e conteúdo diferente, a nova sai com «(2)»,
«(3)»… no nome e a anterior não é mexida: diga o nome exatamente como a linha
traz.

- **Caso do escritório:** diga esse caminho, e só ele: «Pronto. A peça está na
  pasta "4 - Peças prontas", em {cliente}: "{nome do arquivo}". Ao lado está o
  termo de conferência, com o que foi conferido nas citações e o que ficou
  pendente. É um rascunho técnico: a revisão e a assinatura são suas.»
- **Caso de treino** (a pasta é «Caso de treino», o nome do arquivo leva
  «TREINO - » logo depois da data e a saída traz a linha `PEÇA DE TREINO`; com
  `--json`, `"treino": true`): feche com o fecho próprio da
  entrevista (`_legalsquad/core/entrevista-escritorio.md`, "A primeira peça",
  passo 5): a peça é de um caso inventado, abre com o aviso de treino, não
  leva assinatura e não é para assinar nem protocolar;
  nunca ofereça protocolo ou envio. Linha `ATENÇÃO:` que fala do caso de
  treino (o cliente ligado ao time foi ignorado; a minuta de treino tinha um
  fecho com assinatura): diga numa linha, em linguagem simples, que a peça
  continua sendo de treino; não é defeito do papel timbrado.
- Linha `ATENÇÃO:` na saída (o papel timbrado do escritório não pôde ser
  usado e a peça saiu no papel simples da Banca): diga o motivo em linguagem
  simples, sem nome de comando nem de arquivo, e ofereça consertar o papel
  (modo refazer da entrevista). Nunca entregue calado.
- Linha `ATENÇÃO:` que fala das citações (o nome do arquivo tem «CONFERIR
  CITAÇÕES»; com `--json`, `pecas_prontas.aviso`): a peça chegou a «4 - Peças
  prontas» sem a conferência de citações em dia (não houve conferência, a peça
  mudou depois dela, ou alguma citação não foi confirmada). Diga o nome do
  arquivo como a linha traz, explique em uma frase, em linguagem simples, por
  que o nome avisa para conferir as citações, e ofereça rodar a conferência de
  citações agora (o Citation Gate do runner, Passo 4.5) e empacotar de novo.
  Nunca diga que ela está pronta para assinar. Depois de conferida, a peça
  nova chega com o nome normal, e a de antes, com «CONFERIR CITAÇÕES» no
  nome, continua na pasta: diga ao advogado que ela pode ser apagada.
- Linha `Atenção:` de cópia incompleta, ou `A peça não foi copiada para …`:
  diga que a peça está pronta, mas a cópia em «4 - Peças prontas» não saiu (em
  geral, o arquivo está aberto no Word). Nesta ordem: (1) peça: «Se a peça
  estiver aberta no Word, feche-a, por favor.» e espere; (2) rode de novo o
  empacotador do time (`node scripts/empacotar.mjs squads/<time> --run <run_id>`:
  ele apaga e refaz a pasta do pacote inteira, e o Windows recusa se algum
  arquivo dela estiver aberto no Word) e `npx banca diagnostico --consertar`;
  (3) só se a cópia continuar falhando, abra a peça para ele: se a linha
  `para o advogado:` trouxe um caminho em «4 - Peças prontas», diga onde está;
  senão, rode `npx banca escritorio abrir "<arquivo>"` com o arquivo da peça
  (o `.docx` do pacote): ele abre no programa padrão, em qualquer sistema, sem
  montar linha de `cmd` à mão, e só abre documento que esteja dentro da pasta
  do escritório.
  Nesse ramo, lembre também: «É um rascunho técnico: a revisão e a assinatura
  são suas.» A folha de teste do papel abre pelo comando próprio
  (`npx banca escritorio folha-de-teste --abrir`), em qualquer sistema.

Este fecho **substitui a conclusão padrão do runner**, que cita a pasta
`output/` e o RELATORIO.md: ao advogado não se dá esse caminho. No caso de
treino, o Lex não mostra próximos passos de protocolo.

«Onde está a peça que você fez ontem?»: olhe `4 - Peças prontas` (os nomes
começam pela data) e responda com a pasta do cliente e o nome do arquivo. Se
ele pedir para abrir, `npx banca escritorio abrir "<arquivo>"`.

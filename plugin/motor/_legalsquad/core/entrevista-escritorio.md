# Entrevista do escritório (roteiro do Lex)

Roteiro para montar a **identidade do escritório** numa conversa de cerca de 5
minutos: a ficha única em `_legalsquad/escritorio/ficha.json` (e o logo e o
papel timbrado ao lado), de onde o motor gera o perfil (`company.md`), a
configuração das intimações (`djen.json`), o papel timbrado e o nome nas
preferências. No fim, o Lex propõe a primeira peça.

O usuário não usa terminal: quem roda os comandos é você. Numa pasta
preparada, `npx banca …` sempre funciona.

**Quem está do outro lado é um advogado que mal usa o chat.** Frases curtas,
uma pergunta por mensagem, nenhum nome de pasta técnica (`_legalsquad`,
`squads`, `acervo`), de arquivo interno nem de comando. As únicas pastas que
ele conhece são as quatro numeradas e o `COMECE AQUI` (ver
`_legalsquad/core/pasta-do-escritorio/roteiro-do-lex.md`).

## Quando usar

- **Ficha ausente** (`npx banca escritorio mostrar --json` devolve
  `"existe": false`): a entrevista inteira.
- **Ficha com erro** (`"success": false` com `erros`): pergunte só os campos
  com erro, um por mensagem, corrija-os com a ferramenta Edit (não toque na
  chave `timbre` nem em `logo`) e siga para "Gravar e mostrar".
- **Pedido de mudança** ("Lex, troca o papel timbrado", "troca o logo", "muda
  o endereço", "mudei de OAB", "passei a atuar em família", "coloquei meu
  papel timbrado na pasta 3"): o modo **refazer**, no fim deste arquivo.
- **Perfil antigo:** se o `company.md` já tem a seção Identidade preenchida
  (sem nenhum `<…>`: use a ferramenta Grep da IDE com o padrão `<[^!>][^>]*>`),
  leia-o, mostre numa mensagem o que achou ("Encontrei no perfil: …; está
  certo?") e pergunte só o que falta: OAB com UF, endereço e contato, papel
  timbrado.

## Abertura

Uma linha, e já a primeira pergunta:

> ⚖️ Olá, eu sou o Lex. Antes da primeira peça, preciso conhecer o escritório:
> nome, OAB, endereço e o papel timbrado. São umas 7 perguntas rápidas, uma de
> cada vez.

## As perguntas: uma por mensagem, nesta ordem

1. **Tipo de instituição** (AskUserQuestion, uma escolha), com o enunciado
   «Que tipo de instituição é?»: Escritório de advocacia (`escritorio`) · Ministério Público
   (`ministerio-publico`) · Defensoria Pública (`defensoria`) · Outro
   (`outro`: pergunte o papel, como "departamento jurídico", e grave em
   `responsavel.cargo`).
2. **Polo predominante** (AskUserQuestion, uma escolha, com o enunciado «De
   que lado o escritório costuma atuar?» e a explicação em cada opção): «Polo ativo: quem entra com a ação» (`ativo`) · «Polo passivo:
   quem se defende» (`passivo`) · «Varia por caso: depende de cada cliente»
   (`misto`) · «Consultivo: pareceres e contratos, sem processo»
   (`consultivo`). No Ministério Público, grave `ativo` sem perguntar;
   na Defensoria, `passivo` sem perguntar. Nunca ofereça opções de um ramo só
   (acusação/defesa, reclamante/reclamada): o polo é postura, não matéria.
3. **Nome do escritório** (texto livre), como deve sair no papel timbrado.
4. **Responsável** (texto livre): «Nome completo do(a) responsável e a OAB com
   a UF (ex.: Helena Moura, OAB/MT 12345).» No Ministério Público e na
   Defensoria: nome e cargo (ex.: «Promotora de Justiça»); a OAB é opcional.
   Grave a OAB só com o número (sem pontos) e a UF em maiúsculas.
5. **Áreas** (uma chamada só do AskUserQuestion, que o advogado vê como uma
   tela só, com duas perguntas de várias escolhas, porque a ferramenta aceita
   até 4 opções por pergunta): «Áreas (1 de 2)»: Trabalhista · Consumidor ·
   Família · Nenhuma destas; «Áreas (2 de 2)»: Previdenciário · Cível ·
   Criminal · Nenhuma destas. Se a ferramenta não deixar juntar as duas, faça
   em duas mensagens, uma lista por vez. Se as duas listas ficarem sem escolha
   (ou só com «Nenhuma destas»), pergunte em texto livre quais são as áreas:
   pelo menos uma é obrigatória. Grave os slugs pela tabela abaixo, na ordem
   das opções. Área escrita em "Outra": rode `npx banca acervo areas`, ache o slug e grave; se o catálogo
   não tiver, grave o slug que o advogado indicou e diga numa linha que ela
   está fora do catálogo instalado.
6. **Endereço e contato** (texto livre, uma mensagem): «Endereço do escritório
   (rua, número, cidade/UF), telefone e e-mail que vão no papel timbrado. Se
   quiser, diga também as comarcas onde atua. Pode pular o que não quiser no
   papel.»
7. **Papel timbrado:** o do próprio escritório é o caminho principal. Antes de
   perguntar, rode `npx banca escritorio papel --json`: ele diz o que o
   advogado já pôs na pasta «3 - Identidade do escritório» e para que cada
   arquivo serve (`papel` ou `logo`).
   - **Já há um arquivo que serve de papel:** «Achei "{arquivo}" na pasta 3.
     Uso como o papel timbrado das suas peças?»
   - **Não há:** faça a pergunta em escolha (AskUserQuestion): «Você já tem
     papel timbrado do escritório?» com as opções **Tenho o papel timbrado** ·
     **Só tenho o logo** · **Não tenho nenhum dos dois**. Com a primeira ou a
     segunda, uma instrução só, com a pasta primeiro: «Coloque o arquivo na
     pasta "3 - Identidade do escritório" (ou arraste para cá) e me avise.»
     Quando ele avisar, rode `npx banca escritorio papel --json` de novo. Se o
     arquivo arrastado chegar sem caminho (imagem colada na conversa), peça para
     pôr o arquivo na pasta 3 e rode o comando outra vez. Com a terceira
     opção: «Tudo bem: eu monto um papel simples da Banca, com os dados do
     escritório.» (modelo `lateral`, sem logo).
   - Guarde o caminho do papel para o passo 3 de "Gravar e mostrar" (o comando
     precisa da ficha gravada). Papel em Word (.docx) dá o melhor resultado.
   - **Só o logo** (ou arquivo que a lista marcou como `logo`): rode
     `npx banca escritorio logo "<caminho do arquivo>"` (PNG ou JPEG, até 2
     MB). Se recusar, diga o motivo em linguagem simples, sem nome de comando
     nem de arquivo (formato, tamanho), e peça outro arquivo uma vez; na
     segunda recusa, siga sem logo e diga que dá para pôr depois com «Lex, troca
     o logo». Ao advogado, o modelo `lateral` se chama «o papel simples da
     Banca (logo à esquerda, seus dados à direita)»; nunca diga "modelo
     lateral".

| Rótulo na pergunta | Slug gravado na ficha |
|---|---|
| Trabalhista | direito-do-trabalho |
| Consumidor | direito-do-consumidor |
| Família | familia-e-sucessoes |
| Previdenciário | direito-previdenciario |
| Cível | direito-civil |
| Criminal | criminal |

## Gravar e mostrar

1. Grave `_legalsquad/escritorio/ficha.json` com a ferramenta Write (a pasta
   fica **fora** de `_legalsquad/_memory/`: a trava de LGPD da memória barra
   OAB, e-mail e telefone escritos ali pelo Claude, e a identidade do próprio
   advogado não é dado de cliente). O que não veio fica `null`, nunca `<…>`:

   ```json
   {
     "versao": 1,
     "tipo": "escritorio",
     "polo": "ativo",
     "nome": "Moura & Tavares Advocacia",
     "responsavel": { "nome": "Helena Moura", "oab": "12345", "uf": "MT", "cargo": null },
     "areas": ["direito-do-trabalho", "direito-do-consumidor"],
     "comarcas": ["Cuiabá/MT"],
     "endereco": { "linha": "Rua das Palmeiras, 210, sala 4, Centro", "cidade": "Cuiabá", "uf": "MT" },
     "contato": { "telefone": "(65) 3000-0000", "email": "contato@escritorio.exemplo" },
     "logo": null,
     "timbre": { "modelo": "lateral" }
   }
   ```

   No `logo`, ponha o nome que o comando `logo` devolveu (por exemplo,
   `"logo.png"`); sem logo, `null`. Na chave `timbre`, ponha só
   `{ "modelo": "lateral" }`: o papel do próprio escritório é gravado por
   quem o registra (o comando `papel`), nunca à mão.

   Nunca grave CPF nem dado de cliente na ficha.
2. Rode `npx banca escritorio aplicar`. Com erro, pergunte só os campos que ele
   nomeia e rode de novo. Nunca edite à mão o `company.md`, o `djen.json` nem o
   `estilo-escritorio.json`: o `aplicar` os gera da ficha. Linha `!` na saída
   (na primeira vez, o `aplicar` guardou uma cópia do que estava escrito à mão:
   o perfil, o cabeçalho do papel ou a OAB da busca de intimações): diga numa
   linha, sem nome de arquivo, que o que estava antes ficou guardado, e
   pergunte se faltou alguma linha (outra OAB, o site, uma filial).
3. **Papel do próprio escritório** (se o advogado mandou um): rode
   `npx banca escritorio papel "<caminho do arquivo>"`. Ele prova o papel numa
   peça antes de guardar; aceita Word (.docx/.dotx), imagem (PNG/JPG) e PDF.
   - **Deu certo:** siga para a folha de teste.
   - **Não deu** (arquivo corrompido, com senha, `.doc` antigo, PDF num
     computador sem conversor ou PDF que não pôde ser transformado em imagem,
     timbre solto no corpo da página): nada mudou. Se a mensagem mandar
     atualizar a pasta, diga numa linha «Vou atualizar os programas desta
     pasta, é rapidinho; seus arquivos ficam como estão.», rode você mesmo
     `npx banca update` e repita o comando, sem pedir nada ao advogado.
     Diga o motivo em linguagem simples, sem nome de comando nem de arquivo
     (onde a mensagem do comando disser "modelo lateral", diga «o papel
     simples da Banca»), e ofereça o que o comando sugerir: mandar o arquivo
     em Word (.docx), mandar uma imagem da página, ou usar o papel simples da
     Banca (logo à esquerda, seus dados à direita). Também recusam o papel:
     arquivo salvo como «Strict Open XML», imagens grandes demais (salvar em
     resolução menor) e imagem que parece um logo, não um papel: nesse caso,
     ofereça usá-la como logo (`npx banca escritorio logo "<caminho>"`).
     Quando a saída trouxer
     `logoExtraido`, ofereça: «Consegui tirar o logo de dentro do arquivo.
     Monto o papel com ele enquanto você não manda o Word?» e, com o sim, rode
     `npx banca escritorio logo "<logoExtraido>"`. **Nunca siga para a peça
     sem dizer ao advogado com que papel ela vai sair.**
   - **Imagem ou PDF:** tem de ser o papel **em branco** (só o timbre, sem
     texto de exemplo), porque a página vira o fundo de todas as páginas da
     peça; se vier com texto, peça a versão em branco ou o arquivo em Word.
   - **Imagem da página inteira:** depois da folha de teste, pergunte se o
     texto ficou em cima de algum desenho do papel. Se ficou, **não peça
     centímetros ao advogado**: rode de novo, com o mesmo arquivo, com
     `--topo <cm>` (onde o texto começa, a partir do alto; o padrão é 4,5)
     aumentado de 1 cm por vez (e `--base <cm>`, quanto sobra embaixo, o
     padrão é 3, se o problema for embaixo), e mostre a folha outra vez.
4. Ao **repetir** a folha (nova margem, novo papel, novo logo), peça antes:
   «Se a folha de teste estiver aberta no Word, feche-a, por favor.» (só ao
   repetir a folha; na primeira vez não há o que fechar. No Windows, o arquivo
   aberto trava a nova cópia). Rode
   `npx banca escritorio folha-de-teste --abrir --json` e **leia a saída antes
   de falar**, nesta ordem:
   - `"copia": null` **tem prioridade**: a cópia da folha na pasta «3 -
     Identidade do escritório» não saiu (em geral, a folha anterior está aberta
     no Word). A folha NÃO está na pasta 3: não diga que ela está lá nem que
     você a abriu. Trate só este item (o `"aberto"` não conta aqui): repita o
     pedido de fechar a folha e rode de novo.
   - `"aberto": true` (só com ele): diga «Abri a folha de teste do papel
     timbrado. É assim que as suas peças vão sair. Confira o cabeçalho, o
     rodapé e, no fim, o seu nome e a OAB. Ficou como você queria?»
     e **espere a resposta**: só depois o resumo, os modelos e a primeira
     peça, um assunto por mensagem.
   - `"aberto": false` (só vale quando a cópia existe): a folha não abriu
     sozinha. No lugar de «Abri a folha…», diga onde ela está: «A folha de
     teste do papel timbrado está na pasta "3 - Identidade do escritório", com
     o nome "Folha de teste do papel timbrado". É assim que as suas peças vão
     sair. Abra e confira o cabeçalho, o rodapé e, no fim, o seu nome e a OAB.
     Ficou como você queria?» e espere a resposta, do mesmo jeito.
   - `aviso` (no texto sem `--json`, a linha `ATENÇÃO:`): o papel do escritório
     não pôde ser usado e a folha saiu no papel simples da Banca. Diga o motivo
     em linguagem simples, sem nome de comando nem de arquivo, e trate como o
     "Não deu" acima.
5. Com o «sim» do advogado, mostre o resumo em três linhas (de
   `npx banca escritorio mostrar`): instituição e responsável · áreas e polo ·
   endereço e contato. Se ele disser que **não** ficou como queria, pergunte o
   que mudar e siga "Refazer um campo". Acrescente ao resumo:
   «Uma informação: o envio do formato das equipes de trabalho que eu monto
   para a comunidade da Banca vem desligado. Se um dia quiser ligar, é só me
   pedir.» (Instrução para o Lex, não é fala: se ele perguntar o que é
   enviado, explique em uma frase simples o que a opção faz; se ele pedir
   para ligar, ligue você mesmo, com `"contribuir": true` em
   `_legalsquad/config/acervo.json`; nunca dite o caminho. Diga também que a
   caixa de entrada da comunidade ainda não está no ar, então os envios ficam
   pendentes até ela entrar.)

## Os modelos do advogado

Numa mensagem só dele (depois do resumo), rode `npx banca escritorio modelos --json`.
Com `novos` vazio, diga numa linha: «Se quiser que eu consulte peças suas antes
de escrever, coloque-as (Word ou PDF) na pasta "2 - Meus modelos" e me avise.
Se der, tire antes os nomes e dados de clientes.» Com
arquivos novos, siga "Modelos novos" de
`_legalsquad/core/pasta-do-escritorio/roteiro-do-lex.md`.

## A primeira peça

0. Antes, o passo 4 do "Onboarding Flow" da skill (modelos de peça guardados
   noutra pasta do escritório), só quando houver o que trazer; o tipo de
   instituição é o da pergunta 1 da entrevista. Sem modelo que caiba, o passo
   manda acrescentar uma linha ao resumo: como o resumo já foi enviado (passo 5
   de "Gravar e mostrar"), diga essa linha numa frase própria, logo antes de
   propor a peça.
1. Rode `npx banca escritorio primeira-peca --json`.
   - `sugestao: null`: nenhuma área da ficha tem peça sugerida. Pergunte qual
     peça o advogado quer fazer primeiro e siga pela rota de sempre
     (`npx banca squad-modelo --para "<peça>" --criar --json`).
   - `disponivel: false`: o modelo ainda não está nesta pasta. Rode
     `npx banca acervo sync` (ou `npx banca acervo areas`, se a área estiver
     desligada) antes de oferecer.
2. Pergunte (AskUserQuestion): «Vamos fazer sua primeira peça? {peça} com o
   caso de treino (fictício) ou com um caso seu?». Opções, nesta ordem: **Caso
   de treino (fictício)**, a primeira e recomendada · **Um caso meu** ·
   **Agora não**. Se o advogado quiser a peça de outra área que ele marcou,
   ponha essa área em primeiro lugar em `areas` na ficha (ferramenta Edit),
   rode `npx banca escritorio aplicar` e repita o passo 1. Com **Agora não**,
   feche com: «Quando quiser, é só dizer, por exemplo: "Lex, preciso de uma
   petição para a cliente Maria Silva".»
   **Depois do «sim»** (caso de treino ou caso dele), e só então: se duas ou
   mais áreas da ficha levam a peça sugerida (as seis da tabela de áreas,
   acima), pergunte (AskUserQuestion) «Por qual área começamos a primeira
   peça?», com as áreas dele; ponha a escolhida em primeiro lugar em `areas`,
   rode `aplicar`, repita o passo 1 e diga qual peça ficou: «Então será {peça}.»
3. **Caso de treino:** rode
   `npx banca escritorio primeira-peca --criar --caso treino --json`. Diga numa
   linha: «Este caso é inventado (nomes, fatos e valores fictícios). Serve só
   para você ver a Banca trabalhando.» Não cite a pasta dos casos (é pasta
   técnica, escondida). Siga o `proximo` que o comando devolve: indexar os
   documentos do time e rodar o time pelo runner. **No caso de treino, nunca
   ofereça o checkpoint de protocolo ou de envio, nem próximos passos de
   protocolo.**
   **Caso do escritório:** pergunte o nome do cliente e siga, em
   `_legalsquad/core/pasta-do-escritorio/roteiro-do-lex.md`, os passos 1, 2, 4
   e 5 de "Pedido que cita um cliente" (a pasta do cliente em «1 - Clientes» é
   onde ficam os documentos). No lugar do passo 3, crie o time com
   `npx banca escritorio primeira-peca --criar --caso meu --json` e use o
   `code` que ele devolve no passo 4 (ligar o time ao cliente). **Ignore o
   `proximo` dessa saída:** ele fala em copiar documentos para uma pasta
   técnica do time; aqui os documentos ficam na pasta do cliente.
4. No run: na parada `intake`, escolha o ritmo **rápido**
   (`node scripts/squad-state.mjs ritmo squads/<time> --set rapido`); o
   perfil do projeto não muda. As paradas de decisão e a conferência de
   citações valem como em qualquer peça; nenhuma citação de memória. Num caso
   do escritório (real), diga ao advogado, numa linha: «Usei o ritmo rápido
   nesta primeira peça; se quiser a conferência completa, é só pedir.»
5. Na entrega, o empacotador monta o `.docx` com o papel timbrado e a
   assinatura e copia a peça para «4 - Peças prontas» (a linha
   `para o advogado:` da saída; se já havia outra peça com o mesmo nome e
   conteúdo diferente, a nova sai com «(2)» no nome e a anterior não é
   mexida: diga o nome exatamente como a linha traz). Ao lado da peça vai o
   termo de conferência.
   - **Caso do escritório:** feche com: «Pronto: {peça} no papel timbrado do
     escritório. Está na pasta "4 - Peças prontas", em {cliente}: "{nome do
     arquivo, como na linha}". Ao lado está o termo de conferência, com o que
     foi conferido nas citações e o que ficou pendente. É um rascunho técnico:
     a revisão e a assinatura são suas.»
   - **Caso de treino** (a saída do empacotador traz a linha `PEÇA DE TREINO`
     e, com `--json`, `"treino": true`): a peça sai com o aviso «PEÇA DE TREINO
     · caso fictício · não assinar nem protocolar» no alto da primeira página,
     sem o bloco de assinatura, e o nome do arquivo leva «TREINO - » logo depois
     da data (o termo de conferência e o PDF também). Feche com o fecho
     próprio, que não convida a assinar:
     «Pronto: a {peça} de treino saiu no papel timbrado do escritório. Está na
     pasta "4 - Peças prontas", dentro de "Caso de treino": "{nome do arquivo,
     como na linha}". O nome tem a palavra TREINO, e a primeira página avisa
     que é peça de treino. Atenção: o caso é inventado; esta peça não é para
     assinar nem protocolar. Quando quiser, fazemos a mesma peça com um caso
     seu.»
   - Nunca mande o advogado procurar em `squads/` nem em outra pasta
     técnica. Linha `ATENÇÃO:` na saída do empacotador (o papel do escritório
     não pôde ser usado, ou um aviso do caso de treino): diga o motivo em
     linguagem simples, sem nome de comando nem de arquivo, antes de fechar.
     Linha `ATENÇÃO:` que fala das citações (o nome do arquivo tem «CONFERIR
     CITAÇÕES»): explique em uma frase que as citações da peça ainda não
     passaram pela conferência e ofereça rodá-la, como em `roteiro-do-lex.md`,
     "Na entrega".
     Este fecho substitui a conclusão padrão do runner (ver
     `roteiro-do-lex.md`, "Na entrega").

## Refazer um campo

1. Leia a ficha atual com `npx banca escritorio mostrar`.
2. Pergunte só o campo pedido, com a mesma forma da pergunta acima (escolha ou
   texto livre).
3. Papel timbrado: `npx banca escritorio papel "<caminho>"` (sem caminho, ele
   lista o que está na pasta 3), como no passo 3 de "Gravar e mostrar";
   «quero voltar ao papel da Banca» é `npx banca escritorio papel --remover`.
   Logo: `npx banca escritorio logo "<caminho>"` (ele já reaplica a ficha).
   **Se o papel do próprio escritório está em uso** (o `mostrar` diz), o logo
   não aparece nele: diga «O logo só aparece no papel simples da Banca; o seu
   papel próprio já tem o timbre dele. Quer trocar o papel ou usar o papel
   simples com esse logo?». Com o papel simples: `papel --remover` e depois o
   comando `logo`.
   Outro campo: mude só esse campo em `_legalsquad/escritorio/ficha.json`
   (ferramenta Edit) e rode `npx banca escritorio aplicar`. Não mexa na chave
   `timbre` à mão: quem a grava é o comando `papel`.
4. Peça: «Se a folha de teste estiver aberta no Word, feche-a, por favor.»
   Rode `npx banca escritorio folha-de-teste --abrir --json`, trate a saída
   (`aviso`, `"aberto": false`, `"copia": null`) como no passo 4 de "Gravar e
   mostrar" e diga o que mudou, numa linha.
   A folha de teste sai de novo a cada mudança, sempre.

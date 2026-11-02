# Como usar o sistema DBU no Foundry VTT

Sistema para o **Dragon Ball Universe RPG** (regras 0.9.3 de [dbu-rpg.com](https://dbu-rpg.com/)), feito para o
Foundry VTT v14. A ficha calcula tudo sozinha (atributos, aptidões, dados extras, Acerto, Desvio,
Dano, Soak, custos de Ki, limiares de vida...) e avisa quando algo na ficha vai contra as regras.
Homebrew não foi incluído.

## Primeiros passos

1. No Foundry, crie um mundo com o sistema **Dragon Ball Universe RPG (DBU)**.
2. Como GM, abra **Configurações › Configurar Sistema › Regras Adicionais** e marque as regras
   opcionais que valem na sua campanha (ver a página "Regras Adicionais").
3. Crie um Ator do tipo **Personagem** (jogadores) ou **NPC** (adversários; não é validado contra
   as regras de criação).
4. Arraste dos compêndios **DBU — Raças**, **Traços Raciais e Fatores**, **Talentos**,
   **Transformações**, **Unique Abilities**, **Manobras Especiais** e **Equipamentos** para a ficha.
5. Defina o **PL** no cabeçalho, distribua os pontos de atributo e as perícias. Os totais, limites e
   orçamentos aparecem na própria ficha; o que estiver errado aparece em vermelho/amarelo.

Os compêndios trazem os **dados mecânicos** (números, requisitos, aspectos, custos, estrutura dos
efeitos) e um link para a página oficial. O texto completo das regras não vem embutido: em cada
item, a aba **Descrição** tem o botão **Carregar texto oficial**, que busca o texto no site e salva
no seu mundo.

## A ficha de personagem

- **Cabeçalho:** nome, PL, ToP (atual/base), LP, KP e Capacidade com barras, Karma, rodada do
  combate e "SEU TURNO" quando é a vez do personagem.
- **Alertas:** faixa logo abaixo do cabeçalho com testes obrigatórios e lembretes (ver "Alertas").
- **Principal:** atributos (Score, bônus racial, Modificador), aptidões (Initiative, Haste,
  Awareness, Defense Value, Soak, DR, Speed, Might, Surgency), Testes de Resistência e condições.
  Clique em um valor para rolar.
- **Perícias:** ranks, bônus raciais e de talentos, limites de ranks por PL e orçamento.
- **Combate:** Acerto (Strike), Desvio (Dodge), Dano (Wound), dados de ToP, Greater Dice, crítico e
  botch, contadores do combate (Ações, Counter Actions, Power, Super Stacks, Energy Charges,
  Diminishing Defense, Holding Back, DOT), manobras rápidas (Power Up, Energy Charge, Surge,
  Combat Recovery) e o botão **Atacar**.
- **Técnicas:** Signature Techniques (com construtor de Vantagens/Desvantagens que calcula TP e
  KP), Unique Abilities e Manobras Especiais.
- **Transformações:** Forms, Enhancements e Awakenings. Botão de transformar (rola o Stress Test
  com todas as regras de empilhamento), Grade (G), Stage (S), stacks (Z) e Mastery (M).
- **Raça e Talentos:** raça, traços raciais, fatores e talentos com checagem de pré-requisitos.
- **Inventário:** vestuário (camadas, penalidade, Apparel Bonus), armas (tamanho, categoria,
  Craftsmanship, qualidades) e itens.
- **Progressão e Regras:** TP ganhos/gastos, Talent Additions, Attribute Additions, todos os erros
  e avisos de regra encontrados na ficha, modificadores personalizados e **gatilhos personalizados**.
- **Regras Adicionais:** campos das regras opcionais ativadas (idade, gravidade, ferimentos,
  estilos de luta, Path to Power, Path to Godhood...).
- **Biografia:** dados de aparência, Z-Soul e notas.

## Rolagens e ataques

- Toda rolagem já soma o que se aplica: atributo, bônus fixos, penalidades de limiar, Power,
  Super Stacks, Weapon Penalty, Dados Extras de ToP, Greater Dice e modificadores de itens.
- **Crítico e Botch** são marcados no cartão de chat (Critical Target e Botch Range da ficha).
- **Atacar:** escolha a técnica ou o Perfil (Profile), a Fundação, o Ki Wager, Energy Charges e
  opções (Called Shot, Rapid...). O sistema confere as regras (custo mínimo, Capacidade, Wager
  máximo, ações), desconta KP/Capacidade/Ações e rola o Acerto.
- No cartão do ataque, o alvo clica em **Desviar** (ou Defend/Parry/Guard); o atacante rola o
  **Dano**; depois **Aplicar dano** calcula Soak, DR, categoria de dano, Guard, Broken, limiares,
  Steadfast, Massive Damage, Overkill, Bonus Momentum e Diminishing Defense.
- O GM aplica o dano em atores que o jogador não controla (via socket); o jogador não precisa de
  permissão no alvo.

## Transformações

- O botão de transformar rola o **Stress Test**: `1d10 + 1 + Stress Bonus` contra o requisito
  (somando 1/2 dos requisitos das transformações empilhadas, Step-by-Step, Prelude, Scaling e
  Grades).
- Ao entrar, os bônus de atributo, aspectos (Super Saiyan Form, Ki Multiplier, Draining,
  Straining...) e traços entram em vigor. Falhar → Stress Exhaustion.
- Transformações **Graded** (Kaioken, Super Kaioken, Evil Aura, Lightspeed Mode, Powerhouse,
  Wrathful, Beyond Divine Saiyan...) já têm os bônus por Grade automatizados: use + e − ao lado do
  "G".
- O interruptor ao lado liga/desliga sem teste (decisão do ARC).
- Ki em 0, Derrota ou Revert encerram as transformações automaticamente.

## Combate automatizado

Com **Automação de combate** ligada (configuração do mundo), o GM controla o Combat Tracker e o
sistema faz o resto. Cada ficha sabe em que rodada está e se é o seu turno.

- **Início do encontro:** gatilhos "Start of Combat Encounter".
- **Início de cada rodada:** Capacidade cheia, Ações (3 + Power Advantage − Reduced Momentum),
  Counter Actions, Diminishing Defense/Offense zerados, e gatilhos "Start of Combat Round"
  (regeneração Namekiana, Infinite Energy, Battle Born em rodadas pares...).
- **Início do seu turno:** DOT, Draining, Ki 0 (sai da transformação), Straining (botão de Stress
  Test), lembretes de Compelled e Power, efeitos temporários que acabam, e gatilhos "Start of Turn".
- **Fim do seu turno:** Poisoned, Suffocating, Gravidade, efeitos que duram "até o fim do seu
  turno" e gatilhos "End of Turn".
- **Fim do encontro:** Instant Recovery (+1/10 de LP e KP), recursos e contadores zerados.

## Gatilhos de turno e rodada

Todo traço, talento, transformação, Unique Ability ou item pode ter **gatilhos** (aba
Modificadores do item). O compêndio já vem com os efeitos de turno/rodada ligados:

- **Automático:** aplicado sozinho (ex.: *Namekian Biology* +3(bT) LP no início de cada rodada;
  *Born for Battle* +1 Battle Born nas rodadas pares; *Divine Physique* LP/KP por limiar acima).
- **Botão no chat:** quando o efeito é opcional ("you may"), aparece um botão no cartão do turno.
- **Só lembrete:** quando o efeito depende de escolha ou de algo fora da ficha, o cartão do turno
  lembra o nome do efeito no momento certo.
- **Estados e Condições temporários:** "entre no Surging State até o fim do seu turno" coloca o
  estado e o remove sozinho na hora certa (fim do turno, início do próximo turno, fim do próximo
  turno, fim da rodada ou fim do encontro).
- Efeitos de **Opções** (ex.: *Tailed/Tailless* de Saiyan Heritage, *Infinite Energy* de Energy
  Core) vêm desligados: ligue a opção escolhida na aba Modificadores do item.

Campos de um gatilho: Quando (início/fim da rodada, início/fim do seu turno, início do encontro),
Efeito (LP, KP, Capacidade, Counter Actions, Ações, stacks de recurso, State, Combat Condition,
lembrete), Valor (fórmula), Recurso (nome do recurso, State ou Condition), Condição (fórmula),
Modo e Duração.

## Battle Born, Progress e Power

- **Stacks por rolagem:** Battle Born, Progress, Bottomless Battle Born e Divine Battle Born ficam em
  **Combate › Recursos** como recursos "Por rolagem": cada stack fica no Acerto, no Desvio ou no Dano e
  dá +1(T) nessa rolagem (máx. 2 stacks por rolagem no Battle Born e no Progress).
- **Escolha automática:** quando um efeito dá um stack (Born for Battle nas rodadas pares, Warrior's
  Pride no início do encontro, ou o **+** do recurso), abre uma caixa para o **jogador dono** do personagem
  escolher a rolagem. Se o GM está rodando o combate, a caixa aparece na tela do jogador; se ele não
  estiver online, aparece para o GM.
- Rolagem no limite fica bloqueada; marque "Ignorar o limite" quando um efeito permitir (Oozaru,
  "regardless of the limit"). Efeitos que aumentam o limite (Controlled Wrathful, Condensed Legend...)
  já somam sozinhos, e a Divine Battle Born vai direto para o Dano.
- Fechou a caixa sem escolher? O stack fica esperando, com um alerta e o botão **Distribuir** na ficha.
- **Power:** as caixas de seleção ao lado de "Power" são os stacks. Marcar uma caixa dá o stack sem
  gastar Ação; o botão **Power Up** gasta 1 Ação e respeita o limite de 2 por rodada (com 2 stacks, ele
  renova a duração de um deles). Em combate, cada stack sai sozinho no fim do seu próximo turno, e a Max
  Capacity (+1/4 nos 2 primeiros stacks) acompanha.

## Técnicas de exemplo

- O compêndio **DBU — Técnicas de Exemplo** traz as 41 Signature Techniques da página de exemplos do site
  (Kamehameha, Final Flash, Spirit Bomb...), organizadas em Super, Ultimate e Dramatic Finisher. Arraste para a
  ficha ou use o ícone de livro ao lado de "Signature Techniques" na aba Técnicas.
- Cada exemplo já vem com Fundação, Perfil, Vantagens e Desvantagens (com ranks e escolhas) no construtor, e a
  ficha calcula TP e KP.
- A página de exemplos foi escrita com uma versão anterior das regras: os custos listados lá aparecem na
  descrição do item, mas a ficha recalcula pelas regras atuais. Perfis antigos (Sphere, Rapid Fire, Explosion,
  Kiai, Spell, Basic, Blitzing) foram trocados pelo Perfil atual mais próximo, e opções que não existem mais ficaram
  de fora. Tudo isso está anotado na aba Descrição de cada técnica. Requisitos que não batem com as regras atuais
  aparecem como erro no construtor.

## Injury System (ferimentos)

Com a regra **Injury System** ligada em Regras Adicionais:

- Quando um ataque aplica dano acima de **1/3 do LP máximo** do alvo (**1/4** se o dano for Lethal; metade disso
  contra um **Regenerator**, como Namekian Biology ou Nanomachine Repair), o sistema checa o limiar de vida do alvo
  depois do golpe: abaixo de Bruised permite **Minor**; abaixo de Critical, ou Derrotado, permite **Major**.
- Abre uma caixa para o **atacante** escolher o grau (nenhuma, Minor ou até Major) e o local (Olhos, Ouvidos,
  Mão/Braço, Pé/Perna, Interno, Cauda). A caixa aparece na tela do jogador dono do atacante ou, se ele não
  estiver online, na do GM.
- **Called Shot:** marque o tipo de Injury pretendido no diálogo de ataque. O dano conta +1/4 para a checagem e
  só aquele tipo pode ser infligido; sem tipo declarado não há Injury.
- A Injury entra na ficha do alvo: LP e KP máximos −1/10 (Minor) ou −1/5 (Major), mais as penalidades do local.
  Uma Minor repetida no mesmo local vira Major. Com Pé/Perna Major, falhar um Steadfast derruba (Prone).
- **Regenerator:** um Healing Surge pode encerrar uma Injury, e todas acabam no fim do encontro.

## Alertas e testes situacionais

A faixa de alertas mostra o que precisa ser feito agora, com botões quando dá para resolver na
hora:

- **Stress Test obrigatório:** transformado e derrubado por um Health Threshold (falhou o
  Steadfast ou sofreu Massive Damage). Botão rola o teste; falhar aplica Stress Exhaustion.
- **Steadfast pendente** ao cair abaixo de um limiar durante o combate.
- **Ki em 0** transformado, **Derrotado** (Desperation Effects e Karma), **Undying** com LP negativo.
- Condições com ação: Prone (levantar), Pinned (Might Clash), Compelled, Sleeping, Slowed 3,
  Poisoned, Suffocating, Staggered, Blinded, Fatigued, Stress Exhaustion.
- Lembretes: Energy Charge acumulada, Power, DOT, Draining, Rampaging, Limited, Surging,
  Determined, Gravidade, Holding Back, Surge disponível, cargas extras de Ultimate e Diminishing
  Defense.

## Regras Adicionais

Cada regra opcional é uma caixa de seleção em **Configurações › Regras Adicionais**. As marcadas
como *automatizada* são calculadas e checadas na ficha; *parcial* automatiza o que é numérico;
*referência* só aparece como lembrete.

- **Minor Optional Rules:** Profile Buyout, Style Change, Off-Guard, Ping Pong, Stamina Rules,
  Desperation Rules, United Transformation, Overkill, Limit-Breaking Training, Greater
  Enhancement, Factor Restoration, Earned Scaling, Full Power Mastery.
- **Variant Rules:** Awakening Points, Without Limit, Alternate Life Point Generation.
- **Additional Rules:** Age, Ballistics, Characteristics, Dragon Balls, Fighting Styles, Flight,
  Gag Rules, Generations, Gravity (com a intensidade do mundo), Horde Battles, Injury System,
  Path to Godhood, Path to Power, Roles.

## Checagem de regras

A ficha confere a criação e a evolução do personagem: raça e tamanhos, perks, pontos e limites
de atributo, perícias, talentos (quantidade, categorias, pré-requisitos, duplicados), TP gastos
(Signatures, Unique Abilities), limites das Signatures, transformações (raça, ToP, estágios,
empilhamento, limite de Awakenings), equipamento (camadas, armadura, armas) e recursos.

- **Erros** (vermelho) quebram uma regra; **avisos** (amarelo) pedem atenção ou decisão do ARC.
- Com **Checagem rígida** ligada, o sistema bloqueia adições claramente ilegais (dois itens de raça,
  talento repetido...). Desligada, apenas avisa.
- **Avisos instantâneos** mostram uma notificação quando uma edição cria um novo erro.

## Fórmulas dos modificadores

Modificadores e gatilhos usam a notação do DBU:

- `2(T)` = 2 × ToP atual; `1(bT)` = 1 × ToP base; `G(T)`, `Z(bT)`, `@L(T)` usam Grade, stacks e
  nível de estado.
- Variáveis: `@power`, `@below` (limiares abaixo), `@transformed`, `@inForm`, `@holdingBack`,
  `@states.raging`, `@res.battleborn` (recursos pelo nome sem espaços), `@round`, `@lifeMax`,
  `@kiMax`, `@aptitudes.surgency`, `@attributes.fo.mod`...
- Funções: `floor()`, `ceil()`, `min()`, `max()`; comparação e escolha: `@G>=3?2:1`.
- Condições: `@round % 2 == 0` (rodadas pares), `@below == 0` (Healthy), `@power >= 2`.

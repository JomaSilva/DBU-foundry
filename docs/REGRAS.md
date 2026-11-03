# DBU RPG — Regras e Relações (referência para o sistema Foundry)

Fonte: https://dbu-rpg.com/ (versão 0.9.3 das regras, conferida em 02/11/2026) e a planilha
"Super Sheetery v5.0.1". Homebrew foi ignorado. Termos em inglês entre parênteses porque
são os nomes usados nas regras originais e nos dados do sistema.

Legenda de relações: `A → B` significa "A é usado para calcular B".

---

## 1. Regras gerais (Core Rules)

- **Defensor vence (Defender Wins):** empate em Clash (inclusive Acerto x Desvio) → o defensor vence.
- **Específico sobre geral (Specific Over General)**, mesmo ignorando Prioridade.
- **Arredondar para baixo (Round Down):** toda divisão arredonda para baixo, salvo indicação.
- **Mínimos:** nenhum valor numérico fica negativo; mínimo 0 (nenhuma regra tira todos os dados).
- **Falha voluntária (Willing Failure):** pode transformar o Dice Score em 1 (0 em Clash), exceto
  em **rolagens urgentes (Urgent)**, ex.: Iniciativa.
- **Double Dip:** não se pega o mesmo Traço/Talento/Qualidade/Vantagem/Desvantagem duas vezes
  (salvo exceção explícita, ex.: Stat Boosting por atributo diferente). Talento não pode ser
  pego duas vezes. Opções de um mesmo Traço não se repetem. Não se acumula efeito de Categoria de
  Vestuário (Apparel Category) de várias camadas da mesma Categoria.
- **Multi-alvo:** o atacante rola uma vez; cada alvo rola contra esse valor separadamente.
- **Custo de Ki (Ki Point Cost):** pagamentos adicionais do mesmo Maneuver entram no custo antes das
  reduções. Custo mínimo de ataque = 1/2 do custo listado do Perfil (Profile).

### 1.1 Super Stacks (máx. 3)
- Penalidade de músculo: −1(bT) em Acerto e Desvio por stack; com 3 stacks, −1(bT) adicional
  (total −4(bT)).
- Volume sólido: +1(bT) de Soak por stack.
- Poder massivo: +1/4 do Modificador de Força na rolagem de Dano (Wound) de ataques Físicos e de
  Energia por stack.

### 1.2 Nível de Poder (PL) e Tier of Power (ToP)
`PL → ToP base`: PL 1-4 = ToP1; 5-9 = 2; 10-14 = 3; 15-19 = 4; 20-24 = 5; 25-29 = 6; 30 = 7.
Fórmula: `ToP = min(7, floor(PL/5) + 1)` (PL 30 → 7). PL máximo = 30.

- `X(T)` = X × ToP atual. `XdY(T)` = (X×ToP)dY. `X(bT)` = X × ToP **base** (só pelo PL).
- Efeitos aplicados a outro personagem usam o ToP de quem gerou o efeito.
- **Dados Extras de ToP (Tier of Power Extra Dice)** — somados a TODAS as Rolagens de Combate
  (Acerto, Dano, Desvio):

| ToP | Dados extras |
|---|---|
| 1 | — |
| 2 | +1d4 |
| 3 | +1d6 |
| 4 | +1d8 |
| 5 | +1d10 |
| 6 | +1d10+1d4 |
| 7 | +1d10+1d6 |

  Ou seja: começam em d4 no ToP2 e sobem 1 Categoria de Dado por ToP. Se um efeito aumenta a
  categoria no ToP1: +1 categoria → 1d4, +2 → 1d6 etc.
- **Greater Dice:** iguais aos dados de ToP mas começam em 1d4 no ToP1 (+1 categoria por ToP atual
  depois disso).
- **Breakthrough:** aumentar o ToP temporariamente NÃO aumenta custos de Ki.
- **Limite de ToP:** ToP atual ≤ ToP base + 2. Dados extras de ToP podem ser aplicados no máximo
  1 vez adicional.
- **Vantagem de Poder (Power Advantage):** no início de cada Rodada, se seu ToP base for maior que o
  ToP base de todos os oponentes, ganha 1 Ação extra naquela rodada.

### 1.3 Dados
- **Dado Base (Base Die):** 1d10 em toda rolagem (salvo indicação). Resultado = **Natural Result**,
  limitado a 1–10 mesmo com modificadores ao natural.
- **Dice Score:** total da rolagem (dados + bônus).
- **Categoria de Dado:** d4 → d6 → d8 → d10 → d10+d4 → d10+d6 → d10+d8 → 2d10 → 2d10+d4 …
  Multiplicadores (T)/(bT) se mantêm em todos os dados gerados.
- **Limite de aumento de categoria:** ≤ ToP base + 1 categorias (exceto Energy Charges).
- **Crítico (Critical Target):** padrão 10; nunca menor que 7. Crítico em Rolagem de Combate ou
  Teste de Resistência: +1d6, com +1 Categoria por ToP após o 1º (ToP2 = 1d8, ToP3 = 1d10,
  ToP4 = 1d10+1d4, ...).
- **Falha crítica (Botch Range):** padrão 1; nunca maior que 6. Botch em Rolagem de Combate ou
  Teste de Resistência: −2(bT) no Dice Score.
- **Perícias (Skill Checks):** Botch = −2 fixo; Crítico = +1d4 fixo (ignora ToP).
- **Prioridade de dados:** "rolar 2d10 e pegar o maior" não acumula; maior + menor se cancelam → 1d10
  normal. Só se aplica a rolagens com Dado Base.
- **Prioridade de cálculo:** multiplicações/divisões são aplicadas depois das somas.

### 1.4 Valores cruciais
- **Pontos de Vida (Life Points, LP)**, **Pontos de Ki (Ki Points, KP)**, **Capacidade (Capacity)**:
  quanto Ki pode ser gasto por rodada. Toda vez que gasta Ki, gasta Capacidade. Reseta para Max
  Capacity no início de cada Rodada. Se Max Capacity aumenta, ganha a diferença de Capacidade; se
  diminui, perde a diferença (mín. 0).
- **Pontos de Técnica (Technique Points, TP):** ganhos em Skill Improvements/criação; gastos em
  Signature Techniques e Unique Abilities.

### 1.5 Rolagens de Combate (Combat Rolls)
| Rolagem | Fórmula |
|---|---|
| **Acerto (Strike)** | 1d10 + Dados de ToP + **Haste** + **Awareness** + bônus |
| **Dano (Wound)** | 1d10 + Dados de ToP + **Atributo de Dano** (Força p/ Físico e Energia; Magia p/ Mágico) + Ki Wager + bônus |
| **Desvio (Dodge)** | 1d10 + Dados de ToP + **Defense Value** + bônus (−Diminishing Defense) |

### 1.6 Prioridade de efeitos (crescente)
Valores base < Aspectos < Estados (States) < Traços de Transformação Core < Traços de Transformação
< Traços Raciais < Talentos < Condições de Combate < Unique Abilities. Mínimos conflitantes: vale o
do efeito de maior prioridade.

### 1.7 Clashes
Vencedor = maior Dice Score (empate → defensor). Paralelo (mesma perícia/atributo), Variado (escolhe
entre opções), Conflitante (Iniciador vs Defensor). Clash de Perícia NÃO usa dados de ToP.

### 1.8 Palavras-chave de efeito
Passive, Option, Choice, Multi-Option/X, Graded, Triggered (Threshold, Defeated, Start of x,
(State), Power, Transform), Automatic, x/Round, x/Encounter, x/Character (fusões não usam),
Resource, Ruling, Permanent, Constant, Addendum, Twinned, Prerequisite, Acclimated, Adventurous,
Enhanced. Resources são perdidos no fim do Encontro; Resources de transformação somem ao sair dela.

---

## 2. Criação de Personagem e Progressão

Passos: 1) Z-Soul; 2) Raça, Sub-raça e Fatores Raciais; 3) Opções dos traços; 4) Tamanho
(Small/Medium/Large); 5) Atribute Additions; 6) Ranks de perícia (raça + Skill Improvements);
7) Talentos; 8) Converter Character Perks e repetir 5–7; 9) Signature Technique grátis de até 20 TP;
10) Gastar TP; 11) Calcular LP, KP e Max Capacity; 12) Kit de equipamento (Gear Kit).

### 2.1 Perks (Character Perk pode virar qualquer um destes)
- **Attribute Addition:** 2 pontos de atributo.
- **Talent Addition:** 1 Talento.
- **Skill Improvement:** 4 perícias DIFERENTES ganham 1 rank + 15 TP (afetado por Gifted Student).
- **Bônus no PL1:** 5 Attribute Additions; 4 Talent Additions de **categorias diferentes** (exceto
  Miscellaneous e Skill, que podem repetir — mas Skill Talent com pré-requisito de outro Skill Talent
  não); o 1º Skill Improvement do PL1 dá +2 ranks (podem ir na mesma perícia) e +10 TP → 6 ranks e
  25 TP. Perk convertido NÃO recebe esses bônus.
- Atributos começam em 1 antes das Additions e dos aumentos raciais.

### 2.2 Tabela de Power Level
| PL | ToP | Ganhos |
|---|---|---|
| 1 | 1 | 1 Character Perk, 4 Talent Additions, 5 Attribute Additions, 1 Skill Improvement, Signature grátis (20 TP) |
| 2 | 1 | Character Perk |
| 3 | 1 | Attribute Addition |
| 4 | 1 | Character Perk |
| 5 | 2 | Talent + Attribute Addition + Skill Improvement |
| 6 | 2 | Character Perk |
| 7 | 2 | Attribute Addition |
| 8 | 2 | Character Perk |
| 9 | 2 | Talent Addition |
| 10 | 3 | Talent + Attribute + Skill Improvement |
| 11 | 3 | Character Perk |
| 12 | 3 | Attribute Addition |
| 13 | 3 | Character Perk |
| 14 | 3 | Talent Addition |
| 15 | 4 | Talent + Attribute + Skill Improvement |
| 16 | 4 | Character Perk |
| 17 | 4 | Attribute Addition |
| 18 | 4 | Character Perk |
| 19 | 4 | Talent Addition |
| 20 | 5 | Talent + Attribute + Skill Improvement |
| 21 | 5 | Character Perk |
| 22 | 5 | Attribute Addition |
| 23 | 5 | Character Perk |
| 24 | 5 | Talent Addition |
| 25 | 6 | Talent + Attribute + Skill Improvement |
| 26 | 6 | Character Perk |
| 27 | 6 | Attribute Addition |
| 28 | 6 | Character Perk |
| 29 | 6 | Talent Addition |
| 30 | 7 | 5 Character Perks |

Padrão: PL ≡ 0 (mod 5) → Talent+Attribute+Skill; PL ≡ 1 ou 3 (mod 5) → Character Perk (PL 1 é
especial); PL ≡ 2 → Attribute Addition (PL2 é Perk); PL ≡ 4 → Talent Addition (PL4 é Perk).

### 2.3 Valores calculados
- **LP máximos** `= 60 + 12×(PL−1) + RLM×PL + 2×Tenacidade(Score)×PL` (+ bônus).
  `PL, RLM (Racial Life Modifier), Tenacity Score → LP máx.` Tenacidade é retroativa.
  Exemplo: Saiyajin (RLM 3) TE 4 no PL1 → 60+3+8 = 71.
- **KP (Ki Point Pool)** `= 50 + 12×(PL−1)` (+ bônus).
- **Max Capacity** `= 20 + 4×(PL−1)` (+ bônus).
- **TP** = 25 (1º Skill Improvement do PL1) + 15 por Skill Improvement adicional +
  Gifted Student (+3 por Skill Improvement com Scholarship ≥4, +6 com ≥8; retroativo).

---

## 3. Atributos e Aptidões

7 atributos: **Agility (AG)**, **Force (FO)**, **Tenacity (TE)**, **Scholarship (SC)**,
**Insight (IN)**, **Magic (MA)**, **Personality (PE)**.

- **Score** (natural; usado em pré-requisitos, Perícias e Testes de Resistência) vs **Modifier**
  (= Score por padrão, alterado por Transformações/efeitos; usado no combate).
- **Limite de Score (Score Limit)** por ToP base: `8 + 3×(ToP−1)` → 8, 11, 14, 17, 20, 23, 26.

### 3.1 Aptidões (derivadas)
| Aptidão | Fórmula | Uso |
|---|---|---|
| **Haste** | 1/2 do Mod. de Agilidade | soma no Acerto |
| **Awareness** | Mod. de Insight | soma no Acerto |
| **Defense Value** | Mod. de Agilidade + modificador de Tamanho | soma no Desvio |
| **Normal Speed** | 2 + 1/2 Mod. de Agilidade (+ mod. de Tamanho) | movimento normal (quadrados) |
| **Boosted Speed** | 2 + Mod. de Agilidade (+ mod. de Tamanho) | movimento acelerado |
| **Iniciativa** | 1d10 + 1/2 **Score** de Agilidade (sem crítico; urgente) | ordem |
| **Might** | maior entre Mod. de Força e Mod. de Magia | Clashes de Might |
| **Soak** | Mod. de Tenacidade + mod. de Tamanho (mínimo 1(bT)) | reduz dano |
| **Ingenuity** | Mod. de Scholarship ao criar item (sem bônus de Enhancements/Forms) | crafting |
| **Surgency** | Mod. de Força somado ao LP/KP recuperado em Surge | |

### 3.2 Testes de Resistência (Saving Throws) — usam o **Score**
- **Impulsive** (Agility), **Corporeal** (Tenacity), **Cognitive** (Insight), **Morale** (Personality).
- (Fórmula do bônus: ver seção de Testes de Resistência adiante.)

### 3.3 Regras ligadas a atributos
- **Gifted Student (Scholarship):** Score ≥4 → +1 em Skill Checks e +3 TP por Skill Improvement
  (retroativo). Score ≥8 → dobra (+2 e +6).
- **Determination (Personality):** Score ≥4 → +1 Stress Bonus; ≥8 → +2.
- Energia exige Score de Força ≥3; Magia exige Score de Magia ≥3.

---

## 4. Tamanho (Size)

| Tamanho | Alcance corpo a corpo | Mod. Speed | Defense Value | Soak | Quadrados |
|---|---|---|---|---|---|
| Nano | Adjacente | −6 | +3(T) | −3(T) | 1 |
| Tiny | Adjacente | −3 | +2(T) | −2(T) | 1 |
| Small | Adjacente | +0 | +1(T) | −1(T) | 1 |
| Medium | Adjacente | +0 | 0 | 0 | 1 |
| Large | Adjacente | +0 | −1(T) | +1(T) | 1 |
| Enormous | Adjacente +1 | +3 | −2(T) | +2(T) | 2×2 |
| Gigantic | Adjacente +3 | +6 | −3(T) | +3(T) | 4×4 |
| Colossal | Adjacente +6 | +10 | −5(T) | +5(T) | 7×7 |

- Penalidades de tamanho não reduzem uma Aptidão abaixo de 2.
- Na criação só pode escolher Small, Medium ou Large.
- Stealth: −1 por categoria acima de Medium / +1 por categoria abaixo. Intimidation: o inverso.
- Gigantic Grip (+1(T) Grapple por categoria maior, máx 3(T)), Giant Strike (Gigantic → Minor Sphere;
  Colossal → Standard Sphere), Giant Magnitude (+1 magnitude de AoE por categoria após Large),
  Longer Sight (+2 quadrados p/ Long Range por categoria > Large), Punching Down (+1d6(T) de dano em
  alvo 2+ categorias menor), Punching Up (Called Shot sem penalidade e +1(T) Wound por categoria em
  alvo 2+ maior), Size and Movement (±1(bT) quadrado por categoria, máx 3(bT)), Slip Through,
  Tiny Target.

---

## 5. Perícias (Skills)

- **Bônus de perícia** `= floor(Score do atributo / 2) + 2 × Ranks` (+ Gifted Student + tamanho etc.).
- **Teste:** 1d10 + bônus (sem dados de ToP). Botch −2; Crítico +1d4.
- **Limite de ranks por ToP base:** ToP1: 2; ToP2: 3; ToP3: 4; ToP4+: 5.
- **Dificuldades (TN):** Novice 6, Apprentice 10, Qualified 14, Expert 18, Master 22, Grandmaster 26.
- **(R) Required:** falha automática sem pelo menos 1 rank.
- **(E) Encompassing:** cada Especialidade é uma perícia separada com seu próprio limite de ranks.
- **Cooperação:** maior bônus rola + 1/2 do Rank Bonus do melhor ajudante; +1 no natural por ajudante
  extra.
- 2+ ranks numa perícia libera seu Adventuring Maneuver e/ou Special Maneuver.

| Atributo | Perícias |
|---|---|
| Agility | Acrobatics, Flight (R), Thievery, Stealth |
| Scholarship | Craft (R)(E: Basic Item, Apparel, Weapons, Vehicles), Knowledge (E: Science, Profession, History), Investigation, Medicine (R) |
| Insight | Clairvoyance (R), Concealment (R), Creature Handling, Intuition, Perception, Pilot (R), Survival |
| Magic | Use Magic (R) |
| Personality | Bluff, Cooking, Intimidation, Persuasion, Performance |

(Obs.: a página de Atributos lista "Piloting" em Agility, mas a página de Perícias define Pilot com
Insight — conferido na planilha, ver seção 5.1.)

| Perícia | Manobra de combate (2+ ranks) | Manobra de aventura |
|---|---|---|
| Acrobatics | Flip | Stretch |
| Flight | Soar | — |
| Thievery | Snatch, Hijack | Pickpocket |
| Stealth | Hide | Obscure |
| Craft | Repair | Create, Full Repair (+Tune Up c/ 2 ranks em Vehicles) |
| Knowledge | — | Recall, Research |
| Investigation | Analysis | — |
| Medicine | Treatment | Care, Create ([Medicine]) |
| Clairvoyance | Sense | Gauge |
| Concealment | Holding Back | Power Regulation |
| Creature Handling | — | Tame |
| Intuition | Intuit | Profiling |
| Perception | Search | — |
| Pilot | Eject | — |
| Survival | Brace | Forage |
| Use Magic | Magic Trick | — |
| Bluff | Feint | Scam, Fraud |
| Cooking | — | Cook, Create ([Food]) |
| Intimidation | Terrify | Frighten |
| Persuasion | Talk | Befriend, Mingle, Recruit |
| Performance | Hype | — |

(A página de Perícias chama o de Survival de "Forage"; a página Adventure o define como **Scavenge**.)

### 5.1b Adventuring Maneuvers (página Adventure)
- Só **fora de Combat Encounters**. Cada um tem **Time Cost** (sem passar o tempo todo, não ganha o efeito) e
  **Session Limit** (a maioria 1 por Adventuring Session); pode ter pré-requisito.
- **Universais:** Take a Breather (1 h, recupera 1/10 de LP e KP), Rest (8 h, metade de LP e KP).
- **Skilled** (2+ ranks): os da tabela acima. Limites e tempos: Stretch 1 (2 min), Pickpocket ∞ (1 min; −3 por
  tentativa repetida no mesmo alvo), Obscure ∞, Tune Up 1 (4 h), Full Repair 1 (2~10 h), Recall 1 (1 min), Research
  1 (2 h), Care 1 (2 h), Gauge ∞ (1 min; 1× por alvo), Tame 1 (1 dia), Power Regulation ∞, Profiling ∞ (1 min; 1×
  por alvo), Scavenge 1 (2 h), Scam 1 (2 h), Fraud 1 (4 h), Frighten ∞ (1× por alvo), Befriend ∞ (1× por alvo),
  Mingle 1 (2 h), Recruit 1 (1 dia), Cook ∞ (1 h; só a última Meal vale no combate), Create 1 (tempo pelo item).
- **De outras fontes:** Scan (Scouter equipado, Scout Scope), Item Search (Dragon Radar), Rice Cooker (1 h,
  1 Ingredient → Snack), Teleport (Instant Transmission), Instant Understanding (Mind Reading), Long Distance Portal
  (Portal Creation), Foresight (Precognition), Magical Sight (Second Sight), Morph (Shapeshift), Destroy (Hakai), Star
  Consume, Replicate Self e Robot Factory (Big Gete Star Integration), Recruit pela metade do tempo (Commander:
  Minion Collector), Create com Use Magic (Magical Materialization), remover absorvido (Roomy Biology: Might Clash,
  1 min, 2 por sessão). O site não publica tempo nem limite dos que vêm de Unique Abilities.
- **Adventurous** (palavra-chave): efeito de traço usável fora de combate.

### Poder de Luta (leitura de scouter — não é regra do DBU)
`0,78 × 1,75^(PL−1) × 1,4^(ToP atual−1) × (FO + (AG + TE)/4)³ × (KP atual / KP natural, mín. 10%)`, com os
Modificadores atuais. Calibrado no anime: PL 1 ≈ 400 (Goku/Piccolo no início do Z), PL 4 ≈ 8.000 (Goku), PL 5 ≈
18.000 (Vegeta, saga Saiyajin), PL 10 ≈ 530.000 (Freeza suprimido). Configurável pelo mestre.

---

## 6. Encontros de Combate

- Estrutura: posições → Iniciativa → turnos → fim da rodada.
- **Iniciativa:** 1d10 + 1/2 Score de AG; sem crítico; urgente. Empate: maior Score de AG; depois
  d10. Surpreendido: Guard Down + Slowed na rodada surpresa e metade da Iniciativa.
- **Hidden:** inimigos "Oblivious" não podem mirar você (exceto Sense/Search e certos AoE); +2(bT)
  nas Rolagens de Combate contra eles.
- **Turno:** Effect Phase → Act Phase (normalmente 3 Ações) → End Phase.
- Fim do encontro: efeitos acabam, Resources somem, **Instant Recovery** (recupera 1/10 do LP máx e
  do KP máx).

## 7. Ataque

- **Ki Wager:** gasta até 1/2 da Max Capacity (limitado pela Capacidade atual) → +1 no Wound por KP.
  Se obrigado e sem Ki/Capacidade: paga com LP.
- **Sequência:** Declaração do ataque (paga custo + wager) → Declaração de defesa (Desvio ou Defend
  com Counter Maneuver) → Clash (Acerto vs Desvio; empate = defensor) → Dano (Wound − Soak conforme
  categoria − Redução de Dano) → Fim (Bonus Momentum etc.).
- **Absolute Attack:** se errar, ainda rola Wound e aplica 1/2 contra Soak+RD. Máx 2 por rodada.
- **Energy Charges:** +1d6(T) no Wound por carga (+1d8(T) se Signature). Máx 7 por ataque.
- **Diminishing Offense:** a partir do 4º ataque na rodada, cada ataque dá 1 stack: −1(bT) no Acerto.
  Some no fim da rodada.
- **Diminishing Defense:** cada Attacking Maneuver que te mira dá stacks: −1 no Desvio por stack.
  Stacks por ataque pelo ToP base: 1–2 → 1; 3–4 → 2; 5–6 → 3; 7 → 4 (= 1 + floor((ToP−1)/2)).
  Removidos no início de cada rodada.
- **Long Range:** alvo a 9+ quadrados. Penalidade −2(bT) no Acerto.
- **AoE:** Sphere (Minor 0, Standard 1, Large 2, Huge 3, Destructive 4), Line e Cone (Standard 1 …
  Destructive 4). Todos no AoE são alvo, inclusive aliados.

## 8. Dano e Recuperação

- **Soak** = Mod. de TE (+tamanho), mínimo 1(bT).
- **Redução de Dano (Damage Reduction):** aplicada antes do Soak e não é afetada pela categoria.
- **Categoria de Dano:** 1 Standard (Soak inteiro), 2 Direct (1/2 Soak), 3 Lethal (ignora Soak).
  Soma aumentos e subtrai reduções a partir da categoria padrão; limita entre 1 e 3.
- `Dano = max(0, Wound − Redução de Dano − Soak_aplicado)`.
- **DOT:** −1(bT) LP por stack no início do turno.
- **Derrota:** LP 0 → Defeated (sai de Transformações/Estados; turno pulado). Desperation Effects
  com Karma. Morte: com intenção de matar, morre a menos que gaste 1 Karma Point.
- **Will to Survive:** se Derrotado e recuperar LP, levanta (1×/encontro).
- **Estado especial Dead:** +2 Stress Bonus, +1 Steadfast; metade do LP perdido por efeitos próprios;
  −1(bT) em Rolagens de Combate e Soak.

## 9. Fundações e Perfis (Foundations & Profiles)

- Fundações: **Physical** (corpo a corpo, salvo exceção), **Energy** (qualquer distância; exige
  Score de FO ≥3), **Magic** (qualquer distância; exige Score de MA ≥3).
- Atributo de Dano: Força (Físico/Energia), Magia (Mágico). Elemento favorito pode usar Força.
- Múltiplos perfis → usa a maior Categoria de Dano.
- Custo de Ki mínimo do ataque = 1/2 do custo do Perfil.
- **Elemento Favorito:** pode usar mesmo com MA < 3, pode usar FO como atributo de dano,
  +1(T) Acerto e +2(T) Wound.

| Perfil | Fundação | Categoria | Custo KP | Efeito resumido |
|---|---|---|---|---|
| Simple | Todas | Standard | 0 | Signature com este perfil começa em 4 TP (em vez de 8) |
| Combination | Todas | Standard | 3(T) | após acertar, +3 rolagens de Acerto contra o Desvio; cada vitória +2(T) Wound |
| Launching | Todas | Standard | 3(T) | Knockback grátis; dano de colisão dobrado |
| Mega Flare | Todas | Standard | 4(T) | até 10 Energy Charges; +1(T) Wound por carga; 7+ cargas → +1 categoria |
| Blitz | Físico | Standard | 4(T) | Charging Assault grátis; se mover > Normal Speed: +1/2 Mod AG no Wound; Signature: −2(T) KP |
| Crushing | Físico | Lethal | 6(T) | só metade do Haste no Acerto |
| Pinpoint | Físico | Standard | 4(T) | ignora Soak = Mod IN; crítico no Acerto dobra o Mod IN |
| Powered | Físico | Standard | 8(T) | aplica atributo de dano 2×; +1 Energy Charge |
| Soaring | Físico | Direct | 5(T) | Standard Line AoE |
| Sweeping | Físico | Standard | 4(T) | Minor Sphere em você; ignora aliados; se causar dano dobra Diminishing Defense |
| Beam | Energia | Direct | 8(T) | +1 Energy Charge que não conta no máximo |
| Blast | Energia | Direct | 5(T) | Cone AoE |
| Clearing | Energia | Standard | 6(T) | Sphere num quadrado não-Long Range; natural mínimo 5 no Acerto |
| Concentrated | Energia | Lethal | 10(T) | Line AoE (máx Standard); ignora 1/2 RD |
| Cutting | Energia | Direct | 6(T) | sem crítico no Acerto = Botch; crítico +1 categoria; crítico do Wound em 5+ |
| Wave | Energia | Direct | 6(T) | Line a partir de quadrado não-Long Range |
| Elemental (Dark) | Magia | Standard | 2(T) | Wager com LP; reduz luz; c/ Light +2(T) Wound |
| Elemental (Earth) | Magia | Direct | 4(T) | efeitos de Bludgeoning + Staggering |
| Elemental (Fire) | Magia | Direct | 8(T) | Threshold → Broken; Aflame |
| Elemental (Ice) | Magia | Direct | 8(T) | Threshold → Slowed; Frozen |
| Elemental (Light) | Magia | Standard | 2(T) | Full Wager grátis; aumenta luz; c/ Dark +1(T) Acerto |
| Elemental (Lightning) | Magia | Direct | 8(T) | Threshold → Impediment; Electrified |
| Elemental (Metal) | Magia | Lethal | 8(T) | Metallic |
| Elemental (Plantlife) | Magia | Standard | 3(T) | Staggering Attack grátis; cria Features |
| Elemental (Poison) | Magia | Direct | 8(T) | Threshold → Poisoned |
| Elemental (Water) | Magia | Direct | 8(T) | Threshold → Prone; Bog |
| Elemental (Wind) | Magia | Direct | 4(T) | efeitos de Slashing |

### 9.1 Super Profiles (apenas 1 por ataque; custo somado ao custo mínimo)
| Super Profile | Custo KP | Pré-requisito | Efeito |
|---|---|---|---|
| All Out | 2(T) | LP abaixo de Injured | Wager de todo o Ki (ignora Capacidade, máx Max Capacity); depois Capacidade = 0 e sucessos de Steadfast viram falhas |
| Cataclysmic Attack | 4(T) | ataque com AoE | AoE cobre o campo todo |
| Combo Attack | 2(T) | sem AoE + outra Signature sem AoE | após acertar usa a outra Signature (Out-of-Sequence); +2(T) Acerto |
| Complete Annihilation | 2(T) | 3+ Energy Charges | atributo de dano +1 vez; +1/2 dano em Undying; sem Triggered/Defeated |
| Genki | — | Unique Ability Energy Gathering | perde Lifeforce: +2(bT) Wound por stack |
| Giga Flare | 2(T)/Ação | Mega Flare | até 2 Ações; +2 Energy Charges por Ação |
| Karmic | 2(T) | Z-Soul não Neutra | +1 categoria contra Z-Soul oposta (2× contra Pure) |
| Multi-Profile | 1(T)/2(T)/3(T) | — | aplica outro Perfil sem seu custo (≤4(T)→1(T); 5–7(T)→2(T); ≥8(T)→3(T)) |
| Super Beam | 2(T) | Beam | Line AoE; +1 magnitude a cada 2 cargas; +1 categoria nos dados de carga |
| Super Combination | 2(T) | Combination | Ações extras: +rank Alotta Lotta Attacks e Peppering Blows e +1 Energy Charge por Ação |
| Super Launch | 2(T) | Launching | vence Might Clash do Knockback; perde LP = quadrados |
| Weather Maximizer | 4(T) | Weather Calling | clima Cataclysmic |
- **Dramatic Finisher:** Ultimate Signature com Super Profile; 1 por personagem; nunca na criação.

---

## 10. Limiares de Vida (Health Thresholds) e Condições

| Limiar | Condição |
|---|---|
| Healthy | LP > 1/2 do máximo |
| Bruised | LP ≤ 1/2 |
| Injured | LP ≤ 1/4 |
| Critical | LP ≤ 1/10 |

- **Steadfast Check:** 1d10, passa com 6+ (ao atravessar um limiar, depois do Maneuver).
- **Penalidade por limiar falhado:** −1(bT) em Rolagens de Combate e −1 no Stress Bonus (por limiar
  abaixo do qual você está e falhou). Poisoned dobra.
- Em Transformação: falhar o Steadfast → Stress Test forçado.
- **Massive Damage:** atravessou vários limiares → falha automática em todos menos o mais baixo
  (rola só esse); se foi Derrotado, falha em todos. Mesmo passando, faz Stress Test se transformado.
- Subir acima do limiar remove a marca. Gatilhos de limiar: 1× por limiar por encontro.
- Perder LP por efeito próprio: não ativa gatilhos (mas sofre penalidade e Reduced Momentum).

### 10.1 Condições de Combate ([S] = acumula)
| Condição | Máx | Efeito |
|---|---|---|
| Blinded | — | efeitos do nível de luz Blinding |
| Broken [S] | 3 | −2(bT) Soak por stack (após tudo); excesso vira dano extra |
| Compelled | — | só ataca o alvo; 2 Ações/turno atacando ou perde 1/10 LP; Wager mín. 1/10 Max Capacity (arred. p/ cima); rolagens urgentes |
| Drained | — | Surgency pela metade; +2(T) no custo de KP dos ataques |
| Fatigued [S] | 2 | cada stack divide a Max Capacity por 2 |
| Guard Down | — | −2(T) no Desvio e no Acerto de Parry; Guard custa +1/2 |
| Impaired [S] | 3 | −1 no Natural Result das Rolagens de Combate por stack |
| Impediment | — | não aplica uma instância dos Dados de ToP (sem dados de ToP: −2(bT) nas Rolagens de Combate). Ignorado no Superior State (que perde o 1º efeito) |
| Pinned | — | 1 Ação por rodada; sem ataques nem movimento; Might Clash para sair |
| Poisoned | — | perde 1/10 do LP máx no fim do turno; dobra penalidades de limiar |
| Prone | — | Speed, Defense Value e Haste pela metade; +1 categoria de dano recebido; 1 Ação para levantar |
| Shaken | — | não se aproxima de quem causou; −2(T) no Acerto |
| Sleeping | — | sem Maneuvers; −2 Perception/Clairvoyance; acertado automaticamente; acorda ao sofrer dano |
| Slowed [S] | 3 | −1 Ação por rodada e −1/4 de Speed por stack; 3 stacks: sem Maneuvers e turno pulado |
| Staggered | — | sem Movement, Soar ou se mover por efeito próprio |
| Stress Exhaustion | — | volta ao estado normal; metade do Ki se tinha Ki Multiplier; não entra em Enhancement/Form |
| Suffocating | — | perde 1/5 do LP máx no fim do turno |
| Transfigured | — | −2(bT) Rolagens de Combate; sem Signature/Unique Ability; só ataques Físicos |

---

## 11. Ações e Manobras

- Por rodada: **3 Ações** + **1 Counter Action**. Ação padrão pode virar Counter a qualquer momento;
  máx 6 Counter Actions por rodada. Sobra é perdida no fim da rodada.
- **Bonus Momentum:** +1 Ação ao derrubar oponente por um limiar ou derrotar um Minion (1×/rodada).
- **Reduced Momentum:** −1 Ação na próxima rodada se você mesmo se derrubou por um limiar.
- **Surges:** Healing Surge = 2d10(T) LP; Ki Surge = 1/4 do KP máx e 1/4 da Max Capacity.
  **Surgency** soma o Mod. de Força ao LP/KP recuperado.
- Tipos: Standard (no seu turno, usa Ações), Counter (quando é alvo; usa Counter Actions),
  Instant (sem custo de ação; em resposta a Standard; não dois seguidos), Out-of-Sequence.

| Manobra | Tipo | Ações | KP | Resumo |
|---|---|---|---|---|
| Arrogant Declaration [1/Enc] | Standard | 1 | — | Superior State até o fim do próximo turno; depois −1(bT) Combate/Surgency/Soak no encontro |
| Basic Attack | Standard | 1 | custo do Perfil | cada Perfil 1×/rodada (exceto Simple) |
| Combat Recovery [1/Round] | Standard | 2–3 | — | por Ação: −1(T) Defense Value até seu próximo turno; +1d10(bT) LP e KP. Condition Recovery / Spectate |
| Disarm [1/Round] | Standard | 1 | — | Clash Strike vs Strike/Dodge |
| Empower [1/Round] | Standard | X | — | transfere até 2×Might KP por Ação (dobro adjacente) |
| Energy Charge | Standard | 1 | 2(bT) | +1 Energy Charge no ataque declarado; Guard Down até atacar |
| Feature Thrust [1/Round] | Standard | 1 | — | move Feature até 1/2 Might |
| Grapple [1/Round] | Standard | 1 | — | Grapple Check (Strike vs Strike/Dodge) |
| Launch [1/Round] | Standard | 1 | — | arremessa o agarrado até Might quadrados |
| Movement [2/Round] | Standard | 1 | — / 3(T) Boosted / +2(T) Rapid | move até Normal Speed (Boosted com custo); Rapid: +1(T) Acerto até o fim do turno |
| Pin [1/Round] | Standard | 2 | — | Grapple Check −1(bT) + Might Clash → Pinned |
| Power Up [2/Round] | Standard | 1 | — | +1 stack de Power (máx 2) até o fim do próximo turno: +1(T) Rolagens de Combate por stack e +1/4 Max Capacity (só 2 primeiros stacks) |
| Revert [1/Round] | Standard | 1 | — | sai de Forms/Enhancements |
| Ride [2/Round] | Standard | 1 | — | veículos/Battle Jackets |
| Signature Technique [1/Round] | Standard | 1 | custo da técnica | |
| Terrain Lift [1/Round] | Standard | 1 | — | Mod FO > 3× Hardness |
| Throw [1/Round] | Standard | 1 | — | ataque Físico Simple à distância; Wager máx 1/4 do KP |
| Thrust [1/Round] | Standard | 1 | — | Clash Strike vs Strike/Dodge → Push Back (1/2 Might) ou Knock Prone |
| Toss [1/Round] | Standard | 1 | — | |
| Transformation | Standard | 1 | — | rola Stress Test |
| Command | Instant | — | — | Minions |
| No Effort [1/Round] | Instant | — | — | sacar arma, cancelar Energy Charge etc. |
| Surge [1/Enc] | Instant | — | — | Healing ou Ki Surge |
| United Attack [1/Round] | Instant | 1 | custo do perfil | +1/2 do atributo de dano no Wound do aliado; Wager até 1/4 Max Capacity |
| Blockade | Counter | 1C | 2(T) | Clash Impulsive para bloquear movimento |
| Defend | Counter | 1C | varia | Parry [0] (Acerto físico no lugar do Desvio; −1(bT) por carga/Power Shot), Direct Hit [0] (+1/2 Soak), Power Flare [0], Cross Counter [0] (Defense Value pela metade + Basic Attack), Guard [8(bT) +1(bT)/carga, máx +4(bT)] (Wound pela metade e −1 categoria). Defend não gera Diminishing Defense |
| Duel | Counter | 1C | custo do ataque | contra ataque com 2+ cargas ou Wager ≥10(bT); 3 Duel Clashes com maior entre FO/MA |
| Duel Escape | Counter | 1C | — | Clash Impulsive |
| Energy Cancel [1/Round] | Counter | 1C | — | |
| Exploit | Counter | 1C | — | Basic Attack Out-of-Sequence |
| Intervene | Counter | 1C | 0 / 2(bT) / 8(bT) | Defense Wall (+1/2 Soak, arred. p/ cima), Deflect, Distant Deflect |
| Sudden Stop | Counter | 1C | — | |
| Reflect | Out-of-Sequence | — | 5(T) | devolve ataque de Energia/Magia |
| Called Shot [1/Round] | Modificador | 1 | 2(T) | +1 categoria de dano, −2(T) Acerto (sem AoE) |
| Triggered [1/Round] | Modificador | — | — | atrasa um Maneuver |
| Draining Attack [1/Round] | Modificador especial | 1 | 2(T) | +1 categoria; recupera LP = dano e KP = 1/2 dano |

---

## 12. Transformações

- **Bônus de Modificador de Atributo:** cada transformação tem uma tabela de bônus por atributo
  (somados ao **Modificador**, não ao Score). Awakenings estão sempre ativos.
  `Transformações ativas → Modificadores → Aptidões (Haste, Awareness, DV, Soak, Speed, Might, Wound)`.
- **Tipos:** Awakening (permanente), Enhancement, Form. Máximo simultâneo: **1 Form + 1 Enhancement**
  (Awakenings não contam). Enhancement **Transcended** conta como Form.
- **Requisitos para transformar:** raça compatível, **ToP atual ≥ requisito de ToP**, pré-requisitos.
- **Stress Test:** `1d10 + 1 + Stress Bonus` ≥ Requisito de Stress Test (sem crítico/botch).
  **Stress Bonus = PL + Determination** (+1 com PE ≥4, +2 com PE ≥8) − 1 por limiar falhado
  (+ outros efeitos; Dead +2).
- **Transformações empilhadas:** requisito = maior requisito + 1/2 dos requisitos das demais.
- **Falhou o Stress Test:** Stress Exhaustion até o fim do próximo turno (não entra).
- **Saída forçada:** Derrota; Ki = 0 (sai + Stress Exhaustion); Revert.
- **Grades** (Graded): "G" = grade atual; muda de grade com Transformation Maneuver. Cada Grade aplica os
  Aspects da sua linha da tabela de Grades, incluindo os dos Grades abaixo (Powerhouse diz isso; Wrathful só
  tem 2 Grades). Um Aspect com nível "LVG" tem tantos níveis quanto o Grade atual.
- **Stages** (Forms): "S" = estágio; estágios herdam traços dos anteriores; precisa ter os
  anteriores. Stage 0 = Null Stage (conta como estado normal, sem Ki Multiplier).
  - Herdam os **traços**, não os AMB: cada Stage usa os da sua tabela.
  - Mais de uma forma no mesmo Stage: no Stage de cima, escolhe-se de qual delas herdar (o sistema usa a forma
    principal, a que não é variante).
  - **Evolving Traits:** "Traço (Traço de baixo)" substitui aquele traço do Stage de baixo.
  - A Mastery Trait de um Stage de baixo só vale no de cima quando ele também estiver dominado.
  - Evolved Stages não entram na herança: o SSJ3 herda do SSJ2, não do Ascended.
  - **Variants:** contam como a transformação listada para efeitos e pré-requisitos. Herdam todos os traços dela,
    menos os substituídos ("Nome (Original)"), e não podem ser usadas junto com ela.
  - **Legendary Traits:** possuídos o tempo todo depois do acesso à forma; não somam com eles mesmos. Um Null
    Stage não tem o seu; se a forma tiver mais de um, escolhe-se um ao ganhar acesso.
  - **Metamorphosis:** Suppression of Power (Full Suppression, Stage 0) ignora o requisito de ToP para entrar e
    permanecer; herdado por todos os Stages. Entrar antes do ToP com a forma enfraquecida só existe hoje pelo
    Aspect **Prelude**.
- **Step-by-Step:** de uma Form para outra de maior requisito de ToP: −1 no requisito (−2 se mesma
  linha), só no teste inicial.
- **New Level of Power** (1ª vez que ganha acesso em combate): +1 ToP, +1(bT) Stress Bonus,
  ToP base +1 p/ Power Advantage; Awakening: recupera 1/2 LP e KP; Enhancement/Form: sucesso
  automático nos Stress Tests dela.
- **Forms:** **Ki Multiplier** (KP máx ×2 e Max Capacity +1/2 quando entra via Transformation
  Maneuver). **Legend Realized** (1×/transformação/encontro): recupera LP e KP = 2d10(T) + PL.
- **Enhancements:** **Burst Limit** [1/Enc]: ao entrar numa Enhancement pela Transformation Maneuver, ou mudar o
  Grade dela pela manobra, pode-se ativar o traço Burst Limit dela. É um por encontro no total (qualquer
  Enhancement); o New Level of Power numa Enhancement libera o Burst Limit dela de novo.
  - **Burst Recovery:** numa Enhancement Transcended (ou entrando numa), ativar um Burst Limit recupera 1/2 do KP
    máximo.
  - **Transcendent Trait:** com o Aspect Transcendent, depois de Fully Mastered, mais uma maestria libera o
    Transcendent Trait, que vale enquanto a Enhancement estiver Transcended; os efeitos [Permanent] dele valem
    mesmo sem estar Transcended.
- **Awakenings:** Stacks (Z), tipos Lesser/Greater/Super (1 Super por personagem), origem
  Body/Mind. **Limite de Awakenings por ToP base:**

| ToP base | Lesser | Greater |
|---|---|---|
| 1 | 2 | 1 |
| 2 | 3 | 1 |
| 3 | 4 | 2 |
| 4 | 5 | 2 |
| 5 | 6 | 3 |
| 6 | 7 | 3 |
| 7 | 7 | 4 |

- **Grand Awakening:** traço de cada Super Awakening que não faz nada até ser ativado. Exige o **Grand Trigger**
  (condição listada no próprio traço) cumprido no encontro, que libera a **Full Awakening Maneuver** [1/Enc,
  1 Action]: ativa o Grand Awakening até o fim do encontro e recupera 1/4 (arred. p/ cima) de LP/KP.
- **Traços de Awakening "Nome (n)"** só valem com n Stacks ou mais.
- **Permanent:** efeito de traço de transformação que vale mesmo fora dela.
- **Mastery:** Mastery Trait; Difficult [LV] exige masterizar várias vezes ("M"). Os efeitos Permanent
  da Mastery Trait mudam os Aspects: "perde o Innate State (Feral)" tira só esse estado (o Wrathful continua no
  Raging); "reduz o Rampaging em 1 nível" vale depois do nível dado pelo Grade. "M levels" = um nível por maestria
  (M = número de maestrias), até o "(max. N)" quando houver; "gains N level(s)" soma aos níveis que o Aspect já tem,
  enquanto "gains the X (LVN) Aspect" deixa o Aspect com pelo menos N níveis.
- **God Ki** (estado especial): quem está numa transformação com o Aspect God Ki fica no estado God Ki. Ele dá
  acesso aos Divine Ki Points, +3(T) em Wound e Soak, e vence Concealment contra quem não sente God Ki.
- **Divine Ki Points (DKP):** pool separado = 1/2 do KP máximo (sem Ki Multiplier, arred. p/ baixo), cheio no
  início de cada encontro para quem tem acesso a uma forma com God Ki (ou está no estado). Só se usa no estado God
  Ki, como se fosse KP, com estas regras:
  - gasta 1/2 (arred. p/ cima) da Capacity Rate;
  - Draining no estado God Ki tira DKP = 1/2 do KP perdido;
  - um pagamento (custo de uma manobra, ou um Ki Wager) sai de um pool só;
  - Empower pode mandar DKP a um aliado também em God Ki;
  - o No Energy das formas com God Ki depende dos DKP.
- **God Maneuvers:** ganhas por traço e pagas em DKP: Divine Attack, Breathing, Counter, Flame, Flex, Movement,
  Pulse, Roar, God Bind, God Strike, God Finisher e Holy Transformation (custos e frequências no compêndio).

### 12.1 Aspectos com efeito numérico automatizável
| Aspecto | Efeito |
|---|---|
| Absorbed Apparel | perde vestuário; +1/2 (arred. cima) do bônus do melhor vestuário em Combate e Soak (máx 2(T)) |
| Armored | −1 categoria de dano recebida |
| Bulky | +1 Super Stack |
| Enhanced Save (X) | +1(T) no Teste de Resistência indicado |
| Glowing | fonte de luz |
| God Ki | God Ki State |
| Growth [LV~3] | tamanho mínimo Large (+1 por nível) |
| Heartbeat [Solo, LV~3] | entra por 1 Maneuver se Stress Bonus ≥ requisito − 4 |
| High Speed | +bônus de AG da transformação nas Speeds |
| Mindful | no Mindful State: +1(T) Desvio e Parry |
| Natural [Solo, LV~2] | sem Stress Tests |
| Perfect Ki Control | −1(T) no custo de KP de ataques; custo mínimo 2(T) |
| Prelude | −1 requisito de ToP e −3 requisito de Stress; −1(T) nos bônus de atributo (mín 1(T)); perde o último traço |
| Raging | no Raging State: +2(T) Wound |
| Realization | Legend Realized extra como Instant (x = ToP base − requisito, máx 2) |
| Scaling [Solo, LV~4] | +x(T) nos bônus (exceto SC/IN/PE) e +2x no Stress Test, x = ToP atual − requisito (≤ nível) |
| Super Saiyan Form | dados de ToP aplicados +1 vez; +1/4 KP máx e Max Capacity |
| Transcendent | pode ser Transcended |
| Draining [LV] | −3(T) KP por nível no início do turno (T = maior requisito de ToP ativo) |
| Exhausting | ao sair: Stress Exhaustion + Impediment |
| Fading [LV~2] | LV1: não volta no encontro; LV2: perde acesso |
| Limited [LV~5] | sai após N rodadas |
| Long Transformation [LV~2] | +1 Ação por nível; provoca Exploit |
| Peaked | não pode ser masterizada, conta como masterizada |
| Power High [LV~3] | +1(T) por nível no custo do Guard |
| Rampaging [LV~2] | Compelled contra o oponente mais próximo |
| Straining | Stress Test no início de cada turno |
| Weakening | KP < 1/4 do máximo → bônus de atributo pela metade |
| Blutz Wave / Bursting / Difficult / Light Dependent / Variant | classificação / regras especiais |

---

## 13. Estados (States)

Pode estar em vários estados (não no mesmo duas vezes). Entrar sem efeito: Instant + 1 Karma
(com requisito narrativo e permissão do ARC). "L" = nível do estado.

| Estado | Efeitos automatizáveis |
|---|---|
| **Raging** (3 níveis) | Nv1: +L(T) Wound; Botch Range +L em Acerto/Desvio/Resistência/Perícias. Nv2: +L(T) Soak. Nv3: Basic Attack extra 1×/rodada; ignora penalidade de limiar |
| **Mindful** (3 níveis) | Nv1: Critical Target −L em Combate/Resistência/Perícias; −L(T) Wound. Nv2: +2L(bT) KP ao usar Counter. Nv3: +1 Counter Action por rodada; ignora penalidade de limiar |
| **Superior** | Greater Dice nas Rolagens de Combate; +2(T) de dano recebido de ataques |
| **Undying** | não é derrotado (LP pode ficar negativo); −1(T) Rolagens de Combate |
| **Surging** | Focus: +1 Energy Charge nos ataques contra o Focus; ao sair: Fatigued |
| **Determined** | ataques acertam automaticamente; ignora penalidade de limiar; sai e pula o turno seguinte |
| **Dead** (especial) | +2 Stress Bonus, +1 Steadfast, −1(bT) Combate e Soak |

---

## 14. Raças (Racial Rules) e Fatores Raciais

- **Aumentos de Score raciais:** +2 em dois atributos e +1 em um terceiro (algumas raças deixam
  escolher). `Raça → Scores`.
- **Racial Life Modifier (RLM):** somado aos LP a cada PL (retroativo). Ex.: Saiyajin +3.
- **Teste de Resistência racial:** +1(T) no teste indicado e Critical Target −1 nele.
- **Ranks de perícia raciais:** N ranks em perícias diferentes (não pode repetir a mesma perícia).
- **Traços Raciais:** Primários e Secundários; categorias Body/Mind; sub-raças obrigatórias quando
  existem (traços de sub-raça contam como Primários).
- **Fatores Raciais:** substituem um traço Secundário (ou o traço indicado entre colchetes) por um
  Factor Trait; limite "Maximum Factor" por fator; exigem raça/pré-requisitos.
- Unique Abilities concedidas por traço não custam TP nem exigem pré-requisitos.
- **Unnatural:** imune a Suffocating e Poisoned.

## 15. Talentos

- Ganhos: 4 na criação (categorias diferentes, exceto Miscellaneous e Skill), 1 por Talent
  Addition (PL 5, 9, 10, 14, 15, 19, 20, 24, 25, 29) ou Character Perk convertido.
- Cada talento só 1 vez. Pré-requisitos: Scores de atributo, outros talentos, ranks de perícia, ToP.
  Se perder o pré-requisito, não pode usar o talento até recuperá-lo.
- Categorias (página de Talentos): Attacking, Balance, Buddy, ... (lista completa no compêndio
  **DBU — Talentos**, organizada em pastas por categoria).

## 16. Signature Techniques

- Nível: **Super**, **Ultimate**, **Dramatic Finisher** (Ultimate + Super Profile; 1 por personagem,
  nunca na criação, precisa do ARC).
- **Custo de TP:** começa em **8** (Perfil Simple: começa em 4) + Vantagens (custo por rank) −
  Desvantagens; Ultimate +4 no final. **Mínimo 8 TP.**
- **Custo de KP:** custo do Perfil + `ceil(TP/5)` (T) (+ Efficiency −4(T)/rank, Inefficiency +4(T)/rank,
  Blitz −2(T)). Na criação, não pode ser menor que o custo do Perfil. Custo mínimo em uso: 1/2 do
  custo do perfil (+ super profile).
- **TP máximo gasto numa técnica (por ToP base):** 1 → 25; 2 → 30; 3 → 40; 4+ → 50.
- **Signature grátis na criação:** até 20 TP, não custa TP.
- **Charged Up:** toda Signature aumenta a categoria dos dados de Energy Charge em 1 (d6 → d8).
- **Ultimate:** +1 Energy Charge por limiar de vida abaixo; pode ter 1 carga além do limite;
  1×/encontro cada; no máximo 3 Ultimates por encontro; nº de Ultimates ≤ max(1, nº de Supers)
  (sem contar técnicas dadas por Transformações).
- Vantagens/Desvantagens têm ranks com custos próprios e requisitos (Perfil, Fundação, AoE,
  nível Ultimate/Super, exclusões mútuas). Lista completa com custos no construtor de Signature (aba Detalhes do item).
- Ataque armado só com Signature se tiver a vantagem **Weapon Assisted**.

## 17. Unique Abilities

- Compradas com TP (na criação ou ao ganhar PL), exigem pré-requisitos.
- Tipos Technical/Magical. Cada uma é um Maneuver usado 1×/rodada com custo de KP e de Ação próprios.
- **Passive Bonus**, **Advancements** (custo de TP + pré-requisito), **Restrictions** (reduzem TP;
  travam Advancements).
- **Custo mínimo de TP:** 1/2 do custo listado. **KP mínimo:** se o custo listado ≥ 4(T), não pode
  ficar abaixo de 1/2.

## 18. Z-Soul e Karma

- Alinhamento: Pure Good (2), Good (1), Neutral (0), Evil (−1), Pure Evil (−2).
- **Karma Points:** máximo 4; começa com 2.
- Efeitos: Dynamic (variável), Karmic Boost (1: rola Greater Dice + 1(bT) após saber o resultado),
  Karmic Save (1: vence Clash de Resistência/Perícia/Might), Karmic Chance (1: rerrola um dado),
  Karmic Technique (1), Karmic Desperation (1: Defend sem Counter Action), Karmic Assault (2: Super
  Profile numa Ultimate). Desperation Effects (derrotado): "You Can't Die" (1), "You Can't Lose" (1),
  "Bring Out Your Power" (1), "Now's Your Chance" (1), "Just Take It" (1), "It's Up to You" (2).
- 1 Karma para sobreviver a uma derrota com intenção de morte.

## 19. Equipamento

- Tipos: Basic Item, Accessory, Apparel, Weapon. Integrated (ignora penalidades iniciais).
- **Gear Kit (criação):** 1 opção (arma/vestuário Grade 3, Battle Jacket Advanced, veículo Grade 3,
  acessório até Expert, Buddy, ou 2 itens até Qualified) + **2(bT) Equipment Points**.
- **Vestuário (Apparel):** até 3 camadas (Top/Middle/Bottom). **Penalidade:** −ceil(ToP base/2) em
  Rolagens de Combate por peça além da primeira (Standard Clothing não conta). Break Value 3.
  - Craftsmanship 1–5 → Grade Low/Low/Standard/Standard/High; slots 0/1/2/3/4.
  - **Apparel Bonus:** Low 1(bT), Standard 2(bT), High 3(bT).
  - Categorias: **Armor** (Redução de Dano = Apparel Bonus; precisa ser Top e única), **Weights**
    (−Apparel Bonus nas Rolagens de Combate; acumula), **Combat Clothing** (se Top: +ceil(AB/2) em
    Defense Value), **Standard Clothing** (sem penalidade de vestuário).
  - **Doff Bonus:** ao remover, +AB nas Rolagens de Combate até o fim do próximo turno (Weights após
    a 3ª rodada: +50%).
  - Natural Armor: Craftsmanship = ToP base (máx 5); só 1 camada de vestuário.
- **Armas:** Hardness 2; **Weapon Penalty −2(T) no Acerto** (removida pelo talento Weapon Specialist).
  LP da arma = 32 + 8×PL; RD 6(bT). Craftsmanship 1–5 → slots 0–4.
  - Tamanho: **Small** +1(T) Acerto, −2(T) Wound; **Standard** 0; **Big** −1(T) Acerto, +2(T) Wound.
  - Categorias Físicas: Bludgeoning (ignora 1/2 RD; Staggering), Slashing (+2(T) Wound; Diminishing
    Defense na declaração), Piercing (ignora ceil(1/4) do Soak; Lasting Wounds), Shield (+LP; Block).
  - Energia: Efficient (−2(T) KP; +2(T) Wound com Simple), Precision (Called Shot +1(T)/+2(T); Far
    Sight), High Power (Wager ≥ 1/2 Max Capacity → +1 Energy Charge; +1 magnitude).
  - Magia: Magic Staff (−2(T) KP de ataques mágicos e UAs mágicas; +2 Use Magic), Elemental Tool
    (elemento favorito), Magic Orb (Spiritual; +2(T) Wound).

---

## 20. Regras Adicionais e Opcionais (caixas de seleção)

Ativadas pelo GM em **Configurações › Regras Adicionais**. Relações principais com o resto da ficha:

| Regra | O que muda (automatizado) |
|---|---|
| Profile Buyout | +10 TP na criação; Basic Attack só com Perfis Multi-Foundation, os outros Perfis custam 2 TP cada (comprados na aba Regras Adicionais) |
| Stamina Rules | limiares de Ki: Worn (<1/2) −1(bT) Wound; Tired (<1/4) −1(bT) Combate, −1 Stress; Exhausted (<1/10) −2(bT)/−1(bT); Dire (<1/20) −3(bT)/−2(bT) |
| Desperation Rules | contra ToP base maior, 1×/encontro: LP no Ki Wager (até 1/2 da Capacidade) |
| Overkill | dano > 1/3 do LP máximo impede efeitos Triggered/Defeated (aviso no dano) |
| Limit-Breaking Training | stacks de treino não contam no limite de Awakenings |
| Greater Enhancement | 1 Enhancement masterizado vira Transcendent (+1(T) AMB, +1(T) Surgency, +1/4 Max Capacity) |
| Earned Scaling | níveis de Scaling concedidos pelo ARC (campo no item) |
| Awakening Points | limite de Awakenings vira pontos (4 no ToP 1; +1/+3/+1/+3/+1/+2) — Lesser 1, Greater 2 |
| Without Limit | ignora Limite de Score, teto de TP por Signature e limite de Awakenings |
| Alternate LP Generation | 2d10 LP por PL após o 1º em vez de 12 |
| Age | idade física/mental → bônus/penalidades em Combate, Resistências, Stress, TP, Soak, custo de KP; Mini |
| Ballistics | arma balística: Wound sem atributo, sem Wager/KP, Caliber e munição |
| Fighting Styles | Stance States com efeitos automáticos; Stance Strain −1 Stress |
| Gravity | GI do mundo − aclimatação (− metade do requisito de ToP da Form): −GI(bT) Speed e Combate, −GI Perícias e Stress; GI 2 sem Soar; GI 3+ Prone no fim do turno; GI 4+ perde 1/4 do LP ao cair |
| Injury System | dano > 1/3 do LP máximo (Lethal: 1/4; Regenerator: metade; Called Shot: dano +1/4 e tipo declarado) → Injury escolhida pelo atacante: Minor (alvo abaixo de Bruised) ou Major (abaixo de Critical/Derrotado); −1/10 ou −1/5 de LP/KP máximos e penalidades por local; Minor repetida no mesmo local vira Major; Pé/Perna Major: Steadfast falho → Prone; Regenerator: Healing Surge remove 1 e o fim do encontro remove todas |
| Path to Godhood | após PL 30: God Levels → Stress Bonus, categoria dos Dados de ToP, Legend Perks |
| Path to Power | PL1 em 5 Martial Levels: 40 LP/30 KP +5 por ML, Martial Dice d4→d10, limites próprios |
| Gag Rules | Gag Maneuver (Clash Morale) com perda de LP |
| Style Change, Off-Guard, Ping Pong, United Transformation, Factor Restoration, Full Power Mastery, Dragon Balls, Characteristics, Flight, Generations, Horde Battles, Roles | referência/parcial: lembretes, campos na ficha e checagens simples |

## 21. Testes situacionais (alertas da ficha)

- **Steadfast Check** ao atravessar um Health Threshold (após o Maneuver). Massive Damage: falha
  automática em todos menos o mais baixo; Derrotado falha em todos.
- **Stress Test forçado:** transformado + falhou um Steadfast (ou Massive Damage) → Stress Test.
  Falhou → Stress Exhaustion (sai das transformações, metade do Ki se tinha Ki Multiplier).
- **Ki = 0** transformado → sai de todas as Forms/Enhancements + Stress Exhaustion.
- **Straining:** Stress Test no início de cada turno.
- **Derrota:** Desperation Effects com Karma; 1 Karma para sobreviver à intenção de matar.
- **Undying** com LP negativo: ao sair do estado, Derrotado.
- Condições com saída por ação: Prone (1 Ação), Pinned (Might Clash), Sleeping (dano acorda),
  Slowed 3 (turno pulado), Compelled (2 Ações atacando ou −1/10 LP).

## 22. Efeitos de turno e de rodada

Ordem automática no combate (cliente do GM):

1. **Início do encontro:** gatilhos "Triggered/Start of Combat Encounter".
2. **Início da rodada:** Capacidade cheia; Ações = 3 + Power Advantage (ToP base maior que todos
   os oponentes) − Reduced Momentum; Counter Actions; zera Diminishing Defense/Offense; gatilhos
   "Start of Combat Round" (inclusive "every even-numbered Combat Round").
3. **Início do turno:** expiram efeitos "até o início do seu próximo turno"; DOT (1(bT) por
   stack); Draining (3(T) por nível); Ki 0; Straining; gatilhos "Start of Turn".
4. **Fim do turno:** Poisoned (1/10 LP), Suffocating (1/5 LP), Gravidade; expiram efeitos "até o
   fim do seu turno"; gatilhos "End of Turn".
5. **Fim da rodada:** expiram efeitos "até o fim da rodada"; gatilhos "End of Combat Round".
6. **Fim do encontro:** Instant Recovery (+1/10 LP e KP), stacks e contadores zerados, efeitos
   temporários removidos.

**Stacks por rolagem (Battle Born, Progress):** cada stack ganho vai para Acerto, Desvio ou Dano (o
jogador escolhe), +1(T) por stack nessa rolagem, máx. 2 por rolagem (limite aumentado por alguns efeitos;
Oozaru: ilimitado no Dano e todo stack novo vai para o Dano; Bottomless Battle Born: só na rolagem com
menos stacks; Divine Battle Born: sempre no Dano, máx. 3).
`Battle Born → Acerto/Desvio/Dano`; `@res.battleborn` (total) e `@res.battleborn_wound` (no Dano) nas fórmulas.

**Power:** cada stack de Power Up dura até o fim do seu próximo turno; Power Up 2×/rodada; com 2 stacks
(máximo), Power Up remove um e ganha outro (renova a duração). +1(T) nas Rolagens de Combate por stack e
+1/4 de Max Capacity só nos 2 primeiros.

Os efeitos de traços, talentos, transformações e Unique Abilities com palavras-chave
*Triggered/Start of Turn*, *Start of Combat Round*, *End of Turn* etc. foram ligados a esses
momentos: os numéricos (recuperar LP/KP, ganhar stacks/pontos/ações, entrar em State ou sofrer
Condition por um tempo) são aplicados sozinhos; os que dependem de escolha geram botão ou
lembrete.

## 23. Fusão (Fusion)

Resumo das páginas *Fusion* e *Fusion Methods & Modifiers*. Na ficha, isso fica no Ator do tipo Fusão.

**Character Combination** (o (bT) da criação é o do personagem de maior PL):
1. Z-Soul e Alinhamento entre o menor e o maior dos personagens; a fusão usa o Karma de todos.
2. Todas as raças; usa o maior Racial Life Modifier e os Saving Throws raciais de todas.
3. Até 7 traços raciais: 2 a 4 primários; o resto secundários ou de sub-raça.
4. Atributos: o maior Score de cada um.
5. Tamanho base entre o menor e o maior.
6. Todos os talentos, transformações (com maestrias), Signature Techniques e Unique Abilities.
   Awakenings dentro do limite próprio da fusão.
7. Perícias: o maior número de ranks de cada uma.
8. PL da fusão: o maior + 1(bT), se todos estão a até 5 PL do maior e não há Minion. Pode passar de
   30, mas o ToP base para em 7. Esse PL vale para ToP, LP, KP, Capacidade e Legend Realized.
9. Fused Technique, mais 10(bT) TP (ou 15(bT) sem a Fused Technique).
10. Todo o equipamento.
11. Fusion Modifiers e o Method Trait.

**Limite de Awakenings da fusão** (Lesser / Greater por ToP base): 1: 3/1 · 2: 4/2 · 3: 5/3 · 4: 6/3 ·
5: 7/4 · 6: 8/5 · 7: 10/6. Uma fusão não pode fazer parte de outra.

**Fused Technique:** duas técnicas de personagens diferentes. A base perde as Desvantagens, recebe as
Vantagens da outra, ganha Complete Annihilation, um Super Profile "Super" do perfil da base ou
Multi-Profile, e −4(T) KP. É uma Ultimate.

**Repeating Fusions:** a mesma fusão pelo mesmo método reaproveita a ficha. Atributos, itens,
perícias, PL e equipamento são refeitos; dá para trocar 1 Fusion Modifier.

**Em combate:**
- A fusão rola Iniciativa, mas joga logo depois de formada. É um personagem novo: LP e KP cheios, ou 1
  acima do limiar Bruised se todos estavam abaixo de Injured.
- Ao se separar, os personagens rolam Iniciativa de novo, entram ao lado, pulam o turno na rodada,
  ficam em Stress Exhaustion por 2 rodadas e não se fundem por 5 rodadas.
- **Defusão forçada:** falhar o Steadfast de Injured ou Critical, ou ser Derrotada.

**Métodos:**

| Método | Tipo | Rodadas | Personagens | Method Trait (resumo) |
|---|---|---|---|---|
| Metamorese | Temporária | 10 | 2 | Metamoran Clothing, +2 Stress Bonus, +2 Karma, 1 Manobra fora de sequência |
| Potara | Temporária | 20 | 2 | vestuário combinado sem penalidade, +2(bT) Wound/RD em God Ki, +2 LP/PL, 1 Stress Test salvo |
| Maxi | Temporária | 1 | 5 | +2 Ações, Ultra Fusion, Stress Tests automáticos |
| Merge | Duradoura | — | 2~4 | tamanho base +1 (+2 com 3+) |
| EX | Duradoura | — | 2 | vestuário combinado sem penalidade, +1 Stress Bonus |
| Parasitic | Duradoura | — | 2 | sem vestuário: +2(bT) Rolagens/RD; Healing Surge 1/rodada |

- **Round Limiter:** nas Temporárias, a primeira Transformação de requisito ToP 4+ corta metade do
  requisito (para cima) das rodadas restantes.
- **Defusão livre:** Duradouras se separam no início da rodada sem penalidades.
- **Metamoran Fusion Dance:** Performance contra Master (+1 categoria com tamanhos diferentes). Os
  dois acertam: Metamorese. Um erra: 1d4 (1 Frail, 2~4 Plump). Os dois erram: nada acontece.
  - Plump: Modificador de AG pela metade.
  - Frail: AG, FO, TE e MA pela metade.
  - Os dois ficam sem Fusion Modifiers, transformações, técnicas e Unique Abilities.

**Fusion Modifiers** (2 nas Temporárias, 1 nas Duradouras):

| Modifier | Requisito | Efeito |
|---|---|---|
| Balanced Fusion | 2+ atributos com Score igual ou a 1 de diferença | +2(bT) no Mod de 2 deles; +3(bT) KP no início do turno |
| Dominant Personality | 1 não-Minion, ou 1 com PL maior que todos | TP ×2; −2(T) KP em ataques e UAs |
| Enhanced Fusion | ninguém tem Forms | +1(T) Rolagens em Enhancement; +2(T) Wound com 2+ |
| Fused Transformation | todos têm a mesma Form | +1(T)/+2(T) AG/FO/TE/MA nela; estágios seguintes; sem penalidade de limiar no Stress |
| Power of Friendship | Partners (Synchronized Combatants) | +1 ToP |
| Shared Heritage | mesma raça e menos de 7 traços | RLM ×2; +1(T) AG/FO/TE/MA; +2(T) Wound da Fused Technique por personagem |
| Synergistic Fusion | 2+1(bT) talentos iguais | +1(T) AG/FO/TE/MA; +3 PL |
| The Mightiest Fusion | Rivals (Chosen Rival) | +1 ToP; é a própria Rival |

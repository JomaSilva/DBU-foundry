# Lutas de teste

Lutas canônicas rodadas no mundo de teste **dbu-teste**, com as fichas montadas pelo sistema (0 erros e
0 avisos na checagem de regras de todas) e o combate 100% automatizado: Stress Tests, New Level of Power,
Legend Realized, Draining, Ki 0, regeneração por rodada, Battle Born, limiares, Steadfast, Bonus Momentum etc.

Quem joga é uma IA simples (`build/tools/simular-luta.js`):
- usa Ki Surge ou Healing Surge abaixo de 35%;
- faz Power Up uma vez;
- usa a técnica de maior dano que cabe no Ki, com as Energy Charges obrigatórias e guardando 25% do KP;
- gasta o resto das ações em Ataque Básico físico;
- sempre se defende com Dodge.

Ela não usa Guard, Parry, Counters nem Unique Abilities, e cada confronto rodou uma vez só (menos a luta 1),
então o dado pesa bastante.

## Resultados

| Luta | Vencedor | Rodadas | Herói (LP final) | Vilão (LP final) |
|---|---|---|---|---|
| 1 — Goku SSJ × Freeza Forma Final (ToP 2) | Goku | 5 | 159/309 | 0/291 |
| 2 — Gohan SSJ2 × Cell Perfeito (ToP 3) | Gohan | 3 | 451/482 | 0/426 |
| 2b — revanche sem New Level of Power | Gohan | 7 | 283/482 | 0/426 |
| 3 — Goku SSJ3 × Kid Buu (ToP 4) | ninguém (limite de 10 rodadas) | 10 | 519/675 | 193/713 |

### Luta 1 — Goku SSJ × Freeza

- O SSJ1 nunca tinha sido usado. O Goku ganha o **New Level of Power**: entra sem Stress Test, vai do
  ToP 2 para o 3, recebe Legend Realized dobrado e tem 4 ações por rodada (Power Advantage contra o ToP 2
  do Freeza).
- Dois Kamehamehas (104 e 109 de dano) decidem.
- Com 24 LP, o Freeza falha o Steadfast, depois o Stress Test forçado, e perde a True Form (Stress
  Exhaustion). O Healing Surge não salva.
- Execuções anteriores:
  - Na 1ª, o Freeza venceu na rodada 4: o Goku tirou 1 natural no Stress Test do SSJ, e o bug do Stress
    Exhaustion que nunca acabava o deixou fora da forma (bug corrigido).
  - Na 2ª, com o bug corrigido mas ainda sem o New Level of Power, o Goku venceu na rodada 10 com 27 LP.

### Luta 2 — Gohan SSJ2 × Cell Perfeito: por que só 3 rodadas

O SSJ2 é a primeira vez do Gohan na forma, e o New Level of Power muda tudo:

| | Gohan SSJ2 + New Level of Power | Cell Perfeito |
|---|---|---|
| ToP | 4 (3 + 1 do New Level of Power) | 3 |
| Dados de ToP em cada rolagem | 2 × 1d8 (Super Saiyan Form aplica os dados duas vezes) | 1 × 1d6 |
| Acerto fixo (sem os dados) | 15 (Haste 7 + Awareness 8) | 19 (Haste 4 + Awareness 6 + Artificial Warrior 3 + Perfection 6) |
| Desvio fixo (Defense Value) | 15 | 9 |
| Ações por rodada | 4 (Power Advantage) | 3 |
| KP máximo | 515 (Ki Multiplier ×2 + Super Saiyan Form +1/4) | 206 |

- Na média, o Gohan acerta com 15 + 1d10 + 2d8 ≈ 29,5 contra um Desvio de 9 + 1d10 + 1d6 ≈ 18 do Cell:
  quase sempre acerta. O Cell acerta com ≈ 28 contra ≈ 29,5 do Gohan: mais ou menos metade das vezes.
- O Kamehameha no ToP 4 rola 12d8 de Wound: 140 e 128 de dano.
- O Cell ainda tirou dois 1 naturais no Desvio, errou 2 dos 3 ataques e a IA dele nunca usou o Special
  Beam Cannon nem a Barrier.
- **Canonicamente** é isso mesmo: no anime/mangá o Gohan SSJ2 atropela o Cell Perfeito, que não consegue
  machucá-lo. Só depois da autodestruição, já como Super Perfect Cell, a luta equilibra.
- Na **revanche sem o New Level of Power**, os dois ficam em ToP 3 e o SSJ2 passa pelo Stress Test normal.
  O Gohan ainda vence, porque a Super Saiyan Form dá a ele 2 × 1d6 de dados de ToP contra 1 × 1d6 do Cell,
  mas leva 7 rodadas e termina com 283/482 LP.

### Luta 3 — Goku SSJ3 × Kid Buu

- O SSJ3 sem maestria tem **Draining** pesado: cerca de 48 KP por turno. O Goku usa o Ki Surge na
  rodada 2, chega a 0 de KP na rodada 7 e volta ao estado normal.
- O Kid Buu regenera 13 LP por turno (regeneração Majin) e mais 77 com o Healing Surge, mas erra muito
  contra o Desvio do Goku em SSJ3.
- Depois disso, os ataques básicos do Goku mal passam do Soak do Buu.
- Empate no limite de 10 rodadas, bem parecido com o original: o SSJ3 gasta energia demais e o Goku não
  consegue terminar o serviço.
- A Genki Dama (Spirit Bomb, Finisher) não entrou: a IA só usa Finishers depois que o próprio personagem
  passou de 2 limiares de vida, e o Goku terminou com 77% do LP.

## Broly Full Power × Goku SSJ Blue (nível máximo)

Os dois no PL 30 (ToP 7, o máximo), com os 18 Character Perks gastos do mesmo jeito: 10 em atributos,
6 em talentos e 2 em Skill Improvements. Os dois com 0 erros na checagem.

- **Broly**: NPC Chefe com Legendary Saiyan, Wrathful G2, Immensely Wrathful e Full Power Super Saiyan
  totalmente dominado (maestria 2).
- **Goku**: SSJ1, SSJ2, SSJ3, Super Saiyan God e SSJ Blue totalmente dominado (maestria 2).

| Luta | Montagem | Vencedor | Rodadas | Goku (LP) | Broly (LP) |
|---|---|---|---|---|---|
| 1 | Broly quase todo em Força; os dois se transformam em combate | Goku | 13 | 1278/1278 | 0/1518 |
| 2 | Broly equilibrado; os dois já começam transformados (Broly em Full Power + Wrathful G2) | Goku | 23 | 220/1278 | 0/1338 |
| 3 | Como no filme: primeiro Full Power do Broly (New Level of Power), saindo do Wrathful | Goku | 4 | 1278/1278 | 0/1338 |
| 4 | Como no filme, mas sem o Wrathful | Goku | 5 | 1066/1278 | 0/1338 |

A luta 2 é a mais justa. O Broly bate muito mais forte e estava na frente depois de 15 rodadas (753 contra
528 LP). O Ki dele zerou na rodada 21, ele perdeu as formas e o Goku terminou o serviço em 3 rodadas.

Por que o Goku ganha:

- **As formas:** o SSJ Blue dá +6(T) em AG, FO, TE e MA; o Full Power dá +4(T). No ToP 7 isso é +42 contra
  +28. Só com o Wrathful G2 por cima (+3(T) em AG, FO e TE) o Broly passa o Goku: AG 69 contra 62, FO 66
  contra 57 e TE 63 contra 54.
- **O Ki:** o Blue totalmente dominado perde Draining e Weakening. O Full Power continua com Draining 2
  mesmo dominado (a maestria 2 só acrescenta Perfect Ki Control): uns 24 KP por turno, fora os Wagers.
- **O Stress Test do combo:** entrar no Full Power já estando no Wrathful G2 pede 34 (25 + metade de 18).
  O Broly rola 1d10 + 31 e falha com 1 ou 2, ou seja, 20% de chance. Falhou nas duas vezes que tentou
  (tirou 2 nas duas): caiu em Stress Exhaustion, perdeu o Wrathful e ficou um turno sem forma tomando
  Mastered Kamehameha de mais de 200.
  - O New Level of Power não salva esse teste: o sucesso automático não vale para transformação em
    conjunto, e o +1(bT) de Stress Bonus só conta depois que ele já está na forma.
- **Acerto e Desvio:** o Acerto é metade da AG mais a IN; o Desvio é a AG inteira.
  - Na luta 1, montado em Força (AG 14), o Broly não acertou um golpe sequer.
  - A linha de talentos de esquiva do Goku (Cunning, Instinctual e Masterful Dodge, Agile Warrior) também pesa.
- **O dano:** o soco do Broly (Might 73) passa 70 a 90 do Soak 97 do Goku. O soco do Goku (Might 57) passa
  só 10 a 30 do Soak de cerca de 100 do Broly. O dano do Goku vem do Mastered Kamehameha, de 200 a 270 de Wound.
- **A IA:** ela guarda 25% do KP. Na luta 2, o Goku parou de usar o Kamehameha na rodada 5 e venceu no soco,
  enquanto o Broly gastou Wagers de 53 KP no começo.
- **Canon:** no filme o Broly passa por cima dos dois Blues. No DBU, o SSJ Blue é uma forma de nível acima
  do Full Power (requisito ToP 5 contra 4), e o sistema segue a regra.

Nas lutas 3 e 4, os Stress Tests forçados do Broly no Full Power passaram sozinhos, por causa do New Level of
Power. É a correção feita durante os testes funcionando.

### Broly PL 30 × Goku PL 25 (mais canônico)

No filme o Broly base já é muito mais forte que o Goku, então baixei o Goku para o PL 25 (ToP 6). Ele tem
11 Character Perks, na mesma proporção: 6 em atributos, 4 em talentos e 1 em Skill Improvement. O Broly é o
da luta 2 acima. Os dois começam já transformados.

| Execução | Vencedor | Rodadas | Goku (LP) | Broly (LP) |
|---|---|---|---|---|
| 1 | Broly | 3 | 0/973 | 1143/1338 |
| 2 | Broly | 4 | 0/973 | 1338/1338 |

| Já transformados | Broly PL 30 (Full Power + Wrathful G2) | Goku PL 25 (SSJ Blue) |
|---|---|---|
| ToP | 7 | 6 |
| Dados de ToP por rolagem | 2 × (1d10+1d6) | 2 × (1d10+1d4) |
| AG / FO / TE | 69 / 66 / 63 | 53 / 49 / 46 |
| Might / Soak | 73 / 101 | 49 / 83 |
| LP / KP | 1338 / 995 | 973 / 845 |
| Ações por rodada | 4 (Power Advantage) | 3 |

- O Broly abre com o Gigantic Roar (460 e 425 de dano) e fecha com Eraser Cannon (260 a 270) e socos de
  mais de 100.
- O Goku acertou um Mastered Kamehameha nas duas lutas (195 de dano). O Healing Surge só adiou o fim.
- É a luta do filme: o Goku Blue não aguenta o Broly Full Power.

### Gogeta × Broly (fusão em combate)

O Goku (PL 30) e o Vegeta (PL 30, montado igual ao Goku com Final Flash e Big Bang Attack) começam na
cena contra o mesmo Broly da luta 2, já em Full Power + Wrathful G2. No primeiro turno do Vegeta os dois
se fundem pela Metamorese. O resultado da dança foi deixado como sucesso, porque as fichas não têm a
Unique Ability da dança nem ranks de Performance.

**O Gogeta:**
- PL 37 (30 + 7), ToP 7, 1750 LP, Karma 6 (2 de cada + 2 do método).
- Fusion Modifiers: Fused Transformation (+2(T) no SSJ Blue) e Shared Heritage (RLM em dobro e +1(T)).
- Fused Technique: **Big Bang Kamehameha**, Kamehameha mais as Vantagens do Final Flash, com Super Beam.

| | Gogeta (SSJ Blue) | Broly (Full Power + Wrathful G2) |
|---|---|---|
| AG / FO / TE | 83 / 79 / 76 | 69 / 66 / 63 |
| Might / Soak | 79 / 131 | 73 / 101 |
| LP / KP no Blue | 1750 / 1205 | 1338 / 995 |

**Resultado:** o Gogeta venceu na rodada 5 sem levar nenhum golpe (1750/1750), com 3 rodadas de fusão
sobrando.
- O Big Bang Kamehameha abriu com 270 de dano.
- Os Mastered Kamehamehas fizeram de 182 a 261.
- O Broly errou todos os ataques: Acerto de 76 a 108 contra Desvio de 126 a 139.
- **Round Limiter:** 10 rodadas, cortadas para 7 ao entrar no SSJ Blue (requisito ToP 5), depois 6, 5, 4 e 3.

**Defusão por tempo, testada à parte:** fundidos em combate e com 1 rodada no contador. Na virada da
rodada o Gogeta saiu da cena e Goku e Vegeta voltaram ao lado com Iniciativa nova. O turno do Goku
naquela rodada foi pulado sozinho. Os dois ficaram em Stress Exhaustion até o fim da rodada seguinte,
2 rodadas no total, e só podem se fundir de novo 5 rodadas depois.

```text
=== Gogeta (Metamorese, SSJ Blue) × Broly (Full Power + Wrathful G2) · PL 30 ===
Iniciativa: Goku SSJ Blue (nível máximo) 17.2 · Vegeta SSJ Blue (nível máximo) 19.19 · Broly (Full Power, nível máximo) 15.2
— Rodada 1 —
 • Vegeta SSJ Blue (nível máximo): Metamoran Fusion Dance com Goku SSJ Blue (nível máximo) → FUSÃO!
   Gogeta (PL 37, ToP 7, LP 1750/1750, KP 482, Karma 6) · 10 rodadas
 • Gogeta [base · ToP 7] (LP 1750/1750, KP 482/482, Ações 3)
   Transformation Maneuver → Super Saiyan Blue: TRANSFORMOU (Stress Test 43 vs 30)
   Big Bang Kamehameha (Wager 51): Acerto 123 vs Desvio 72 → ACERTOU · Wound 320 → 270 de dano (Broly (Full Power, nível máximo): 1338 → 1068 LP)
   Ataque Básico: Acerto 117 vs Desvio 92 → ACERTOU · Wound 147 → 46 de dano (Broly (Full Power, nível máximo): 1068 → 1022 LP)
   Round Limiter: 10 → 7 rodadas (SSJ Blue tem requisito ToP 5)
 • Broly (Full Power, nível máximo) [Wrathful + Full Power Super Saiyan · ToP 7] (LP 1022/1338, KP 971/995, Ações 3)
   Power Up (Power 1)
   Ataque Básico (Wager 53): Acerto 98 (CRÍTICO) vs Desvio 139 → errou
   Ataque Básico (Wager 53): Acerto 108 (CRÍTICO) vs Desvio 126 → errou
— Rodada 2 — (fusão: 6 rodada(s) restante(s))
 • Gogeta [Super Saiyan Blue · ToP 7] (LP 1750/1750, KP 423/1205, Ações 3)
   Power Up (Power 1)
   Mastered Kamehameha: Acerto 123 vs Desvio 117 → ACERTOU · Wound 236 → 182 de dano (Broly (Full Power, nível máximo): 1022 → 840 LP)
   Ataque Básico: Acerto 122 vs Desvio 104 → ACERTOU · Wound 173 → 65 de dano (Broly (Full Power, nível máximo): 840 → 775 LP)
 • Broly (Full Power, nível máximo) [Wrathful + Full Power Super Saiyan · ToP 7] (LP 775/1338, KP 841/995, Ações 3)
   Energy Charge (1) para Gigantic Roar
   Energy Charge (2) para Gigantic Roar
   Gigantic Roar (Wager 53): Acerto 94 vs Desvio 132 → errou
— Rodada 3 — (fusão: 5 rodada(s) restante(s))
 • Gogeta [Super Saiyan Blue · ToP 7] (LP 1750/1750, KP 332/1205, Ações 3)
   Ki Surge: 332 → 712 KP
   Mastered Kamehameha (Wager 64): Acerto 119 vs Desvio 95 → ACERTOU · Wound 311 → 261 de dano (Broly (Full Power, nível máximo): 775 → 514 LP)
   Mastered Kamehameha (Wager 44): Acerto 131 vs Desvio 89 → ACERTOU · Wound 289 → 235 de dano (Broly (Full Power, nível máximo): 514 → 279 LP)
   Mastered Kamehameha: Acerto 131 vs Desvio 62 → ACERTOU · Wound 241 → 184 de dano (Broly (Full Power, nível máximo): 279 → 95 LP)
   Ataque Básico: Acerto 102 vs Desvio 79 → ACERTOU · Wound 174 → 52 de dano (Broly (Full Power, nível máximo): 95 → 43 LP)
 • Broly (Full Power, nível máximo) [Wrathful + Full Power Super Saiyan · ToP 7] (LP 43/1338, KP 504/995, Ações 3)
   Stress Test obrigatório: passou
   Healing Surge: 43 → 206 LP
   Power Up (Power 1)
   Ataque Básico (Wager 53): Acerto 78 vs Desvio 127 → errou
   Ataque Básico (Wager 53): Acerto 76 vs Desvio 126 → errou
— Rodada 4 — (fusão: 4 rodada(s) restante(s))
 • Gogeta [Super Saiyan Blue · ToP 7] (LP 1750/1750, KP 331/1205, Ações 3)
   Power Up (Power 1)
   Ataque Básico: Acerto 115 vs Desvio 83 → ACERTOU · Wound 179 → 43 de dano (Broly (Full Power, nível máximo): 206 → 163 LP)
   Ataque Básico: Acerto 114 vs Desvio 90 → ACERTOU · Wound 177 → 41 de dano (Broly (Full Power, nível máximo): 163 → 122 LP)
   Ataque Básico: Acerto 114 vs Desvio 97 → ACERTOU · Wound 182 → 39 de dano (Broly (Full Power, nível máximo): 122 → 83 LP)
 • Broly (Full Power, nível máximo) [Wrathful + Full Power Super Saiyan · ToP 7] (LP 83/1338, KP 374/995, Ações 3)
   Energy Charge (1) para Eraser Cannon
   Energy Charge (2) para Eraser Cannon
   Eraser Cannon: Acerto 86 vs Desvio 128 → errou
— Rodada 5 — (fusão: 3 rodada(s) restante(s))
 • Gogeta [Super Saiyan Blue · ToP 7] (LP 1750/1750, KP 331/1205, Ações 3)
   Ataque Básico: Acerto 118 vs Desvio 91 → ACERTOU · Wound 187 → 51 de dano (Broly (Full Power, nível máximo): 83 → 32 LP)
   Ataque Básico: Acerto 118 vs Desvio 98 → ACERTOU · Wound 174 → 38 de dano (Broly (Full Power, nível máximo): 32 → 0 LP)
VENCEDOR: Gogeta (rodada 5)
```

### Fichas do Broly e do Goku

- **Broly (Full Power, nível máximo)**: NPC Chefe, PL 30, ToP 7, Saiyan; LP 1338, KP 398 (995 no Full Power).
  - Atributos: AG 20, FO 16, TE 13, SC 1, IN 12, MA 1, PE 1. O Immensely Wrathful dá +1 em FO, TE e MA.
  - Traços: Born for Battle, Saiyan Heritage (Tailless), Legendary Saiyan, Blood of the Warrior, Powerful Physique.
  - Talentos (20): Saiyan Soul, Angry Warrior, Burning Fury, Furious Berserker, Primal Rage, Enhanced Fist,
    Iron Fist, Rapid Fist, Supreme Fist, Cunning Dodge, Instinctual Dodge, Masterful Dodge, Agile Warrior,
    Insightful Warrior, Resilience, Tough Warrior, Willpower, Enhanced Shot, Point Blank Shot, Muscular Warrior.
  - Transformações: Super Saiyan 1 (maestria 1, S-Cells: Super Sturdy), Full Power Super Saiyan (maestria 2),
    Wrathful (até G2), Immensely Wrathful.
  - Técnicas (montadas no construtor): Eraser Cannon, Gigantic Roar; Explosive Wave.
  - Na luta 1 a ficha era outra: AG 14, FO 24, TE 16, IN 7, com talentos de força (Herculean Power...) no
    lugar dos de esquiva.
- **Goku SSJ Blue (nível máximo)**: Personagem, PL 30, ToP 7, Saiyan; LP 1278, KP 398 (995 no Blue).
  - Atributos: AG 20, FO 15, TE 12, SC 2, IN 12, MA 2, PE 1.
  - Traços: Born for Battle, Saiyan Heritage (Tailless), Warrior's Pride, Blood of the Warrior, Powerful Physique.
  - Talentos (20): Saiyan Soul, Kindhearted Saiyan, Enhanced Fist, Iron Fist, Rapid Fist, Supreme Fist,
    Enhanced Shot, Artillery Shot, Point Blank Shot, Cunning Dodge, Instinctual Dodge, Masterful Dodge,
    Agile Warrior, Angry Warrior, Calm Mind, Combat Zen, Tranquil Warrior, Insightful Warrior, Willpower, Footwork.
  - Transformações: SSJ1 (maestria 1, S-Cells: Super Surger), SSJ2 (maestria 2), SSJ3 (maestria 1),
    Super Saiyan God (maestria 1), Super Saiyan Blue (maestria 2, Blue Saiyan: Blue Classic), Kaioken.
  - Técnicas: Kamehameha, Mastered Kamehameha; Afterimage Technique.
- **Goku SSJ Blue (PL 25)**: Personagem, PL 25, ToP 6, Saiyan; LP 973, KP 338 (845 no Blue).
  - Atributos: AG 17, FO 13, TE 10, SC 1, IN 10, MA 2, PE 1.
  - Traços, transformações e técnicas iguais aos do Goku de PL 30.
  - Talentos (17): os do PL 30 menos Combat Zen, Tranquil Warrior e Footwork.

## Fichas

Todas no mundo **dbu-teste**, de volta ao estado inicial (LP/KP cheios). Freeza e Kid Buu começam já na
forma do nome. O SSJ1 do Goku de Namek e o SSJ2 do Gohan estão desmarcados como "já usados", então o New
Level of Power acontece de novo.

- **Goku (Namek)**: Personagem, PL 9, ToP 2, Saiyan; LP 309, KP 146.
  - Atributos: AG 7, FO 8, TE 6, SC 1, IN 3, MA 1, PE 2.
  - Traços: Born for Battle, Saiyan Heritage (Tailless), Warrior's Pride, Blood of the Warrior, Powerful Physique.
  - Talentos: Saiyan Soul, Enhanced Fist, Enhanced Shot, Cunning Dodge, Angry Warrior, Rapid Fist.
  - Transformações: Super Saiyan 1 (S-Cells: Super Surger, nunca usado), Kaioken.
  - Técnicas: Kamehameha; Afterimage Technique.
- **Freeza (Forma Final)**: NPC Chefe, PL 9, ToP 2, Arcosian; LP 291, KP 146 (292 na True Form).
  - Atributos: AG 8, FO 7, TE 5, SC 1, IN 2, MA 1, PE 4.
  - Traços: Overwhelming Fighter, Survivor (Sleek Plating), Overwhelming Assault, Surprising Resilience, Emperor.
  - Talentos: Reserved Tail, Enhanced Shot, Point Blank Shot, Cunning Dodge, Arrogance, Mental Warfare.
  - Transformações: Full/Heavy/Partial Suppression, True Form (maestria 1).
  - Técnicas: Death Beam (Penetration), Supernova; Telekinesis.
- **Gohan (Cell Games)**: Personagem, PL 14, ToP 3, Saiyan; LP 482, KP 206.
  - Atributos: AG 7, FO 8, TE 7, SC 2, IN 4, MA 1, PE 3.
  - Traços: Born for Battle, Saiyan Heritage (Tailless), Blood of the Warrior, Powerful Physique, Warrior of Two Worlds.
  - Talentos: Saiyan Soul, Kindhearted Saiyan, Enhanced Shot, Artillery Shot, Cunning Dodge, Angry Warrior,
    Burning Fury, Calm Mind.
  - Transformações: Super Saiyan 1 (maestria 1, S-Cells: Super Surger), Super Saiyan 2 (nunca usado).
  - Técnicas: Kamehameha, Masenko.
- **Cell Perfeito**: NPC Chefe, PL 14, ToP 3, Bio-Android; LP 426, KP 206.
  - Atributos: AG 7, FO 7, TE 6, SC 3, IN 4, MA 1, PE 4.
  - Traços: Artificial Warrior (Genetic Aggressor), Uncanny Monster, Saiyan Genes, Namekian Genes, Arcosian Genes.
  - Talentos: Genetic Catalogue, Enhanced Shot, Enhanced Fist, Arrogance, Resilience, Mental Warfare,
    Point Blank Shot, Cunning Dodge.
  - Transformação: Perfection (Awakening Z2, Genetic Aggressor).
  - Técnicas: Kamehameha, Special Beam Cannon; Barrier.
- **Goku SSJ3 (Saga Majin Boo)**: Personagem, PL 19, ToP 4, Saiyan; LP 675, KP 266.
  - Atributos: AG 9, FO 10, TE 8, SC 1, IN 4, MA 1, PE 3.
  - Traços: Born for Battle, Saiyan Heritage (Tailless), Warrior's Pride, Blood of the Warrior, Powerful Physique.
  - Talentos: Saiyan Soul, Kindhearted Saiyan, Enhanced Fist, Rapid Fist, Supreme Fist, Enhanced Shot,
    Cunning Dodge, Instinctual Dodge, Angry Warrior, Calm Mind.
  - Transformações: SSJ1 (maestria 1), SSJ2 (maestria 2), SSJ3 (sem maestria), Kaioken.
  - Técnicas: Kamehameha, Mastered Kamehameha, Spirit Bomb; Afterimage Technique.
- **Kid Buu (Pure Form)**: NPC Chefe, PL 19, ToP 4, Majin; LP 713, KP 266 (532 na Pure Form).
  - Atributos: AG 7, FO 10, TE 8, SC 1, IN 1, MA 4, PE 5.
  - Traços: Rubbery Body, Majin Regeneration, Steaming Fury, Majin Malice, Elastic Tentacle, Bouncy Physique.
  - Talentos: Roomy Biology, AIIIEEEEEEE, Angry Warrior, Furious Berserker, Resilience, Tough Warrior,
    Enhanced Fist, Rapid Fist, Enhanced Shot, Point Blank Shot.
  - Transformações: Pure Form (maestria 4); Awakenings Super Regeneration, Super Majin, Unkillable Majin.
  - Técnicas: Kamehameha, Vanishing Ball.

## Corrigido durante os testes

- **Stress Exhaustion nunca acabava**: agora dura até o fim do próximo turno, como na regra.
- **Aviso falso de requisito racial** ("Perfection: Bio-Android"): a comparação agora ignora hífen e plural.
- **Traços secundários de Majin e Aliens** vinham marcados como primários.
- **Faltavam os Factor Traits exclusivos de raça**: Emperor, Legendary Saiyan, Tremendous Lord e Golden Fruit.
- **Efeitos "Choice"** (como os do Perfection) não eram compilados.
- **New Level of Power**:
  - os Stress Tests forçados (Steadfast falhado, Straining) não passavam sozinhos;
  - o New Level of Power de um Awakening não dava o +1 ToP.

## Limitações conhecidas

- A regra de LP negativo do Survivor (Arcosian) não está modelada.
- O compêndio não tem Instant Transmission.
- A IA das lutas é simples, e uma única execução por confronto não mede o equilíbrio.

## Relatos completos

O chat do mundo dbu-teste tem todas as rolagens de cada luta.

### Luta 1 (com New Level of Power)

```text
=== Luta 1 — Goku SSJ vs Freeza (Forma Final) · ToP 2 (com New Level of Power) ===
Iniciativa: Goku (Namek) 10.07 · Freeza (Forma Final) 9.08
— Rodada 1 —
 • Goku (Namek) [base · ToP 2] (LP 309/309, KP 146/146, Ações 3)
   Transformation Maneuver → Super Saiyan 1: TRANSFORMOU (sem Stress Test) · NEW LEVEL OF POWER (+1 ToP, Stress Test automático, Legend Realized dobrado)
   Ataque Básico (Wager 16): Acerto 26 vs Desvio 35 → errou
   Ataque Básico (Wager 16): Acerto 21 vs Desvio 24 → errou
 • Freeza (Forma Final) [True Form · ToP 2] (LP 291/291, KP 268/292, Ações 3)
   Power Up (Power 1)
   Death Beam (Wager 16): Acerto 15 vs Desvio 29 → errou
   Death Beam (Wager 16): Acerto 24 vs Desvio 21 → ACERTOU · Wound 53 → 46 de dano (Goku (Namek): 309 → 263 LP)
— Rodada 2 —
 • Goku (Namek) [Super Saiyan 1 · ToP 3] (LP 263/309, KP 206/365, Ações 4)
   Power Up (Power 1)
   Energy Charge (1) para Kamehameha
   Energy Charge (2) para Kamehameha
   Kamehameha (Wager 20): Acerto 29 vs Desvio 26 → ACERTOU · Wound 109 → 104 de dano (Freeza (Forma Final): 291 → 187 LP)
 • Freeza (Forma Final) [True Form · ToP 2] (LP 187/291, KP 176/292, Ações 3)
   Energy Charge (1) para Supernova
   Energy Charge (2) para Supernova
   Supernova (Wager 16): Acerto 22 vs Desvio 19 → ACERTOU · Wound 56 → 45 de dano (Goku (Namek): 263 → 218 LP)
— Rodada 3 —
 • Goku (Namek) [Super Saiyan 1 · ToP 3] (LP 218/309, KP 152/365, Ações 4)
   Energy Charge (1) para Kamehameha
   Energy Charge (2) para Kamehameha
   Kamehameha: Acerto 20 vs Desvio 26 → errou
   Ataque Básico: Acerto 25 vs Desvio 20 → ACERTOU · Wound 32 → 21 de dano (Freeza (Forma Final): 187 → 166 LP)
 • Freeza (Forma Final) [True Form · ToP 2] (LP 166/291, KP 112/292, Ações 3)
   Power Up (Power 1)
   Death Beam: Acerto 21 vs Desvio 19 → ACERTOU · Wound 34 → 29 de dano (Goku (Namek): 218 → 189 LP)
   Death Beam: Acerto 22 vs Desvio 18 → ACERTOU · Wound 33 → 30 de dano (Goku (Namek): 189 → 159 LP)
— Rodada 4 —
 • Goku (Namek) [Super Saiyan 1 · ToP 3] (LP 159/309, KP 118/365, Ações 4)
   Ki Surge: 118 → 220 KP
   Power Up (Power 1)
   Energy Charge (1) para Kamehameha
   Energy Charge (2) para Kamehameha
   Kamehameha (Wager 20): Acerto 38 vs Desvio 31 → ACERTOU · Wound 114 → 109 de dano (Freeza (Forma Final): 166 → 57 LP)
   Ataque Básico (Wager 20): Acerto 34 vs Desvio 17 → ACERTOU · Wound 44 → 33 de dano (Freeza (Forma Final): 57 → 24 LP)
 • Freeza (Forma Final) [True Form · ToP 2] (LP 24/291, KP 52/292, Ações 3)
   Stress Test obrigatório: falhou → sai da transformação (Stress Exhaustion)
   Healing Surge: 24 → 60 LP
   Ataque Básico: Acerto 13 vs Desvio 24 → errou
   Ataque Básico: Acerto 11 vs Desvio 35 → errou
   Ataque Básico: Acerto 17 (CRÍTICO) vs Desvio 23 → errou
— Rodada 5 —
 • Goku (Namek) [Super Saiyan 1 · ToP 3] (LP 159/309, KP 146/365, Ações 4)
   Energy Charge (1) para Kamehameha
   Energy Charge (2) para Kamehameha
   Kamehameha: Acerto 35 vs Desvio 9 → ACERTOU · Wound 83 → 81 de dano (Freeza (Forma Final): 60 → 0 LP)
VENCEDOR: Goku (Namek) (rodada 5)
```

### Luta 2 (com New Level of Power)

```text
=== Luta 2 — Gohan SSJ2 vs Cell Perfeito · ToP 3 ===
Iniciativa: Gohan (Cell Games) 6.07 · Cell Perfeito 4.07
— Rodada 1 —
 • Gohan (Cell Games) [base · ToP 3] (LP 482/482, KP 206/206, Ações 3)
   Transformation Maneuver → Super Saiyan 2: TRANSFORMOU (sem Stress Test) · NEW LEVEL OF POWER (+1 ToP, Stress Test automático, Legend Realized dobrado)
   Ataque Básico (Wager 22): Acerto 35 vs Desvio 23 → ACERTOU · Wound 59 → 48 de dano (Cell Perfeito: 426 → 378 LP)
   Ataque Básico (Wager 22): Acerto 29 vs Desvio 19 → ACERTOU · Wound 58 → 47 de dano (Cell Perfeito: 378 → 331 LP)
 • Cell Perfeito [base · ToP 3] (LP 331/426, KP 206/206, Ações 3)
   Power Up (Power 1)
   Ataque Básico (Wager 15): Acerto 32 vs Desvio 39 → errou
   Ataque Básico (Wager 15): Acerto 28 vs Desvio 24 → ACERTOU · Wound 54 → 31 de dano (Gohan (Cell Games): 482 → 451 LP)
— Rodada 2 —
 • Gohan (Cell Games) [Super Saiyan 2 · ToP 4] (LP 451/482, KP 246/515, Ações 4)
   Power Up (Power 1)
   Energy Charge (1) para Kamehameha
   Energy Charge (2) para Kamehameha
   Kamehameha (Wager 23): Acerto 25 vs Desvio 21 → ACERTOU · Wound 145 → 140 de dano (Cell Perfeito: 340 → 200 LP)
   Ataque Básico: Acerto 37 vs Desvio 7 → ACERTOU · Wound 42 → 31 de dano (Cell Perfeito: 200 → 169 LP)
 • Cell Perfeito [base · ToP 3] (LP 169/426, KP 176/206, Ações 3)
   Energy Charge (1) para Kamehameha
   Energy Charge (2) para Kamehameha
   Kamehameha (Wager 15): Acerto 25 vs Desvio 39 → errou
— Rodada 3 —
 • Gohan (Cell Games) [Super Saiyan 2 · ToP 4] (LP 451/482, KP 163/515, Ações 4)
   Ki Surge: 163 → 307 KP
   Energy Charge (1) para Kamehameha
   Energy Charge (2) para Kamehameha
   Kamehameha (Wager 28): Acerto 33 vs Desvio 15 → ACERTOU · Wound 133 → 128 de dano (Cell Perfeito: 178 → 50 LP)
   Ataque Básico (Wager 28): Acerto 25 vs Desvio 13 → ACERTOU · Wound 69 → 58 de dano (Cell Perfeito: 50 → 0 LP)
VENCEDOR: Gohan (Cell Games) (rodada 3)
```

### Luta 2b (revanche sem New Level of Power)

```text
=== Luta 2b — Gohan SSJ2 vs Cell Perfeito · ToP 3 (sem New Level of Power: SSJ2 já usado antes) ===
Iniciativa: Gohan (Cell Games) 9.07 · Cell Perfeito 11.07
— Rodada 1 —
 • Cell Perfeito [base · ToP 3] (LP 426/426, KP 206/206, Ações 3)
   Power Up (Power 1)
   Ataque Básico (Wager 15): Acerto 47 (CRÍTICO) vs Desvio 17 → ACERTOU · Wound 49 → 40 de dano (Gohan (Cell Games): 482 → 442 LP)
   Ataque Básico (Wager 15): Acerto 36 (CRÍTICO) vs Desvio 15 → ACERTOU · Wound 33 → 24 de dano (Gohan (Cell Games): 442 → 418 LP)
 • Gohan (Cell Games) [base · ToP 3] (LP 418/482, KP 206/206, Ações 3)
   Transformation Maneuver → Super Saiyan 2: TRANSFORMOU (Stress Test 21 vs 16) · Legend Realized +46 LP e KP
   Ataque Básico (Wager 22): Acerto 32 vs Desvio 29 → ACERTOU · Wound 56 → 45 de dano (Cell Perfeito: 426 → 381 LP)
   Ataque Básico (Wager 22): Acerto 14 vs Desvio 17 → errou
— Rodada 2 —
 • Cell Perfeito [base · ToP 3] (LP 390/426, KP 176/206, Ações 3)
   Energy Charge (1) para Kamehameha
   Energy Charge (2) para Kamehameha
   Kamehameha (Wager 15): Acerto 31 vs Desvio 24 → ACERTOU · Wound 100 → 90 de dano (Gohan (Cell Games): 464 → 374 LP)
 • Gohan (Cell Games) [Super Saiyan 2 · ToP 3] (LP 374/482, KP 190/515, Ações 3)
   Power Up (Power 1)
   Ataque Básico (Wager 3): Acerto 28 vs Desvio 15 → ACERTOU · Wound 53 → 42 de dano (Cell Perfeito: 390 → 348 LP)
   Ataque Básico: Acerto 17 vs Desvio 17 → errou
— Rodada 3 —
 • Cell Perfeito [base · ToP 3] (LP 357/426, KP 119/206, Ações 3)
   Power Up (Power 1)
   Ataque Básico (Wager 15): Acerto 21 vs Desvio 21 → errou
   Ataque Básico (Wager 15): Acerto 29 vs Desvio 20 → ACERTOU · Wound 54 → 34 de dano (Gohan (Cell Games): 374 → 340 LP)
 • Gohan (Cell Games) [Super Saiyan 2 · ToP 3] (LP 340/482, KP 169/515, Ações 3)
   Ki Surge: 169 → 311 KP
   Energy Charge (1) para Kamehameha
   Energy Charge (2) para Kamehameha
   Kamehameha (Wager 28): Acerto 35 vs Desvio 23 → ACERTOU · Wound 115 → 110 de dano (Cell Perfeito: 357 → 247 LP)
— Rodada 4 —
 • Cell Perfeito [base · ToP 3] (LP 256/426, KP 89/206, Ações 3)
   Ataque Básico (Wager 10): Acerto 30 vs Desvio 25 → ACERTOU · Wound 36 → 16 de dano (Gohan (Cell Games): 340 → 324 LP)
   Ataque Básico: Acerto 29 vs Desvio 20 → ACERTOU · Wound 18 → 0 de dano (Gohan (Cell Games): 324 → 324 LP)
   Ataque Básico: Acerto 21 vs Desvio 23 → errou
 • Gohan (Cell Games) [Super Saiyan 2 · ToP 3] (LP 324/482, KP 223/515, Ações 3)
   Power Up (Power 1)
   Ataque Básico (Wager 28): Acerto 28 vs Desvio 13 → ACERTOU · Wound 62 → 51 de dano (Cell Perfeito: 256 → 205 LP)
   Ataque Básico (Wager 8): Acerto 35 (CRÍTICO) vs Desvio 23 → ACERTOU · Wound 38 → 27 de dano (Cell Perfeito: 205 → 178 LP)
   Ataque Básico: Acerto 30 vs Desvio 8 → ACERTOU · Wound 29 → 18 de dano (Cell Perfeito: 178 → 160 LP)
— Rodada 5 —
 • Cell Perfeito [base · ToP 3] (LP 169/426, KP 79/206, Ações 3)
   Power Up (Power 1)
   Ataque Básico: Acerto 23 vs Desvio 24 → errou
   Ataque Básico: Acerto 17 vs Desvio 23 → errou
 • Gohan (Cell Games) [Super Saiyan 2 · ToP 3] (LP 324/482, KP 169/515, Ações 3)
   Ataque Básico: Acerto 30 vs Desvio 15 → ACERTOU · Wound 46 → 35 de dano (Cell Perfeito: 169 → 134 LP)
   Ataque Básico: Acerto 27 vs Desvio 18 → ACERTOU · Wound 36 → 25 de dano (Cell Perfeito: 134 → 109 LP)
   Ataque Básico: Acerto 14 vs Desvio 22 → errou
— Rodada 6 —
 • Cell Perfeito [base · ToP 3] (LP 118/426, KP 79/206, Ações 3)
   Healing Surge: 118 → 167 LP
   Ataque Básico: Acerto 29 vs Desvio 27 → ACERTOU · Wound 35 → 15 de dano (Gohan (Cell Games): 324 → 309 LP)
   Ataque Básico: Acerto 38 (CRÍTICO) vs Desvio 34 → ACERTOU · Wound 27 → 7 de dano (Gohan (Cell Games): 309 → 302 LP)
   Ataque Básico: Acerto 29 vs Desvio 25 → ACERTOU · Wound 39 → 19 de dano (Gohan (Cell Games): 302 → 283 LP)
 • Gohan (Cell Games) [Super Saiyan 2 · ToP 3] (LP 283/482, KP 151/515, Ações 3)
   Power Up (Power 1)
   Ataque Básico: Acerto 36 vs Desvio 12 → ACERTOU · Wound 42 → 31 de dano (Cell Perfeito: 167 → 136 LP)
   Ataque Básico: Acerto 28 vs Desvio 18 → ACERTOU · Wound 45 → 34 de dano (Cell Perfeito: 136 → 102 LP)
   Ataque Básico: Acerto 31 vs Desvio 7 → ACERTOU · Wound 27 → 16 de dano (Cell Perfeito: 102 → 86 LP)
— Rodada 7 —
 • Cell Perfeito [base · ToP 3] (LP 95/426, KP 79/206, Ações 3)
   Power Up (Power 1)
   Ataque Básico: Acerto 28 vs Desvio 31 → errou
   Ataque Básico: Acerto 25 vs Desvio 23 → ACERTOU · Wound 12 → 0 de dano (Gohan (Cell Games): 283 → 283 LP)
 • Gohan (Cell Games) [Super Saiyan 2 · ToP 3] (LP 283/482, KP 133/515, Ações 3)
   Ataque Básico: Acerto 32 vs Desvio 15 → ACERTOU · Wound 39 → 28 de dano (Cell Perfeito: 95 → 67 LP)
   Ataque Básico: Acerto 28 vs Desvio 25 → ACERTOU · Wound 40 → 29 de dano (Cell Perfeito: 67 → 38 LP)
   Ataque Básico: Acerto 30 vs Desvio 13 → ACERTOU · Wound 32 → 21 de dano (Cell Perfeito: 38 → 17 LP)
   Ataque Básico: Acerto 24 vs Desvio 6 → ACERTOU · Wound 37 → 26 de dano (Cell Perfeito: 17 → 0 LP)
VENCEDOR: Gohan (Cell Games) (rodada 7)
```

### Luta 3

```text
=== Luta 3 — Goku SSJ3 vs Kid Buu (Pure Form) · ToP 4 ===
Iniciativa: Goku SSJ3 (Saga Majin Boo) 12.09 · Kid Buu (Pure Form) 4.07
— Rodada 1 —
 • Goku SSJ3 (Saga Majin Boo) [base · ToP 4] (LP 675/675, KP 266/266, Ações 3)
   Transformation Maneuver → Super Saiyan 3: TRANSFORMOU (Stress Test 23 vs 20)
   Mastered Kamehameha (Wager 28): Acerto 50 (CRÍTICO) vs Desvio 24 → ACERTOU · Wound 122 → 111 de dano (Kid Buu (Pure Form): 713 → 602 LP)
   Ataque Básico: Acerto 51 (CRÍTICO) vs Desvio 26 → ACERTOU · Wound 55 → 33 de dano (Kid Buu (Pure Form): 602 → 569 LP)
 • Kid Buu (Pure Form) [Pure Form · ToP 4] (LP 582/713, KP 532/532, Ações 3)
   Power Up (Power 1)
   Vanishing Ball (Wager 28): Acerto 29 vs Desvio 28 → ACERTOU · Wound 84 → 54 de dano (Goku SSJ3 (Saga Majin Boo): 675 → 621 LP)
   Vanishing Ball (Wager 28): Acerto 27 vs Desvio 25 → ACERTOU · Wound 77 → 47 de dano (Goku SSJ3 (Saga Majin Boo): 621 → 574 LP)
— Rodada 2 —
 • Goku SSJ3 (Saga Majin Boo) [Super Saiyan 3 · ToP 4] (LP 574/675, KP 208/665, Ações 3)
   Ki Surge: 208 → 396 KP
   Power Up (Power 1)
   Mastered Kamehameha (Wager 35): Acerto 41 vs Desvio 33 → ACERTOU · Wound 149 → 138 de dano (Kid Buu (Pure Form): 582 → 444 LP)
   Mastered Kamehameha (Wager 16): Acerto 51 (CRÍTICO) vs Desvio 32 → ACERTOU · Wound 120 → 109 de dano (Kid Buu (Pure Form): 444 → 335 LP)
   Ataque Básico: Acerto 35 vs Desvio 29 → ACERTOU · Wound 53 → 31 de dano (Kid Buu (Pure Form): 335 → 304 LP)
 • Kid Buu (Pure Form) [Pure Form · ToP 4] (LP 317/713, KP 408/532, Ações 3)
   Stress Test obrigatório: passou
   Vanishing Ball (Wager 28): Acerto 26 vs Desvio 44 → errou
   Vanishing Ball (Wager 28): Acerto 24 vs Desvio 37 → errou
   Vanishing Ball (Wager 8): Acerto 21 vs Desvio 39 → errou
— Rodada 3 —
 • Goku SSJ3 (Saga Majin Boo) [Super Saiyan 3 · ToP 4] (LP 574/675, KP 185/665, Ações 3)
   Ataque Básico: Acerto 28 vs Desvio 23 → ACERTOU · Wound 40 → 18 de dano (Kid Buu (Pure Form): 317 → 299 LP)
   Ataque Básico: Acerto 33 vs Desvio 15 → ACERTOU · Wound 53 → 31 de dano (Kid Buu (Pure Form): 299 → 268 LP)
   Ataque Básico: Acerto 32 vs Desvio 34 → errou
 • Kid Buu (Pure Form) [Pure Form · ToP 4] (LP 281/713, KP 240/532, Ações 3)
   Power Up (Power 1)
   Vanishing Ball (Wager 17): Acerto 20 vs Desvio 31 → errou
   Vanishing Ball: Acerto 19 vs Desvio 27 → errou
— Rodada 4 —
 • Goku SSJ3 (Saga Majin Boo) [Super Saiyan 3 · ToP 4] (LP 574/675, KP 137/665, Ações 3)
   Power Up (Power 1)
   Ataque Básico: Acerto 39 vs Desvio 25 → ACERTOU · Wound 51 → 29 de dano (Kid Buu (Pure Form): 281 → 252 LP)
   Ataque Básico: Acerto 39 vs Desvio 21 → ACERTOU · Wound 45 → 23 de dano (Kid Buu (Pure Form): 252 → 229 LP)
 • Kid Buu (Pure Form) [Pure Form · ToP 4] (LP 242/713, KP 155/532, Ações 3)
   Healing Surge: 242 → 319 LP
   Ataque Básico: Acerto 36 (CRÍTICO) vs Desvio 44 → errou
   Ataque Básico: Acerto 20 vs Desvio 43 → errou
   Ataque Básico: Acerto 20 vs Desvio 53 → errou
— Rodada 5 —
 • Goku SSJ3 (Saga Majin Boo) [Super Saiyan 3 · ToP 4] (LP 574/675, KP 89/665, Ações 3)
   Ataque Básico: Acerto 40 vs Desvio 26 → ACERTOU · Wound 47 → 25 de dano (Kid Buu (Pure Form): 319 → 294 LP)
   Ataque Básico: Acerto 42 vs Desvio 15 → ACERTOU · Wound 47 → 25 de dano (Kid Buu (Pure Form): 294 → 269 LP)
   Ataque Básico: Acerto 38 vs Desvio 18 → ACERTOU · Wound 49 → 27 de dano (Kid Buu (Pure Form): 269 → 242 LP)
 • Kid Buu (Pure Form) [Pure Form · ToP 4] (LP 255/713, KP 159/532, Ações 3)
   Power Up (Power 1)
   Ataque Básico: Acerto 22 vs Desvio 37 → errou
   Ataque Básico: Acerto 17 vs Desvio 34 → errou
— Rodada 6 —
 • Goku SSJ3 (Saga Majin Boo) [Super Saiyan 3 · ToP 4] (LP 574/675, KP 41/665, Ações 3)
   Power Up (Power 1)
   Ataque Básico: Acerto 43 vs Desvio 27 → ACERTOU · Wound 50 → 28 de dano (Kid Buu (Pure Form): 255 → 227 LP)
   Ataque Básico: Acerto 42 vs Desvio 26 → ACERTOU · Wound 56 → 34 de dano (Kid Buu (Pure Form): 227 → 193 LP)
 • Kid Buu (Pure Form) [Pure Form · ToP 4] (LP 206/713, KP 163/532, Ações 3)
   Ataque Básico: Acerto 30 vs Desvio 56 → errou
   Ataque Básico: Acerto 35 (CRÍTICO) vs Desvio 51 → errou
   Ataque Básico: Acerto 12 vs Desvio 35 → errou
— Rodada 7 —
 • Goku SSJ3 (Saga Majin Boo) [base · ToP 4] (LP 574/675, KP 0/266, Ações 3)
   Ataque Básico: Acerto 26 vs Desvio 25 → ACERTOU · Wound 34 → 12 de dano (Kid Buu (Pure Form): 206 → 194 LP)
   Ataque Básico: Acerto 29 vs Desvio 21 → ACERTOU · Wound 25 → 3 de dano (Kid Buu (Pure Form): 194 → 191 LP)
   Ataque Básico: Acerto 33 vs Desvio 16 → ACERTOU · Wound 26 → 4 de dano (Kid Buu (Pure Form): 191 → 187 LP)
 • Kid Buu (Pure Form) [Pure Form · ToP 4] (LP 200/713, KP 167/532, Ações 3)
   Power Up (Power 1)
   Ataque Básico: Acerto 24 vs Desvio 14 → ACERTOU · Wound 20 → 9 de dano (Goku SSJ3 (Saga Majin Boo): 574 → 565 LP)
   Ataque Básico: Acerto 27 vs Desvio 17 → ACERTOU · Wound 38 → 27 de dano (Goku SSJ3 (Saga Majin Boo): 565 → 538 LP)
— Rodada 8 —
 • Goku SSJ3 (Saga Majin Boo) [base · ToP 4] (LP 538/675, KP 0/266, Ações 3)
   Power Up (Power 1)
   Ataque Básico: Acerto 33 vs Desvio 23 → ACERTOU · Wound 32 → 10 de dano (Kid Buu (Pure Form): 200 → 190 LP)
   Ataque Básico: Acerto 30 vs Desvio 23 → ACERTOU · Wound 33 → 11 de dano (Kid Buu (Pure Form): 190 → 179 LP)
 • Kid Buu (Pure Form) [Pure Form · ToP 4] (LP 192/713, KP 171/532, Ações 3)
   Vanishing Ball: Acerto 25 vs Desvio 30 → errou
   Ataque Básico: Acerto 39 (CRÍTICO) vs Desvio 9 → ACERTOU · Wound 25 → 14 de dano (Goku SSJ3 (Saga Majin Boo): 538 → 524 LP)
   Ataque Básico: Acerto 20 vs Desvio 21 → errou
— Rodada 9 —
 • Goku SSJ3 (Saga Majin Boo) [base · ToP 4] (LP 524/675, KP 0/266, Ações 3)
   Ataque Básico: Acerto 15 vs Desvio 23 → errou
   Ataque Básico: Acerto 28 vs Desvio 16 → ACERTOU · Wound 34 → 12 de dano (Kid Buu (Pure Form): 192 → 180 LP)
   Ataque Básico: Acerto 31 vs Desvio 20 → ACERTOU · Wound 26 → 4 de dano (Kid Buu (Pure Form): 180 → 176 LP)
   Ataque Básico: Acerto 30 vs Desvio 20 → ACERTOU · Wound 31 → 9 de dano (Kid Buu (Pure Form): 176 → 167 LP)
 • Kid Buu (Pure Form) [Pure Form · ToP 4] (LP 180/713, KP 139/532, Ações 3)
   Power Up (Power 1)
   Ataque Básico: Acerto 24 vs Desvio 40 → errou
   Ataque Básico: Acerto 22 vs Desvio 22 → errou
— Rodada 10 —
 • Goku SSJ3 (Saga Majin Boo) [base · ToP 4] (LP 524/675, KP 0/266, Ações 3)
   Power Up (Power 1)
   Ataque Básico: Acerto 32 vs Desvio 35 → errou
   Ataque Básico: Acerto 29 vs Desvio 34 → errou
 • Kid Buu (Pure Form) [Pure Form · ToP 4] (LP 193/713, KP 143/532, Ações 3)
   Ataque Básico: Acerto 21 vs Desvio 33 → errou
   Ataque Básico: Acerto 39 (CRÍTICO) vs Desvio 32 → ACERTOU · Wound 16 → 5 de dano (Goku SSJ3 (Saga Majin Boo): 524 → 519 LP)
   Ataque Básico: Acerto 24 vs Desvio 28 → errou
Sem vencedor após 10 rodadas — Goku SSJ3 (Saga Majin Boo) 519/675 LP · Kid Buu (Pure Form) 193/713 LP
```

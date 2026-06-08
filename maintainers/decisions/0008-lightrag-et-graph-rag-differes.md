# ADR 0008 — LightRAG / graph-RAG : différé (intéressant, mais pas maintenant)

- **STATUT :** ACTÉ (2026-06-08) pour la **direction** : on **ne branche pas** LightRAG (ni un
  graph-RAG) dans le chantier en cours ; on le **réserve à plus tard**, conditionné à une mesure.
  C'est une décision de **séquencement et de périmètre**, pas un rejet définitif.
- **Lié :**
  [`0006-le-mcp-du-rag-est-un-contrat-stable.md`](0006-le-mcp-du-rag-est-un-contrat-stable.md)
  (le contrat MCP reste stable ; un graph-RAG vivrait *derrière* ce contrat, pas à la place),
  [`0007-trois-adaptateurs-embedder-et-echelle-confidentialite.md`](0007-trois-adaptateurs-embedder-et-echelle-confidentialite.md)
  (le chantier en cours porte sur l'**embedder** swappable — un autre étage que celui de LightRAG),
  [`0004-claude-only-pour-l-instant.md`](0004-claude-only-pour-l-instant.md) (le LLM qui *répond*
  reste Claude → borne déjà la promesse de privacy ; LightRAG ajouterait un LLM **à l'indexation**).
- **Plan associé :** [`../plans/rag-embedder-plan-action.md`](../plans/rag-embedder-plan-action.md)
  (Étape 7 « profil grosse machine », **conditionnelle**, où cette piste atterrit) et l'étude
  [`../plans/etude-rag-local-criteres-et-veille.md`](../plans/etude-rag-local-criteres-et-veille.md)
  §4 (voie graphe ; E2GraphRAG).

## Contexte

Thomas a demandé d'évaluer **LightRAG** (`HKUDS/LightRAG`, MIT, ~36k stars, Python `lightrag-hku`,
papier EMNLP 2025) pour le second cerveau. C'est un **moteur de RAG à base de graphe de
connaissances** : à l'indexation, **un LLM lit chaque chunk** pour en extraire **entités +
relations + mots-clés** et bâtir un knowledge graph, qu'il combine ensuite aux embeddings à la
recherche (récupération « dual-level » : entités précises + thèmes larges, + voisins à un saut).
Sa promesse explicite : approcher la qualité **multi-hop** de Microsoft GraphRAG pour une
**fraction** de son coût (il supprime les « community reports » et fait des mises à jour
incrémentales). Utilisable en **lib ou en serveur**, avec stores fichier par défaut (KV + vectoriel
+ graphe + doc-status) ou backends prod (Postgres / Neo4j / Milvus / Qdrant…). Embedder **pluggable**
(OpenAI, Ollama, HuggingFace, Gemini…). **Peut tourner 100 % local** (Ollama pour le LLM *et* les
embeddings ; guide « offline » documenté).

La question réelle n'est pas « LightRAG est-il bon ? » (il l'est dans son créneau) mais
**« est-ce que ça entre dans CE produit, MAINTENANT, vu nos invariants ? »**.

## Décision

**On ne branche pas LightRAG (ni un graph-RAG) dans le chantier embedder. On le diffère** à
l'Étape 7 (« profil grosse machine », opt-in, conditionnelle), **à n'ouvrir que si la mesure
(eval-set, Étapes 2/4) révèle un plafond de qualité** que le RAG dense + un éventuel reranker
(Étape 6) ne lèvent pas — et même là, **E2GraphRAG reste préféré** à LightRAG sur machine modeste
(voir Alternatives). Les raisons :

### 1. LightRAG n'est pas un *embedder* — c'est un autre paradigme de retrieval

Tout le chantier en cours (ADR 0007 + plan d'action) rend l'**embedder** swappable **derrière un
contrat MCP figé** (ADR 0006). LightRAG ne se branche pas comme un adaptateur d'embedder : il
**remplace le moteur de recherche entier** et **réutilise zéro** de notre SPI `Embedder`. C'est
**orthogonal** au chantier — pas une brique de plus dedans, mais un autre étage.

> **⚠️ Lever l'ambiguïté : LightRAG ≠ embedder ; il en *utilise* un, pluggable comme le nôtre.**
> Au **niveau de l'embedder**, ce n'est **pas** un autre paradigme. À l'intérieur, LightRAG
> appelle un **embedder** qui joue **exactement le même rôle** que le nôtre (un texte entre, un
> vecteur sort) et qui est **pluggable de la même façon** (OpenAI, Ollama, Gemini, HuggingFace…) :
> notre `OpenAiCompatibleEmbedder` (ADR 0007) s'y brancherait **à l'identique**. Le paradigme
> « embedder swappable » est donc **commun aux deux**. Ce qui diffère n'est pas l'embedder mais ce
> qu'il y a **autour** :
>
> ```
>         RAG dense (le nôtre)                    LightRAG
>    ┌────────────────────────┐        ┌──────────────────────────────────┐
>    │ chunk → EMBEDDER → vec  │        │ chunk → EMBEDDER → vec            │ ← même brique
>    │                        │        │   +                              │
>    │                        │        │ chunk → LLM → entités/relations   │ ← LA couche en plus
>    │                        │        │            → graphe + vecteurs    │
>    └────────────────────────┘        └──────────────────────────────────┘
> ```
>
> Deux nuances : (a) LightRAG **embedde *plus de choses*** — pas seulement les chunks mais aussi
> les **entités** et **relations** extraites — mais c'est le *même* embedder appelé plus souvent,
> pas un embedder d'une autre nature ; (b) le vrai « autre paradigme », c'est l'**étape
> LLM-par-chunk** qui fabrique le graphe (cf. §2), absente de notre RAG dense.
>
> **Conséquence pratique :** le travail embedder (ADR 0007 + plan) **resterait valable et
> réutilisable** même si on adoptait LightRAG un jour — on ne jetterait rien, on **emboîterait une
> couche au-dessus**. C'est précisément le sens de « orthogonal » ici.

| | RAG actuel (dense) | LightRAG (graphe) |
|---|---|---|
| Indexation | embed-and-store, **zéro LLM** | **un appel LLM par chunk** (extraction entités/relations) |
| Stores | SQLite (vecteurs) | KV + vectoriel + **graphe** + doc-status |
| Ce qu'on swap | l'**embedder**, derrière le contrat MCP | **tout le moteur** |
| Coût d'indexation | bas | moyen (taxe LLM par chunk) |
| Multi-hop / synthèse trans-docs | faible | fort |
| Complexité opérationnelle | basse | moyenne (graphe + vecteurs + KV) |

### 2. Le « LLM par chunk » heurte de plein fouet notre modèle de coût ET de privacy

Aujourd'hui notre indexation **ne sort rien vers un LLM** (seul l'embedder parle éventuellement au
cloud ; le local **ne sort pas** — niveau 1 de l'échelle de confidentialité de l'ADR 0007).
LightRAG, lui, **fait passer tout le vault dans un LLM à l'indexation** :

- **en cloud** → coût réel **+ données qui sortent** (et plus seulement « pas d'entraînement » : du
  contenu, pas juste des vecteurs) ;
- **en local** → il faut un **LLM local costaud ET bon en extraction d'entités** (pas le petit
  EmbeddingGemma ~0,3 Go) ; or l'extraction est exigeante, donc un petit modèle produit un **graphe
  pauvre**.

Dans les deux cas, ça **pulvérise la cible « Mac nu d'Achille »** (non-dev, privacy max, friction
minimale) qui guide ADR 0007 et la Décision D1.

### 3. Le gain n'est démontré **que là où nous ne sommes pas (encore)**

Les chiffres flatteurs de LightRAG (60-85 % de « win » vs NaiveRAG/GraphRAG ; ~610 000 tokens →
< 100 tokens à la récupération vs GraphRAG) viennent du **papier lui-même**, sur des corpus
**légal / médical / finance, en anglais, très structurés en entités/relations**. Pour un **second
cerveau perso FR** (notes, transcripts, mails), le bénéfice multi-hop est **plausible mais non
mesuré**. L'adopter sur la foi de ces benchmarks violerait notre règle **« on mesure avant de
choisir »** (eval-set, plan d'action Étapes 2/4).

### 4. Le vrai déclencheur est un **usage**, pas une techno

Le graphe ne se rentabilise que si les questions au cerveau sont **multi-hop / synthèse
trans-documents** (« comment X est-il relié à Y via Z », « fais-moi la synthèse de tout ce qui
touche à… »). Si l'usage réel est surtout du **lookup factuel** (« retrouve ce que j'ai noté sur
X »), un seul chunk pertinent suffit et le graphe n'est que de la **complexité non rentabilisée**.
**Décision : on attend d'avoir l'eval-set ET un signal d'usage** avant d'investir.

## Conséquences

- **Le chantier embedder n'est pas perturbé** : on finit port + 3 adaptateurs + eval-set + mesure
  (Étapes 1-4) sans détour graphe.
- **La piste est tracée, pas perdue** : elle vit à l'Étape 7, **conditionnée à un plafond mesuré**,
  et se départagera **sur notre propre eval-set FR** (pas sur les benchmarks du papier), face à
  E2GraphRAG.
- **Si on l'ouvre un jour**, l'invariant tient : un graph-RAG s'intègrerait **derrière le contrat
  MCP stable** (ADR 0006), pas en cassant la surface exposée au harnais utilisateur. Et il
  s'assumerait en **profil grosse machine + LLM local fort**, **opt-in**, **jamais le défaut**.
- **Coût d'avoir tranché ainsi** : on renonce (pour l'instant) à un éventuel gain multi-hop ; on
  l'assume tant qu'aucune mesure ni aucun usage ne le réclame.

## Alternatives écartées

- **Brancher LightRAG maintenant** — change le paradigme, ajoute un LLM à l'indexation (coût +
  fuite de contenu), casse la cible non-dev/privacy, et n'est pas mesuré sur notre corpus FR.
  Différé (pas rejeté).
- **LightRAG comme voie graphe par défaut le jour venu** — sur machine modeste, **E2GraphRAG** est
  préféré : il vise le bénéfice graphe **sans la taxe « LLM par chunk »** (étude §4). LightRAG
  resterait le choix **seulement** sous profil machine costaude + LLM local fort, après mesure.
- **Microsoft GraphRAG** — encore plus lourd (extraction + community reports, mises à jour
  coûteuses) ; hors-cible pour un second cerveau perso.
</content>
</invoke>

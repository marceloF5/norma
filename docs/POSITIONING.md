# Posicionamento do Norma — o que somos e o que não somos

Este documento existe para deixar clara a **fronteira** do Norma: qual problema ele
resolve, e — principalmente — quais problemas ele **deliberadamente não resolve**. A
maior parte da confusão sobre o Norma vem de compará-lo com ferramentas que vivem em
outra camada. Aqui separamos isso de uma vez.

## A tese em uma frase

> **Um motor puro e determinístico decide a orquestração; um LLM só faz o trabalho
> criativo de cada tarefa.**

`computePlan(tasks, ctx)` é uma função pura, testável, que — dado o estado atual das
tasks — retorna a próxima ação (promote, dispatch, review, rework, escalate, qa,
complete), respeitando o DAG de dependências, o gate de "uma em andamento por vez" e a
prontidão dos lotes de QA. O orquestrador é só o operador: lê o tracker, pergunta ao
motor, roda o agente especialista para cada intent e escreve o resultado de volta. **O
LLM nunca decide _o que_ acontece a seguir — só _como_ implementar/revisar/testar uma
task.**

## O que o Norma é

- Um **motor de orquestração headless** (CLI + cron) para pipelines de agentes.
- **Determinístico e auditável**: mesma entrada → mesmo plano, sempre.
- **Agnóstico ao tracker**: Linear, Jira ou qualquer outro, via porta + adapter + um
  `phaseMapping` declarativo. O tracker é a **fonte da verdade** do estado.
- **Agnóstico ao runtime de agente**: Claude Code, echo, e no futuro qualquer outro
  `AgentRunner`, sem tocar no motor.
- Focado em **tirar o humano do loop de decisão**: você planeja no começo e revisa o
  resultado no fim; no meio, a esteira anda sozinha.

## O que o Norma **não é** (e não pretende ser)

Cada item abaixo é uma **decisão de escopo**, não uma lacuna a ser preenchida.

### 1. Não é um agente de IA / assistente pessoal
O Norma não conversa, não tem personalidade, não "cresce com você". Ele não *é* o
agente — ele **coordena** agentes. A execução criativa é delegada a um `AgentRunner`
(hoje o Claude Code). Se você quer um assistente que aprende com você e te atende no
WhatsApp, isso é outra categoria de produto (ver Hermes, abaixo).

### 2. Não é uma biblioteca de "peças de Lego" para IA
O Norma não é um kit genérico para você montar qualquer aplicação de LLM (RAG,
chatbots, chains arbitrárias). Ele é **opinativo**: já é um fluxo pronto — uma esteira
task-a-task com gates de review/QA. Não é uma caixa de ferramentas; é uma linha de
montagem já configurada (ver LangChain, abaixo).

### 3. Não é um cockpit human-in-the-loop
O Norma não tem — e não quer ter — uma UI rica para você pilotar vários agentes em
paralelo, comparar diffs lado a lado e escolher o melhor merge. Ele é o oposto:
*human-out-of-the-loop*. O valor dele está em rodar **sem** alguém sentado decidindo o
próximo passo (ver Orca, abaixo).

### 4. Não deixa o LLM decidir o fluxo
Esta é a fronteira mais importante. Frameworks de agentes costumam deixar o modelo
decidir o próximo salto em runtime — flexível, porém imprevisível e difícil de auditar.
O Norma faz o oposto **de propósito**: a decisão de fluxo é código puro. Trocamos
flexibilidade por confiabilidade e rastreabilidade.

### 5. Não é o executor do trabalho
O Norma não escreve o código, não revisa, não roda os testes. Isso é papel do agente
dentro de cada task. O Norma decide **o quê** e **em que ordem** — o **como** não é com
ele.

### 6. Não gerencia memória/aprendizado de longo prazo
Não há skills que evoluem, perfil de usuário ou busca em conversas passadas. O único
"estado" que o Norma carrega entre tasks é o **handoff de contexto** (`@norma/context`:
brief / PLAN / report). Aprendizado autônomo não é um objetivo.

## Ferramentas frequentemente confundidas com o Norma

Todas orquestram ou executam agentes de alguma forma — mas cada uma vive numa camada
diferente. **Nenhuma é concorrente direta do Norma**; várias são até complementares
(podem inclusive rodar o mesmo Claude Code que o Norma usa como runner).

### Hermes Agent (NousResearch)
**O que é:** um agente de IA pessoal e auto-evolutivo — mesma categoria do Claude Code.
Roda no seu terminal e em ~20 plataformas de mensagem, aprende com você (skills +
memória + perfil), age no seu computador e melhora com o tempo.

**Camada:** _runner_ de agente (o executor).

**Diferença para o Norma:** o Hermes *é* o agente que faz o trabalho e decide seu
próprio fluxo, aprendendo no caminho. O Norma está **acima** disso, decidindo por
regras determinísticas qual trabalho fazer e em que ordem. O Hermes poderia, em tese,
ser embrulhado como um `AgentRunner` do Norma.

### LangChain / LangGraph
**O que é:** uma biblioteca genérica de componentes para construir aplicações de LLM
(modelos, memória, RAG, tools, chains). O LangGraph adiciona orquestração de agentes com
estado. Quem monta o fluxo é o desenvolvedor — e, com frequência, o LLM decide os saltos
em runtime.

**Camada:** _toolkit_ / framework de construção (a camada de baixo).

**Diferença para o Norma:** LangChain te dá as peças para *você* montar **qualquer**
fluxo; o Norma **já é** um fluxo pronto e opinativo, com a decisão nas mãos de um motor
determinístico. Você poderia até usar LangChain *dentro* de um `AgentRunner` do Norma.
A sobreposição existe só no recorte "orquestração" (LangGraph) — e mesmo aí a aposta é
oposta: flexibilidade (LLM decide) × determinismo (código decide).

### Orca (stablyai/orca) — e ADEs de frota em geral
**O que é:** um ambiente de desenvolvimento (desktop/mobile) para um humano pilotar
vários agentes de código em paralelo, cada um em seu git worktree, comparando saídas,
anotando diffs e escolhendo o merge. Explicitamente *human-in-the-loop*.

**Camada:** _cockpit_ para o humano (acima do agente, mas com você no centro).

**Diferença para o Norma:** o Orca **amplifica você** — te dá superpoderes para produzir
mais rápido, com o julgamento humano no centro do loop. O Norma **substitui o operador**
— tira você do loop de decisão para a esteira rodar sozinha (inclusive via cron), de
forma previsível e auditável. Os dois ficam acima do agente de execução, mas o Orca te
entrega o volante e o Norma guarda o volante para si.

## Resumo de camadas

```
   Humano no comando (cockpit)   ......  Orca (ADE / frota human-in-the-loop)
            │
   Decisão de fluxo               ......  Norma  ⚙️ determinístico  ×  LangGraph 🤖 LLM decide
            │
   Execução da task (o agente)    ......  Claude Code · Hermes · Codex · …
            │
   Peças de LLM (modelos/RAG/tools) ....  LangChain
```

O Norma ocupa **uma única faixa**: a decisão de fluxo, feita por código. Tudo abaixo
(execução, peças) é delegado por portas & adapters; tudo acima (o humano dirigindo) é,
por design, ausente.

## A régua para dizer "não"

Quando surgir a dúvida "o Norma deveria fazer X?", o teste é:

1. **X é decidir _o quê_/_em que ordem_ a partir do estado das tasks?** → sim, é do
   Norma (e deve ser determinístico, no motor).
2. **X é _executar_ o trabalho de uma task?** → não é do Norma; é do `AgentRunner`.
3. **X exige um humano no loop de decisão, ou uma UI para pilotar?** → não é do Norma.
4. **X é uma capacidade genérica de LLM (memória, RAG, skills que evoluem)?** → não é do
   Norma; no máximo entra como contexto via `@norma/context`.

Se X não passa no teste 1, provavelmente pertence a **outra camada** — e a resposta
correta é um adapter/runner, não uma mudança no motor.

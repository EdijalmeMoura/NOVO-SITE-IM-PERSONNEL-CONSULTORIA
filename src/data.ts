import insightDefaults from '../content/insights.json';

export type ServiceItem = {
  slug: string;
  title: string;
  short: string;
  eyebrow: string;
  intro: string;
  challenge: string;
  solution: string;
  benefits: string[];
  steps: string[];
  faqs: { q: string; a: string }[];
  icon: string;
};

export const services: ServiceItem[] = [
  {
    slug: 'recrutamento-e-selecao',
    title: 'Recrutamento e Seleção',
    short: 'Atração e avaliação de profissionais alinhados aos desafios da sua organização.',
    eyebrow: 'Talentos que fazem sentido',
    intro: 'Um processo de seleção cuidadoso começa com escuta. Entendemos o contexto da posição, a cultura da organização e o que realmente será importante para a pessoa que chegar.',
    challenge: 'Uma contratação não é apenas o preenchimento de uma posição. É uma escolha que influencia a dinâmica da equipe, a continuidade das entregas e os próximos passos do negócio.',
    solution: 'A IM Personnel apoia sua empresa na definição de perfil, estratégia de busca, análise de profissionais e condução das etapas de seleção, com comunicação clara ao longo do processo.',
    benefits: ['Escopo alinhado ao contexto e à cultura da empresa', 'Busca direcionada e avaliação estruturada', 'Visibilidade das etapas e alinhamento entre as partes', 'Acompanhamento próximo da jornada de seleção'],
    steps: ['Entendimento da necessidade e do contexto', 'Alinhamento de perfil e estratégia de atração', 'Busca, entrevistas e avaliação de profissionais', 'Apresentação de perfis e acompanhamento'],
    faqs: [
      { q: 'Como começa um processo de recrutamento?', a: 'Começa com uma conversa para compreender a posição, as prioridades da empresa, as competências necessárias e os critérios que orientarão a seleção.' },
      { q: 'A solução pode ser adaptada a diferentes níveis?', a: 'Sim. O escopo e as etapas podem ser ajustados à senioridade, à complexidade e às particularidades da posição.' },
      { q: 'A IM Personnel oferece garantia de contratação?', a: 'Não prometemos resultados ou prazos sem uma análise prévia. Escopo, condições e acompanhamento são alinhados com a empresa contratante.' },
    ],
    icon: 'search',
  },
  {
    slug: 'executive-search',
    title: 'Recrutamento Executivo · C-Level',
    short: 'Busca estratégica, abordagem confidencial e alinhamento de lideranças à visão de negócio.',
    eyebrow: 'Lideranças para o próximo capítulo',
    intro: 'Encontrar uma liderança estratégica exige leitura de negócio, discrição e conversas qualificadas. O processo considera tanto a experiência quanto a capacidade de conduzir desafios específicos.',
    challenge: 'Decisões executivas têm impacto amplo e pedem confidencialidade, alinhamento entre stakeholders e uma leitura cuidadosa do momento da organização.',
    solution: 'Apoiamos a identificação e avaliação de lideranças para posições de alta gestão, construindo o entendimento do mandato, das competências críticas e da cultura para uma abordagem reservada.',
    benefits: ['Alinhamento sobre o mandato e os desafios da posição', 'Abordagem profissional e confidencial', 'Avaliação conectada às prioridades da organização', 'Comunicação estruturada com stakeholders'],
    steps: ['Alinhamento de contexto, mandato e confidencialidade', 'Mapeamento de perfil e estratégia de busca', 'Abordagem e conversas qualificadas', 'Avaliação, apresentação e apoio às decisões'],
    faqs: [
      { q: 'Como é tratada a confidencialidade?', a: 'O nível de acesso às informações e os canais de comunicação são definidos com a empresa antes do início do trabalho e tratados com discrição.' },
      { q: 'Quais posições podem ser consideradas?', a: 'O escopo é alinhado caso a caso para posições executivas e de liderança, conforme a estrutura e a necessidade da organização.' },
      { q: 'Como é avaliado o alinhamento de uma liderança?', a: 'A análise parte dos desafios da posição e pode considerar trajetória, competências, estilo de liderança e aderência ao contexto organizacional.' },
    ],
    icon: 'briefcase',
  },
  {
    slug: 'selecao-industrial',
    title: 'Seleção Industrial',
    short: 'Avaliação atenta a competências técnicas, segurança e realidade operacional.',
    eyebrow: 'Precisão para a operação',
    intro: 'Cada operação tem requisitos próprios. Uma seleção consistente combina clareza sobre as atividades do dia a dia, competências técnicas e o contexto em que a pessoa vai atuar.',
    challenge: 'Posições industriais podem envolver requisitos técnicos, rotinas e condições de trabalho muito específicos. Generalizar o perfil pode afastar profissionais adequados e dificultar o alinhamento.',
    solution: 'Trabalhamos com a empresa para detalhar os requisitos da função, identificar competências essenciais e conduzir uma avaliação compatível com a realidade operacional e com as orientações de segurança.',
    benefits: ['Levantamento detalhado dos requisitos da função', 'Atenção a competências técnicas e comportamentais', 'Alinhamento com a rotina e o ambiente de trabalho', 'Comunicação objetiva sobre critérios da posição'],
    steps: ['Entendimento da área, atividade e contexto operacional', 'Definição de requisitos indispensáveis e desejáveis', 'Atração e avaliação dos profissionais', 'Apresentação de perfis e alinhamento com a empresa'],
    faqs: [
      { q: 'A seleção pode atender diferentes funções industriais?', a: 'O escopo é definido conforme as posições, os requisitos técnicos e as condições informadas pela empresa.' },
      { q: 'Como são tratados requisitos de segurança?', a: 'As orientações e qualificações requeridas devem ser informadas pela empresa e consideradas no alinhamento de perfil e na avaliação.' },
      { q: 'A consultoria valida requisitos legais e técnicos?', a: 'A empresa contratante permanece responsável por confirmar requisitos regulatórios, habilitações e condições específicas da função.' },
    ],
    icon: 'settings',
  },
  {
    slug: 'consultoria-de-rh',
    title: 'Consultoria de Recursos Humanos',
    short: 'Orientação especializada para organizar práticas de RH conectadas à estratégia.',
    eyebrow: 'RH que apoia decisões',
    intro: 'Práticas de pessoas ganham força quando são compreendidas no contexto do negócio. A consultoria começa por ouvir as prioridades e transformar questões de gestão em frentes de trabalho claras.',
    challenge: 'Organizações em diferentes momentos podem precisar revisar rotinas, papéis e políticas de pessoas para que o RH acompanhe as mudanças do negócio.',
    solution: 'Apoiamos o diagnóstico e a construção de iniciativas de RH em escopo acordado com cada organização, respeitando sua estrutura, sua cultura e sua capacidade de implementação.',
    benefits: ['Visão organizada de prioridades de RH', 'Recomendações contextualizadas ao negócio', 'Clareza de papéis, rotinas e próximos passos', 'Apoio à construção e à implementação de práticas'],
    steps: ['Escuta e entendimento do cenário atual', 'Identificação de necessidades e prioridades', 'Desenho conjunto das iniciativas', 'Acompanhamento das ações acordadas'],
    faqs: [
      { q: 'A consultoria começa com um diagnóstico?', a: 'O formato do trabalho é alinhado com a empresa. Quando necessário, a primeira etapa reúne informações e percepções para compreender o cenário.' },
      { q: 'É possível contratar um projeto específico?', a: 'Sim. O escopo pode ser pontual ou estruturado em etapas, conforme a prioridade e a capacidade de execução da organização.' },
      { q: 'Como a confidencialidade das informações é tratada?', a: 'O tratamento das informações e as responsabilidades das partes devem ser definidos antes do início do trabalho.' },
    ],
    icon: 'compass',
  },
  {
    slug: 'mapeamento-de-processos',
    title: 'Mapeamento de Processos',
    short: 'Visualize fluxos, responsabilidades e oportunidades de melhoria.',
    eyebrow: 'Mais clareza no fluxo do trabalho',
    intro: 'Processos compreensíveis aproximam as equipes e ajudam a transformar a estratégia em rotinas possíveis. O mapeamento cria uma visão compartilhada de como o trabalho realmente acontece.',
    challenge: 'Quando atividades, decisões e interfaces não estão visíveis, o dia a dia pode depender de acordos informais que se perdem com as mudanças e dificultam a melhoria contínua.',
    solution: 'Apoiamos a identificação e a representação dos fluxos prioritários junto às pessoas envolvidas. O resultado é uma base de conversa para organizar responsabilidades e avaliar alternativas de melhoria.',
    benefits: ['Visibilidade de etapas, entradas e entregas', 'Compreensão de papéis e interfaces', 'Identificação de pontos de espera e retrabalho', 'Base concreta para priorizar melhorias'],
    steps: ['Definição do escopo e dos objetivos', 'Conversas com os envolvidos e levantamento do fluxo', 'Representação e validação do processo atual', 'Organização de oportunidades e próximos passos'],
    faqs: [
      { q: 'O mapeamento substitui a documentação interna?', a: 'O formato da documentação é alinhado com a empresa e pode complementar os materiais existentes.' },
      { q: 'É possível mapear apenas uma área?', a: 'Sim. É comum iniciar por um processo prioritário e ampliar o escopo de acordo com as necessidades.' },
      { q: 'Quem precisa participar?', a: 'A participação das pessoas que executam, aprovam ou recebem as entregas ajuda a representar o fluxo com mais fidelidade.' },
    ],
    icon: 'workflow',
  },
  {
    slug: 'gestao-de-pessoas-e-desempenho',
    title: 'Gestão de Pessoas e Desempenho',
    short: 'Estruture conversas, desenvolvimento e práticas de desempenho com intencionalidade.',
    eyebrow: 'Desenvolvimento com direção',
    intro: 'Desempenho sustentável depende de expectativas claras, conversas de qualidade e oportunidades de desenvolvimento. Uma abordagem consistente ajuda a transformar intenção em práticas do dia a dia.',
    challenge: 'Quando critérios, responsabilidades e conversas de desenvolvimento não estão claros, líderes e equipes podem ter dificuldade para alinhar expectativas e acompanhar prioridades.',
    solution: 'Apoiamos a construção de práticas de gestão de pessoas e desempenho alinhadas à realidade de cada empresa, com clareza de objetivos, papéis e cadência de acompanhamento.',
    benefits: ['Expectativas e responsabilidades mais claras', 'Conversas de desenvolvimento estruturadas', 'Práticas conectadas aos objetivos da organização', 'Apoio a lideranças na gestão de equipes'],
    steps: ['Entendimento das práticas e prioridades existentes', 'Definição de princípios e objetivos', 'Desenho das ferramentas e rituais de gestão', 'Orientação para adoção e revisão das práticas'],
    faqs: [
      { q: 'O trabalho envolve uma plataforma de avaliação?', a: 'O escopo pode considerar processos e instrumentos. A necessidade de tecnologia deve ser avaliada separadamente, conforme o cenário da empresa.' },
      { q: 'Como evitar que a avaliação se torne apenas um formulário?', a: 'É importante conectar critérios a objetivos claros, preparar as lideranças e criar conversas de acompanhamento que apoiem decisões e desenvolvimento.' },
      { q: 'As práticas são iguais para todas as empresas?', a: 'Não. Princípios e ferramentas precisam refletir a estratégia, a cultura e o momento de cada organização.' },
    ],
    icon: 'users',
  },
  {
    slug: 'gestao-de-negocios-e-processos',
    title: 'Gestão de Negócios e Processos',
    short: 'Mapeamento e organização de processos para apoiar escolhas e rotinas mais claras.',
    eyebrow: 'Processos que dão clareza',
    intro: 'A forma como o trabalho acontece influencia a experiência das pessoas e a capacidade de execução. Tornar fluxos visíveis é um passo importante para identificar oportunidades de melhoria.',
    challenge: 'Processos pouco claros podem gerar retrabalho, dúvidas sobre responsabilidades e dificuldade para acompanhar o andamento das atividades.',
    solution: 'Apoiamos o mapeamento de processos e a organização de rotinas e responsabilidades, priorizando entendimento compartilhado e recomendações aplicáveis ao contexto.',
    benefits: ['Visibilidade de etapas, interfaces e responsabilidades', 'Identificação de pontos de atenção e oportunidades', 'Rotinas e fluxos mais compreensíveis', 'Base estruturada para decisões de melhoria'],
    steps: ['Definição do escopo e dos envolvidos', 'Levantamento e representação do processo atual', 'Análise de interfaces e oportunidades', 'Organização das recomendações e próximos passos'],
    faqs: [
      { q: 'É necessário documentar todos os processos?', a: 'O escopo deve ser priorizado conforme a necessidade. É possível começar por um fluxo ou área específica.' },
      { q: 'A consultoria também apoia a implementação?', a: 'O nível de apoio à implementação pode ser combinado no escopo inicial e ajustado conforme as prioridades.' },
      { q: 'Como as equipes participam?', a: 'A participação de quem realiza e recebe o trabalho ajuda a representar o processo com mais contexto e a construir entendimento compartilhado.' },
    ],
    icon: 'workflow',
  },
];

export const methodology = [
  { number: '01', title: 'Entendemos o negócio', text: 'Escutamos o contexto, os objetivos e os desafios da posição ou do projeto.' },
  { number: '02', title: 'Desenhamos a estratégia', text: 'Alinhamos perfil, critérios de avaliação e a melhor forma de conduzir cada busca.' },
  { number: '03', title: 'Conectamos profissionais', text: 'Identificamos e avaliamos perfis com atenção ao que foi combinado.' },
  { number: '04', title: 'Acompanhamos a jornada', text: 'Apresentamos os perfis e apoiamos os alinhamentos ao longo do processo.' },
];

export type Insight = { slug: string; category: string; title: string; intro: string; minutes: number; body: string[]; created_at?: string; updated_at?: string; published?: boolean; id?: string };
export const insights: Insight[] = insightDefaults as Insight[];

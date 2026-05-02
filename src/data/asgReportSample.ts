export const asgReportSamples = [
  {
    // SP: Caso de teste com dados moderados
    indicador: 'SP-123456-7',
    ambiental: {
      app: '12.7 ha',
      rl: '68.4 ha',
      deter: '5.8 ha',
      focos: '3 reg.'
    },
    social: {
      ucsSobreposicao: '7 ha',
      tiSobreposicao: 'Sem sobreposição'
    },
    governanca: {
      carStatus: 'Ativo',
      incraStatus: 'Aguard. análise'
    }
  },
  {
    // PA-456789-1: Caso de desmatamento alto (Pará - região crítica de desmatamento)
    indicador: 'PA-456789-1',
    ambiental: {
      app: '45.2 ha',
      rl: '120.0 ha',
      deter: '23.5 ha',
      focos: '8 reg.'
    },
    social: {
      ucsSobreposicao: '15.3 ha',
      tiSobreposicao: 'Sobreposição parcial com TI Kayapó (2.5 ha)'
    },
    governanca: {
      carStatus: 'Ativo',
      incraStatus: 'Aprovado'
    }
  },
  {
    // MT-987654-3: Caso de queimadas/focos alto (Mato Grosso - região de alta atividade)
    indicador: 'MT-987654-3',
    ambiental: {
      app: '28.5 ha',
      rl: '89.0 ha',
      deter: '8.2 ha',
      focos: '15 reg.'
    },
    social: {
      ucsSobreposicao: '22.1 ha',
      tiSobreposicao: 'Sem sobreposição'
    },
    governanca: {
      carStatus: 'Ativo',
      incraStatus: 'Aguard. análise'
    }
  },
  {
    // MG-111222-5: Caso de conservação (Minas Gerais - múltiplas UCs)
    indicador: 'MG-111222-5',
    ambiental: {
      app: '35.0 ha',
      rl: '95.5 ha',
      deter: '2.1 ha',
      focos: '1 reg.'
    },
    social: {
      ucsSobreposicao: '48.7 ha',
      tiSobreposicao: 'Sem sobreposição'
    },
    governanca: {
      carStatus: 'Inativo',
      incraStatus: 'Cancelado'
    }
  },
  {
    // RS-333444-9: Caso de propriedade com status suspenso (Rio Grande do Sul)
    indicador: 'RS-333444-9',
    ambiental: {
      app: '18.5 ha',
      rl: '76.0 ha',
      deter: '0.0 ha',
      focos: '0 reg.'
    },
    social: {
      ucsSobreposicao: '0 ha',
      tiSobreposicao: 'Sem sobreposição'
    },
    governanca: {
      carStatus: 'Suspenso',
      incraStatus: 'Aguardando análise de RL'
    }
  }
];

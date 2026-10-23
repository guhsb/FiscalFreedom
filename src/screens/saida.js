import { telaNotas, conferirSaida } from './notas.js';

export default telaNotas({
  id: 'saida',
  titulo: 'Conferir notas de saída',
  subtitulo: 'XML da nota × cadastro × Tributei',
  resumo: 'Acha CST errado, ST faltando ou a mais antes de a mercadoria sair',
  icone: 'saida', cor: 'violeta',
  base: 'saidas',
  conferir: conferirSaida
});

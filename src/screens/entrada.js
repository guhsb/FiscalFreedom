import { telaNotas, conferirEntrada } from './notas.js';

export default telaNotas({
  id: 'entrada',
  titulo: 'Conferir notas de entrada',
  subtitulo: 'Compras: ST destacada × antecipação',
  resumo: 'Confere se o fornecedor destacou a ST ou se a Freedom precisa recolher',
  icone: 'entrada', cor: 'laranja',
  base: 'entrada',
  conferir: conferirEntrada
});

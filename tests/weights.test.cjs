const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');

// Invented counts with hand-calculated expectations; never operational data.
function fixture({local = 100, ownNew = 20, delivery = false} = {}) {
  const sales = [['Позиция меню (блюдо)', 'Ресторан', 'Подразделение', 'Дата_Отчет', 'Группа меню', 'Позиций']];
  const orders = [['Ресторан', 'Подразделение', 'Дата', 'Заказы']];
  for (const [restaurant, channel, novelty, ordinary] of [
    ['Цель', 'Зал', ownNew, 80],
    ['База 1', 'Зал', 100, 900], // 10%, despite ten times the volume
    ['База 2', 'Зал', 30, 70], // 30%; equal restaurant weights give 20%
    ...(delivery ? [['Цель', 'Интернет-магазин', 10, 90]] : []),
  ]) {
    for (const [name, qty] of [['Новинка', novelty], ['Обычное', ordinary]]) {
      sales.push([name, restaurant, channel, '2026-01-05', 'Группа', qty]);
    }
    orders.push([restaurant, channel, '2026-01-05', 100]);
  }
  sales.push(['Локальная альтернатива', 'Цель', 'Зал', '2026-01-05', 'Группа', local]);
  return E.buildDataset({
    'СПР': [['Позиция', 'группа', 'Новое', 'старт'], ['Новинка', 'Группа', 1, '2026-01-05']],
    'Поток продаж': sales, 'Поток чеков': orders,
  });
}
function target(data, onlyTarget = false) {
  const filters = {...E.defaults(data), rankingMethod:'weights'};
  if (onlyTarget) filters.restaurants = new Set([data.restaurants.indexOf('Цель')]);
  return E.benchmark(data, filters).find(row => row.name === 'Цель');
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

test('Weights exclude the target, give peers equal influence and use the common assortment', () => {
  const row = target(fixture());
  near(row.expectedQty, 20);
  near(row.deviation, 0);
  assert.equal(row.details[0].peerRestaurants, 2);
  assert.equal(row.details[0].comparisonGroupQty, 100);
  assert.deepEqual(row.details[0].localItems, ['Локальная альтернатива']);
  near(target(fixture({local: 10000})).expectedQty, 20);
  near(target(fixture({ownNew: 40})).expectedQty, 24); // Own volume changes, peer share remains 20%.
  near(target(fixture(), true).expectedQty, 20); // Output filter must retain the rest of the network.
});

test('Inactive channels add no zero peers; unavailable channel comparisons retain explicit coverage', () => {
  const hall = target(fixture());
  assert.equal(hall.details.length, 1);
  assert.equal(hall.coverage, 100);
  const partial = target(fixture({delivery: true}));
  assert.equal(partial.qty, 30);
  assert.equal(partial.comparisonQty, 20);
  assert.equal(partial.comparisonOrders, 100);
  near(partial.expectedQty, 20);
  near(partial.coverage, 100 * 20 / 30);
  assert.equal(partial.missingPairs.length, 1);
  assert.equal(partial.missingPairs[0].reason, 'no_peer_dish');
});

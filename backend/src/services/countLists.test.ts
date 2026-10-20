import { createCountListsService } from './countLists.js';
import type { CountListsRepo } from './countLists.js';
import type { CountListInput } from '../domain/types.js';

const countable = ['13', '14', '16'];

const setup = (overrides: Partial<CountListsRepo> = {}) => {
  const saved: CountListInput[] = [];
  const repo: CountListsRepo = {
    list: async () => [],
    insert: async (input) => {
      saved.push(input);
      return { id: 'new', ...input };
    },
    update: async (id, input) => {
      saved.push(input);
      return id === 'known' ? { id, ...input } : null;
    },
    remove: async (id) => id === 'known',
    get: async () => null,
    ...overrides,
  };
  const service = createCountListsService({
    repo,
    countableProductIds: async () => new Set(countable),
  });
  return { service, saved };
};

describe('count lists service', () => {
  it('rejects products that FUDO does not offer for counting', async () => {
    const { service, saved } = setup();

    await expect(
      service.create({ name: 'Riesgo', productIds: ['14', '999'] })
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.update('known', { name: 'Riesgo', productIds: ['999'] })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(saved).toHaveLength(0);
  });

  it('answers 409 when another list has the same name', async () => {
    const { service } = setup({
      insert: async () => {
        throw Object.assign(new Error('duplicate key'), { code: '23505' });
      },
    });

    await expect(
      service.create({ name: 'Diario', productIds: ['14'] })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('saves a valid list', async () => {
    const { service } = setup();

    await expect(
      service.create({ name: 'Riesgo', productIds: ['14', '16'] })
    ).resolves.toEqual({ id: 'new', name: 'Riesgo', productIds: ['14', '16'] });
  });

  it('returns null when updating a list that does not exist', async () => {
    const { service } = setup();

    await expect(
      service.update('missing', { name: 'Riesgo', productIds: ['14'] })
    ).resolves.toBeNull();
  });

  it('hides products that FUDO no longer offers for counting', async () => {
    const { service } = setup({
      list: async () => [
        { id: 'a', name: 'Diario', productIds: ['14', '200'] },
      ],
    });

    await expect(service.list()).resolves.toEqual([
      { id: 'a', name: 'Diario', productIds: ['14'] },
    ]);
  });
  it('keeps the saved order when a product drops out of FUDO', async () => {
    const { service } = setup({
      list: async () => [
        { id: 'a', name: 'Recorrido', productIds: ['16', '999', '13'] },
      ],
    });
    await expect(service.list()).resolves.toEqual([
      { id: 'a', name: 'Recorrido', productIds: ['16', '13'] },
    ]);
  });
});

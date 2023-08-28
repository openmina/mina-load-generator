import { Mina, PublicKey } from 'snarkyjs';
import {
  AccountSource,
  LocalBlockchainAccountSource,
} from './accounts-source.js';
import { LoadGenerator } from './load-generator.js';
import { LoadDescriptor, TransactionData } from './load-descriptor.js';
import { LocalBlockchainConnection } from './mina-connection.js';
import { LocalTransactionStore } from './transaction-store.js';
import { LocalTransactionIdsStore } from './transaction-ids-store.js';
import { setTimeout } from 'timers/promises';

class TestLoad implements LoadDescriptor {
  getSetupTransaction(
    _account: PublicKey
  ): Promise<TransactionData | undefined> {
    return Promise.resolve(undefined);
  }
  getTransaction(_account: PublicKey): Promise<TransactionData> {
    return Promise.resolve({
      body: () => {},
    });
  }
}

class TestLoadWithSetup implements LoadDescriptor {
  getSetupTransaction(
    _account: PublicKey
  ): Promise<TransactionData | undefined> {
    return Promise.resolve({
      body: () => {},
    });
  }
  getTransaction(_account: PublicKey): Promise<TransactionData> {
    return Promise.resolve({
      body: () => {},
    });
  }
}

beforeEach(() => async () => {});

async function generator() {
  const localBlockchain = Mina.LocalBlockchain();
  const minaConn = new LocalBlockchainConnection(localBlockchain);
  const accounts: AccountSource = new LocalBlockchainAccountSource(
    localBlockchain
  );
  return new LoadGenerator(minaConn, accounts);
}

describe('tx template generation', () => {
  it('should get single tx ID after sending test tx to node', async () => {
    const loadGen = await generator();
    const load = new TestLoad();
    const txStore = new LocalTransactionStore();
    const idsStore = new LocalTransactionIdsStore();
    await loadGen.generate(load, txStore);
    await loadGen.sendAll(txStore, idsStore, { count: 1 });
    await expect(idsStore.getTransactionIds()).resolves.toHaveProperty(
      'length',
      1
    );
  });

  it('should get single tx IDs after sending setup and test tx to node', async () => {
    const loadGen = await generator();
    const load = new TestLoadWithSetup();
    const txStore = new LocalTransactionStore();
    const idsStore = new LocalTransactionIdsStore();
    await loadGen.generate(load, txStore);
    await loadGen.sendAll(txStore, idsStore, { count: 1 });
    await expect(idsStore.getTransactionIds()).resolves.toHaveProperty(
      'length',
      1
    );
  });
});

describe('tx sending', () => {
  it('should generate fixed number of transactions', async () => {
    const N = 10;
    const loadGen = await generator();
    const load = new TestLoadWithSetup();
    const txStore = new LocalTransactionStore();
    const idsStore = new LocalTransactionIdsStore();
    await loadGen.generate(load, txStore);
    await loadGen.sendAll(txStore, idsStore, { count: N });
    await expect(idsStore.getTransactionIds()).resolves.toHaveProperty(
      'length',
      N
    );
  }, 15000);

  it('should generate transactions during specific duration', async () => {
    const DUR = 10;
    const loadGen = await generator();
    const load = new TestLoadWithSetup();
    const txStore = new LocalTransactionStore();
    const idsStore = new LocalTransactionIdsStore();
    await loadGen.generate(load, txStore);
    let send = loadGen.sendAll(txStore, idsStore, { duration: DUR });
    await expect(
      Promise.any([send.then(() => true), setTimeout(DUR * 1000 + 500, false)])
    ).resolves.toBe(true);
  }, 15000);

  it('should generate estimated number of transactions when duration and period is set', async () => {
    const DUR = 10;
    const INT = 1;
    const loadGen = await generator();
    const load = new TestLoadWithSetup();
    const txStore = new LocalTransactionStore();
    const idsStore = new LocalTransactionIdsStore();
    await loadGen.generate(load, txStore);
    await loadGen.sendAll(txStore, idsStore, { duration: DUR, interval: INT });
    await expect(
      idsStore.getTransactionIds().then((a) => a.length)
    ).resolves.toBeCloseTo(DUR / INT);
  }, 15000);
});

afterAll(() => {});

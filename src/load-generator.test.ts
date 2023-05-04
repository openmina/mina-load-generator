import { Mina, PublicKey, shutdown } from 'snarkyjs';
import {
  AccountSource,
  LocalBlockchainAccountSource,
} from './accounts-source.js';
import { LoadGenerator } from './load-generator.js';
import { LoadDescriptor, TransactionData } from './load-descriptor.js';
import { LocalBlockchainConnection } from './mina-connection.js';
import { LocalTransactionStore } from './transaction-store.js';
import { LocalTransactionIdsStore } from './transaction-ids-store.js';

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

describe('tx template generation', () => {
  function generator() {
    const localBlockchain = Mina.LocalBlockchain();
    const minaConn = new LocalBlockchainConnection(localBlockchain);
    const accounts: AccountSource = new LocalBlockchainAccountSource(
      localBlockchain
    );
    return new LoadGenerator(minaConn, accounts);
  }

  it('should get single tx ID after sending test tx to node', async () => {
    const loadGen = generator();
    const load = new TestLoad();
    const txStore = new LocalTransactionStore();
    const idsStore = new LocalTransactionIdsStore();
    await loadGen.generate(load, txStore);
    await loadGen.sendAll(txStore, idsStore, {});
    await expect(idsStore.getTransactionIds()).resolves.toHaveProperty(
      'length',
      1
    );
  });

  it('should get single tx IDs after sending setup and test tx to node', async () => {
    const loadGen = generator();
    const load = new TestLoadWithSetup();
    const txStore = new LocalTransactionStore();
    const idsStore = new LocalTransactionIdsStore();
    await loadGen.generate(load, txStore);
    await loadGen.sendAll(txStore, idsStore, {});
    await expect(idsStore.getTransactionIds()).resolves.toHaveProperty(
      'length',
      1
    );
  });
});

afterAll(() => {
  setTimeout(shutdown, 0);
});

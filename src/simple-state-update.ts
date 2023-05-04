import { Command } from '@commander-js/extra-typings';
import { AccountUpdate, PrivateKey, PublicKey } from 'snarkyjs';
import { Logger } from 'tslog';
import { Add } from './Add.js';
import { LoadRegistry } from './load-registry.js';
import { LoadDescriptor, TransactionData } from './load-descriptor.js';
import { LOG } from './log.js';
import { tracePerfAsync } from './perf.js';

export class SimpleStateUpdate implements LoadDescriptor {
  account: PrivateKey;
  zk: Add;
  log: Logger<any>;

  constructor() {
    this.log = LOG.getSubLogger({ name: 'ssu' });
    this.account = PrivateKey.random();
    this.log.info(`public key: ${this.account.toPublicKey().toBase58()}`);
    this.log.debug(`private key: ${this.account.toBase58()}`);
  }

  async getSetupTransaction(
    account: PublicKey
  ): Promise<TransactionData | undefined> {
    this.log.info('compiling zkApp...');
    await tracePerfAsync('zkApp compilation', this.log, async () => {
      await Add.compile();
    });

    this.zk = new Add(this.account.toPublicKey());
    return {
      body: () => {
        let update = AccountUpdate.fundNewAccount(account);
        update.send({ to: this.account.toPublicKey(), amount: 10e9 });
        this.zk.deploy();
      },
      signers: [this.account],
      fee: 10e9,
    };
  }

  async getTransaction(_account: PublicKey): Promise<TransactionData> {
    return {
      body: () => {
        this.zk.update();
      },
      fee: 1e9,
    };
  }

  transactionBody() {
    return () => {
      this.zk.update();
    };
  }
}

LoadRegistry.register(
  SimpleStateUpdate,
  new Command('simple-state-update').description(
    'call `Add.update()` method that increment on-chain state by two'
  )
);

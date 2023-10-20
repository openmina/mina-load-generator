import { Command } from '@commander-js/extra-typings';
import { AccountUpdate, PrivateKey, PublicKey, UInt64 } from 'o1js';
import { Logger } from 'tslog';
import { LoadDescriptor, TransactionData } from './load-descriptor.js';
import { LoadRegistry } from './load-registry.js';
import { LOG } from './log.js';
import { MultiAcc } from './MultiAcc.js';

export interface Transfer {
  to: PublicKey;
  amount: number;
}

abstract class MultiAccTrans implements LoadDescriptor {
  log: Logger<any>;
  sender: PublicKey;
  a1: PublicKey;
  a2: PublicKey;
  a3: PublicKey;
  a4: PublicKey;
  a5: PublicKey;
  a6: PublicKey;
  a7: PublicKey;
  a8: PublicKey;

  constructor() {
    this.log = LOG.getSubLogger({ name: 'matp' });

    this.a1 = PrivateKey.random().toPublicKey();
    this.a2 = PrivateKey.random().toPublicKey();
    this.a3 = PrivateKey.random().toPublicKey();
    this.a4 = PrivateKey.random().toPublicKey();
    this.a5 = PrivateKey.random().toPublicKey();
    this.a6 = PrivateKey.random().toPublicKey();
    this.a7 = PrivateKey.random().toPublicKey();
    this.a8 = PrivateKey.random().toPublicKey();
  }

  getSetupTransaction(
    account: PublicKey
  ): Promise<TransactionData | undefined> {
    this.sender = account;
    return Promise.resolve(undefined);
  }

  getTransaction(_account: PublicKey) {
    return Promise.resolve({
      fee: 10e9,
      signers: this.signers(),
      body: this.body(),
    });
  }

  signers(): PrivateKey[] {
    return [];
  }

  abstract body(): () => void;
}

abstract class MultiAccWithZkApp extends MultiAccTrans {
  zk: MultiAcc;
  zkKey: PrivateKey;

  constructor() {
    super();

    this.zkKey = PrivateKey.random();
    this.zk = new MultiAcc(this.zkKey.toPublicKey());

    this.log.info(`zkApp public key: ${this.zkKey.toPublicKey().toBase58()}`);
    this.log.debug(`zkApp private key: ${this.zkKey.toBase58()}`);
  }

  async getSetupTransaction(account: PublicKey) {
    this.log.debug('compiling zkApp...');
    await MultiAcc.compile();
    this.log.debug('done');

    return {
      body: () => {
        let update = AccountUpdate.fundNewAccount(account);
        update.send({ to: this.zkKey.toPublicKey(), amount: 100e9 });
        this.zk.deploy();
      },
      fee: 10e9,
      signers: [this.zkKey],
    };
  }
}

class Simple2 extends MultiAccTrans {
  body() {
    return () => {
      AccountUpdate.createSigned(this.sender).send({
        to: this.a1,
        amount: UInt64.from(10e9),
      });
      AccountUpdate.createSigned(this.sender).send({
        to: this.a2,
        amount: UInt64.from(10e9),
      });
    };
  }
}
LoadRegistry.register(Simple2, () => new Command('simple2').description(''));

class Simple4 extends MultiAccTrans {
  body() {
    return () => {
      AccountUpdate.createSigned(this.sender).send({
        to: this.a1,
        amount: UInt64.from(10e9),
      });
      AccountUpdate.createSigned(this.sender).send({
        to: this.a2,
        amount: UInt64.from(10e9),
      });
      AccountUpdate.createSigned(this.sender).send({
        to: this.a3,
        amount: UInt64.from(10e9),
      });
      AccountUpdate.createSigned(this.sender).send({
        to: this.a4,
        amount: UInt64.from(10e9),
      });
    };
  }
}
LoadRegistry.register(Simple4, () => new Command('sign-x4'));

class Simple8 extends MultiAccTrans {
  body() {
    return () => {
      AccountUpdate.createSigned(this.sender).send({
        to: this.a1,
        amount: UInt64.from(10e9),
      });
      AccountUpdate.createSigned(this.sender).send({
        to: this.a2,
        amount: UInt64.from(10e9),
      });
      AccountUpdate.createSigned(this.sender).send({
        to: this.a3,
        amount: UInt64.from(10e9),
      });
      AccountUpdate.createSigned(this.sender).send({
        to: this.a4,
        amount: UInt64.from(10e9),
      });
      AccountUpdate.createSigned(this.sender).send({
        to: this.a5,
        amount: UInt64.from(10e9),
      });
      AccountUpdate.createSigned(this.sender).send({
        to: this.a6,
        amount: UInt64.from(10e9),
      });
      AccountUpdate.createSigned(this.sender).send({
        to: this.a7,
        amount: UInt64.from(10e9),
      });
      AccountUpdate.createSigned(this.sender).send({
        to: this.a8,
        amount: UInt64.from(10e9),
      });
    };
  }
}
LoadRegistry.register(Simple8, () => new Command('simple8').description(''));

class Simple4AndZkApp4 extends MultiAccWithZkApp {
  body() {
    return () => {
      this.zk.deposit(UInt64.from(30e9));
      AccountUpdate.createSigned(this.sender).send({
        to: this.a1,
        amount: UInt64.from(10e9),
      });
      this.zk.transfer(UInt64.from(10e9), this.a2);
      AccountUpdate.createSigned(this.sender).send({
        to: this.a3,
        amount: UInt64.from(10e9),
      });
      this.zk.transfer(UInt64.from(10e9), this.a4);
      AccountUpdate.createSigned(this.sender).send({
        to: this.a5,
        amount: UInt64.from(10e9),
      });
      this.zk.transfer(UInt64.from(10e9), this.a6);
      AccountUpdate.createSigned(this.sender).send({
        to: this.a7,
        amount: UInt64.from(10e9),
      });
    };
  }
}
LoadRegistry.register(Simple4AndZkApp4, () =>
  new Command('simple4-zkapp4').description('')
);

class ZkApp4AndSimple4 extends MultiAccWithZkApp {
  body() {
    return () => {
      AccountUpdate.createSigned(this.sender).send({
        to: this.a1,
        amount: UInt64.from(10e9),
      });
      this.zk.deposit(UInt64.from(30e9));
      AccountUpdate.createSigned(this.sender).send({
        to: this.a3,
        amount: UInt64.from(10e9),
      });
      this.zk.transfer(UInt64.from(10e9), this.a2);
      AccountUpdate.createSigned(this.sender).send({
        to: this.a5,
        amount: UInt64.from(10e9),
      });
      this.zk.transfer(UInt64.from(10e9), this.a4);
      AccountUpdate.createSigned(this.sender).send({
        to: this.a7,
        amount: UInt64.from(10e9),
      });
      this.zk.transfer(UInt64.from(10e9), this.a6);
    };
  }
}
LoadRegistry.register(ZkApp4AndSimple4, () =>
  new Command('zkapp4-simple4').description('')
);

class ZkApp2 extends MultiAccWithZkApp {
  body() {
    return () => {
      this.zk.deposit(UInt64.from(10e9));
      this.zk.transfer(UInt64.from(10e9), this.a1);
    };
  }
}
LoadRegistry.register(ZkApp2, () => new Command('zkapp2').description(''));

class ZkApp3 extends MultiAccWithZkApp {
  body() {
    return () => {
      this.zk.deposit(UInt64.from(20e9));
      this.zk.transfer(UInt64.from(10e9), this.a1);
      this.zk.transfer(UInt64.from(10e9), this.a2);
    };
  }
}
LoadRegistry.register(ZkApp3, () =>
  new Command('sign-proof-x3').description('')
);

class ZkApp4 extends MultiAccWithZkApp {
  body() {
    return () => {
      this.zk.deposit(UInt64.from(30e9));
      this.zk.transfer(UInt64.from(10e9), this.a1);
      this.zk.transfer(UInt64.from(10e9), this.a2);
      this.zk.transfer(UInt64.from(10e9), this.a3);
    };
  }
}
LoadRegistry.register(ZkApp4, () => new Command('zkapp4').description(''));

class ZkApp8 extends MultiAccWithZkApp {
  body() {
    return () => {
      this.zk.deposit(UInt64.from(70e9));
      this.zk.transfer(UInt64.from(10e9), this.a1);
      this.zk.transfer(UInt64.from(10e9), this.a2);
      this.zk.transfer(UInt64.from(10e9), this.a3);
      this.zk.transfer(UInt64.from(10e9), this.a4);
      this.zk.transfer(UInt64.from(10e9), this.a5);
      this.zk.transfer(UInt64.from(10e9), this.a6);
      this.zk.transfer(UInt64.from(10e9), this.a7);
    };
  }
}
LoadRegistry.register(ZkApp8, () => new Command('zkapp8').description(''));

class ZkApp9 extends MultiAccWithZkApp {
  body() {
    return () => {
      this.zk.deposit(UInt64.from(80e9));
      this.zk.transfer(UInt64.from(10e9), this.a1);
      this.zk.transfer(UInt64.from(10e9), this.a2);
      this.zk.transfer(UInt64.from(10e9), this.a3);
      this.zk.transfer(UInt64.from(10e9), this.a4);
      this.zk.transfer(UInt64.from(10e9), this.a5);
      this.zk.transfer(UInt64.from(10e9), this.a6);
      this.zk.transfer(UInt64.from(10e9), this.a7);
      this.zk.transfer(UInt64.from(10e9), this.a8);
    };
  }
}
LoadRegistry.register(ZkApp9, () => new Command('zkapp9').description(''));

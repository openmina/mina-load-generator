import { Command } from '@commander-js/extra-typings';
import {
  AccountUpdate,
  Mina,
  PrivateKey,
  PublicKey,
  Signature,
  UInt64,
} from 'snarkyjs';
import { Logger } from 'tslog';
import { Account } from './account.js';
import { LoadDescriptor, TransactionData } from './load-descriptor.js';
import { LoadRegistry } from './load-registry.js';
import { TestToken } from './TestToken.js';

class TokenTrans implements LoadDescriptor {
  log: Logger<any>;

  zk: TestToken;

  zkAccount: Account;
  receiver: Account;

  signers: PrivateKey[];

  constructor() {
    this.log = new Logger();
    this.zkAccount = new Account();
    this.receiver = new Account();
    this.zk = new TestToken(this.zkAccount.account);
    this.signers = [this.zkAccount.key, this.receiver.key];
  }

  async getSetupTransaction(
    account: PublicKey
  ): Promise<TransactionData | undefined> {
    //this.sender = account;

    this.log.trace('compiling smart contract...');
    let { verificationKey } = await TestToken.compile();
    this.log.trace('done');

    return {
      body: () => {
        AccountUpdate.fundNewAccount(account).send({
          to: this.zkAccount.account,
          amount: 100e9,
        });
        AccountUpdate.fundNewAccount(account).send({
          to: this.receiver.account,
          amount: 100e9,
        });
        this.zk.deploy({ verificationKey, zkappKey: this.zkAccount.key });
        this.zk.init();
      },
      fee: 1e9,
    };
  }

  getTransaction() {
    const amount = UInt64.from(10);
    const signature = Signature.create(
      this.zkAccount.key,
      amount.toFields().concat(this.zkAccount.account.toFields())
    );
    return Promise.resolve({
      body: () => {
        this.zk.mint(this.zkAccount.account, amount, signature);
        this.zk.sendTokens(this.receiver.account, amount);
        this.zk.burn(this.receiver.account, amount);
      },
      fee: 1e9,
    });
  }
}
LoadRegistry.register(TokenTrans, () => new Command('token').description(''));

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
import { AbstractLoad, LoadDescriptor, LoadRegistry } from './load-registry.js';
import { TestToken } from './TestToken.js';

class TokenTrans extends AbstractLoad implements LoadDescriptor {
  log: Logger<any>;

  zk: TestToken;

  zkAccount: Account;
  receiver: Account;

  signers: PrivateKey[];

  constructor() {
    super();
    this.log = new Logger();
    this.zkAccount = new Account();
    this.receiver = new Account();
    this.zk = new TestToken(this.zkAccount.account);
    this.signers = [this.zkAccount.key, this.receiver.key];
  }

  async initialize(account: PrivateKey): Promise<void> {
    //this.sender = account;

    this.log.trace('compiling smart contract...');
    let { verificationKey } = await TestToken.compile();
    this.log.trace('done');

    let tx = await Mina.transaction(
      { fee: 1e9, sender: account.toPublicKey() },
      () => {
        AccountUpdate.fundNewAccount(account.toPublicKey()).send({
          to: this.zkAccount.account,
          amount: 100e9,
        });
        AccountUpdate.fundNewAccount(account.toPublicKey()).send({
          to: this.receiver.account,
          amount: 100e9,
        });
        this.zk.deploy({ verificationKey, zkappKey: this.zkAccount.key });
      }
    );
    await tx.prove();
    let id = await tx.sign([account]).send();
    await id.wait();
  }
  transactionBody(): () => void {
    const amount = UInt64.from(10);
    const signature = Signature.create(
      this.zkAccount.key,
      amount.toFields().concat(this.zkAccount.account.toFields())
    );
    return () => {
      this.zk.mint(this.zkAccount.account, amount, signature);
      this.zk.sendTokens(this.receiver.account, amount);
      this.zk.burn(this.receiver.account, amount);
    };
  }
}
LoadRegistry.register('token', TokenTrans);

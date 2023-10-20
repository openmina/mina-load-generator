import { MultiAcc } from './MultiAcc';
import {
  isReady,
  shutdown,
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  UInt64,
} from 'o1js';

/*
 * This file specifies how to test the `MultiAcc` example smart contract. It is safe to delete this file and replace
 * with your own tests.
 *
 * See https://docs.minaprotocol.com/zkapps for more info.
 */

let proofsEnabled = false;

describe('MultiAcc', () => {
  let deployerAccount: PublicKey,
    deployerKey: PrivateKey,
    senderAccount: PublicKey,
    senderKey: PrivateKey,
    zkAppMultiAccress: PublicKey,
    zkAppPrivateKey: PrivateKey,
    zkApp: MultiAcc,
    a1: PublicKey,
    a2: PublicKey,
    a3: PublicKey,
    a4: PublicKey,
    a5: PublicKey;

  beforeAll(async () => {
    await isReady;
    if (proofsEnabled) MultiAcc.compile();
  });

  beforeEach(() => {
    const Local = Mina.LocalBlockchain({ proofsEnabled });
    Mina.setActiveInstance(Local);
    ({ privateKey: deployerKey, publicKey: deployerAccount } =
      Local.testAccounts[0]);
    ({ privateKey: senderKey, publicKey: senderAccount } =
      Local.testAccounts[1]);
    zkAppPrivateKey = PrivateKey.random();
    zkAppMultiAccress = zkAppPrivateKey.toPublicKey();
    zkApp = new MultiAcc(zkAppMultiAccress);
    a1 = Local.testAccounts[2].publicKey;
    a2 = Local.testAccounts[3].publicKey;
    a3 = Local.testAccounts[4].publicKey;
    a4 = Local.testAccounts[5].publicKey;
    a5 = Local.testAccounts[6].publicKey;
  });

  afterAll(() => {
    // `shutdown()` internally calls `process.exit()` which will exit the running Jest process early.
    // Specifying a timeout of 0 is a workaround to defer `shutdown()` until Jest is done running all tests.
    // This should be fixed with https://github.com/MinaProtocol/mina/issues/10943
    setTimeout(shutdown, 0);
  });

  async function localDeploy() {
    const txn = await Mina.transaction(deployerAccount, () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      zkApp.deploy();
    });
    await txn.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn.sign([deployerKey, zkAppPrivateKey]).send();
  }

  it('generates and deploys the `MultiAcc` smart contract', async () => {
    await localDeploy();
  });

  it('correctly updates the num state on the `MultiAcc` smart contract', async () => {
    await localDeploy();

    // update transaction
    const txn = await Mina.transaction(senderAccount, () => {
      zkApp.deposit(UInt64.from(100e9));
      //zkApp.withdraw(UInt64.from(100e9));
      zkApp.transfer(UInt64.from(10e9), a1);
      zkApp.transfer(UInt64.from(10e9), a2);
      //zkApp.transfer(UInt64.from(10e9), a3);
      //zkApp.transfer(UInt64.from(10e9), a4);
    });
    await txn.prove();
    await txn.sign([senderKey]).send();
  });
});

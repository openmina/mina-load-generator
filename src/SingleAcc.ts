import { SmartContract, method, AccountUpdate } from 'o1js';

/**
 * See https://docs.minaprotocol.com/zkapps/how-to-write-a-zkapp#signing-transactions-and-explicit-account-updates
 */
export class SingleAcc extends SmartContract {
  @method deposit() {
    let senderUpdate = AccountUpdate.createSigned(this.sender);
    senderUpdate.send({ to: this, amount: 1e9 });
  }
}

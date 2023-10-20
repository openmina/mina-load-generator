import {
  AccountUpdate,
  method,
  PublicKey,
  SmartContract,
  UInt64,
  Permissions,
} from 'o1js';

export class MultiAcc extends SmartContract {
  init() {
    super.init();
    this.account.permissions.set({
      ...Permissions.default(),
      send: Permissions.proofOrSignature(),
    });
  }

  @method transfer(amount: UInt64, to: PublicKey) {
    this.send({ to, amount });
  }

  @method withdraw(amount: UInt64) {
    this.send({ to: this.sender, amount });
  }

  @method deposit(amount: UInt64) {
    let senderUpdate = AccountUpdate.createSigned(this.sender);
    senderUpdate.send({ to: this, amount });
  }

  @method depositUnsigned(amount: UInt64) {
    let senderUpdate = AccountUpdate.create(this.sender);
    senderUpdate.send({ to: this, amount });
  }
}

import {
  DeployArgs,
  method,
  Permissions,
  PublicKey,
  Signature,
  SmartContract,
  UInt64,
} from 'snarkyjs';

export class TestToken extends SmartContract {
  deploy(args: DeployArgs) {
    super.deploy(args);

    const proof = Permissions.proof();

    this.account.permissions.set({
      ...Permissions.default(),
      editState: proof,
      setTokenSymbol: proof,
      send: proof,
      receive: proof,
    });
  }

  @method init() {
    super.init();
    this.account.tokenSymbol.set('OMN');
  }

  @method mint(address: PublicKey, amount: UInt64, signature: Signature) {
    signature
      .verify(this.address, amount.toFields().concat(address.toFields()))
      .assertTrue();
    this.token.mint({ address, amount });
  }

  @method sendTokens(receiver: PublicKey, amount: UInt64) {
    this.token.send({ from: this.sender, to: receiver, amount });
  }

  @method burn(address: PublicKey, amount: UInt64) {
    this.token.burn({ address, amount });
  }
}

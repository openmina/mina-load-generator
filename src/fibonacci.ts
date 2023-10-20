import { Command } from '@commander-js/extra-typings';
import {
  AccountUpdate,
  Experimental,
  Field,
  method,
  PrivateKey,
  Proof,
  PublicKey,
  SelfProof,
  SmartContract,
  Struct,
} from 'o1js';
import { Logger } from 'tslog';
import { LoadDescriptor, TransactionData } from './load-descriptor.js';
import { LoadRegistry } from './load-registry.js';
import { LOG } from './log.js';
import { myParseInt, myParseMina } from './parse-int.js';
import { tracePerfAsync } from './perf.js';

class FibPair extends Struct({
  f0: Field,
  f1: Field,
}) {}

const Fibonacci = Experimental.ZkProgram({
  publicInput: FibPair,

  methods: {
    first: {
      privateInputs: [],
      method(fib: FibPair) {
        fib.f0.assertEquals(Field(0));
        fib.f1.assertEquals(Field(1));
      },
    },
    next: {
      privateInputs: [SelfProof],
      method(fib: FibPair, prev: SelfProof<FibPair, void>) {
        prev.verify();
        fib.f0.assertEquals(prev.publicInput.f1);
        fib.f1.assertEquals(prev.publicInput.f0.add(prev.publicInput.f1));
      },
    },
  },
});

class FibonacciProof extends Proof<FibPair, void> {
  static publicInputType = Fibonacci.publicInputType;
  static publicOutputType = Fibonacci.publicOutputType;
  static tag = () => Fibonacci;
}

export class FibonacciZkapp extends SmartContract {
  @method verify(proof: FibonacciProof) {
    proof.verify();
  }
}

interface FibonacciLoadOpts {
  initialFee: number;
  initialAmount: number;
  fee: number;
  proofNumber: number;
}

function fibonacciLoad() {
  return new Command('recursive')
    .description('zkApp with recursive proof')
    .option('-f, --fee <amount>', 'transaction fee', myParseMina, 1e9)
    .option('-F, --initialFee <amount>', 'deployment fee', myParseMina, 1e9)
    .option(
      '-A, --initialAmount <amount>',
      'initial zkApp amount',
      myParseMina,
      1e9
    )
    .option(
      '-n, --proof-number <number>',
      'number of inductive proofs to generate',
      myParseInt,
      3
    );
}

class FibonacciLoad implements LoadDescriptor {
  log: Logger<any>;

  initialAmount: number;
  initialFee: number;
  fee: number;
  proofNumber: number;

  zkKey: PrivateKey;
  zkAddres: PublicKey;
  zk: FibonacciZkapp;

  constructor(opts: FibonacciLoadOpts) {
    this.log = LOG.getSubLogger({ name: 'fib' });

    this.initialAmount = opts.initialAmount;
    this.initialFee = opts.initialFee;
    this.fee = opts.fee;
    this.proofNumber = opts.proofNumber;

    this.zkKey = PrivateKey.random();
    this.zkAddres = this.zkKey.toPublicKey();
    this.zk = new FibonacciZkapp(this.zkAddres);
  }

  async getSetupTransaction(
    account: PublicKey
  ): Promise<TransactionData | undefined> {
    await tracePerfAsync(
      'Recursive program compilation',
      this.log,
      async () => {
        await Fibonacci.compile();
      }
    );
    await tracePerfAsync('ZkApp compilation', this.log, async () => {
      await FibonacciZkapp.compile();
    });
    return {
      body: () => {
        AccountUpdate.fundNewAccount(account);
        this.zk.deploy();
      },
      signers: [this.zkKey],
      fee: this.initialFee,
    };
  }

  async getTransaction(_account: PublicKey): Promise<TransactionData> {
    let f0 = Field(0);
    let f1 = Field(1);

    this.log.info(`${f0.toBigInt()} and ${f1.toBigInt()}`);
    let proof = await tracePerfAsync(
      `Base proof generation`,
      this.log,
      async () => {
        return await Fibonacci.first({ f0, f1 } as FibPair);
      }
    );
    for (let n = 0; n < this.proofNumber; n++) {
      [f0, f1] = [f1, f0.add(f1)];
      this.log.info(`${f0.toBigInt()} and ${f1.toBigInt()}`);
      proof = await tracePerfAsync(
        `Inductive proof generation`,
        this.log,
        async () => {
          return await Fibonacci.next({ f0, f1 } as FibPair, proof);
        }
      );
    }

    return {
      body: () => this.zk.verify(proof),
      fee: this.fee,
      signers: [this.zkKey],
    };
  }
}

LoadRegistry.register(FibonacciLoad, fibonacciLoad);

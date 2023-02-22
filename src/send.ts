import { isReady, Mina, PrivateKey, shutdown } from 'snarkyjs';
import { Add } from './Add.js';
import { Command } from '@commander-js/extra-typings';

const program = new Command()
  .requiredOption('-z, --zk-app-address <private-key>', 'zkApp address')
  .requiredOption(
    '-s, --sender <private-key>',
    'sender of the zkApp invocation'
  )
  .requiredOption('-u, --url <url>', 'GraphQL endpoint')
  //    .option('-c, --count', 'count of zkApp transactions in sequence')
  .parse(process.argv);
const opts = program.opts(); // smart type

console.log('waiting for snarkyjs to become ready...');
await isReady;
let zkAppKey = PrivateKey.fromBase58(opts.zkAppAddress);
let senderKey = PrivateKey.fromBase58(opts.sender);

console.log('activating Mina network connection...');
const Network = Mina.Network(opts.url);
Mina.setActiveInstance(Network);

let zkApp = new Add(zkAppKey.toPublicKey());

// compile the contract to create prover keys
console.log('compiling zkApp...');
console.time('compile');
await Add.compile();
console.timeEnd('compile');

console.log('creating a transaction...');
console.time('create transaction');
let tx = await Mina.transaction(
  { fee: 1e9, sender: senderKey.toPublicKey() },
  () => {
    zkApp.update();
  }
);
console.timeEnd('create transaction');

console.log('generating a proof...');
console.time('generate proof');
await tx.prove();
console.timeEnd('generate proof');

console.log('signing and sending the transaction...');
console.time('send transaction');
let sentTx = await tx.sign([senderKey]).send();
console.timeEnd('send transaction');

if (sentTx.hash() !== undefined) {
  console.log(`Success! ${sentTx.hash()}`);
}

shutdown();

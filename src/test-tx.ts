import { Command } from '@commander-js/extra-typings';
import { isReady, PublicKey, shutdown } from 'snarkyjs';
import { AccountUpdate, Mina, PrivateKey } from 'snarkyjs';
import { LOG } from './log.js';
import { myParseInt, myParseMina } from './parse-int.js';

export const testTx = new Command()
  .name('test-tx')
  .requiredOption('-n, --node <url>', 'Mina node GraphQL url')
  .requiredOption('-s, --sender <private-key>', 'sender account private key')
  .option('-r, --receiver <public-key>', 'receiver account public key')
  .option('-a, --amount <mina>', 'amount to send', myParseInt, 100)
  .option('-f, --fee <mina>', 'fee to pay', myParseInt, 0.1)
  .action(async (opts) => {
    let { node, sender: key, receiver: r, amount, fee } = opts;
    let signer = PrivateKey.fromBase58(key);
    let sender = signer.toPublicKey();
    let receiver =
      r !== undefined
        ? PublicKey.fromBase58(r)
        : PrivateKey.random().toPublicKey();
    Mina.setActiveInstance(Mina.Network(node));
    let tx = await Mina.transaction({ sender, fee: fee * 1e9 }, () => {
      AccountUpdate.createSigned(sender).send({
        to: receiver,
        amount: amount * 1e9,
      });
    });
    let txid = await tx.sign([signer]).send();
    if (txid.isSuccess) {
      console.log('successful:', txid.hash());
      await txid.wait();
    }
  });

export const testLocalTx = new Command()
  .name('test-local-tx')
  .option('-a, --amount <mina>', 'amount to send', myParseMina, 100e9)
  .option('-f, --fee <mina>', 'fee to pay', myParseInt, 0.1e9)
  .action(async (opts) => {
    let log = LOG;
    await isReady;
    log.debug('snarkyjs is ready');
    let localBlockchain = Mina.LocalBlockchain();
    let { amount, fee } = opts;
    let { privateKey: signer, publicKey: sender } =
      localBlockchain.testAccounts[0];
    let { publicKey: receiver } = localBlockchain.testAccounts[1];
    Mina.setActiveInstance(localBlockchain);
    log.debug('local chain instance initialized');
    let tx = await Mina.transaction({ sender, fee }, () => {
      AccountUpdate.createSigned(sender).send({ to: receiver, amount });
    });
    log.debug('transaction created');
    await tx.sign([signer]).send();
    log.debug('transaction is sent');
    await shutdown();
  });

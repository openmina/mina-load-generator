# Mina zkapp transactions generator

## Building

``` sh
$ npm install
$ npm run build
```

## Sending a Transaction

### Account Update with Proofs and Signatures

``` sh
$ node build/src/main.js run --node http://1.k8.openmina.com:31355/node1/graphql --key EKE5WXywUNqyPoNpU8D9682z6fxcnUdDMQaQN4x6K1wmC8sYXWa1 -- sign-proof-x3
```

[Account update zkApp code](src/MultiAcc.ts)

[Transaction body](src/multi-account-updates.ts#L245-L247)

## Sending Many Transactions in A Cluster

_!!!OUTDATED!!!_

The following commands will deploy the parallel job instances that generate
zkapp calls, follow the log of one of them, and then delete the deploymen,
freeing resources. Namespace can be like `testnet-unoptimized`.

``` sh
$ helm --namespace=<NAMESPACE> install zkapps .
$ kubectl --namespace=<NAMESPACE> logs job/send-zkapps --follow
$ helm --namespace=<NAMESPACE> delete zkapps
```

## GraphQL Queries

[graphql.md](graphql.md)


## Testing Simple zkApp Transactions

To run a single simple zkApp transaction containing just a pair of account updates, use the following command:

``` sh
$ node build/src/main.js test-tx --node <graphql URL> --sender <sender private key> --receiver <receiver public key> --amount 10 --fee 2
```

## License

[Apache-2.0](LICENSE)

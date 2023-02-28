# Sample Mina zkapp transaction generator

## Building

``` sh
$ npm install
$ npm run build
```

## Sending a Transaction

``` sh
$ npm run call -- --url http://1.k8.openmina.com:31311/node1/graphql --fee-payer-key EKE5WXywUNqyPoNpU8D9682z6fxcnUdDMQaQN4x6K1wmC8sYXWa1
```

## Sending Many Transactions in A Cluster

The following commands will deploy the parallel job instances that generate
zkapp calls, follow the log of one of them, and then delete the deploymen,
freeing resources. Namespace can be like `testnet-unoptimized`.

``` sh
$ helm --namespace=<NAMESPACE> install zkapps .
$ kubectl --namespace=<NAMESPACE> logs job/send-zkapps --follow
$ helm --namespace=<NAMESPACE> delete zkapps
```

## License

[Apache-2.0](LICENSE)

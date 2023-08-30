import { setTimeout } from 'timers/promises';
import { Logger } from "tslog";
import { makeGraphqlRequest } from './fetch.js';
import { LOG } from './log.js';
import { MinaConnection, MinaGraphQL } from "./mina-connection.js"
import { TransactionIdsStore } from "./transaction-ids-store.js";

interface Block {
    height: number;
    hash: string;
    date: string,
    txs: ZkappCommand[];
}

interface ZkappCommand {
    hash: string,
    failure: {
        reasons: string[],
        index: number
    } | undefined
}


const lastBlocksQueryFailureCheck = (maxLength: number) => `{
bestChain(maxLength: ${maxLength}) {
    stateHash
    protocolState {
      blockchainState {
        utcDate
      }
      consensusState {
        blockHeight
      }
    }
    transactions {
      zkappCommands {
        hash
        failureReason {
          failures
          index
        }
      }
    }
  }
}`;

interface GraphqlBlock {
    stateHash: string,
    protocolState: {
        blockchainState: {
            utcDate: string
        }
        consensusState: {
            blockHeight: string
        }
    }
    transactions: {
        zkappCommands: GraphqlZkappCommand[]
    }
}

interface GraphqlZkappCommand {
    hash: string,
    failureReason: {
        failures: string[],
        index: number
    } | undefined
}

function parseTransaction(tx: GraphqlZkappCommand): ZkappCommand {
    let failure = (tx.failureReason === null || tx.failureReason === undefined) ? undefined : {
        reasons: tx.failureReason.failures,
        index: tx.failureReason.index,
    };
    return {
        hash: tx.hash,
        failure
    }
}

function parseBlock(block: GraphqlBlock): Block {
    return {
        hash: block.stateHash,
        height: parseInt(block.protocolState.consensusState.blockHeight, 10),
        date: block.protocolState.blockchainState.utcDate,
        txs: block.transactions.zkappCommands.map(parseTransaction)
    }
}

const ALL_BLOCKS = 290;

export class BlockchainTransactions<Mina extends MinaConnection & MinaGraphQL> {
    mina: Mina;
    txStore: TransactionIdsStore;
    lastBlockHeight: number | undefined;

    log: Logger<any>;

    constructor(mina: Mina, txStore: TransactionIdsStore) {
        this.mina = mina;
        this.txStore = txStore;
        this.log = LOG.getSubLogger({ name: "bctx" });
    }

    async #loadBestChain(length: number): Promise<Block[]> {
        this.log.trace(`fetching ${length} blocks of the best chain...`);
        let [resp, error] = await makeGraphqlRequest(lastBlocksQueryFailureCheck(length), this.mina);
        if (error) throw Error(error.statusText);
        let blocks = resp?.data.bestChain.map(parseBlock);
        this.log.trace(`fetched blocks:`, blocks);
        return blocks;
    }

    async #fetchNewBlocks(): Promise<Block[]> {
        let blocks: Block[];
        if (this.lastBlockHeight == undefined) {
            blocks = await this.#loadBestChain(ALL_BLOCKS);
        } else {
            let [block, ..._rest] = await this.#loadBestChain(1);
            let newBlocks = block.height - this.lastBlockHeight;
            if (!newBlocks) {
                blocks = [];
            } else if (newBlocks == 1) {
                blocks = [block];
            } else {
                blocks = await this.#loadBestChain(newBlocks);
            }
        }
        this.log.debug(`fetched ${blocks.length} new blocks`);
        if (blocks.length > 0) {
            this.lastBlockHeight = blocks[blocks.length - 1].height;
        }
        return blocks;
    }

    async waitAll(): Promise<void> {
        let txSet = new Set((await this.txStore.getTransactionIds()).map(tx => tx.hash()));
        this.log.info(`waiting for ${txSet.size} transactions`);
        while (txSet.size > 0) {
            let blocks = await this.#fetchNewBlocks();
            for (const block of blocks) {
                this.log.debug(`looking for transactions in state ${block.hash} at height ${block.height}`);
                for (const zkappCommand of block.txs) {
                    if (txSet.delete(zkappCommand.hash)) {
                        this.log.info(`tx ${zkappCommand.hash} is included in block ${block.hash} at height ${block.height}`);
                    }
                }
            }
            if (txSet.size == 0) {
                break;
            }
            await setTimeout(1 * 60 * 1000);
        }
        this.log.info(`all transactions are included`);
    }

}


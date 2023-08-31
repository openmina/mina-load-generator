// The following code is copied (with minor modifications)
// from snarkyjs/src/lib/fetch.ts, that is a part of snarkyjs library.

import { Transaction } from 'snarkyjs/dist/node/lib/mina.js';
import { setTimeout } from 'timers';
import { LOG } from './log.js';
import {
  isMinaGraphQL,
  MinaConnection,
  MinaGraphQL,
} from './mina-connection.js';
//
// Specify 10 secs as the default timeout
const defaultTimeout = 60 * 1000;

type FetchConfig = { timeout?: number };
type FetchResponse = { data: any; errors?: any };
export type FetchError = {
  statusCode: number;
  statusText: string;
};
export function isFetchError(e: any): e is FetchError {
  return typeof e === 'object' && 'statusCode' in e;
}

const log = LOG.getSubLogger({ name: 'fetch' });

export async function sendTransaction(txn: Transaction, mina: MinaConnection) {
  if (!isMinaGraphQL(mina)) {
    return await txn.send();
  }

  txn.sign();

  let [response, error] = await sendZkapp(txn.toJSON(), mina);
  let errors: any[] | undefined;
  if (response === undefined && error !== undefined) {
    console.log('Error: Failed to send transaction', error);
    errors = [error];
  } else if (response && response.errors && response.errors.length > 0) {
    console.log(
      'Error: Transaction returned with errors',
      JSON.stringify(response.errors, null, 2)
    );
    errors = response.errors;
  }

  let isSuccess = errors === undefined;
  let maxAttempts: number;
  let interval: number;

  return {
    isSuccess,
    data: response?.data,
    errors,
    async wait(_options?: { maxAttempts?: number; interval?: number }) {
      throw Error('not implemented');
    },
    hash() {
      return response?.data?.sendZkapp?.zkapp?.hash;
    },
  };
}

/**
 * Sends a zkApp command (transaction) to the specified GraphQL endpoint.
 */
function sendZkapp(
  json: string,
  graphqlEndpoint: MinaConnection & MinaGraphQL,
  { timeout = defaultTimeout } = {}
) {
  return makeGraphqlRequest(sendZkappQuery(json), graphqlEndpoint, {
    timeout,
  });
}

// removes the quotes on JSON keys
function removeJsonQuotes(json: string) {
  let cleaned = JSON.stringify(JSON.parse(json), null, 2);
  return cleaned.replace(/"(\S+)"\s*:/gm, '$1:');
}

function sendZkappQuery(json: string) {
  return `mutation {
  sendZkapp(input: {
    zkappCommand: ${removeJsonQuotes(json)}
  }) {
    zkapp {
      hash
      id
      failureReason {
        failures
        index
      }
      zkappCommand {
        memo
        feePayer {
          body {
            publicKey
          }
        }
        accountUpdates {
          body {
            publicKey
            useFullCommitment
            incrementNonce
          }
        }
      }
    }
  }
}
`;
}

export async function makeGraphqlRequest(
  query: string,
  graphqlEndpoint: MinaConnection & MinaGraphQL,
  { timeout = defaultTimeout } = {} as FetchConfig
) {
  let timeouts: NodeJS.Timeout[] = [];
  const clearTimeouts = () => {
    timeouts.forEach((t) => clearTimeout(t));
    timeouts = [];
  };

  const makeRequest = async (url: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    timeouts.push(timer);
    let body = JSON.stringify({ operationName: null, query, variables: {} });
    try {
      log.debug(`requesting ${url}...`);
      let response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });
      return checkResponseStatus(response);
    } finally {
      clearTimeouts();
    }
  };
  // try to fetch from endpoints in pairs
  let errors: { url: string; error: any }[] = [];
  for (let i = 0; i < graphqlEndpoint.nodesCount(); i++) {
    const url = graphqlEndpoint.graphql();
    try {
      return await makeRequest(url);
    } catch (unknownError) {
      log.warn(`error making graphql request: ${unknownError}`);
      let error = inferError(unknownError);
      log.debug(`inferred error: ${error}`);
      if ([408, 500].includes(error.statusCode)) {
        // If the request timed out, or internal server error, try the next endpoint
        errors.push({ url, error: `timeout error: ${error}` });
        graphqlEndpoint.nextNode();
        log.debug(`using next graphql endpoint ${graphqlEndpoint.graphql()}`);
      } else {
        // If the request failed for some other reason (e.g. SnarkyJS error), return the error
        return [undefined, error] as [undefined, FetchError];
      }
    }
  }
  const statusText = errors
    .map(({ url, error }) => `Request to ${url} failed. Error: ${error}`)
    .join('\n');
  return [undefined, { statusCode: 408, statusText }] as [
    undefined,
    FetchError
  ];
}

async function checkResponseStatus(
  response: Response
): Promise<[FetchResponse, undefined] | [undefined, FetchError]> {
  if (response.ok) {
    let jsonResponse = await response.json();
    if (jsonResponse.errors && jsonResponse.errors.length > 0) {
      return [
        undefined,
        {
          statusCode: response.status,
          statusText: jsonResponse.errors
            .map((error: any) => error.message)
            .join('\n'),
        } as FetchError,
      ];
    } else if (jsonResponse.data === undefined) {
      return [
        undefined,
        {
          statusCode: response.status,
          statusText: `GraphQL response data is undefined`,
        } as FetchError,
      ];
    }
    return [jsonResponse as FetchResponse, undefined];
  } else {
    return [
      undefined,
      {
        statusCode: response.status,
        statusText: response.statusText,
      } as FetchError,
    ];
  }
}

function inferError(error: unknown): FetchError {
  let errorMessage = JSON.stringify(error);
  if (error instanceof AbortSignal) {
    return { statusCode: 408, statusText: `Request Timeout: ${errorMessage}` };
  } else {
    return {
      statusCode: 500,
      statusText: `Internal Server Error: ${errorMessage}`,
    };
  }
}

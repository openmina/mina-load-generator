// The following code is copied (with minor modifications)
// from snarkyjs/src/lib/fetch.ts, that is a part of snarkyjs library.

import { setTimeout } from 'timers';
import { MinaConnection, MinaGraphQL } from './mina-connection';
//
// Specify 10 secs as the default timeout
const defaultTimeout = 10 * 1000;

type FetchConfig = { timeout?: number };
type FetchResponse = { data: any; errors?: any };
type FetchError = {
    statusCode: number;
    statusText: string;
};

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
    let timeoutErrors: { url: string; error: any }[] = [];
    for (let i = 0; i < graphqlEndpoint.nodesCount(); i++) {
        const url = graphqlEndpoint.graphql();
        try {
            return await makeRequest(url);
        } catch (unknownError) {
            let error = inferError(unknownError);
            if (error.statusCode === 408) {
                // If the request timed out, try the next 2 endpoints
                timeoutErrors.push({ url, error });
                graphqlEndpoint.nextNode();
            } else {
                // If the request failed for some other reason (e.g. SnarkyJS error), return the error
                return [undefined, error] as [undefined, FetchError];
            }
        }
    }
    const statusText = timeoutErrors
        .map(
            ({ url, error }) =>
                `Request to ${url} timed out. Error: ${error}`
        )
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
            statusText: `Unknown Error: ${errorMessage}`,
        };
    }
}

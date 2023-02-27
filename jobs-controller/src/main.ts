import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import { Command } from '@commander-js/extra-typings';

dotenv.config();

const program = new Command();


program
    .argument('<data-file>', 'data file')
    .option('-p, --port <port>', 'port to listen to', '8000')
    .action((dataFile: string, opts: { port: string }) => {
        const app: Express = express();

        let data: { nodes: string[], senders: string[] } = require(dataFile);
        let nodesIndex = 0;
        let sendersIndex = 0;

        app.get('/', (_req: Request, res: Response) => {
            const d = { node: data.nodes[(nodesIndex++) % data.nodes.length], sender: data.senders[(sendersIndex++) % data.senders.length] };
            res.status(200).json(d);
        });

        app.listen(opts.port, () => {
            console.log(`⚡️[server]: Server is running at http://localhost:${opts.port}`);
        });
    })

program.parse();

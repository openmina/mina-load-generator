import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import { Command } from '@commander-js/extra-typings';
import { Logger } from 'tslog';

const log = new Logger();
dotenv.config();

const program = new Command();


program
    .argument('<data-file>', 'data file')
    .option('-p, --port <port>', 'port to listen to', '8000')
    .action((dataFile: string, opts: { port: string }) => {
        const app: Express = express();

        let data: { count: number, nodes: string[], senders: string[] } = require(dataFile);
        let nodesIndex = 0;
        let sendersIndex = 0;
        let init_jobs = 0;
        let ready_jobs = new Set();

        app.get('/init', (_req: Request, res: Response) => {
            const d = { node: data.nodes[(nodesIndex++) % data.nodes.length], sender: data.senders[(sendersIndex++) % data.senders.length] };
            init_jobs++;
            if (data.count === undefined) {
                log.info(`Initializing job #${init_jobs}`);
            } else {
                log.info(`Initializing job #${init_jobs} of ${data.count}`);
            }
            res.status(200).json(d);
        });
        app.head('/ready/:publicKey', (req: Request<{publicKey: String}>, res: Response) => {
            const id = req.params.publicKey;
            ready_jobs.add(id);
            const ready = ready_jobs.size >= (data.count || init_jobs);
            if (ready) {
                log.info(`Releasing job for ${id}`);
            } else {
                log.info(`Pausing job for ${id}...`);
            }
            res.set('X-All-Ready', `${ready}`).sendStatus(200);
        });

        app.listen(opts.port, () => {
            console.log(`⚡️[server]: Server is running at http://localhost:${opts.port}`);
        });
    })

program.parse();

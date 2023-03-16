import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import { Command, InvalidArgumentError } from '@commander-js/extra-typings';
import { Logger } from 'tslog';

const log = new Logger();
dotenv.config();

const program = new Command();

function myParseInt(value: string, dummyPrevious: number) {
  // parseInt takes a string and a radix
  const parsedValue = parseInt(value, 10);
  if (isNaN(parsedValue)) {
    throw new InvalidArgumentError('Not a number.');
  }
  return parsedValue;
}

program
    .argument('<data-file>', 'data file')
    .option('-p, --port <port>', 'port to listen to', myParseInt, 8000)
    .option('-l, --limit <number>', 'limit on total number of transactions', myParseInt, 1024)
    .option('-j, --jobs <number>', 'number of parallel jobs', myParseInt)
    .action((dataFile: string, opts: { port: number, limit: number, jobs?: number }) => {
        const app: Express = express();

        let data: { nodes: string[], senders: string[] } = require(dataFile);
        let nodesIndex = 0;
        let sendersIndex = 0;
        let init_jobs = 0;
        let ready_jobs = new Set();
        let all_ready = false;
        let jobs = opts.jobs;
        let work = opts.limit;

        app.get('/init', (_req: Request, res: Response) => {
            if (all_ready) {
                res.status(200).json({});
                return;
            }
            const d = { node: data.nodes[(nodesIndex++) % data.nodes.length], sender: data.senders[(sendersIndex++) % data.senders.length] };
            init_jobs++;
            if (jobs === undefined) {
                log.info(`Initializing job #${init_jobs}`);
            } else {
                log.info(`Initializing job #${init_jobs} of ${jobs}`);
            }
            res.status(200).json(d);
        });
        app.get('/ready/:publicKey', (req: Request<{publicKey: String}>, res: Response) => {
            const id = req.params.publicKey;
            ready_jobs.add(id);
            all_ready = ready_jobs.size >= (jobs || init_jobs);
            if (all_ready) {
                log.info(`Releasing job for ${id}`);
            } else {
                log.info(`Pausing job for ${id} as only ${ready_jobs.size} jobs are ready out of ${(jobs || init_jobs)}...`);
            }
            res.set('X-All-Ready', `${all_ready}`).sendStatus(200);
        });
        if (work !== undefined) {
            app.get('/work', (_req: Request, res: Response) => {
                if (work > 0) {
                    work--;
                    log.info(`Providing work, ${work} work left`);
                    res.set('X-Has-Work', 'true');
                } else {
                    log.info('No work left');
                    res.set('X-Has-Work', 'false');
                }
                res.sendStatus(200);
            });
        }
        app.listen(opts.port, () => {
            console.log(`⚡️[server]: Server is running at http://localhost:${opts.port}`);
        });
    })

program.parse();

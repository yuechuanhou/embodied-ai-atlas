import {createApplication} from './app.js';
import {renderWorkbench} from './workbench.js';
import {WorkerEntrypoint} from 'cloudflare:workers';
import {createProposalValidation} from './proposal-validation.js';
import {createKnowledgeSync} from './knowledge.js';

const validation = createProposalValidation({synchronize: createKnowledgeSync(fetch)});
export class ValidationBroker extends WorkerEntrypoint {
  async fetch(request) {return validation.machine(request, this.env);}
}

export default createApplication({renderWorkbench});

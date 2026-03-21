import { cronJobs } from '@rocket.chat/cron';
import { ajv, validateUnauthorizedErrorResponse, validateForbiddenErrorResponse } from '@rocket.chat/rest-typings';

import { API } from '../api';
import { validateBadRequestErrorResponse } from '@rocket.chat/rest-typings/src/v1/Ajv';

API.v1.get(
	'jobs',
	{
		authRequired: true,
		permissionsRequired: ['view-privileged-setting'],
		response: {
			200: ajv.compile({
				type: 'object',
				properties: {
					jobs: { type: 'array', items: { type: 'object' } },
					count: { type: 'number' },
					offset: { type: 'number' },
					total: { type: 'number' },
					success: { type: 'boolean', enum: [true] },
				},
				required: ['jobs', 'count', 'offset', 'total', 'success'],
				additionalProperties: false,
			}),
			401: validateUnauthorizedErrorResponse,
			403: validateForbiddenErrorResponse,
		},
	},
	async function action() {
		const { status, count = '25', offset = '0' } = this.queryParams;

		const limit = parseInt(count as string, 10);
		const skip = parseInt(offset as string, 10);

		const query: Record<string, any> = {};

		if (status === 'failed') {
			query.failReason = { $exists: true };
		} else if (status === 'disabled') {
			query.disabled = true;
		}

		const [rawJobs, total] = await Promise.all([
			cronJobs.getJobs(query, { nextRunAt: 1 }, limit, skip),
			cronJobs.countJobs(query),
		]);

		const STUCK_THRESHOLD_MS = 10 * 60 * 1000;
		const now = new Date();

		const jobs = rawJobs.map((job) => {
			const attrs = job.attrs;

			let jobStatus: string;
			if (attrs.disabled) {
				jobStatus = 'disabled';
			} else if (attrs.lockedAt && !attrs.lastFinishedAt) {
				jobStatus = 'running';
			} else if (attrs.lockedAt && now.getTime() - new Date(attrs.lockedAt).getTime() > STUCK_THRESHOLD_MS) {
				jobStatus = 'stuck';
			} else if (attrs.failReason) {
				jobStatus = 'failed';
			} else if (attrs.nextRunAt && new Date(attrs.nextRunAt) > now) {
				jobStatus = 'scheduled';
			} else {
				jobStatus = 'completed';
			}

			return {
				_id: String(attrs._id),
				name: attrs.name,
				status: jobStatus,
				repeatInterval: attrs.repeatInterval ?? null,
				repeatTimezone: attrs.repeatTimezone ?? null,
				nextRunAt: attrs.nextRunAt ?? null,
				lastRunAt: attrs.lastRunAt ?? null,
				lastFinishedAt: attrs.lastFinishedAt ?? null,
				lockedAt: attrs.lockedAt ?? null,
				failCount: attrs.failCount ?? 0,
				failReason: attrs.failReason ?? null,
				disabled: attrs.disabled ?? false,
				source: 'core',
			};
		});

		return API.v1.success({ jobs, count: jobs.length, offset: skip, total });
	},
);
API.v1.post(
    'jobs/:jobId/disable',
    {
        authRequired: true,
        permissionsRequired: ['view-privileged-setting'],
       response: {
			200: ajv.compile({
				type: 'object',
				properties: {
					success: { type: 'boolean', enum: [true] },
				},
				required: ['success'],
				additionalProperties: false,
			}),
			400: validateBadRequestErrorResponse,
			401: validateUnauthorizedErrorResponse,
			403: validateForbiddenErrorResponse,
		},
    },
    async function action() {
        const { jobId } = this.urlParams;
        const found = await cronJobs.disableJob(jobId);
        if (!found) {
            return API.v1.failure('Job not found') as any;
        }
        return API.v1.success();
    },
);
API.v1.post(
    'jobs/:jobId/enable',
    {
        authRequired: true,
        permissionsRequired: ['view-privileged-setting'],
        response: {
			200: ajv.compile({
				type: 'object',
				properties: {
					success: { type: 'boolean', enum: [true] },
				},
				required: ['success'],
				additionalProperties: false,
			}),
			400: validateBadRequestErrorResponse,
			401: validateUnauthorizedErrorResponse,
			403: validateForbiddenErrorResponse,
		},
    },
    async function action() {
        const { jobId } = this.urlParams;
        const found = await cronJobs.enableJob(jobId) as any;
        if (!found) {
            return API.v1.failure('Job not found');
        }
        return API.v1.success();
    },
);
API.v1.post(
    'jobs/:jobId/force-run',
    {
        authRequired: true,
        permissionsRequired: ['view-privileged-setting'],
        response: {
			200: ajv.compile({
				type: 'object',
				properties: {
					success: { type: 'boolean', enum: [true] },
				},
				required: ['success'],
				additionalProperties: false,
			}),
			400: validateBadRequestErrorResponse,
			401: validateUnauthorizedErrorResponse,
			403: validateForbiddenErrorResponse,
		},
    },
    async function action() {
        const { jobId } = this.urlParams;
        const found = await cronJobs.forceRunJob(jobId) as any;
        if (!found) {
            return API.v1.failure('Job not found');
        }
        return API.v1.success();
    },
);
import { cronJobs } from '@rocket.chat/cron';
import { ajv, validateUnauthorizedErrorResponse, validateForbiddenErrorResponse } from '@rocket.chat/rest-typings';
import { CronHistory } from '@rocket.chat/models';
import { API } from '../api';
import { validateBadRequestErrorResponse } from '@rocket.chat/rest-typings/src/v1/Ajv';
import { MongoInternals } from 'meteor/mongo';
import { ObjectId } from 'mongodb';


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

    const db = (MongoInternals.defaultRemoteCollectionDriver().mongo as any).client.db();
    const appsSchedulerCollection = db.collection('rocketchat_apps_scheduler');

    const [rawCoreJobs, coreTotal, rawAppsJobs] = await Promise.all([
        cronJobs.getJobs(query, { nextRunAt: 1 }, limit, skip),
        cronJobs.countJobs(query),
        appsSchedulerCollection.find(query).toArray(),
    ]);

    const STUCK_THRESHOLD_MS = 10 * 60 * 1000;
    const now = new Date();

    const deriveStatus = (attrs: any): string => {
        if (attrs.disabled) return 'disabled';
        if (attrs.lockedAt && !attrs.lastFinishedAt) return 'running';
        if (attrs.lockedAt && now.getTime() - new Date(attrs.lockedAt).getTime() > STUCK_THRESHOLD_MS) return 'stuck';
        if (attrs.failReason) return 'failed';
        if (attrs.nextRunAt && new Date(attrs.nextRunAt) > now) return 'scheduled';
        return 'completed';
    };

    const coreJobs = rawCoreJobs.map((job) => {
        const attrs = job.attrs;
        return {
            _id: String(attrs._id),
            name: attrs.name,
            status: deriveStatus(attrs),
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

    const appsJobs = rawAppsJobs.map((doc: any) => ({
        _id: String(doc._id),
        name: doc.name,
        status: deriveStatus(doc),
        repeatInterval: doc.repeatInterval ?? null,
        repeatTimezone: doc.repeatTimezone ?? null,
        nextRunAt: doc.nextRunAt ?? null,
        lastRunAt: doc.lastRunAt ?? null,
        lastFinishedAt: doc.lastFinishedAt ?? null,
        lockedAt: doc.lockedAt ?? null,
        failCount: doc.failCount ?? 0,
        failReason: doc.failReason ?? null,
        disabled: doc.disabled ?? false,
        appId: doc.data?.appId ?? null,
        source: 'apps-engine',
    }));

    const jobs = [...coreJobs, ...appsJobs];

    return API.v1.success({ jobs, count: jobs.length, offset: skip, total: coreTotal + rawAppsJobs.length });
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
    const { source } = this.bodyParams;

    if (source === 'apps-engine') {
        const db = (MongoInternals.defaultRemoteCollectionDriver().mongo as any).client.db();
        const result = await db.collection('rocketchat_apps_scheduler').findOneAndUpdate(
            { _id: new ObjectId(jobId) },
            { $set: { disabled: true } },
            { returnDocument: 'after' },
        );
        if (!result) return API.v1.failure('Job not found');
        return API.v1.success();
    }

    const found = await cronJobs.disableJob(jobId);
    if (!found) return API.v1.failure('Job not found');
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
    const { source } = this.bodyParams as { source?: string };

    if (source === 'apps-engine') {
        const db = (MongoInternals.defaultRemoteCollectionDriver().mongo as any).client.db();
        const result = await db.collection('rocketchat_apps_scheduler').findOneAndUpdate(
            { _id: new ObjectId(jobId) },
            { $set: { disabled: false } },
            { returnDocument: 'after' },
        );
        if (!result) return API.v1.failure('Job not found') as any;
        return API.v1.success();
    }

    const found = await cronJobs.enableJob(jobId);
    if (!found) return API.v1.failure('Job not found') as any;
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
    const { source } = this.bodyParams as { source?: string };

    if (source === 'apps-engine') {
        const db = (MongoInternals.defaultRemoteCollectionDriver().mongo as any).client.db();
        const result = await db.collection('rocketchat_apps_scheduler').findOneAndUpdate(
            { _id: new ObjectId(jobId) },
            { $set: { nextRunAt: new Date() } },
            { returnDocument: 'after' },
        );
        if (!result) return API.v1.failure('Job not found') as any;
        return API.v1.success();
    }

    const found = await cronJobs.forceRunJob(jobId);
    if (!found) return API.v1.failure('Job not found') as any;
    return API.v1.success();
	},
	);
API.v1.get(
    'jobs/:jobName/history',
    {
        authRequired: true,
        permissionsRequired: ['view-privileged-setting'],
        response: {
            200: ajv.compile({
                type: 'object',
                properties: {
                    history: { type: 'array', items: { type: 'object' } },
                    count: { type: 'number' },
                    offset: { type: 'number' },
                    total: { type: 'number' },
                    success: { type: 'boolean', enum: [true] },
                },
                required: ['history', 'count', 'offset', 'total', 'success'],
                additionalProperties: false,
            }),
            401: validateUnauthorizedErrorResponse,
            403: validateForbiddenErrorResponse,
        },
    },
    async function action() {
        const { jobName } = this.urlParams;
        const { count = '25', offset = '0' } = this.queryParams;

        const limit = parseInt(count as string, 10);
        const skip = parseInt(offset as string, 10);

        const [history, total] = await Promise.all([
            CronHistory.find({ name: jobName }, { sort: { startedAt: -1 }, limit, skip }).toArray(),
            CronHistory.countDocuments({ name: jobName }),
        ]);

        return API.v1.success({ history, count: history.length, offset: skip, total });
    },
);
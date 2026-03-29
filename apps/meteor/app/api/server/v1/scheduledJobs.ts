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
	const VALID_STATUSES = ['scheduled', 'running', 'failed', 'completed', 'disabled', 'stuck'] as const;
	type JobStatus = (typeof VALID_STATUSES)[number];

	const VALID_SORT_FIELDS = ['name', 'nextRunAt', 'lastRunAt', 'lastFinishedAt', 'failCount', 'status'] as const;
	type SortField = (typeof VALID_SORT_FIELDS)[number];

	const {
		status: rawStatus,
		count = '25',
		offset = '0',
		search,
		sortField: rawSortField = 'nextRunAt',
		sortOrder: sortOrderRaw,
		source,
	} = this.queryParams;

	const safeStatus: JobStatus | undefined = VALID_STATUSES.includes(rawStatus as JobStatus)
		? (rawStatus as JobStatus)
		: undefined;

	const safeSortField: SortField = VALID_SORT_FIELDS.includes(rawSortField as SortField)
		? (rawSortField as SortField)
		: 'nextRunAt';

	const sortOrder: 'asc' | 'desc' = (sortOrderRaw as string) === 'desc' ? 'desc' : 'asc';

	const limit = Math.min(Math.max(parseInt(count as string, 10) || 25, 1), 100);
	const skip = Math.max(parseInt(offset as string, 10) || 0, 0);

	const STUCK_THRESHOLD_MS = 10 * 60 * 1000;
	const now = new Date();
	// Filter strategy for 'failed' and 'disabled' statuses:
	// These are applied via baseMatch BEFORE $unionWith so both collections
	// are filtered at the source — inside appsSubPipeline for Apps Engine,
	// and in the core pipeline's $match for core jobs.
	//
	// Performance rationale: failed and disabled jobs are a small subset of
	// total jobs. Pre-filtering at the source means MongoDB never processes
	// the majority of documents through the expensive addStatusStage $switch.
	//
	// 'stuck', 'running', 'scheduled', 'completed' cannot be pre-filtered
	// because they depend on the derived 'status' field computed by addStatusStage.
	// Those are filtered via a $match stage AFTER $unionWith merges both collections.
	const baseMatch: Record<string, any> = {};

	if (safeStatus === 'failed') baseMatch.failReason = { $exists: true, $ne: null };
	if (safeStatus === 'disabled') baseMatch.disabled = true;
	if (search) baseMatch.name = { $regex: search, $options: 'i' };

	const db = (MongoInternals.defaultRemoteCollectionDriver().mongo as any).client.db();
	const coreCollection = db.collection('rocketchat_cron'); // adjust if name differs

	// ── $addFields stage: compute a 'status' field in the aggregation pipeline ──
	const addStatusStage = {
		$addFields: {
			status: {
				$switch: {
					branches: [
						
						{ case: { $eq: ['$disabled', true] }, then: 'disabled' },
						
						{
							case: {
								$and: [
									{ $ifNull: ['$lockedAt', false] },
									{
										$gt: [
											{ $subtract: [now, '$lockedAt'] },
											STUCK_THRESHOLD_MS,
										],
									},
									{ $ifNull: ['$lastRunAt', false] },
									{
										$or: [
											{ $not: [{ $ifNull: ['$lastFinishedAt', false] }] },
											{ $gt: ['$lastRunAt', '$lastFinishedAt'] },
										],
									},
								],
							},
							then: 'stuck',
						},
						
						{
							case: {
								$and: [
									{ $ifNull: ['$lockedAt', false] },
									{ $ifNull: ['$lastRunAt', false] },
									{
										$or: [
											{ $not: [{ $ifNull: ['$lastFinishedAt', false] }] },
											{ $gt: ['$lastRunAt', '$lastFinishedAt'] },
										],
									},
								],
							},
							then: 'running',
						},
				
						{
							case: {
								$or: [
									{ $ifNull: ['$failedAt', false] },
									{ $and: [{ $ifNull: ['$failReason', false] }, { $ne: ['$failReason', null] }] },
								],
							},
							then: 'failed',
						},
						
						{
							case: {
								$and: [
									{ $ifNull: ['$nextRunAt', false] },
									{ $gt: ['$nextRunAt', now] },
								],
							},
							then: 'scheduled',
						},
					],
					default: 'completed',
				},
			},
			
			appId: { $ifNull: ['$data.appId', null] },
		},
	};

	const addCoreSourceStage = { $addFields: { source: 'core' } };
	const addAppsSourceStage = { $addFields: { source: 'apps-engine' } };

	const fetchCore = source !== 'apps-engine';
	const fetchApps = source !== 'core';

	const appsSubPipeline = [
		{ $addFields: { schedule: { $ifNull: ['$repeatInterval', '$value'] } } },
		{ $match: baseMatch },
		addAppsSourceStage,
		addStatusStage,
	];

	const pipeline: object[] = [];
	
	if (fetchCore) {
		
		pipeline.push({ $match: baseMatch });
		pipeline.push({ $addFields: { schedule: { $ifNull: ['$repeatInterval', '$value'] } } })
		pipeline.push(addCoreSourceStage);
		pipeline.push(addStatusStage);
	} else {

		pipeline.push({ $match: { _id: { $exists: false } } });
	}

	if (fetchApps) {
		
		pipeline.push({
			$unionWith: {
				coll: 'rocketchat_apps_scheduler',
				pipeline: appsSubPipeline,
			},
		});
	}

	if (safeStatus && !['failed', 'disabled'].includes(safeStatus)) {
		pipeline.push({ $match: { status: safeStatus } });
	}

	const sortDir = sortOrder === 'desc' ? -1 : 1;

	pipeline.push({
		$facet: {
			data: [
				{ $sort: { [safeSortField]: sortDir, _id: 1 } },
				{ $skip: skip },
				{ $limit: limit },
				{
					$project: {
						_id: { $toString: '$_id' },
						name: 1,
						status: 1,
						schedule: { $ifNull: ['$schedule', null] },
						repeatTimezone: { $ifNull: ['$repeatTimezone', null] },
						nextRunAt: { $ifNull: ['$nextRunAt', null] },
						lastRunAt: { $ifNull: ['$lastRunAt', null] },
						lastFinishedAt: { $ifNull: ['$lastFinishedAt', null] },
						lockedAt: { $ifNull: ['$lockedAt', null] },
						failCount: { $ifNull: ['$failCount', 0] },
						failReason: { $ifNull: ['$failReason', null] },
						disabled: { $ifNull: ['$disabled', false] },
						type: { $ifNull: ['$type', null] },
						appId: 1,
						source: 1,
					},
				},
			],
			total: [{ $count: 'count' }],
		},
	});

	const [result] = await coreCollection.aggregate(pipeline).toArray();

	const paginated = result?.data ?? [];
	const total = result?.total?.[0]?.count ?? 0;

	return API.v1.success({
		jobs: paginated,
		count: paginated.length,
		offset: skip,
		total,
	});
}
);
API.v1.post(
    'jobs/:jobId/disable',
    {
        authRequired: true,
        permissionsRequired: ['edit-privileged-setting'],
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
        permissionsRequired: ['edit-privileged-setting'],
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
        permissionsRequired: ['edit-privileged-setting'],
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
import { Tabs } from '@rocket.chat/fuselage';
import { useEffectEvent } from '@rocket.chat/fuselage-hooks';
import { ContextualbarDialog, Page, PageHeader, PageContent } from '@rocket.chat/ui-client';
import { useRouteParameter, useRouter, useEndpoint } from '@rocket.chat/ui-contexts';
import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import EditScheduledJobWithData from './EditScheduledJobWithData';
import ScheduledJobsTable from './ScheduledJobsTable';

type Tab = 'all' | 'failed' | 'disabled';

const ScheduledJobsPage = (): ReactElement => {
	const { t } = useTranslation();
	const router = useRouter();
	const context = useRouteParameter('context');
	const id = useRouteParameter('id');

	const [tab, setTab] = useState<Tab>('all');
	const reloadRef = useRef(() => null);

	const getJobs = useEndpoint('GET', '/v1/jobs' as any, {} as any) as any;

	const { data: failedData } = useQuery({
		queryKey: ['jobs', 'failed', 'count'],
		queryFn: () => getJobs({ status: 'failed', count: '0', offset: '0' }),
	});

	const { data: disabledData } = useQuery({
		queryKey: ['jobs', 'disabled', 'count'],
		queryFn: () => getJobs({ status: 'disabled', count: '0', offset: '0' }),
	});

	const handleCloseContextualbar = useEffectEvent(() =>
		router.navigate('/admin/scheduled-jobs'),
	);

	const failedCount: number = failedData?.total ?? 0;
	const disabledCount: number = disabledData?.total ?? 0;

	return (
		<Page flexDirection='row'>
			<Page>
				<PageHeader title={t('Scheduled Jobs')} />
				<Tabs>
					<Tabs.Item selected={tab === 'all'} onClick={() => setTab('all')}>
						{t('All')}
					</Tabs.Item>
					<Tabs.Item selected={tab === 'failed'} onClick={() => setTab('failed')}>
						{t('Failed')}
						{failedCount > 0 && ` (${failedCount})`}
					</Tabs.Item>
					<Tabs.Item selected={tab === 'disabled'} onClick={() => setTab('disabled')}>
						{t('Disabled')}
						{disabledCount > 0 && ` (${disabledCount})`}
					</Tabs.Item>
				</Tabs>
				<PageContent>
					<ScheduledJobsTable
						reload={reloadRef}
						status={tab === 'all' ? undefined : tab}
					/>
				</PageContent>
			</Page>
			{context === 'edit' && (
				<ContextualbarDialog onClose={handleCloseContextualbar}>
					<EditScheduledJobWithData id={id} onClose={handleCloseContextualbar} />
				</ContextualbarDialog>
			)}
		</Page>
	);
};

export default ScheduledJobsPage;